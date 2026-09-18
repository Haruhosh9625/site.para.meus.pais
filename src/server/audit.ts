import { prisma } from "./db";
import { logger } from "./logger";

/**
 * Registra um evento relevante (login, mudança de status, alteração de preço…)
 * tanto no log estruturado quanto na tabela `audit_logs`.
 *
 * Dois tipos de autor, propositalmente separados:
 *   - `userId`: id de um usuário real (há chave estrangeira para `users`);
 *   - `actor`:  rótulo livre para quando quem agiu não é uma pessoa
 *               (ex.: "system:gateway", quando o webhook do gateway
 *               confirma um pagamento sozinho).
 *
 * Usar um rótulo de sistema em `userId` violaria a chave estrangeira e o
 * registro de auditoria seria perdido — que é exatamente o que não pode
 * acontecer com um log de auditoria.
 */
export async function audit(params: {
  action: string;
  userId?: string | null;
  /** Autor não-humano, quando aplicável (ex.: "system:gateway"). */
  actor?: string | null;
  entity?: string;
  entityId?: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { action, userId, actor, entity, entityId, ip, metadata } = params;

  // Rótulos de sistema nunca vão para a coluna com chave estrangeira.
  const isSystemActor = typeof userId === "string" && userId.includes(":");
  const realUserId = isSystemActor ? null : (userId ?? null);
  const actorLabel = actor ?? (isSystemActor ? userId : null);

  const fullMetadata = { ...(metadata ?? {}), ...(actorLabel ? { actor: actorLabel } : {}) };

  logger.info(`audit:${action}`, { userId: realUserId, entity, entityId, ...fullMetadata });

  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: realUserId,
        entity: entity ?? null,
        entityId: entityId ?? null,
        ip: ip ?? null,
        metadata: fullMetadata as never,
      },
    });
  } catch (error) {
    logger.warn("audit:persist_failed", { action, error: String(error) });
  }
}
