import { cookies, headers } from "next/headers";
import { prisma } from "../db";
import { env } from "../env";
import { hashPassword, verifyPassword } from "../password";
import { generateToken, hashToken } from "../tokens";
import { badRequest, unauthorized } from "../errors";
import type { IdentityProvider, IdentityRef, RegisterInput, RegisterResult } from "./types";

/**
 * Provedor local: a credencial mora neste banco.
 *
 * Hash scrypt em `users.password_hash` e sessão opaca na tabela `sessions`
 * (só o SHA-256 do token é guardado, então nem com acesso de leitura ao
 * banco alguém remonta um cookie válido).
 *
 * É o provedor de desenvolvimento e o que o teste end-to-end usa: assim a
 * suíte inteira roda sem depender de rede nem de credenciais externas.
 * Em produção o padrão é o Supabase — ver identity/index.ts.
 */

export const SESSION_COOKIE = "ds_session";

/** Hash de comparação usado quando a conta não existe, para não vazar isso pelo tempo de resposta. */
const DUMMY_HASH = "scrypt$32768$8$3$AAAA$AAAA";

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // `secure` só em produção: em HTTP local o navegador descartaria o cookie.
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

async function openSession(userId: string) {
  const token = generateToken(32);
  const maxAge = env.sessionDays * 24 * 60 * 60;
  const h = await headers();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfSecret: generateToken(24), // herança do esquema; o CSRF hoje é assinado
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      expiresAt: new Date(Date.now() + maxAge * 1000),
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(maxAge));
}

export const localIdentity: IdentityProvider = {
  id: "local",
  label: "Local (senha neste banco)",

  isConfigured: () => true,

  async register(input: RegisterInput): Promise<RegisterResult> {
    // A identidade local É a linha de `users`, que ainda não existe aqui.
    // Devolvemos só o hash; a rota cria a linha e chama startSession.
    return {
      authId: null,
      needsEmailConfirmation: false,
      passwordHash: await hashPassword(input.password),
    };
  },

  async startSession(appUserId: string) {
    await openSession(appUserId);
  },

  async signIn({ email, password }) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, active: true },
    });

    const invalid = unauthorized("E-mail ou senha incorretos.");

    if (!user || !user.passwordHash) {
      // Gasta o mesmo tempo de um hash real para não vazar a existência da conta.
      await verifyPassword(password, DUMMY_HASH);
      throw invalid;
    }
    if (!(await verifyPassword(password, user.passwordHash))) throw invalid;

    await openSession(user.id);
    return { authId: user.id };
  },

  async signOut() {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) {
      await prisma.session
        .deleteMany({ where: { tokenHash: hashToken(token) } })
        .catch(() => undefined);
    }
    store.delete(SESSION_COOKIE);
  },

  async signOutEverywhere(authId) {
    await prisma.session.deleteMany({ where: { userId: authId } });
  },

  async current(): Promise<IdentityRef | null> {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, expiresAt: true, user: { select: { id: true, email: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      }
      return null;
    }

    return { authId: session.user.id, email: session.user.email };
  },

  async requestPasswordReset({ authId }) {
    // Invalida pedidos anteriores ainda não usados.
    await prisma.passwordResetToken.updateMany({
      where: { userId: authId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateToken(32);
    await prisma.passwordResetToken.create({
      data: {
        userId: authId,
        // Só o hash é guardado: um vazamento do banco não permite redefinir senhas.
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return { link: `${env.appUrl}/redefinir-senha?token=${token}` };
  },

  async resetPassword({ token, password }) {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw badRequest("Este link de redefinição é inválido ou expirou. Solicite um novo.");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(password) },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { authId: record.userId };
  },

  async changePassword({ authId, currentPassword, newPassword }) {
    const record = await prisma.user.findUniqueOrThrow({
      where: { id: authId },
      select: { passwordHash: true },
    });

    if (!record.passwordHash || !(await verifyPassword(currentPassword, record.passwordHash))) {
      throw badRequest("A senha atual está incorreta.");
    }

    await prisma.user.update({
      where: { id: authId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
  },

  async updateEmail() {
    // No provedor local o e-mail da credencial É o da linha de `users`:
    // a própria rota de perfil já o atualizou.
    return { applied: true };
  },
};
