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
 * Asaas — cobrança PIX (billingType: PIX) com QR Code.
 *
 * Credenciais (somente no servidor, via .env):
 *   ASAAS_API_KEY        — chave de API da conta
 *   ASAAS_WEBHOOK_TOKEN  — token definido ao cadastrar o webhook
 *   ASAAS_BASE_URL       — https://api.asaas.com/v3 (produção)
 *                          https://api-sandbox.asaas.com/v3 (sandbox)
 */
async function asaasFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${env.asaas.baseUrl}${path}`, {
    ...init,
    headers: {
      access_token: env.asaas.apiKey,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = body?.errors?.[0]?.description ?? text.slice(0, 200);
    throw new Error(`Asaas respondeu ${response.status}: ${message}`);
  }
  return body;
}

function mapStatus(status: string): RemotePaymentStatus["status"] {
  switch (status) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "PAID";
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      return "PENDING";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "CHARGEBACK_REQUESTED":
      return "REFUNDED";
    case "OVERDUE":
      return "FAILED";
    default:
      return "CANCELLED";
  }
}

/** Cria (ou reaproveita) o cliente no Asaas — a cobrança exige um customer. */
async function ensureCustomer(request: ChargeRequest): Promise<string> {
  const email = encodeURIComponent(request.customer.email);
  const found = await asaasFetch(`/customers?email=${email}&limit=1`);
  if (found?.data?.[0]?.id) return String(found.data[0].id);

  const created = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: request.customer.name,
      email: request.customer.email,
      mobilePhone: request.customer.phone,
      cpfCnpj: request.customer.document,
      externalReference: request.orderId,
    }),
  });
  return String(created.id);
}

export const asaasProvider: PaymentProvider = {
  id: "asaas",
  label: "Asaas",
  usesRemoteVerification: true,

  supports(method: PaymentMethod) {
    return method === "PIX" || method === "CARD";
  },

  isConfigured() {
    return Boolean(env.asaas.apiKey);
  },

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const customerId = await ensureCustomer(request);
    const dueDate = new Date().toISOString().slice(0, 10);

    const payment = await asaasFetch("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: request.method === "PIX" ? "PIX" : "CREDIT_CARD",
        value: Number((request.amountCents / 100).toFixed(2)),
        dueDate,
        description: request.description,
        externalReference: request.orderId,
      }),
    });

    let pixQrCode: string | null = null;
    let pixQrCodeBase64: string | null = null;
    if (request.method === "PIX") {
      const qr = await asaasFetch(`/payments/${payment.id}/pixQrCode`);
      pixQrCode = qr?.payload ?? null;
      pixQrCodeBase64 = qr?.encodedImage ?? null;
    }

    return {
      provider: "asaas",
      providerPaymentId: String(payment.id),
      status: mapStatus(payment.status) === "PAID" ? "PAID" : "PENDING",
      pixQrCode,
      pixQrCodeBase64,
      checkoutUrl: payment.invoiceUrl ?? null,
      expiresAt: null,
      raw: payment,
    };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const token = env.asaas.webhookToken;
    if (!token) return { ok: false, reason: "ASAAS_WEBHOOK_TOKEN não configurado.", status: 503 };

    // O Asaas autentica o webhook por token fixo no cabeçalho.
    const provided = headers.get("asaas-access-token") ?? "";
    if (!provided || !safeEqual(provided, token)) {
      return { ok: false, reason: "Token do webhook inválido.", status: 401 };
    }

    let payload: { id?: string; event?: string; payment?: { id?: string } };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "Corpo inválido.", status: 400 };
    }

    const paymentId = payload?.payment?.id ? String(payload.payment.id) : null;
    if (!paymentId) return { ok: false, reason: "payment.id ausente.", status: 400 };

    return {
      ok: true,
      eventId: String(payload.id ?? `${payload.event}:${paymentId}`),
      eventType: String(payload.event ?? "PAYMENT_EVENT"),
      providerPaymentId: paymentId,
      payload,
    };
  },

  async fetchPaymentStatus(providerPaymentId: string): Promise<RemotePaymentStatus> {
    const payment = await asaasFetch(`/payments/${encodeURIComponent(providerPaymentId)}`);
    return {
      status: mapStatus(payment.status),
      amountCents: Math.round(Number(payment.value ?? 0) * 100),
      paidAt: payment.paymentDate ? new Date(payment.paymentDate) : null,
      raw: payment,
    };
  },
};
