import { route, readJson, ok } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { cancelOrder } from "@/server/services/orders";

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, { params }: Params) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const { id } = await params;
  const body = (await readJson(request)) as { reason?: string };

  const order = await cancelOrder({
    orderId: id,
    changedBy: admin.id,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : null,
  });

  return ok({ order });
});
