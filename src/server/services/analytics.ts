import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

/**
 * Consultas do dashboard e do módulo financeiro.
 *
 * Todos os números vêm de agregações reais no banco — nenhum valor é
 * inventado ou estimado. Pedidos cancelados nunca entram no faturamento.
 */

/** Só conta como faturamento o pedido não cancelado E com pagamento confirmado. */
const REVENUE_WHERE: Prisma.OrderWhereInput = {
  status: { not: "CANCELLED" },
  paymentStatus: "PAID",
};

export async function getDashboardMetrics() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOf7d = new Date(startOfToday.getTime() - 6 * 86400000);
  const startOf30d = new Date(startOfToday.getTime() - 29 * 86400000);

  const [
    todayOrders,
    todayRevenue,
    yesterdayRevenue,
    pending,
    preparing,
    ready,
    completedToday,
    cancelledToday,
    revenue7d,
    revenue30d,
    topProducts,
    recentOrders,
    dailySeries,
    paymentBreakdown,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.order.aggregate({
      where: { ...REVENUE_WHERE, createdAt: { gte: startOfToday } },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { ...REVENUE_WHERE, createdAt: { gte: startOfYesterday, lt: startOfToday } },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.order.count({
      where: { status: { in: ["AWAITING_PAYMENT", "PAYMENT_CONFIRMED", "RECEIVED"] } },
    }),
    prisma.order.count({ where: { status: "PREPARING" } }),
    prisma.order.count({ where: { status: { in: ["READY", "OUT_FOR_DELIVERY"] } } }),
    prisma.order.count({
      where: { status: { in: ["DELIVERED", "PICKED_UP"] }, createdAt: { gte: startOfToday } },
    }),
    prisma.order.count({ where: { status: "CANCELLED", createdAt: { gte: startOfToday } } }),
    prisma.order.aggregate({
      where: { ...REVENUE_WHERE, createdAt: { gte: startOf7d } },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { ...REVENUE_WHERE, createdAt: { gte: startOf30d } },
      _sum: { totalCents: true },
      _count: true,
    }),
    getTopProducts({ gte: startOf30d }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        number: true,
        customerName: true,
        totalCents: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        deliveryType: true,
        createdAt: true,
      },
    }),
    getDailyRevenue(14),
    getPaymentBreakdown({ gte: startOf30d }),
  ]);

  const todayRevenueCents = todayRevenue._sum.totalCents ?? 0;
  const todayPaidCount = todayRevenue._count;

  return {
    today: {
      orders: todayOrders,
      paidOrders: todayPaidCount,
      revenueCents: todayRevenueCents,
      averageTicketCents: todayPaidCount ? Math.round(todayRevenueCents / todayPaidCount) : 0,
      completed: completedToday,
      cancelled: cancelledToday,
    },
    yesterday: {
      revenueCents: yesterdayRevenue._sum.totalCents ?? 0,
      orders: yesterdayRevenue._count,
    },
    queue: { pending, preparing, ready },
    last7Days: {
      revenueCents: revenue7d._sum.totalCents ?? 0,
      orders: revenue7d._count,
      averageTicketCents: revenue7d._count
        ? Math.round((revenue7d._sum.totalCents ?? 0) / revenue7d._count)
        : 0,
    },
    last30Days: {
      revenueCents: revenue30d._sum.totalCents ?? 0,
      orders: revenue30d._count,
      averageTicketCents: revenue30d._count
        ? Math.round((revenue30d._sum.totalCents ?? 0) / revenue30d._count)
        : 0,
    },
    topProducts,
    recentOrders,
    dailySeries,
    paymentBreakdown,
  };
}

