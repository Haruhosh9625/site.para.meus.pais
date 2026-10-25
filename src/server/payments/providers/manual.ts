import type { PaymentMethod } from "@prisma/client";
import { env } from "../../env";
import { hmacSha256, safeEqual } from "../../tokens";
import { generatePixBrCode } from "../pix-brcode";
import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  RemotePaymentStatus,
  WebhookVerification,
} from "../types";

/**
 * Provedor "manual" — o padrão de fábrica do sistema.
 *
 * Usa a chave PIX da própria loja (PIX_KEY) e gera um BR Code EMV válido,
 * que qualquer app de banco lê. Não há gateway no meio, então a confirmação
 * do pagamento vem de duas fontes possíveis, ambas do lado do servidor:
 *
 *   1. o webhook POST /api/webhooks/payments/manual, assinado com
 *      HMAC-SHA256 usando MANUAL_WEBHOOK_SECRET (integração com o
 *      extrato do banco, robô de conciliação etc.); ou
 *   2. a baixa manual feita por um ADMINISTRADOR autenticado no painel.
 *
 * O cliente nunca confirma o próprio pagamento — clicar em "já paguei" não
 * muda nada no sistema.
 */
export const manualProvider: PaymentProvider = {
  id: "manual",
  label: "PIX direto (sem gateway)",
  // Não há API remota: o webhook assinado com nosso próprio segredo é a fonte.
  usesRemoteVerification: false,

  supports(method: PaymentMethod) {
    // Cartão e dinheiro são acertados presencialmente/na entrega.
    return method === "PIX" || method === "CASH" || method === "CARD";
  },

  isConfigured() {
    return true;
  },

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.method !== "PIX") {
      // Dinheiro e cartão na entrega: não há cobrança online a criar.
      return {
        provider: "manual",
        providerPaymentId: `manual_${request.orderId}`,
        status: "PENDING",
      };
    }

    if (!env.pixKey) {
      throw new Error(
        "PIX_KEY não configurada. Defina a chave PIX da loja no .env para cobrar via PIX " +
          "com o provedor manual, ou configure um gateway em PAYMENT_PROVIDER.",
      );
    }

    const pixQrCode = generatePixBrCode({
      pixKey: env.pixKey,
      amountCents: request.amountCents,
      receiverName: env.pixReceiverName,
      receiverCity: env.pixReceiverCity,
      txid: `DS${request.orderNumber}`,
      description: `Pedido ${request.orderNumber}`,
    });

    return {
      provider: "manual",
      providerPaymentId: `manual_${request.orderId}`,
      status: "PENDING",
      pixQrCode,
      // Expira em 30 minutos: depois disso o pedido pode ser cancelado.
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const secret = env.manualWebhookSecret;
    if (!secret) {
      return {
        ok: false,
        reason:
          "MANUAL_WEBHOOK_SECRET não configurado. O webhook manual fica desativado até que ele exista.",
        status: 503,
      };
    }

    const signature = headers.get("x-signature") ?? "";
    if (!signature) return { ok: false, reason: "Assinatura ausente.", status: 401 };

    const expected = hmacSha256(secret, rawBody);
    if (!safeEqual(signature.trim().toLowerCase(), expected.toLowerCase())) {
      return { ok: false, reason: "Assinatura inválida.", status: 401 };
    }

    let payload: { eventId?: string; paymentId?: string; status?: string };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "Corpo inválido.", status: 400 };
    }

    if (!payload.paymentId) {
      return { ok: false, reason: "paymentId ausente no corpo.", status: 400 };
    }

    return {
      ok: true,
      eventId: payload.eventId ?? `${payload.paymentId}:${payload.status ?? "paid"}`,
      eventType: `payment.${payload.status ?? "paid"}`,
      providerPaymentId: payload.paymentId,
      payload,
    };
  },

  /**
   * Sem gateway não existe consulta remota. O status autoritativo é o que
   * já está no banco — quem o altera é o webhook assinado ou o administrador.
   */
  async fetchPaymentStatus(): Promise<RemotePaymentStatus> {
    return { status: "PENDING", amountCents: null, paidAt: null };
  },
};
