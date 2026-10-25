import { prisma } from "@/server/db";
import { route, ok } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { badRequest, notFound } from "@/server/errors";
import { confirmPayment } from "@/server/services/payments";

type Params = { params: Promise<{ id: string }> };

/**
 * Baixa manual do pagamento pelo administrador.
 *
 * É o caminho legítimo para dinheiro na entrega, cartão na maquininha e PIX
 * recebido fora do gateway. Continua sendo uma confirmação feita pelo
 * BACKEND, por um usuário autenticado com papel ADMIN — e fica registrada
 * no log de auditoria com o autor.
 */
export const POST = route(async (_request: Request, { params }: Params) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) throw notFound("Pedido não encontrado.");
  if (order.paymentStatus === "PAID") throw badRequest("Este pedido já está pago.");
  if (order.status === "CANCELLED") throw badRequest("Este pedido foi cancelado.");

  const pending =
    order.payments.find((p) => p.status === "PENDING") ??
    (await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "manual",
        providerPaymentId: `admin_${order.id}`,
        method: order.paymentMethod,
        amountCents: order.totalCents,
        status: "PENDING",
      },
    }));

  const payment = await confirmPayment({
    paymentId: pending.id,
    source: "admin",
    adminId: admin.id,
  });

  return ok({ payment });
});
