import { prisma } from "@/server/db";
import { route, readJson, ok, created } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { categorySchema, slugify } from "@/server/validation";
import { audit } from "@/server/audit";

export const GET = route(async () => {
  await requireAdmin();
  const categories = await prisma.category.findMany({
    orderBy: { position: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return ok({ categories });
});

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const body = categorySchema.parse(await readJson(request));

  const category = await prisma.category.create({
    data: {
      name: body.name,
      slug: slugify(body.name) || `categoria-${Date.now().toString(36)}`,
      position: body.position ?? 0,
      active: body.active ?? true,
    },
  });

  await audit({ action: "category.created", userId: admin.id, entity: "Category", entityId: category.id });
  return created({ category });
});
