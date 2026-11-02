import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { resetPasswordSchema } from "@/server/validation";
import { assertCsrf, getClientIp } from "@/server/auth";
import { getIdentityProvider } from "@/server/identity";
import { enforceRateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const ip = await getClientIp();
  await enforceRateLimit(`reset:${ip}`, 10, 60 * 15);

  const body = resetPasswordSchema.parse(await readJson(request));

  // O provedor valida o token e aplica a nova senha. Token inválido ou
  // expirado vira erro 400 com mensagem legível.
  const { authId } = await getIdentityProvider().resetPassword({
    token: body.token,
    password: body.password,
  });

  // Senha redefinida derruba todas as sessões abertas, inclusive a que o
  // próprio link de recuperação acabou de abrir: a partir daqui só entra
  // quem souber a senha nova.
  await getIdentityProvider().signOutEverywhere(authId);

  const user = await prisma.user.findFirst({
    where: { OR: [{ authUserId: authId }, { id: authId }] },
    select: { id: true },
  });
  if (user) await audit({ action: "auth.password_reset", userId: user.id, ip });

  return ok({ message: "Senha redefinida. Você já pode entrar com a nova senha." });
});
