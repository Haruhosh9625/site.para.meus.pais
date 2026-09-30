import { prisma } from "@/server/db";
import { route, readJson, ok, created } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { deliveryAreaSchema } from "@/server/validation";
import { getSettings } from "@/server/services/settings";
import { audit } from "@/server/audit";

export const GET = route(async () => {
  await requireAdmin();
  const areas = await prisma.deliveryArea.findMany({ orderBy: { neighborhood: "asc" } });
  return ok({ areas });
});

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const body = deliveryAreaSchema.parse(await readJson(request));
  await getSettings();

  const area = await prisma.deliveryArea.upsert({
    where: {
      settingsId_neighborhood_city: {
        settingsId: "default",
        neighborhood: body.neighborhood,
        city: body.city ?? "",
      },
    },
    update: {
      feeCents: body.feeCents,
      minOrderCents: body.minOrderCents ?? 0,
      etaMinutes: body.etaMinutes ?? 30,
      active: body.active ?? true,
    },
    create: {
      settingsId: "default",
      neighborhood: body.neighborhood,
      city: body.city ?? "",
      feeCents: body.feeCents,
      minOrderCents: body.minOrderCents ?? 0,
      etaMinutes: body.etaMinutes ?? 30,
      active: body.active ?? true,
    },
  });

  await audit({ action: "delivery_area.saved", userId: admin.id, entity: "DeliveryArea", entityId: area.id });
  return created({ area });
});
