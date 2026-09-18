import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { notFound, badRequest } from "@/server/errors";
import { audit } from "@/server/audit";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  await requireAdmin();
  const { id } = await params;

  const customer = await prisma.user.findUnique({
    where: { id },
    // Sem passwordHash: nem o admin acessa o hash da senha.
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      active: true,
      createdAt: true,
      addresses: { where: { active: true } },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { items: true },
      },
    },
  });
  if (!customer) throw notFound("Cliente não encontrado.");

  return ok({ customer });
});

/** Ativar/desativar cliente (uso restrito; nunca altera senha). */
export const PATCH = route(async (request: Request, { params }: Params) => {
  await assertCsrf();
  const admin = await requireAdmin();
  const { id } = await params;
  const body = (await readJson(request)) as { active?: boolean };

  if (typeof body.active !== "boolean") throw badRequest("Informe o campo `active`.");
  if (id === admin.id) throw badRequest("Você não pode desativar a própria conta.");

  const user = await prisma.user.update({
    where: { id },
    data: { active: body.active },
    select: { id: true, name: true, email: true, active: true },
  });

  // Conta desativada perde as sessões abertas imediatamente.
  if (!body.active) await prisma.session.deleteMany({ where: { userId: id } });

  await audit({
    action: body.active ? "customer.activated" : "customer.deactivated",
    userId: admin.id,
    entity: "User",
    entityId: id,
  });

  return ok({ customer: user });
});
