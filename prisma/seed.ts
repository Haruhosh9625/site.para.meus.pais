import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/password";
import { DEFAULT_OPENING_HOURS } from "../src/server/services/settings";

const prisma = new PrismaClient();

/**
 * Seed inicial da DS Espetos.
 *
 * Idempotente: pode rodar quantas vezes quiser. Produtos e categorias são
 * criados por `slug` com upsert, então rodar de novo não duplica o cardápio
 * nem sobrescreve preços que o administrador já tenha ajustado no painel
 * (só o que não existe é criado).
 *
 * Preços em CENTAVOS — R$ 8,00 é 800.
 */

const CATEGORIES = [
  { name: "Espetos", slug: "espetos", position: 1 },
  { name: "Bebidas", slug: "bebidas", position: 2 },
  { name: "Acompanhamentos", slug: "acompanhamentos", position: 3 },
];

const PRODUCTS = [
  // ------------------------------- Espetos --------------------------------
  {
    slug: "espeto-de-porco",
    name: "Espeto de Porco",
    description: "Cubos suculentos de pernil suíno temperados na hora e assados na brasa.",
    priceCents: 800,
    category: "espetos",
    image: "/produtos/espeto-porco.svg",
    position: 1,
  },
  {
    slug: "espeto-de-carne",
    name: "Espeto de Carne",
    description: "Carne bovina macia, temperada com sal grosso e grelhada no ponto certo.",
    priceCents: 800,
    category: "espetos",
    image: "/produtos/espeto-carne.svg",
    position: 2,
  },
  {
    slug: "espeto-de-toscana",
    name: "Espeto de Toscana",
    description: "Linguiça toscana artesanal, dourada por fora e suculenta por dentro.",
    priceCents: 800,
    category: "espetos",
    image: "/produtos/espeto-toscana.svg",
    position: 3,
  },
  {
    slug: "espeto-de-frango",
    name: "Espeto de Frango",
    description: "Filé de frango temperado, macio e assado na brasa.",
    priceCents: 800,
    category: "espetos",
    image: "/produtos/espeto-frango.svg",
    position: 4,
  },
  {
    slug: "espeto-de-frango-com-bacon",
    name: "Espeto de Frango com Bacon",
    description: "Frango envolto em bacon crocante — o mais pedido da casa.",
    priceCents: 800,
    category: "espetos",
    image: "/produtos/espeto-frango-bacon.svg",
    position: 5,
  },

  // ------------------------------- Bebidas --------------------------------
  {
    slug: "refrigerante-1-litro",
    name: "Refrigerante 1 litro",
    description: "Refrigerante gelado de 1 litro. Consulte os sabores disponíveis.",
    priceCents: 1000,
    category: "bebidas",
    image: "/produtos/refrigerante.svg",
    position: 1,
  },

  // ---------------------------- Acompanhamentos ---------------------------
  {
    slug: "completo",
    name: "Completo",
    description:
      "Acompanhamento completo da casa. Item independente: não vem junto com o espeto, " +
      "adicione separadamente ao seu pedido.",
    priceCents: 1200,
    category: "acompanhamentos",
    image: "/produtos/completo.svg",
    position: 1,
  },
];

async function seedCategories() {
  const map = new Map<string, string>();
  for (const category of CATEGORIES) {
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, position: category.position },
      create: category,
    });
    map.set(category.slug, record.id);
  }
  console.log(`  Categorias: ${map.size}`);
  return map;
}

async function seedProducts(categories: Map<string, string>) {
  let created = 0;
  let kept = 0;
  for (const product of PRODUCTS) {
    const categoryId = categories.get(product.category);
    if (!categoryId) throw new Error(`Categoria ausente: ${product.category}`);

    const existing = await prisma.product.findUnique({ where: { slug: product.slug } });
    if (existing) {
      // Não sobrescreve preço/descrição: o admin pode já ter ajustado.
      kept++;
      continue;
    }
    await prisma.product.create({
      data: {
        slug: product.slug,
        name: product.name,
        description: product.description,
        priceCents: product.priceCents,
        categoryId,
        imageUrl: product.image,
        position: product.position,
        available: true,
        active: true,
      },
    });
    created++;
  }
  console.log(`  Produtos: ${created} criados, ${kept} já existentes`);
}

async function seedSettings() {
  await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      storeName: "DS Espetos",
      phone: "",
      whatsapp: "",
      openingHours: DEFAULT_OPENING_HOURS as never,
      // Valores de negócio começam zerados de propósito: quem define é o
      // administrador em /admin/configuracoes, nunca o código.
      deliveryFeeCents: 0,
      minOrderCents: 0,
      prepTimeMinutes: 30,
      deliveryTimeMinutes: 20,
      // A DS Espetos ainda não entrega: só retirada agendada. O dia em que
      // a entrega começar, é um clique em /admin/configuracoes — nada aqui
      // precisa mudar.
      allowDelivery: false,
      allowPickup: true,
      // Agendamento: meia hora de antecedência, janelas de 30 minutos,
      // sem limite de pedidos por janela (o administrador liga o limite
      // quando a cozinha precisar) e apenas para o dia de hoje.
      minLeadMinutes: 30,
      slotWindowMinutes: 30,
      slotCapacity: 0,
      scheduleHorizonDays: 0,
    },
  });
  console.log("  Configurações: prontas");
}

/**
 * Administrador inicial.
 *
 * A senha NUNCA está no código: vem de SEED_ADMIN_PASSWORD. Sem essa
 * variável, nenhum admin é criado e o seed apenas avisa como fazer.
 */
async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      "  Administrador: não criado (defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env,\n" +
        "                  ou rode `npm run admin:create`)",
    );
    return;
  }

  if (password.length < 10) {
    throw new Error(
      "SEED_ADMIN_PASSWORD precisa ter pelo menos 10 caracteres. " +
        "Escolha uma senha forte — ela dá acesso total ao painel.",
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "ADMIN") {
      await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
      console.log(`  Administrador: ${email} promovido a ADMIN`);
    } else {
      console.log(`  Administrador: ${email} já existe (senha inalterada)`);
    }
    return;
  }

  await prisma.user.create({
    data: {
      name: process.env.SEED_ADMIN_NAME?.trim() || "Administrador",
      email,
      phone: (process.env.SEED_ADMIN_PHONE ?? "").replace(/\D/g, "") || "00000000000",
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    },
  });
  console.log(`  Administrador: ${email} criado`);
}

async function main() {
  console.log("Semeando a base da DS Espetos...");
  const categories = await seedCategories();
  await seedProducts(categories);
  await seedSettings();
  await seedAdmin();
  console.log("Seed concluído.");
}

main()
  .catch((error) => {
    console.error("Falha no seed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
