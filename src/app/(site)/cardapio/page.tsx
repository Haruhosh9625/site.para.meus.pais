import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { MenuClient } from "./menu-client";

export const metadata: Metadata = {
  title: "Cardápio",
  description:
    "Espetos de porco, carne, toscana, frango e frango com bacon a R$ 8,00. " +
    "Refrigerante 1 litro e o Completo, item independente.",
};

export const dynamic = "force-dynamic";

/**
 * Cardápio.
 *
 * Os produtos vêm do banco renderizados no servidor (rápido no celular,
 * indexável), e a interação de quantidade/carrinho acontece no cliente.
 */
export default async function CardapioPage() {
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

  return <MenuClient categories={categories.filter((category) => category.products.length > 0)} />;
}
