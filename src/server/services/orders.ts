import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { notifyOrderStatus } from "./notifications";
import { buildQuote, assertQuoteIsCheckoutable } from "./pricing";
import { getSettings, getStoreStatus } from "./settings";
import type { z } from "zod";
import type { createOrderSchema } from "../validation";

/**
 * Regras de pedido: criação, transições de status e cancelamento.
 *
 * A máquina de estados é explícita — um pedido não pode "pular" de
 * Aguardando pagamento direto para Entregue, e um pedido cancelado ou já
 * finalizado não muda mais de estado.
 */

/** Transições permitidas a partir de cada status. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  AWAITING_PAYMENT: ["PAYMENT_CONFIRMED", "RECEIVED", "CANCELLED"],
  PAYMENT_CONFIRMED: ["RECEIVED", "PREPARING", "CANCELLED"],
  RECEIVED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "PICKED_UP", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  PICKED_UP: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from] ?? [];
}

export const orderInclude = {
  items: { orderBy: { productNameSnapshot: "asc" } },
  payments: { orderBy: { createdAt: "desc" } },
  statusHistory: { orderBy: { createdAt: "asc" } },
  address: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Cria um pedido.
 *
 * Todos os valores são recalculados aqui a partir do banco — o que o
 * navegador mandou de preço é simplesmente ignorado.
 */
export async function createOrder(userId: string, input: CreateOrderInput) {
  const settings = await getSettings();
  const storeStatus = getStoreStatus(settings);

  if (!storeStatus.open) {
    throw badRequest(
      storeStatus.nextOpening
        ? `A DS Espetos está fechada no momento. Abrimos ${storeStatus.nextOpening}.`
        : "A DS Espetos está fechada no momento.",
    );
  }

  // Idempotência: o mesmo clique duplicado não gera dois pedidos.
  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: orderInclude,
    });
    if (existing) {
      if (existing.userId !== userId) throw forbidden();
      return { order: existing, duplicated: true as const };
    }
  }

  if (input.deliveryType === "DELIVERY" && !settings.allowDelivery) {
    throw badRequest("A entrega está indisponível no momento. Escolha retirada no local.");
  }
  if (input.deliveryType === "PICKUP" && !settings.allowPickup) {
    throw badRequest("A retirada está indisponível no momento. Escolha entrega.");
  }

  const methodEnabled =
    (input.paymentMethod === "PIX" && settings.acceptPix) ||
    (input.paymentMethod === "CARD" && settings.acceptCard) ||
    (input.paymentMethod === "CASH" && settings.acceptCash);
  if (!methodEnabled) {
    throw badRequest("Esta forma de pagamento não está disponível no momento.");
  }

  // ------------------------------ endereço ---------------------------------
  let addressId: string | null = null;
  let addressSnapshot: Prisma.InputJsonValue | undefined;
  let neighborhood: string | null = null;

  if (input.deliveryType === "DELIVERY") {
    let address;
    if (input.addressId) {
      address = await prisma.address.findFirst({
        where: { id: input.addressId, userId, active: true },
      });
      if (!address) throw notFound("Endereço de entrega não encontrado.");
    } else if (input.newAddress) {
      const a = input.newAddress;
      if (a.isDefault) {
        await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      address = await prisma.address.create({
        data: {
          userId,
          label: a.label ?? "Entrega",
          street: a.street,
          number: a.number,
          complement: a.complement ?? null,
          neighborhood: a.neighborhood,
          city: a.city,
          state: a.state,
          postalCode: a.postalCode,
          reference: a.reference ?? null,
          isDefault: a.isDefault ?? false,
        },
      });
    } else {
      throw badRequest("Informe o endereço de entrega.");
    }

    addressId = address.id;
    neighborhood = address.neighborhood;
    addressSnapshot = {
      label: address.label,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      reference: address.reference,
    } satisfies Prisma.InputJsonValue;
  }

  // ---------------------------- preços (servidor) --------------------------
  const quote = await buildQuote({
    items: input.items,
    deliveryType: input.deliveryType,
    neighborhood,
    couponCode: input.couponCode ?? null,
    userId,
  });
  assertQuoteIsCheckoutable(quote);

  // Se o cupom informado não passou na validação, o pedido não segue calado.
  if (input.couponCode && !quote.coupon) {
    throw badRequest(quote.warnings[0] ?? "Cupom inválido.");
  }
  if (quote.warnings.length > 0 && quote.lines.length !== input.items.length) {
    throw conflict(quote.warnings[0]);
  }

  if (input.paymentMethod === "CASH" && input.changeForCents) {
    if (input.changeForCents < quote.totalCents) {
      throw badRequest("O valor informado para troco é menor que o total do pedido.");
    }
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, phone: true },
  });

  const order = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        userId,
        status: "AWAITING_PAYMENT",
        paymentStatus: "PENDING",
        paymentMethod: input.paymentMethod,
        deliveryType: input.deliveryType,
        subtotalCents: quote.subtotalCents,
        deliveryFeeCents: quote.deliveryFeeCents,
        discountCents: quote.discountCents,
        totalCents: quote.totalCents,
        changeForCents:
          input.paymentMethod === "CASH" && input.changeForCents ? input.changeForCents : null,
        couponId: quote.coupon?.id ?? null,
        couponCode: quote.coupon?.code ?? null,
        addressId,
        addressSnapshot,
        customerName: user.name,
        customerPhone: user.phone,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        estimatedMinutes: quote.estimatedMinutes,
        items: {
          create: quote.lines.map((line) => ({
            productId: line.productId,
            // Snapshot: este pedido guarda para sempre o nome e o preço de hoje.
            productNameSnapshot: line.name,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            subtotalCents: line.subtotalCents,
          })),
        },
        statusHistory: {
          create: { from: null, to: "AWAITING_PAYMENT", changedBy: userId },
        },
      },
      include: orderInclude,
    });

    if (quote.coupon) {
      await tx.coupon.update({
        where: { id: quote.coupon.id },
        data: { usageCount: { increment: 1 } },
      });
    }

    return createdOrder;
  });

  await audit({
    action: "order.created",
    userId,
    entity: "Order",
    entityId: order.id,
    metadata: { number: order.number, totalCents: order.totalCents, method: order.paymentMethod },
  });

  await notifyOrderStatus({
    userId,
    orderId: order.id,
    orderNumber: order.number,
    status: "AWAITING_PAYMENT",
  });

  return { order, duplicated: false as const };
}

