import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { assertCsrf, requireUser } from "@/server/auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { notFound } from "@/server/errors";
import { rescheduleSchema } from "@/server/validation";
import { rescheduleOrder } from "@/server/services/orders";

type Params = { params: Promise<{ id: string }> };

/** O cliente remarca a retirada, enquanto o preparo não começou. */
export const POST = route(async (request: Request, { params }: Params) => {
  await assertCsrf();
  const user = await requireUser();
  const { id } = await params;
  await enforceRateLimit(`reschedule:${user.id}`, 10, 60 * 10);

  const body = rescheduleSchema.parse(await readJson(request));

  const order = await prisma.order.findFirst({
    where: user.role === "ADMIN" ? { id } : { id, userId: user.id },
    select: { id: true },
  });
  if (!order) throw notFound("Pedido não encontrado.");

  const updated = await rescheduleOrder({
    orderId: order.id,
    scheduledFor: body.scheduledFor,
    changedBy: user.id,
    byCustomer: user.role !== "ADMIN",
  });

  return ok({ order: updated });
});
