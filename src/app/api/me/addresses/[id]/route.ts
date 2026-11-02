import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { addressSchema } from "@/server/validation";
import { assertCsrf, requireUser } from "@/server/auth";
import { notFound } from "@/server/errors";

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  await assertCsrf();
  const user = await requireUser();
  const { id } = await params;
  const body = addressSchema.parse(await readJson(request));

  // O filtro por userId garante que ninguém edita endereço de outra pessoa.
  const existing = await prisma.address.findFirst({ where: { id, userId: user.id, active: true } });
  if (!existing) throw notFound("Endereço não encontrado.");

  if (body.isDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const address = await prisma.address.update({
    where: { id },
    data: {
      label: body.label ?? existing.label,
      street: body.street,
      number: body.number,
      complement: body.complement ?? null,
      neighborhood: body.neighborhood,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      reference: body.reference ?? null,
      isDefault: body.isDefault ?? existing.isDefault,
    },
  });

  return ok({ address });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  await assertCsrf();
  const user = await requireUser();
  const { id } = await params;

  const existing = await prisma.address.findFirst({ where: { id, userId: user.id, active: true } });
  if (!existing) throw notFound("Endereço não encontrado.");

  // Soft delete: pedidos antigos continuam apontando para o endereço usado.
  await prisma.address.update({ where: { id }, data: { active: false, isDefault: false } });

  if (existing.isDefault) {
    const next = await prisma.address.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  return ok({ deleted: true });
});
