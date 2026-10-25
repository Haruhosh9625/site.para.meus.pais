import { prisma } from "@/server/db";
import { route, readJson, ok, created } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { productSchema, slugify } from "@/server/validation";
import { conflict } from "@/server/errors";
import { audit } from "@/server/audit";

export const GET = route(async () => {
  await requireAdmin();
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ category: { position: "asc" } }, { position: "asc" }, { name: "asc" }],
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.category.findMany({ orderBy: { position: "asc" } }),
  ]);
  return ok({ products, categories });
});

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const body = productSchema.parse(await readJson(request));

  let slug = slugify(body.name);
  const clash = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;

  const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
  if (!category) throw conflict("Categoria inválida.");

  const product = await prisma.product.create({
    data: {
      name: body.name,
      slug,
      description: body.description ?? "",
      priceCents: body.priceCents,
      categoryId: body.categoryId,
      imageUrl: body.imageUrl ?? null,
      available: body.available ?? true,
      active: body.active ?? true,
      position: body.position ?? 0,
    },
    include: { category: { select: { id: true, name: true } } },
  });

  await audit({
    action: "product.created",
    userId: admin.id,
    entity: "Product",
    entityId: product.id,
    metadata: { name: product.name, priceCents: product.priceCents },
  });

  return created({ product });
});

export const dynamic = "force-dynamic";
