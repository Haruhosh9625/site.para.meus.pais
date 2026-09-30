import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { productSchema } from "@/server/validation";
import { notFound } from "@/server/errors";
import { audit } from "@/server/audit";

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const { id } = await params;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw notFound("Produto não encontrado.");

  const body = productSchema.partial().parse(await readJson(request));

  const product = await prisma.product.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      priceCents: body.priceCents ?? existing.priceCents,
      categoryId: body.categoryId ?? existing.categoryId,
      imageUrl: body.imageUrl === undefined ? existing.imageUrl : (body.imageUrl || null),
      available: body.available ?? existing.available,
      active: body.active ?? existing.active,
      position: body.position ?? existing.position,
    },
    include: { category: { select: { id: true, name: true } } },
  });

  await audit({
    action: "product.updated",
    userId: admin.id,
    entity: "Product",
    entityId: id,
    metadata: {
      priceFrom: existing.priceCents,
      priceTo: product.priceCents,
      availableTo: product.available,
    },
  });

  return ok({ product });
});

/**
 * Remoção de produto.
 *
 * Produto já usado em algum pedido NUNCA é apagado — vira `active: false`.
 * Isso preserva o histórico: relatórios antigos continuam corretos e o
 * OrderItem mantém o vínculo com o produto original.
 */
export const DELETE = route(async (_request: Request, { params }: Params) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
  if (!product) throw notFound("Produto não encontrado.");

  if (product._count.items > 0) {
    const updated = await prisma.product.update({
      where: { id },
      data: { active: false, available: false },
    });
    await audit({
      action: "product.deactivated",
      userId: admin.id,
      entity: "Product",
      entityId: id,
      metadata: { reason: "usado em pedidos", orders: product._count.items },
    });
    return ok({
      product: updated,
      deleted: false,
      message:
        "Produto desativado (não excluído) porque já aparece em pedidos. O histórico foi preservado.",
    });
  }

  await prisma.product.delete({ where: { id } });
  await audit({ action: "product.deleted", userId: admin.id, entity: "Product", entityId: id });
  return ok({ deleted: true, message: "Produto excluído." });
});
