import { prisma } from "@/server/db";
import { route, readJson, created } from "@/server/api";
import { registerSchema } from "@/server/validation";
import { assertCsrf, getClientIp } from "@/server/auth";
import { getIdentityProvider } from "@/server/identity";
import { enforceRateLimit, pruneRateLimits } from "@/server/rate-limit";
import { conflict } from "@/server/errors";
import { audit } from "@/server/audit";
import { logger } from "@/server/logger";

/**
 * Cadastro.
 *
 * Ordem importa: a CREDENCIAL é criada primeiro, no provedor de identidade.
 * Se ela falhar (e-mail já usado, senha recusada pela política do provedor),
 * nenhuma linha pela metade sobra no banco. Só depois a linha de `users` é
 * gravada, com o endereço, em uma única operação.
 */
export const POST = route(async (request: Request) => {
  await assertCsrf();
  const ip = await getClientIp();
  // Limite por IP: impede criação automatizada de contas em massa.
  await enforceRateLimit(`register:${ip}`, 5, 60 * 15);
  void pruneRateLimits();

  const body = registerSchema.parse(await readJson(request));
  const provider = getIdentityProvider();

  const existing = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (existing) {
    throw conflict("Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.");
  }

  // A senha em texto puro nunca é gravada nem registrada em log.
  const credential = await provider.register({
    email: body.email,
    password: body.password,
    name: body.name,
    phone: body.phone,
  });

  const user = await prisma.user.create({
    data: {
      // Quando o provedor define a identidade (Supabase), o id da linha é o
      // mesmo UUID da credencial: uma identidade só em todo o sistema.
      ...(credential.authId ? { id: credential.authId } : {}),
      authUserId: credential.authId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      passwordHash: credential.passwordHash ?? null,
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

  // Provedor local: a identidade é o id da linha, conhecido só agora.
  if (!credential.authId) {
    await prisma.user.update({ where: { id: user.id }, data: { authUserId: user.id } });
  }

  if (credential.needsEmailConfirmation) {
    logger.info("auth:register_pending_confirmation", { userId: user.id });
    await audit({
      action: "auth.register_pending_confirmation",
      userId: user.id,
      entity: "User",
      entityId: user.id,
      ip,
    });
    return created({
      user,
      needsEmailConfirmation: true,
      message:
        "Conta criada! Confirme seu e-mail pelo link que enviamos e depois entre no site.",
    });
  }

  await provider.startSession(user.id);
  await audit({ action: "auth.register", userId: user.id, entity: "User", entityId: user.id, ip });

  return created({ user, needsEmailConfirmation: false });
});
