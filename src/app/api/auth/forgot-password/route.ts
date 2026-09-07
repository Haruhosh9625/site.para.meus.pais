import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { forgotPasswordSchema } from "@/server/validation";
import { assertCsrf, getClientIp } from "@/server/auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { generateToken, hashToken } from "@/server/tokens";
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
 * O token vai por e-mail. Enquanto o canal de e-mail não estiver
 * configurado (NOTIFY_EMAIL_ENABLED), o link é registrado no log do
 * servidor — visível para quem opera a aplicação, nunca para o cliente.
 */
export const POST = route(async (request: Request) => {
  await assertCsrf();
  const ip = await getClientIp();
  await enforceRateLimit(`forgot:${ip}`, 5, 60 * 15);

  const { email } = forgotPasswordSchema.parse(await readJson(request));
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (user) {
    await enforceRateLimit(`forgot:user:${user.id}`, 3, 60 * 30);

    // Invalida pedidos anteriores ainda não usados.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateToken(32);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        // Só o hash é guardado: um vazamento do banco não permite redefinir senhas.
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
      },
    });

    const link = `${env.appUrl}/redefinir-senha?token=${token}`;
    await notify({
      userId: user.id,
      event: "auth.password_reset_requested",
      title: "Redefinição de senha",
      body: `Use este link para criar uma nova senha (válido por 1 hora): ${link}`,
    });

    if (!env.notifications.emailEnabled) {
      logger.info("auth:password_reset_link", { userId: user.id, link });
    }
    await audit({ action: "auth.password_reset_requested", userId: user.id, ip });
  }

  return ok({
    message:
      "Se existir uma conta com este e-mail, enviamos as instruções para redefinir a senha.",
  });
});
