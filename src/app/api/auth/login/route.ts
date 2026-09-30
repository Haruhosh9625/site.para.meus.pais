import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { loginSchema } from "@/server/validation";
import { assertCsrf, getClientIp, getCurrentUser } from "@/server/auth";
import { getIdentityProvider } from "@/server/identity";
import { enforceRateLimit, pruneRateLimits } from "@/server/rate-limit";
import { forbidden, unauthorized } from "@/server/errors";
import { audit } from "@/server/audit";

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const ip = await getClientIp();
  const body = loginSchema.parse(await readJson(request));

  // Dois limites: por IP (ataque distribuído) e por conta (força bruta focada).
  // Ficam desta lado do provedor de propósito: o limite vale mesmo quando
  // quem confere a senha é o Supabase.
  await enforceRateLimit(`login:ip:${ip}`, 20, 60 * 10);
  await enforceRateLimit(`login:email:${body.email}`, 8, 60 * 10);
  void pruneRateLimits();

  // A conta pode estar desativada pela loja — isso é decisão nossa, não do
  // provedor de identidade, e é conferida antes de abrir a sessão.
  const conta = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true, active: true },
  });
  if (conta && !conta.active) {
    throw forbidden("Esta conta está desativada. Fale com a loja.");
  }

  try {
    await getIdentityProvider().signIn({ email: body.email, password: body.password });
  } catch (error) {
    if (conta) await audit({ action: "auth.login_failed", userId: conta.id, ip });
    throw error;
  }

  // Releitura pelo caminho normal: cria a linha da aplicação se ela faltar e
  // devolve o papel direto do banco.
  const user = await getCurrentUser();
  if (!user) throw unauthorized("Não foi possível abrir a sessão. Tente novamente.");

  await audit({ action: "auth.login", userId: user.id, ip, metadata: { role: user.role } });

  return ok({ user });
});
