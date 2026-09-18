import type { Payment, PaymentStatus } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { logger } from "../logger";
import { audit } from "../audit";
import { badRequest, conflict, notFound } from "../errors";
import { getProvider, getActiveProvider } from "../payments";
import { changeOrderStatus } from "./orders";

/**
 * Regras de pagamento.
 *
 * Princípio que o sistema inteiro respeita: um pedido SÓ vira
 * "Pagamento confirmado" quando o backend tem prova disso —
 * o webhook assinado do gateway (com reconsulta server-to-server do status)
 * ou a baixa manual de um administrador autenticado.
 * O cliente voltar para a página ou clicar em "já paguei" não muda nada.
 */

/** Cria (ou reaproveita) a cobrança de um pedido no gateway ativo. */
export async function createChargeForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { name: true, email: true, phone: true } }, payments: true },
  });
  if (!order) throw notFound("Pedido não encontrado.");
  if (order.paymentStatus === "PAID") throw conflict("Este pedido já está pago.");
  if (order.status === "CANCELLED") throw conflict("Este pedido foi cancelado.");

  // Já existe cobrança pendente e válida? Reaproveita em vez de duplicar.
  const existing = order.payments.find(
    (p) => p.status === "PENDING" && (!p.expiresAt || p.expiresAt > new Date()),
  );
  if (existing) return existing;

  const provider = getActiveProvider();

  if (!provider.isConfigured()) {
    throw badRequest(
      `O gateway "${provider.label}" está selecionado mas não tem credenciais configuradas. ` +
        "Verifique as variáveis de ambiente do provedor.",
    );
  }

  // Dinheiro é sempre acertado na entrega/retirada — nunca cobrado online.
  if (order.paymentMethod === "CASH") {
    return prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "manual",
        providerPaymentId: `cash_${order.id}`,
        method: "CASH",
        amountCents: order.totalCents,
        status: "PENDING",
      },
    });
  }

  const charge = await provider.createCharge({
    orderId: order.id,
    orderNumber: order.number,
    amountCents: order.totalCents,
    method: order.paymentMethod,
    description: `DS Espetos - Pedido #${String(order.number).padStart(6, "0")}`,
    customer: {
      name: order.user.name,
      email: order.user.email,
      phone: order.user.phone,
    },
    returnUrl: `${env.appUrl}/pedido/${order.id}`,
    idempotencyKey: `order-${order.id}`,
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: charge.provider,
      providerPaymentId: charge.providerPaymentId,
      method: order.paymentMethod,
      amountCents: order.totalCents,
      status: charge.status === "PAID" ? "PAID" : charge.status === "FAILED" ? "FAILED" : "PENDING",
      pixQrCode: charge.pixQrCode ?? null,
      pixQrCodeBase64: charge.pixQrCodeBase64 ?? null,
      checkoutUrl: charge.checkoutUrl ?? null,
      expiresAt: charge.expiresAt ?? null,
      paidAt: charge.status === "PAID" ? new Date() : null,
    },
  });

  await audit({
    action: "payment.charge_created",
    entity: "Payment",
    entityId: payment.id,
    metadata: { orderId: order.id, provider: charge.provider, method: order.paymentMethod },
  });

  // Gateway já devolveu como pago (raro, mas possível): confirma na hora.
  if (charge.status === "PAID") {
    await confirmPayment({ paymentId: payment.id, source: "gateway" });
  }

  return payment;
}

/**
 * Confirma um pagamento e move o pedido para "Pagamento confirmado".
 *
 * É idempotente: chamar duas vezes para o mesmo pagamento não duplica nada
 * nem reescreve o histórico do pedido.
 */
export async function confirmPayment(params: {
  paymentId: string;
  source: "gateway" | "admin";
  adminId?: string;
  paidAt?: Date | null;
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    include: { order: { select: { id: true, status: true, paymentStatus: true, number: true } } },
  });
  if (!payment) throw notFound("Pagamento não encontrado.");

  if (payment.status === "PAID" && payment.order.paymentStatus === "PAID") {
    return payment; // já confirmado — nada a fazer
  }

  const paidAt = params.paidAt ?? new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", paidAt },
    });
    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: "PAID", paidAt },
    });
  });

  await audit({
    action: "payment.confirmed",
    userId: params.adminId,
    entity: "Payment",
    entityId: payment.id,
    metadata: { orderId: payment.orderId, source: params.source, amountCents: payment.amountCents },
  });

  // Avança o pedido apenas se ele ainda estava esperando pagamento.
  // Vai direto para AGENDADO: o pagamento confirmado é o que garante o
  // horário, e é esse o estado em que o pedido espera a hora marcada.
  if (payment.order.status === "AWAITING_PAYMENT") {
    const actor = params.adminId ?? `system:${params.source}`;
    await changeOrderStatus({
      orderId: payment.orderId,
      to: "PAYMENT_CONFIRMED",
      changedBy: actor,
      force: true,
    });
    await changeOrderStatus({
      orderId: payment.orderId,
      to: "SCHEDULED",
      changedBy: actor,
      force: true,
    });
  }

  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
}

