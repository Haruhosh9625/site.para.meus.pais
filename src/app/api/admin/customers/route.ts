import { prisma } from "@/server/db";
import { route, ok } from "@/server/api";
import { requireAdmin } from "@/server/auth";

/**
 * Lista de clientes com métricas agregadas.
 *
 * O select é explícito e NUNCA inclui `passwordHash` — administradores não
 * têm como ver senha nenhuma, nem o hash.
 */
export const GET = route(async (request: Request) => {
  await requireAdmin();
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const skip = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const where = search
    ? {
        role: "CUSTOMER" as const,
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search.replace(/\D/g, "") } },
        ],
      }
    : { role: "CUSTOMER" as const };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        createdAt: true,
        orders: {
          where: { status: { not: "CANCELLED" } },
          select: { totalCents: true, createdAt: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const customers = users.map((user) => {
    const totalSpentCents = user.orders.reduce((sum, o) => sum + o.totalCents, 0);
    const lastOrderAt = user.orders.reduce<Date | null>(
      (latest, o) => (!latest || o.createdAt > latest ? o.createdAt : latest),
      null,
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      active: user.active,
      createdAt: user.createdAt,
      orderCount: user.orders.length,
      totalSpentCents,
      averageTicketCents: user.orders.length ? Math.round(totalSpentCents / user.orders.length) : 0,
      lastOrderAt,
    };
  });

  return ok({ customers, total });
});

export const dynamic = "force-dynamic";
