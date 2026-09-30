import { PrismaClient } from "@prisma/client";

/**
 * Instância única do Prisma. Em desenvolvimento o hot-reload do Next
 * recria os módulos várias vezes; sem o cache global isso abriria
 * uma nova pool de conexões a cada alteração de arquivo.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
