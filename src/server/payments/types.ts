import type { PaymentMethod } from "@prisma/client";

/**
 * Contrato que todo gateway de pagamento precisa cumprir.
 *
 * Trocar de gateway (Mercado Pago -> Asaas, por exemplo) é mudar a variável
 * PAYMENT_PROVIDER: nenhuma rota, tela ou regra de pedido muda.
 */

export type ChargeRequest = {
  orderId: string;
  orderNumber: number;
  amountCents: number;
  method: PaymentMethod;
  description: string;
  customer: { name: string; email: string; phone: string; document?: string };
  /** URL para onde o cliente volta depois de pagar (métodos com redirecionamento). */
  returnUrl: string;
  /** Chave de idempotência propagada ao gateway quando ele suporta. */
  idempotencyKey: string;
};

export type ChargeResult = {
  provider: string;
  /** ID do pagamento no gateway. Null quando o método não gera cobrança online. */
  providerPaymentId: string | null;
  status: "PENDING" | "PAID" | "FAILED";
  /** Código PIX copia-e-cola (payload EMV). */
  pixQrCode?: string | null;
  /** Imagem do QR Code em base64 (sem o prefixo data:). */
  pixQrCodeBase64?: string | null;
  /** URL de checkout hospedado (cartão). */
  checkoutUrl?: string | null;
  expiresAt?: Date | null;
  raw?: unknown;
};

/** Resultado da verificação de assinatura + extração do evento do webhook. */
export type WebhookVerification =
  | {
      ok: true;
      /** Identificador único do evento, usado para garantir idempotência. */
      eventId: string;
      eventType: string;
      /** ID do pagamento no gateway a ser consultado. */
      providerPaymentId: string | null;
      payload: unknown;
    }
  | { ok: false; reason: string; status?: number };

export type RemotePaymentStatus = {
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED";
  amountCents: number | null;
  paidAt: Date | null;
  raw?: unknown;
};

export interface PaymentProvider {
  readonly id: string;
  readonly label: string;
  /** Métodos que este provedor consegue cobrar online. */
  supports(method: PaymentMethod): boolean;
  /** Diz se as credenciais necessárias estão configuradas. */
  isConfigured(): boolean;
  /**
   * Quando true, o status do pagamento é sempre reconsultado no gateway
   * (server-to-server) antes de confirmar — o corpo do webhook sozinho
   * nunca basta. Só provedores sem API remota (o "manual", cujo webhook é
   * assinado com um segredo nosso) usam false.
   */
  readonly usesRemoteVerification: boolean;
  /** Cria a cobrança no gateway. */
  createCharge(request: ChargeRequest): Promise<ChargeResult>;
  /**
   * Valida a assinatura do webhook e extrai o identificador do evento.
   * Recebe o corpo cru (string), pois a assinatura é calculada sobre ele.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification>;
  /**
   * Consulta o status REAL do pagamento no gateway (server-to-server).
   * É esta consulta — e não o corpo do webhook — que confirma o pagamento.
   */
  fetchPaymentStatus(providerPaymentId: string): Promise<RemotePaymentStatus>;
}
