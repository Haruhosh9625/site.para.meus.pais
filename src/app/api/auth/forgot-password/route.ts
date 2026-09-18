import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { forgotPasswordSchema } from "@/server/validation";
import { assertCsrf, getClientIp } from "@/server/auth";
import { getIdentityProvider } from "@/server/identity";
import { enforceRateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { env } from "@/server/env";
import { notify } from "@/server/services/notifications";
import { logger } from "@/server/logger";

/**
 * Recuperação de senha.
 *
 * A resposta é SEMPRE a mesma, exista ou não a conta: assim a rota não
 * funciona como um verificador de e-mails cadastrados.
 *
 * Quem entrega a mensagem depende do provedor. No Supabase o e-mail sai de
 * lá (e por isso o projeto precisa de SMTP configurado). No provedor local,
 * o link volta para cá e vai pelo canal de notificações — ou, enquanto o
 * e-mail não estiver ligado, para o log do servidor, visível apenas para
 * quem opera a aplicação.
 */
export const POST = route(async (request: Request) => {
  await assertCsrf();
  const ip = await getClientIp();
  await enforceRateLimit(`forgot:${ip}`, 5, 60 * 15);

  const { email } = forgotPasswordSchema.parse(await readJson(request));
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, authUserId: true },
  });

  if (user) {
    await enforceRateLimit(`forgot:user:${user.id}`, 3, 60 * 30);

    const { link } = await getIdentityProvider().requestPasswordReset({
      email,
      authId: user.authUserId ?? user.id,
    });

    if (link) {
      await notify({
        userId: user.id,
        event: "auth.password_reset_requested",
        title: "Redefinição de senha",
        body: `Use este link para criar uma nova senha (válido por 1 hora): ${link}`,
      });
      if (!env.notifications.emailEnabled) {
        logger.info("auth:password_reset_link", { userId: user.id, link });
      }
    }

    await audit({ action: "auth.password_reset_requested", userId: user.id, ip });
  }

  return ok({
    message:
      "Se existir uma conta com este e-mail, enviamos as instruções para redefinir a senha.",
  });
});
