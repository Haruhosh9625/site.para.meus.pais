import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { loginSchema } from "@/server/validation";
import { verifyPassword } from "@/server/password";
import { assertCsrf, createSession, getClientIp } from "@/server/auth";
import { enforceRateLimit, pruneRateLimits } from "@/server/rate-limit";
import { unauthorized, forbidden } from "@/server/errors";
import { audit } from "@/server/audit";
import { headers } from "next/headers";

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const ip = await getClientIp();
  const body = loginSchema.parse(await readJson(request));

  // Dois limites: por IP (ataque distribuído) e por conta (força bruta focada).
  await enforceRateLimit(`login:ip:${ip}`, 20, 60 * 10);
  await enforceRateLimit(`login:email:${body.email}`, 8, 60 * 10);
  void pruneRateLimits();

  const user = await prisma.user.findUnique({ where: { email: body.email } });

  // Mensagem genérica de propósito: não revela se o e-mail existe.
  const invalid = unauthorized("E-mail ou senha incorretos.");

  if (!user) {
    // Gasta o mesmo tempo de um hash real para não vazar a existência da conta.
    await verifyPassword(body.password, "scrypt$32768$8$3$AAAA$AAAA");
    throw invalid;
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    await audit({ action: "auth.login_failed", userId: user.id, ip });
    throw invalid;
  }
  if (!user.active) throw forbidden("Esta conta está desativada. Fale com a loja.");

  const h = await headers();
  await createSession(user.id, { userAgent: h.get("user-agent"), ip });
  await audit({ action: "auth.login", userId: user.id, ip, metadata: { role: user.role } });

  return ok({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});