/** Marca um pagamento como falho/cancelado/reembolsado. */
export async function updatePaymentStatus(paymentId: string, status: PaymentStatus) {
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status },
  });
  await prisma.order.update({
    where: { id: payment.orderId },
    data: { paymentStatus: status },
  });
  return payment;
}

/**
 * Processa um evento de webhook já validado (assinatura conferida).
 *
 * Fluxo:
 *   1. registra o evento — se já foi processado, para aqui (idempotência);
 *   2. reconsulta o status REAL no gateway (server-to-server);
 *   3. só então confirma o pagamento.
 */
export async function processWebhookEvent(params: {
  providerId: string;
  eventId: string;
  eventType: string;
  providerPaymentId: string | null;
  payload: unknown;
}): Promise<{ handled: boolean; reason: string }> {
  const provider = getProvider(params.providerId);

  // (1) Idempotência: a chave única (provider, eventId) impede reprocessamento.
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: params.providerId,
        eventId: params.eventId,
        eventType: params.eventType,
        payload: (params.payload ?? {}) as never,
      },
    });
  } catch {
    logger.info("webhook:duplicate_ignored", {
      provider: params.providerId,
      eventId: params.eventId,
    });
    return { handled: false, reason: "Evento já processado anteriormente." };
  }

  if (!params.providerPaymentId) {
    return { handled: false, reason: "Evento sem identificador de pagamento." };
  }

  const payment = await prisma.payment.findFirst({
    where: { provider: params.providerId, providerPaymentId: params.providerPaymentId },
  });
  if (!payment) {
    logger.warn("webhook:payment_not_found", {
      provider: params.providerId,
      providerPaymentId: params.providerPaymentId,
    });
    return { handled: false, reason: "Pagamento não encontrado para este evento." };
  }

  // (2) A verdade vem do gateway, nunca do corpo do webhook.
  let remoteStatus: PaymentStatus;
  let paidAt: Date | null = null;

  if (provider.usesRemoteVerification) {
    const remote = await provider.fetchPaymentStatus(params.providerPaymentId);
    remoteStatus = remote.status;
    paidAt = remote.paidAt;

    // Confere o valor: se o gateway informa outro valor, algo está errado.
    if (
      remote.status === "PAID" &&
      remote.amountCents !== null &&
      remote.amountCents !== payment.amountCents
    ) {
      logger.error("webhook:amount_mismatch", {
        paymentId: payment.id,
        expected: payment.amountCents,
        received: remote.amountCents,
      });
      return { handled: false, reason: "Valor divergente do esperado." };
    }
  } else {
    // Provedor "manual": o corpo assinado com o NOSSO segredo é a fonte.
    const body = params.payload as { status?: string; paidAt?: string } | null;
    const raw = (body?.status ?? "paid").toLowerCase();
    remoteStatus =
      raw === "paid" || raw === "approved"
        ? "PAID"
        : raw === "refunded"
          ? "REFUNDED"
          : raw === "cancelled" || raw === "canceled"
            ? "CANCELLED"
            : "FAILED";
    paidAt = body?.paidAt ? new Date(body.paidAt) : new Date();
  }

  // (3) Aplica o status.
  if (remoteStatus === "PAID") {
    await confirmPayment({ paymentId: payment.id, source: "gateway", paidAt });
    return { handled: true, reason: "Pagamento confirmado." };
  }

  if (remoteStatus !== payment.status) {
    await updatePaymentStatus(payment.id, remoteStatus);
    return { handled: true, reason: `Status atualizado para ${remoteStatus}.` };
  }

  return { handled: false, reason: "Nenhuma mudança de status." };
}

/** Dados de pagamento seguros para exibir ao cliente. */
export function toPublicPayment(payment: Payment) {
  return {
    id: payment.id,
    provider: payment.provider,
    method: payment.method,
    status: payment.status,
    amountCents: payment.amountCents,
    pixQrCode: payment.pixQrCode,
    pixQrCodeBase64: payment.pixQrCodeBase64,
    checkoutUrl: payment.checkoutUrl,
    expiresAt: payment.expiresAt,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
  };
}
