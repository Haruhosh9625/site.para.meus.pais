import type { PaymentMethod } from "@prisma/client";
import { env } from "../../env";
import { hmacSha256, safeEqual } from "../../tokens";
import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  RemotePaymentStatus,
  WebhookVerification,
} from "../types";

/**
 * Mercado Pago — cobrança PIX via API de Pagamentos (v1/payments).
 *
 * Credenciais (somente no servidor, via .env):
 *   MERCADOPAGO_ACCESS_TOKEN  — Access Token de produção da aplicação
 *   MERCADOPAGO_WEBHOOK_SECRET — "Assinatura secreta" do painel de webhooks
 *
 * A confirmação é sempre em duas etapas: valida a assinatura do webhook e,
 * em seguida, consulta GET /v1/payments/{id} para saber o status real.
 */
const API = "https://api.mercadopago.com";

async function mpFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.mercadopago.accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      `Mercado Pago respondeu ${response.status}: ${body?.message ?? text.slice(0, 200)}`,
    );
  }
  return body;
}

/** Mapeia o status do Mercado Pago para o vocabulário interno. */
function mapStatus(status: string): RemotePaymentStatus["status"] {
  switch (status) {
    case "approved":
      return "PAID";
    case "authorized":
    case "in_process":
    case "pending":
      return "PENDING";
    case "refunded":
    case "charged_back":
      return "REFUNDED";
    case "cancelled":
      return "CANCELLED";
    default:
      return "FAILED";
  }
}

export const mercadoPagoProvider: PaymentProvider = {
  id: "mercadopago",
  label: "Mercado Pago",
  usesRemoteVerification: true,

  supports(method: PaymentMethod) {
    return method === "PIX" || method === "CARD";
  },

  isConfigured() {
    return Boolean(env.mercadopago.accessToken);
  },

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const [firstName, ...rest] = request.customer.name.split(" ");
    const body = {
      transaction_amount: Number((request.amountCents / 100).toFixed(2)),
      description: request.description,
      payment_method_id: request.method === "PIX" ? "pix" : undefined,
      external_reference: request.orderId,
      notification_url: `${env.appUrl}/api/webhooks/payments/mercadopago`,
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      payer: {
        email: request.customer.email,
        first_name: firstName,
        last_name: rest.join(" ") || firstName,
      },
    };

    const payment = await mpFetch("/v1/payments", {
      method: "POST",
      // O gateway usa esta chave para não criar a mesma cobrança duas vezes.
      headers: { "X-Idempotency-Key": request.idempotencyKey },
      body: JSON.stringify(body),
    });

    const transactionData = payment?.point_of_interaction?.transaction_data;

    return {
      provider: "mercadopago",
      providerPaymentId: String(payment.id),
      status: mapStatus(payment.status) === "PAID" ? "PAID" : "PENDING",
      pixQrCode: transactionData?.qr_code ?? null,
      pixQrCodeBase64: transactionData?.qr_code_base64 ?? null,
      checkoutUrl: transactionData?.ticket_url ?? null,
      expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : null,
      raw: payment,
    };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const secret = env.mercadopago.webhookSecret;
    if (!secret) {
      return { ok: false, reason: "MERCADOPAGO_WEBHOOK_SECRET não configurado.", status: 503 };
    }

    // Cabeçalho: "ts=1704908010,v1=<hmac hexadecimal>"
    const signatureHeader = headers.get("x-signature") ?? "";
    const requestId = headers.get("x-request-id") ?? "";
    const parts = Object.fromEntries(
      signatureHeader
        .split(",")
        .map((part) => part.split("=", 2))
        .filter((pair): pair is [string, string] => pair.length === 2)
        .map(([k, v]) => [k.trim(), v.trim()]),
    );

    let payload: { id?: string | number; type?: string; action?: string; data?: { id?: string } };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "Corpo inválido.", status: 400 };
    }

    const dataId = payload?.data?.id ? String(payload.data.id) : null;
    if (!parts.ts || !parts.v1 || !dataId) {
      return { ok: false, reason: "Assinatura ou data.id ausentes.", status: 401 };
    }

    // Manifesto definido pelo Mercado Pago para o cálculo do HMAC.
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
    const expected = hmacSha256(secret, manifest);
    if (!safeEqual(parts.v1.toLowerCase(), expected.toLowerCase())) {
      return { ok: false, reason: "Assinatura inválida.", status: 401 };
    }

    // Rejeita eventos antigos demais (proteção contra replay).
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(parts.ts) / 1000);
    if (Number.isFinite(ageSeconds) && ageSeconds > 60 * 10) {
      return { ok: false, reason: "Evento fora da janela de tempo aceita.", status: 401 };
    }

    return {
      ok: true,
      eventId: `${payload.type ?? "payment"}:${dataId}:${payload.action ?? ""}`,
      eventType: payload.action ?? payload.type ?? "payment",
      providerPaymentId: dataId,
      payload,
    };
  },

  async fetchPaymentStatus(providerPaymentId: string): Promise<RemotePaymentStatus> {
    const payment = await mpFetch(`/v1/payments/${encodeURIComponent(providerPaymentId)}`);
    return {
      status: mapStatus(payment.status),
      amountCents: Math.round(Number(payment.transaction_amount ?? 0) * 100),
      paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
      raw: payment,
    };
  },
};
