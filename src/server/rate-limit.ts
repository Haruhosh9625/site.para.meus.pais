import { prisma } from "./db";
import { tooManyRequests } from "./errors";

/**
 * Rate limiting com janela fixa, persistido no banco.
 *
 * Fica no banco (e não em memória) de propósito: em produção a aplicação
 * roda em várias instâncias, e um contador em memória seria trivial de
 * contornar bastando alternar entre elas.
 */
export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  try {
    // Uma única ida ao banco: cria a janela ou incrementa a existente.
    const rows = await prisma.$queryRaw<Array<{ count: number; expires_at: Date }>>`
      INSERT INTO rate_limits (key, count, expires_at)
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.expires_at < ${now} THEN 1 ELSE rate_limits.count + 1 END,
        expires_at = CASE WHEN rate_limits.expires_at < ${now} THEN ${resetAt} ELSE rate_limits.expires_at END
      RETURNING count, expires_at
    `;

    const row = rows[0];
    const count = Number(row?.count ?? 1);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: row?.expires_at ?? resetAt,
    };
  } catch {
    // Se o contador falhar, não derrubamos o site — apenas deixamos passar.
    return { allowed: true, remaining: limit, resetAt };
  }
}

/** Versão que lança 429 direto, para usar no início de um handler. */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const result = await rateLimit(key, limit, windowSeconds);
  if (!result.allowed) {
    const seconds = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
    throw tooManyRequests(
      `Muitas tentativas. Tente novamente em ${seconds} segundo${seconds > 1 ? "s" : ""}.`,
    );
  }
  return result;
}

/** Limpeza das janelas expiradas (chamada periodicamente pelas rotas de auth). */
export async function pruneRateLimits() {
  try {
    await prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    /* melhor esforço */
  }
}
