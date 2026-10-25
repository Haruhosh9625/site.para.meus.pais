import { prisma } from "@/server/db";
import { route, ok } from "@/server/api";

/**
 * Cardápio público.
 * Só produtos ativos aparecem; os indisponíveis vêm marcados para que a
 * tela possa mostrá-los esmaecidos, sem permitir a compra.
 */
export const GET = route(async () => {
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      products: {
        where: { active: true },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          priceCents: true,
          imageUrl: true,
          available: true,
        },
      },
    },
  });

  return ok({ categories: categories.filter((c) => c.products.length > 0) });
});
