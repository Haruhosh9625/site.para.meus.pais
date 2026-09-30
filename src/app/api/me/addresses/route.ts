import { prisma } from "@/server/db";
import { route, readJson, ok, created } from "@/server/api";
import { addressSchema } from "@/server/validation";
import { assertCsrf, requireUser } from "@/server/auth";
import { badRequest } from "@/server/errors";

export const GET = route(async () => {
  const user = await requireUser();
  const addresses = await prisma.address.findMany({
    where: { userId: user.id, active: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return ok({ addresses });
});

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const user = await requireUser();
  const body = addressSchema.parse(await readJson(request));

  const count = await prisma.address.count({ where: { userId: user.id, active: true } });
  if (count >= 10) throw badRequest("Você atingiu o limite de 10 endereços salvos.");

  // Primeiro endereço já entra como padrão.
  const shouldBeDefault = body.isDefault === true || count === 0;
  if (shouldBeDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const address = await prisma.address.create({
    data: {
      userId: user.id,
      label: body.label ?? "Casa",
      street: body.street,
      number: body.number,
      complement: body.complement ?? null,
      neighborhood: body.neighborhood,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      reference: body.reference ?? null,
      isDefault: shouldBeDefault,
    },
  });

  return created({ address });
});
