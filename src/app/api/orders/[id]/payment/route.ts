import { prisma } from "@/server/db";
import { route, ok } from "@/server/api";
import { assertCsrf, requireUser } from "@/server/auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { notFound } from "@/server/errors";
import { createChargeForOrder, toPublicPayment } from "@/server/services/payments";

type Params = { params: Promise<{ id: string }> };

/**
 * Reabre a cobrança de um pedido (PIX expirado, falha na primeira tentativa).
 *
 * Isto NÃO confirma pagamento algum: apenas gera um novo QR Code/checkout.
 * Quem confirma é o webhook do gateway ou um administrador.
 */
export const POST = route(async (_request: Request, { params }: Params) => {
  await assertCsrf();
  const user = await requireUser();
  const { id } = await params;
  await enforceRateLimit(`payment:${user.id}`, 15, 60 * 10);

  const order = await prisma.order.findFirst({
    where: user.role === "ADMIN" ? { id } : { id, userId: user.id },
    select: { id: true },
  });
  if (!order) throw notFound("Pedido não encontrado.");

  const payment = await createChargeForOrder(order.id);
  return ok({ payment: toPublicPayment(payment) });
});
