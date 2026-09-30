import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { changePasswordSchema } from "@/server/validation";
import { assertCsrf, getClientIp, requireUser } from "@/server/auth";
import { getIdentityProvider } from "@/server/identity";
import { enforceRateLimit } from "@/server/rate-limit";
import { badRequest } from "@/server/errors";
import { audit } from "@/server/audit";

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const user = await requireUser();
  const ip = await getClientIp();
  await enforceRateLimit(`change-password:${user.id}`, 10, 60 * 15);

  const body = changePasswordSchema.parse(await readJson(request));

  if (body.currentPassword === body.newPassword) {
    throw badRequest("A nova senha precisa ser diferente da atual.");
  }

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { authUserId: true },
  });

  const provider = getIdentityProvider();

  const authId = record.authUserId ?? user.id;

  // O provedor confere a senha atual — é ele quem a guarda.
  await provider.changePassword({
    authId,
    email: user.email,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  });

  /*
    Senha trocada derruba TODAS as sessões, em qualquer aparelho: se a senha
    antiga tinha vazado, quem estava usando a conta perde o acesso na hora.
    Em seguida este aparelho volta, já com a senha nova — assim quem trocou
    não é deslogado do próprio navegador.
  */
  await provider.signOutEverywhere(authId);
  await provider.signIn({ email: user.email, password: body.newPassword });

  await audit({ action: "auth.password_changed", userId: user.id, ip });

  return ok({
    message: "Senha alterada. As demais sessões foram encerradas.",
  });
});
