import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { updateProfileSchema } from "@/server/validation";
import { assertCsrf, getCurrentUser, requireUser } from "@/server/auth";
import { getIdentityProvider } from "@/server/identity";
import { conflict } from "@/server/errors";
import { audit } from "@/server/audit";

/** Perfil do usuário logado. Devolve `user: null` quando não há sessão. */
export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });

  const [addresses, unreadNotifications] = await Promise.all([
    prisma.address.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    prisma.notification.count({
      where: { userId: user.id, channel: "IN_APP", readAt: null },
    }),
  ]);

  return ok({ user, addresses, unreadNotifications });
});

/** Edição dos dados pessoais. */
export const PATCH = route(async (request: Request) => {
  await assertCsrf();
  const current = await requireUser();
  const body = updateProfileSchema.parse(await readJson(request));

  if (body.email !== current.email) {
    const taken = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });
    if (taken && taken.id !== current.id) {
      throw conflict("Este e-mail já está em uso por outra conta.");
    }
  }

  /*
    Trocar de e-mail é trocar a credencial de acesso, então o provedor de
    identidade precisa saber. Alguns provedores (o Supabase, por padrão)
    exigem confirmação no endereço novo: até o clique no link, o e-mail do
    perfil NÃO pode mudar aqui, senão a pessoa não conseguiria mais entrar.
  */
  let emailAplicado = true;
  if (body.email !== current.email) {
    const record = await prisma.user.findUniqueOrThrow({
      where: { id: current.id },
      select: { authUserId: true },
    });
    const resultado = await getIdentityProvider().updateEmail({
      authId: record.authUserId ?? current.id,
      email: body.email,
    });
    emailAplicado = resultado.applied;
  }

  const user = await prisma.user.update({
    where: { id: current.id },
    data: {
      name: body.name,
      phone: body.phone,
      ...(emailAplicado ? { email: body.email } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
  });

  await audit({ action: "user.profile_updated", userId: current.id, entity: "User", entityId: current.id });

  return ok({
    user,
    ...(emailAplicado
      ? {}
      : {
          message:
            "Enviamos um link para o novo e-mail. Ele passa a valer depois que você confirmar.",
        }),
  });
});
