import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { couponSchema } from "@/server/validation";
import { notFound } from "@/server/errors";
import { audit } from "@/server/audit";

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const { id } = await params;

  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw notFound("Cupom não encontrado.");

  const body = couponSchema.partial().parse(await readJson(request));

  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      code: body.code ?? existing.code,
      description: body.description ?? existing.description,
      discountType: body.discountType ?? existing.discountType,
      discountValue: body.discountValue ?? existing.discountValue,
      minOrderCents: body.minOrderCents ?? existing.minOrderCents,
      maxDiscountCents: body.maxDiscountCents ?? existing.maxDiscountCents,
      startsAt: body.startsAt === undefined ? existing.startsAt : body.startsAt ? new Date(body.startsAt) : null,
      expiresAt: body.expiresAt === undefined ? existing.expiresAt : body.expiresAt ? new Date(body.expiresAt) : null,
      usageLimit: body.usageLimit === undefined ? existing.usageLimit : body.usageLimit,
      perUserLimit: body.perUserLimit === undefined ? existing.perUserLimit : body.perUserLimit,
      active: body.active ?? existing.active,
    },
  });

  await audit({ action: "coupon.updated", userId: admin.id, entity: "Coupon", entityId: id });
  return ok({ coupon });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const { id } = await params;

  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  });
  if (!coupon) throw notFound("Cupom não encontrado.");

  // Cupom já usado é desativado, nunca apagado: preserva o histórico do pedido.
  if (coupon._count.orders > 0) {
    const updated = await prisma.coupon.update({ where: { id }, data: { active: false } });
    return ok({
      coupon: updated,
      deleted: false,
      message: "Cupom desativado (já foi usado em pedidos).",
    });
  }

  await prisma.coupon.delete({ where: { id } });
  await audit({ action: "coupon.deleted", userId: admin.id, entity: "Coupon", entityId: id });
  return ok({ deleted: true });
});
