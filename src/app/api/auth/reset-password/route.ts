import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { resetPasswordSchema } from "@/server/validation";
import { assertCsrf, destroyAllSessions, getClientIp } from "@/server/auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashToken } from "@/server/tokens";
import { hashPassword } from "@/server/password";
import { badRequest } from "@/server/errors";
import { audit } from "@/server/audit";

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const ip = await getClientIp();
  await enforceRateLimit(`reset:${ip}`, 10, 60 * 15);

  const body = resetPasswordSchema.parse(await readJson(request));

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(body.token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest("Este link de redefinição é inválido ou expirou. Solicite um novo.");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(body.password) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  // Senha trocada: todas as sessões abertas caem, inclusive de outros aparelhos.
  await destroyAllSessions(record.userId);
  await audit({ action: "auth.password_reset", userId: record.userId, ip });

  return ok({ message: "Senha redefinida. Você já pode entrar com a nova senha." });
});
