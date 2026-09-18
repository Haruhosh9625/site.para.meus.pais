import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { assertCsrf, requireUser } from "@/server/auth";
import { notFound } from "@/server/errors";
import { cancelOrder } from "@/server/services/orders";

type Params = { params: Promise<{ id: string }> };

/** Cancelamento pelo próprio cliente (só antes de o preparo começar). */
export const POST = route(async (request: Request, { params }: Params) => {
  await assertCsrf();
  const user = await requireUser();
  const { id } = await params;
  const body = (await readJson(request)) as { reason?: string };

  const order = await prisma.order.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!order) throw notFound("Pedido não encontrado.");

  const updated = await cancelOrder({
    orderId: order.id,
    changedBy: user.id,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : "Cancelado pelo cliente",
    byCustomer: true,
  });

  return ok({ order: updated });
});
