import { prisma } from "@/server/db";
import { route, readJson, ok, created } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { couponSchema } from "@/server/validation";
import { conflict } from "@/server/errors";
import { audit } from "@/server/audit";

/**
 * CRUD de cupons. O sistema já nasce com o módulo pronto e funcional —
 * criar um cupom aqui passa a valer imediatamente no checkout.
 */
export const GET = route(async () => {
  await requireAdmin();
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } } },
  });
  return ok({ coupons });
});

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const body = couponSchema.parse(await readJson(request));

  const existing = await prisma.coupon.findUnique({ where: { code: body.code } });
  if (existing) throw conflict("Já existe um cupom com este código.");

  if (body.discountType === "PERCENT" && body.discountValue > 100) {
    throw conflict("Desconto percentual não pode passar de 100%.");
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: body.code,
      description: body.description ?? "",
      discountType: body.discountType,
      discountValue: body.discountValue,
      minOrderCents: body.minOrderCents ?? 0,
      maxDiscountCents: body.maxDiscountCents ?? 0,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      usageLimit: body.usageLimit ?? null,
      perUserLimit: body.perUserLimit ?? null,
      active: body.active ?? true,
    },
  });

  await audit({ action: "coupon.created", userId: admin.id, entity: "Coupon", entityId: coupon.id });
  return created({ coupon });
});
