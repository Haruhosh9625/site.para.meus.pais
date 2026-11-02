import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentMethod } from "@prisma/client";
import { env } from "../../env";
import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  RemotePaymentStatus,
  WebhookVerification,
} from "../types";

/**
 * Stripe — Checkout Session (PIX e cartão).
 *
 * Credenciais (somente no servidor, via .env):
 *   STRIPE_SECRET_KEY      — chave secreta (sk_live_... / sk_test_...)
 *   STRIPE_WEBHOOK_SECRET  — segredo do endpoint (whsec_...)
 *
 * A integração é feita direto na REST API, sem SDK: menos dependências e
 * nenhuma chave chega ao navegador.
 */
const API = "https://api.stripe.com/v1";

/** A API da Stripe recebe form-urlencoded com chaves aninhadas por colchetes. */
function toFormBody(data: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          parts.push(...toFormBody(item as Record<string, unknown>, `${field}[${index}]`));
        } else {
          parts.push(`${encodeURIComponent(`${field}[${index}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === "object") {
      parts.push(...toFormBody(value as Record<string, unknown>, field));
    } else {
      parts.push(`${encodeURIComponent(field)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

async function stripeFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.stripe.secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe respondeu ${response.status}: ${body?.error?.message ?? "erro"}`);
  }
  return body;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  label: "Stripe",
  usesRemoteVerification: true,

  supports(method: PaymentMethod) {
    return method === "PIX" || method === "CARD";
  },

  isConfigured() {
    return Boolean(env.stripe.secretKey);
  },

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const session = await stripeFetch("/checkout/sessions", {
      method: "POST",
      headers: { "Idempotency-Key": request.idempotencyKey },
      body: toFormBody({
        mode: "payment",
        // PIX aparece para contas brasileiras com o método habilitado no painel.
        payment_method_types: request.method === "PIX" ? ["pix"] : ["card"],
        client_reference_id: request.orderId,
        customer_email: request.customer.email,
        success_url: request.returnUrl,
        cancel_url: request.returnUrl,
        metadata: { orderId: request.orderId, orderNumber: String(request.orderNumber) },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "brl",
              unit_amount: request.amountCents,
              product_data: { name: request.description },
            },
          },
        ],
      }).join("&"),
    });

    return {
      provider: "stripe",
      providerPaymentId: String(session.id),
      status: session.payment_status === "paid" ? "PAID" : "PENDING",
      checkoutUrl: session.url ?? null,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
      raw: session,
    };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const secret = env.stripe.webhookSecret;
    if (!secret) return { ok: false, reason: "STRIPE_WEBHOOK_SECRET não configurado.", status: 503 };

    // Cabeçalho: "t=1704908010,v1=<hmac>,v1=<hmac alternativo>"
    const header = headers.get("stripe-signature") ?? "";
    const pairs = header.split(",").map((p) => p.split("=", 2));
    const timestamp = pairs.find((p) => p[0] === "t")?.[1];
    const signatures = pairs.filter((p) => p[0] === "v1").map((p) => p[1]);

    if (!timestamp || signatures.length === 0) {
      return { ok: false, reason: "Assinatura ausente.", status: 401 };
    }

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    const matches = signatures.some((signature) => {
      const a = Buffer.from(signature ?? "", "utf8");
      const b = Buffer.from(expected, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (!matches) return { ok: false, reason: "Assinatura inválida.", status: 401 };

    // Janela de 5 minutos contra reenvio de eventos capturados.
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return { ok: false, reason: "Evento fora da janela de tempo aceita.", status: 401 };
    }

    let payload: { id?: string; type?: string; data?: { object?: { id?: string } } };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "Corpo inválido.", status: 400 };
    }

    return {
      ok: true,
      eventId: String(payload.id ?? ""),
      eventType: String(payload.type ?? ""),
      providerPaymentId: payload.data?.object?.id ? String(payload.data.object.id) : null,
      payload,
    };
  },

  async fetchPaymentStatus(providerPaymentId: string): Promise<RemotePaymentStatus> {
    const session = await stripeFetch(`/checkout/sessions/${encodeURIComponent(providerPaymentId)}`);
    const status =
      session.payment_status === "paid"
        ? "PAID"
        : session.status === "expired"
          ? "CANCELLED"
          : "PENDING";
    return {
      status,
      amountCents: typeof session.amount_total === "number" ? session.amount_total : null,
      paidAt: status === "PAID" ? new Date() : null,
      raw: session,
    };
  },
};