/**
 * Muda o status de um pedido respeitando a máquina de estados,
 * grava o histórico e notifica o cliente.
 */
export async function changeOrderStatus(params: {
  orderId: string;
  to: OrderStatus;
  changedBy: string;
  note?: string | null;
  /** Pula a checagem de transição — usado apenas pelo webhook de pagamento. */
  force?: boolean;
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      status: true,
      number: true,
      userId: true,
      deliveryType: true,
      paymentStatus: true,
    },
  });
  if (!order) throw notFound("Pedido não encontrado.");
  if (order.status === params.to) return order;

  if (!params.force && !canTransition(order.status, params.to)) {
    throw conflict(
      `Não é possível mudar o pedido de "${order.status}" para "${params.to}".`,
    );
  }

  // Coerência entre tipo de recebimento e status final.
  if (params.to === "OUT_FOR_DELIVERY" && order.deliveryType !== "DELIVERY") {
    throw badRequest("Pedidos para retirada não saem para entrega.");
  }
  if (params.to === "PICKED_UP" && order.deliveryType !== "PICKUP") {
    throw badRequest("Este pedido é para entrega, não para retirada.");
  }
  if (params.to === "DELIVERED" && order.deliveryType !== "DELIVERY") {
    throw badRequest("Este pedido é para retirada. Use o status \"Retirado\".");
  }

  const isFinal = params.to === "DELIVERED" || params.to === "PICKED_UP";

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: { id: order.id },
      data: {
        status: params.to,
        completedAt: isFinal ? new Date() : undefined,
        cancelledAt: params.to === "CANCELLED" ? new Date() : undefined,
        cancelReason: params.to === "CANCELLED" ? (params.note ?? null) : undefined,
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        from: order.status,
        to: params.to,
        changedBy: params.changedBy,
        note: params.note ?? null,
      },
    });
    return result;
  });

  await audit({
    action: "order.status_changed",
    userId: params.changedBy,
    entity: "Order",
    entityId: order.id,
    metadata: { from: order.status, to: params.to, number: order.number },
  });

  await notifyOrderStatus({
    userId: order.userId,
    orderId: order.id,
    orderNumber: order.number,
    status: params.to,
  });

  return updated;
}

/** Cancela um pedido, devolvendo o uso do cupom quando havia um. */
export async function cancelOrder(params: {
  orderId: string;
  changedBy: string;
  reason?: string | null;
  /** Cliente só pode cancelar enquanto o pedido ainda não foi preparado. */
  byCustomer?: boolean;
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, status: true, couponId: true, paymentStatus: true },
  });
  if (!order) throw notFound("Pedido não encontrado.");
  if (order.status === "CANCELLED") throw conflict("Este pedido já está cancelado.");
  if (["DELIVERED", "PICKED_UP"].includes(order.status)) {
    throw conflict("Pedidos já concluídos não podem ser cancelados.");
  }
  if (params.byCustomer && !["AWAITING_PAYMENT", "PAYMENT_CONFIRMED", "RECEIVED"].includes(order.status)) {
    throw conflict(
      "Seu pedido já está em preparação. Entre em contato com a loja para cancelar.",
    );
  }

  await prisma.$transaction(async (tx) => {
    if (order.couponId) {
      await tx.coupon.update({
        where: { id: order.couponId },
        data: { usageCount: { decrement: 1 } },
      });
    }
    await tx.payment.updateMany({
      where: { orderId: order.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  });

  return changeOrderStatus({
    orderId: params.orderId,
    to: "CANCELLED",
    changedBy: params.changedBy,
    note: params.reason ?? null,
    force: true,
  });
}

/** Formata o número do pedido como #000123. */
export function formatOrderNumber(number: number): string {
  return `#${String(number).padStart(6, "0")}`;
}
