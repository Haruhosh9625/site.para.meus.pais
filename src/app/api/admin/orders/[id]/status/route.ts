import { route, readJson, ok } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { orderStatusSchema } from "@/server/validation";
import { changeOrderStatus } from "@/server/services/orders";

type Params = { params: Promise<{ id: string }> };

/** Alteração de status pelo administrador, respeitando a máquina de estados. */
export const POST = route(async (request: Request, { params }: Params) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const { id } = await params;
  const body = orderStatusSchema.parse(await readJson(request));

  const order = await changeOrderStatus({
    orderId: id,
    to: body.status,
    changedBy: admin.id,
    note: body.note ?? null,
  });

  return ok({ order });
});
