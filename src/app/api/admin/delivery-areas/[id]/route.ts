import { prisma } from "@/server/db";
import { route, ok } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { audit } from "@/server/audit";

type Params = { params: Promise<{ id: string }> };

export const DELETE = route(async (_request: Request, { params }: Params) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const { id } = await params;

  await prisma.deliveryArea.delete({ where: { id } });
  await audit({ action: "delivery_area.deleted", userId: admin.id, entity: "DeliveryArea", entityId: id });
  return ok({ deleted: true });
});
