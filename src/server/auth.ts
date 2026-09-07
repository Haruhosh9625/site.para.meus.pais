import { cookies, headers } from "next/headers";
import type { Role, User } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { generateToken, hashToken, safeEqual } from "./tokens";
import { forbidden, unauthorized } from "./errors";

export const SESSION_COOKIE = "ds_session";
export const CSRF_COOKIE = "ds_csrf";
export const CSRF_HEADER = "x-csrf-token";

export type SessionUser = Pick<User, "id" | "name" | "email" | "phone" | "role" | "createdAt">;

const sessionSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  createdAt: true,
} as const;

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

/**
 * Cria uma sessão: gera um token opaco, grava apenas o HASH no banco e
 * devolve o token em um cookie httpOnly. Mesmo com acesso de leitura ao
 * banco, ninguém consegue reconstruir um cookie de sessão válido.
 */
export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
) {
  const token = generateToken(32);
  const csrfSecret = generateToken(24);
  const maxAge = env.sessionDays * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + maxAge * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfSecret,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(maxAge));
  // O cookie de CSRF é legível por JavaScript de propósito: o front precisa
  // lê-lo para reenviá-lo no cabeçalho (padrão double-submit).
  store.set(CSRF_COOKIE, csrfSecret, { ...cookieOptions(maxAge), httpOnly: false });

  return { token, csrfSecret, expiresAt };
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

/** Encerra todas as sessões do usuário (usado ao trocar/redefinir a senha). */
export async function destroyAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Usuário da requisição atual, ou null. Nunca lança. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, user: { select: { ...sessionSelect, active: true } } },
  });

  if (!session || session.expiresAt < new Date() || !session.user.active) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const { active: _active, ...user } = session.user;
  return user;
}

/** Exige um usuário autenticado. Lança 401 quando não há sessão. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/** Exige um papel específico. Base do controle de acesso do /admin. */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) throw forbidden();
  return user;
}

export const requireAdmin = () => requireRole("ADMIN");

// ------------------------------- CSRF / origem ------------------------------

/**
 * Proteção CSRF em duas camadas para toda requisição que altera estado:
 *
 *  1. Origin/Referer precisa bater com a origem da própria aplicação.
 *     Um site malicioso não consegue forjar esse cabeçalho.
 *  2. Double-submit: o cabeçalho x-csrf-token precisa ser igual ao segredo
 *     guardado na sessão. Como o cookie é SameSite=Lax e outra origem não
 *     consegue lê-lo, o atacante não tem como montar o cabeçalho.
 */
export async function assertCsrf() {
  const h = await headers();
  const store = await cookies();

  const origin = h.get("origin");
  const referer = h.get("referer");
  const host = h.get("host");

  const allowedHosts = new Set<string>();
  if (host) allowedHosts.add(host.toLowerCase());
  try {
    allowedHosts.add(new URL(env.appUrl).host.toLowerCase());
  } catch {
    /* APP_URL inválida — o host da requisição já cobre o caso comum */
  }

  const sourceUrl = origin || referer;
  if (sourceUrl) {
    let sourceHost: string;
    try {
      sourceHost = new URL(sourceUrl).host.toLowerCase();
    } catch {
      throw forbidden("Origem da requisição inválida.");
    }
    if (!allowedHosts.has(sourceHost)) {
      throw forbidden("Origem da requisição não autorizada.");
    }
  }

  // Sem sessão não há o que proteger com token (ex.: login e cadastro).
  const sessionToken = store.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
    select: { csrfSecret: true },
  });
  if (!session) return;

  const provided = h.get(CSRF_HEADER) ?? "";
  if (!provided || !safeEqual(provided, session.csrfSecret)) {
    throw forbidden("Token CSRF ausente ou inválido. Recarregue a página e tente novamente.");
  }
}

/** IP do cliente considerando proxies reversos. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
