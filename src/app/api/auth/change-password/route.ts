import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { changePasswordSchema } from "@/server/validation";
import { assertCsrf, createSession, destroyAllSessions, getClientIp, requireUser } from "@/server/auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashPassword, verifyPassword } from "@/server/password";
import { badRequest } from "@/server/errors";
import { audit } from "@/server/audit";
import { headers } from "next/headers";

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const user = await requireUser();
  const ip = await getClientIp();
  await enforceRateLimit(`change-password:${user.id}`, 10, 60 * 15);

  const body = changePasswordSchema.parse(await readJson(request));

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!(await verifyPassword(body.currentPassword, record.passwordHash))) {
    throw badRequest("A senha atual está incorreta.");
  }
  if (body.currentPassword === body.newPassword) {
    throw badRequest("A nova senha precisa ser diferente da atual.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) },
  });

  // Derruba todas as sessões e cria uma nova para este aparelho.
  await destroyAllSessions(user.id);
  const h = await headers();
  await createSession(user.id, { userAgent: h.get("user-agent"), ip });
  await audit({ action: "auth.password_changed", userId: user.id, ip });

  return ok({ message: "Senha alterada. As demais sessões foram encerradas." });
});
