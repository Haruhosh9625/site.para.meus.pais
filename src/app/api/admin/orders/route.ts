import { prisma } from "@/server/db";
import { route, ok } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { buildOrderWhere } from "@/server/services/admin-filters";

/** Listagem de pedidos com filtros e busca. Exige papel ADMIN. */
export const GET = route(async (request: Request) => {
  await requireAdmin();
  const url = new URL(request.url);
  const where = buildOrderWhere(url.searchParams);

  // A cozinha trabalha por horário combinado, o financeiro por data de
  // entrada. Os dois pedidos de ordenação convivem no mesmo endpoint.
  const orderBy =
    url.searchParams.get("sort") === "schedule"
      ? ([{ scheduledFor: "asc" }, { createdAt: "asc" }] as const)
      : ([{ createdAt: "desc" }] as const);

  const take = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));
  const skip = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const [orders, total, aggregate] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [...orderBy],
      take,
      skip,
      include: {
        items: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({
      where: { ...where, status: { not: "CANCELLED" } },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  return ok({
    orders,
    total,
    summary: {
      count: aggregate._count,
      revenueCents: aggregate._sum.totalCents ?? 0,
    },
  });
});

export const dynamic = "force-dynamic";