/** Produtos mais vendidos no período, por quantidade. */
export async function getTopProducts(createdAt?: { gte?: Date; lte?: Date }, limit = 8) {
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId", "productNameSnapshot"],
    where: {
      order: {
        status: { not: "CANCELLED" },
        ...(createdAt ? { createdAt } : {}),
      },
    },
    _sum: { quantity: true, subtotalCents: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  return grouped.map((row) => ({
    productId: row.productId,
    name: row.productNameSnapshot,
    quantity: row._sum.quantity ?? 0,
    revenueCents: row._sum.subtotalCents ?? 0,
  }));
}

/** Série diária de faturamento para o gráfico (últimos N dias). */
export async function getDailyRevenue(days = 14) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const orders = await prisma.order.findMany({
    where: { ...REVENUE_WHERE, createdAt: { gte: start } },
    select: { createdAt: true, totalCents: true },
  });

  const buckets = new Map<string, { revenueCents: number; orders: number }>();
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    buckets.set(day.toISOString().slice(0, 10), { revenueCents: 0, orders: 0 });
  }

  for (const order of orders) {
    const key = new Date(
      order.createdAt.getTime() - order.createdAt.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.revenueCents += order.totalCents;
      bucket.orders += 1;
    }
  }

  return [...buckets.entries()].map(([date, value]) => ({ date, ...value }));
}

/** Faturamento por forma de pagamento. */
export async function getPaymentBreakdown(createdAt?: { gte?: Date; lte?: Date }) {
  const grouped = await prisma.order.groupBy({
    by: ["paymentMethod"],
    where: { ...REVENUE_WHERE, ...(createdAt ? { createdAt } : {}) },
    _sum: { totalCents: true },
    _count: true,
  });

  const base = { PIX: { revenueCents: 0, orders: 0 }, CARD: { revenueCents: 0, orders: 0 }, CASH: { revenueCents: 0, orders: 0 } };
  for (const row of grouped) {
    base[row.paymentMethod] = { revenueCents: row._sum.totalCents ?? 0, orders: row._count };
  }
  return base;
}

/** Relatório financeiro completo de um período. */
export async function getFinanceReport(range: { gte?: Date; lte?: Date }) {
  const createdAt = range.gte || range.lte ? range : undefined;
  const periodWhere: Prisma.OrderWhereInput = createdAt ? { createdAt } : {};

  const [paid, allOrders, cancelled, refunded, awaiting, breakdown, topProducts, daily, deliverySplit] =
    await Promise.all([
      prisma.order.aggregate({
        where: { ...REVENUE_WHERE, ...periodWhere },
        _sum: { totalCents: true, subtotalCents: true, deliveryFeeCents: true, discountCents: true },
        _count: true,
      }),
      prisma.order.count({ where: periodWhere }),
      prisma.order.aggregate({
        where: { ...periodWhere, status: "CANCELLED" },
        _sum: { totalCents: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { ...periodWhere, paymentStatus: "REFUNDED" },
        _sum: { totalCents: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { ...periodWhere, paymentStatus: "PENDING", status: { not: "CANCELLED" } },
        _sum: { totalCents: true },
        _count: true,
      }),
      getPaymentBreakdown(createdAt),
      getTopProducts(createdAt, 10),
      getDailyRevenue(30),
      prisma.order.groupBy({
        by: ["deliveryType"],
        where: { ...REVENUE_WHERE, ...periodWhere },
        _sum: { totalCents: true, deliveryFeeCents: true },
        _count: true,
      }),
    ]);

  const grossCents = paid._sum.totalCents ?? 0;
  const refundedCents = refunded._sum.totalCents ?? 0;

  return {
    grossRevenueCents: grossCents,
    // Líquido = bruto - reembolsos. Taxas de gateway, quando existirem,
    // entram aqui assim que o provedor for integrado.
    netRevenueCents: grossCents - refundedCents,
    productRevenueCents: paid._sum.subtotalCents ?? 0,
    deliveryFeesCents: paid._sum.deliveryFeeCents ?? 0,
    discountsCents: paid._sum.discountCents ?? 0,
    paidOrders: paid._count,
    totalOrders: allOrders,
    averageTicketCents: paid._count ? Math.round(grossCents / paid._count) : 0,
    cancelled: { count: cancelled._count, amountCents: cancelled._sum.totalCents ?? 0 },
    refunded: { count: refunded._count, amountCents: refundedCents },
    awaitingPayment: { count: awaiting._count, amountCents: awaiting._sum.totalCents ?? 0 },
    paymentBreakdown: breakdown,
    topProducts,
    daily,
    deliverySplit: deliverySplit.map((row) => ({
      deliveryType: row.deliveryType,
      orders: row._count,
      revenueCents: row._sum.totalCents ?? 0,
      feesCents: row._sum.deliveryFeeCents ?? 0,
    })),
  };
}
