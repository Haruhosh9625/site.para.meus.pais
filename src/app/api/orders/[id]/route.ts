import { prisma } from "@/server/db";
import { route, ok } from "@/server/api";
import { requireUser } from "@/server/auth";
import { notFound } from "@/server/errors";
import { orderInclude } from "@/server/services/orders";
import { toPublicPayment } from "@/server/services/payments";

type Params = { params: Promise<{ id: string }> };

/**
 * Acompanhamento do pedido. Serve tanto para a tela de status quanto para o
 * polling automático — por isso é leve e sempre sem cache.
 */
export const GET = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const order = await prisma.order.findFirst({
    // Admin enxerga qualquer pedido; cliente, apenas os seus.
    where: user.role === "ADMIN" ? { id } : { id, userId: user.id },
    include: orderInclude,
  });
  if (!order) throw notFound("Pedido não encontrado.");

  return ok({
    order: { ...order, payments: undefined },
    payments: order.payments.map(toPublicPayment),
  });
});

export const dynamic = "force-dynamic";
