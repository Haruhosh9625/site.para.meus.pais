import { prisma } from "@/server/db";
import { route, readJson, ok, created } from "@/server/api";
import { createOrderSchema } from "@/server/validation";
import { assertCsrf, getClientIp, requireUser } from "@/server/auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { createOrder, orderInclude } from "@/server/services/orders";
import { createChargeForOrder, toPublicPayment } from "@/server/services/payments";
import { logger } from "@/server/logger";
import { audit } from "@/server/audit";

/** Histórico de pedidos do cliente logado. */
export const GET = route(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const skip = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { items: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.order.count({ where: { userId: user.id } }),
  ]);

  return ok({ orders, total });
});

/**
 * Criação do pedido.
 *
 * Todo o cálculo acontece no servidor (ver services/pricing.ts) e a cobrança
 * é aberta no gateway em seguida. O pedido nasce em "Aguardando pagamento".
 */
export const POST = route(async (request: Request) => {
  await assertCsrf();
  const user = await requireUser();
  const ip = await getClientIp();
  await enforceRateLimit(`order:${user.id}`, 10, 60 * 10);
  // O IP fica registrado junto do pedido: ajuda a investigar fraude depois.
  void audit({ action: "order.request", userId: user.id, ip });

  const body = createOrderSchema.parse(await readJson(request));
  const { order, duplicated } = await createOrder(user.id, body);

  if (duplicated) {
    return ok({
      order,
      payment: order.payments[0] ? toPublicPayment(order.payments[0]) : null,
      duplicated: true,
    });
  }

  // A falha ao abrir a cobrança não pode perder o pedido: ele fica salvo
  // e o cliente consegue tentar de novo na tela de acompanhamento.
  let payment = null;
  try {
    const record = await createChargeForOrder(order.id);
    payment = toPublicPayment(record);
  } catch (error) {
    logger.error("order:charge_failed", {
      orderId: order.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const fresh = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: orderInclude,
  });

  return created({ order: fresh, payment });
});
