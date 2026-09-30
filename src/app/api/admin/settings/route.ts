import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { settingsSchema } from "@/server/validation";
import { getSettings } from "@/server/services/settings";
import { listProviders } from "@/server/payments";
import { env } from "@/server/env";
import { audit } from "@/server/audit";

export const GET = route(async () => {
  await requireAdmin();
  const settings = await getSettings();
  return ok({
    settings,
    // Só o NOME do gateway e se ele está configurado. Nenhuma chave sai daqui.
    paymentProviders: listProviders(),
    activeProvider: env.paymentProvider,
    // Diagnóstico: quem está guardando as senhas. Nome, nunca credencial.
    identityProvider: env.authProvider,
  });
});

export const PUT = route(async (request: Request) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const body = settingsSchema.parse(await readJson(request));

  await getSettings(); // garante a existência da linha antes do update

  const settings = await prisma.settings.update({
    where: { id: "default" },
    data: {
      storeName: body.storeName,
      logoUrl: body.logoUrl ?? null,
      phone: body.phone ?? "",
      whatsapp: body.whatsapp ?? "",
      email: body.email ?? "",
      addressStreet: body.addressStreet ?? "",
      addressNumber: body.addressNumber ?? "",
      addressNeighborhood: body.addressNeighborhood ?? "",
      addressCity: body.addressCity ?? "",
      addressState: body.addressState ?? "",
      addressPostalCode: body.addressPostalCode ?? "",
      openingHours: body.openingHours as never,
      manualOpen: body.manualOpen,
      useManualSwitch: body.useManualSwitch,
      minLeadMinutes: body.minLeadMinutes,
      slotWindowMinutes: body.slotWindowMinutes,
      slotCapacity: body.slotCapacity,
      scheduleHorizonDays: body.scheduleHorizonDays,
      deliveryFeeCents: body.deliveryFeeCents,
      minOrderCents: body.minOrderCents,
      freeDeliveryAboveCents: body.freeDeliveryAboveCents,
      prepTimeMinutes: body.prepTimeMinutes,
      deliveryTimeMinutes: body.deliveryTimeMinutes,
      acceptPix: body.acceptPix,
      acceptCard: body.acceptCard,
      acceptCash: body.acceptCash,
      allowDelivery: body.allowDelivery,
      allowPickup: body.allowPickup,
    },
    include: { deliveryAreas: true },
  });

  await audit({
    action: "settings.updated",
    userId: admin.id,
    entity: "Settings",
    entityId: "default",
    metadata: {
      deliveryFeeCents: body.deliveryFeeCents,
      minOrderCents: body.minOrderCents,
      manualOpen: body.manualOpen,
      slotCapacity: body.slotCapacity,
      slotWindowMinutes: body.slotWindowMinutes,
    },
  });

  return ok({ settings });
});

export const dynamic = "force-dynamic";
