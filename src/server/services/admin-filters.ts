import type { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";

/**
 * Tradução dos filtros da tela de pedidos para uma cláusula `where` do Prisma.
 * Fica isolado aqui porque o dashboard, a listagem e o financeiro usam o
 * mesmo vocabulário de período.
 */

export type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "month" | "all" | "custom";

/** Início do dia no fuso local do servidor. */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function resolvePeriod(
  period: PeriodKey,
  from?: string | null,
  to?: string | null,
): { gte?: Date; lte?: Date; label: string } {
  const now = new Date();

  switch (period) {
    case "today":
      return { gte: startOfDay(now), label: "Hoje" };
    case "yesterday": {
      const start = startOfDay(new Date(now.getTime() - 86400000));
      const end = new Date(start.getTime() + 86400000 - 1);
      return { gte: start, lte: end, label: "Ontem" };
    }
    case "7d":
      return { gte: startOfDay(new Date(now.getTime() - 6 * 86400000)), label: "Últimos 7 dias" };
    case "30d":
      return { gte: startOfDay(new Date(now.getTime() - 29 * 86400000)), label: "Últimos 30 dias" };
    case "month":
      return { gte: new Date(now.getFullYear(), now.getMonth(), 1), label: "Este mês" };
    case "custom": {
      const gte = from ? startOfDay(new Date(from)) : undefined;
      const lte = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : undefined;
      return {
        gte: gte && !Number.isNaN(gte.getTime()) ? gte : undefined,
        lte: lte && !Number.isNaN(lte.getTime()) ? lte : undefined,
        label: "Período personalizado",
      };
    }
    default:
      return { label: "Todo o período" };
  }
}

export function buildOrderWhere(searchParams: URLSearchParams): Prisma.OrderWhereInput {
  const period = (searchParams.get("period") ?? "today") as PeriodKey;
  const range = resolvePeriod(period, searchParams.get("from"), searchParams.get("to"));

  const where: Prisma.OrderWhereInput = {};

  if (range.gte || range.lte) {
    where.createdAt = { ...(range.gte ? { gte: range.gte } : {}), ...(range.lte ? { lte: range.lte } : {}) };
  }

  const status = searchParams.get("status");
  if (status && status !== "all") where.status = status as OrderStatus;

  const paymentStatus = searchParams.get("paymentStatus");
  if (paymentStatus && paymentStatus !== "all") where.paymentStatus = paymentStatus as PaymentStatus;

  const paymentMethod = searchParams.get("paymentMethod");
  if (paymentMethod && paymentMethod !== "all") where.paymentMethod = paymentMethod as PaymentMethod;

  const deliveryType = searchParams.get("deliveryType");
  if (deliveryType && deliveryType !== "all") {
    where.deliveryType = deliveryType === "PICKUP" ? "PICKUP" : "DELIVERY";
  }

  const search = searchParams.get("search")?.trim();
  if (search) {
    const asNumber = Number(search.replace(/\D/g, ""));
    where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { customerPhone: { contains: search.replace(/\D/g, "") } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      ...(Number.isFinite(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
    ];
  }

  return where;
}
