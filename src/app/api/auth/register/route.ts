import { prisma } from "@/server/db";
import { route, readJson, created } from "@/server/api";
import { registerSchema } from "@/server/validation";
import { hashPassword } from "@/server/password";
import { assertCsrf, createSession, getClientIp } from "@/server/auth";
import { enforceRateLimit, pruneRateLimits } from "@/server/rate-limit";
import { conflict } from "@/server/errors";
import { audit } from "@/server/audit";
import { headers } from "next/headers";

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const ip = await getClientIp();
  // Limite por IP: impede criação automatizada de contas em massa.
  await enforceRateLimit(`register:${ip}`, 5, 60 * 15);
  void pruneRateLimits();

  const body = registerSchema.parse(await readJson(request));

  const existing = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (existing) {
    throw conflict("Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.");
  }

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone,
      // A senha em texto puro nunca é gravada nem logada.
      passwordHash: await hashPassword(body.password),
      role: "CUSTOMER",
      addresses: body.address
        ? {
            create: {
              label: body.address.label ?? "Casa",
              street: body.address.street,
              number: body.address.number,
              complement: body.address.complement ?? null,
              neighborhood: body.address.neighborhood,
              city: body.address.city,
              state: body.address.state,
              postalCode: body.address.postalCode,
              reference: body.address.reference ?? null,
              isDefault: true,
            },
          }
        : undefined,
    },
    select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
  });

  const h = await headers();
  await createSession(user.id, { userAgent: h.get("user-agent"), ip });
  await audit({ action: "auth.register", userId: user.id, entity: "User", entityId: user.id, ip });

  return created({ user });
});
