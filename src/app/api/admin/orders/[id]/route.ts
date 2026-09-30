import { prisma } from "@/server/db";
import { route, ok } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { notFound } from "@/server/errors";
import { allowedTransitions, orderInclude } from "@/server/services/orders";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  await requireAdmin();
  const { id } = await params;

  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw notFound("Pedido não encontrado.");

  return ok({ order, allowedTransitions: allowedTransitions(order.status) });
});

export const dynamic = "force-dynamic";
