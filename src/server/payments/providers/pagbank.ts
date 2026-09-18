import { createHash } from "node:crypto";
import type { PaymentMethod } from "@prisma/client";
import { env } from "../../env";
import { safeEqual } from "../../tokens";
import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  RemotePaymentStatus,
  WebhookVerification,
} from "../types";

/**
 * PagBank (PagSeguro) — Orders API com QR Code PIX.
 *
 * Credenciais (somente no servidor, via .env):
 *   PAGBANK_TOKEN          — token da conta
 *   PAGBANK_WEBHOOK_TOKEN  — token usado para conferir o x-authenticity-token
 *   PAGBANK_BASE_URL       — https://api.pagseguro.com (produção)
 *                            https://sandbox.api.pagseguro.com (sandbox)
 */
async function pagbankFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${env.pagbank.baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.pagbank.token}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = body?.error_messages?.[0]?.description ?? text.slice(0, 200);
    throw new Error(`PagBank respondeu ${response.status}: ${message}`);
  }
  return body;
}

function mapStatus(status: string): RemotePaymentStatus["status"] {
  switch (status) {
    case "PAID":
    case "AVAILABLE":
      return "PAID";
    case "WAITING":
    case "IN_ANALYSIS":
    case "AUTHORIZED":
      return "PENDING";
    case "REFUNDED":
      return "REFUNDED";
    case "CANCELED":
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "FAILED";
  }
}

/** Deriva o status do pedido a partir das cobranças/QR codes retornados. */
function statusFromOrder(order: {
  charges?: Array<{ status?: string; paid_at?: string }>;
}): RemotePaymentStatus {
  const charge = order.charges?.find((c) => mapStatus(c.status ?? "") === "PAID") ?? order.charges?.[0];
  if (!charge) return { status: "PENDING", amountCents: null, paidAt: null };
  return {
    status: mapStatus(charge.status ?? ""),
    amountCents: null,
    paidAt: charge.paid_at ? new Date(charge.paid_at) : null,
  };
}

export const pagBankProvider: PaymentProvider = {
  id: "pagbank",
  label: "PagBank",
  usesRemoteVerification: true,

  supports(method: PaymentMethod) {
    return method === "PIX" || method === "CARD";
  },

  isConfigured() {
    return Boolean(env.pagbank.token);
  },

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const order = await pagbankFetch("/orders", {
      method: "POST",
      headers: { "x-idempotency-key": request.idempotencyKey },
      body: JSON.stringify({
        reference_id: request.orderId,
        customer: {
          name: request.customer.name,
          email: request.customer.email,
          tax_id: request.customer.document,
          phones: request.customer.phone
            ? [
                {
                  country: "55",
                  area: request.customer.phone.slice(0, 2),
                  number: request.customer.phone.slice(2),
                  type: "MOBILE",
                },
              ]
            : undefined,
        },
        items: [
          {
            reference_id: String(request.orderNumber),
            name: request.description.slice(0, 100),
            quantity: 1,
            unit_amount: request.amountCents,
          },
        ],
        qr_codes: [
          {
            amount: { value: request.amountCents },
            expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        ],
        notification_urls: [`${env.appUrl}/api/webhooks/payments/pagbank`],
      }),
    });

    const qr = order?.qr_codes?.[0];
    const pngLink = qr?.links?.find((l: { media?: string; href?: string }) =>
      l.media?.includes("image/png"),
    );

    return {
      provider: "pagbank",
      providerPaymentId: String(order.id),
      status: "PENDING",
      pixQrCode: qr?.text ?? null,
      checkoutUrl: pngLink?.href ?? null,
      expiresAt: qr?.expiration_date ? new Date(qr.expiration_date) : null,
      raw: order,
    };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const token = env.pagbank.webhookToken;
    if (!token) return { ok: false, reason: "PAGBANK_WEBHOOK_TOKEN não configurado.", status: 503 };

    // O PagBank envia SHA-256 do corpo concatenado com o token da conta.
    // A ordem da concatenação já variou entre versões da documentação, então
    // aceitamos as duas formas — o que confirma o pagamento de verdade é a
    // reconsulta em GET /orders/{id}, logo abaixo.
    const provided = (headers.get("x-authenticity-token") ?? "").trim().toLowerCase();
    if (!provided) return { ok: false, reason: "x-authenticity-token ausente.", status: 401 };

    const candidates = [
      createHash("sha256").update(`${rawBody}-${token}`).digest("hex"),
      createHash("sha256").update(`${token}-${rawBody}`).digest("hex"),
    ];
    if (!candidates.some((expected) => safeEqual(provided, expected))) {
      return { ok: false, reason: "Token de autenticidade inválido.", status: 401 };
    }

    let payload: { id?: string; reference_id?: string; charges?: Array<{ id?: string }> };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "Corpo inválido.", status: 400 };
    }

    const orderId = payload?.id ? String(payload.id) : null;
    if (!orderId) return { ok: false, reason: "id do pedido ausente.", status: 400 };

    return {
      ok: true,
      eventId: `${orderId}:${payload.charges?.[0]?.id ?? "order"}`,
      eventType: "order.updated",
      providerPaymentId: orderId,
      payload,
    };
  },

  async fetchPaymentStatus(providerPaymentId: string): Promise<RemotePaymentStatus> {
    const order = await pagbankFetch(`/orders/${encodeURIComponent(providerPaymentId)}`);
    return { ...statusFromOrder(order), raw: order };
  },
};
