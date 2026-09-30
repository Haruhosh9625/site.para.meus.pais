import { cookies, headers } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { CSRF_COOKIE, CSRF_HEADER, verifyCsrfToken } from "./csrf";
import { getIdentityProvider } from "./identity";
import type { SessionUser } from "./identity/types";
import { forbidden, unauthorized } from "./errors";
import { logger } from "./logger";

/**
 * Sessão, papéis e CSRF da aplicação.
 *
 * Este módulo NÃO sabe onde a senha mora: quem confere credencial é o
 * provedor de identidade (src/server/identity). Aqui fica o que é da
 * aplicação — achar a linha de `users`, exigir login, exigir papel ADMIN e
 * barrar requisição de outra origem.
 *
 * O papel (CUSTOMER/ADMIN) é lido SEMPRE do banco, nunca de um dado que
 * venha do navegador ou de dentro do JWT. Um token adulterado não vira
 * administrador.
 */

export { CSRF_COOKIE, CSRF_HEADER } from "./csrf";
export { SESSION_COOKIE } from "./identity";
export type { SessionUser } from "./identity/types";

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  createdAt: true,
  active: true,
} as const;

/**
 * Usuário da requisição atual, ou null. Nunca lança.
 *
 * Dois passos: o provedor diz quem é (validando o token junto à fonte), e
 * aqui buscamos a linha da aplicação por `authUserId`.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const provider = getIdentityProvider();

  const identity = await provider.current().catch(() => null);
  if (!identity) return null;

  let record = await prisma.user.findUnique({
    where: { authUserId: identity.authId },
    select: userSelect,
  });

  /*
    Credencial sem linha na aplicação.

    Acontece de dois jeitos legítimos: alguém criado direto no painel do
    Supabase, ou um cadastro em que a criação da credencial deu certo e a
    gravação da linha falhou. Em vez de deixar a pessoa presa em um limbo,
    criamos a linha a partir do que o provedor sabe. O papel nasce CUSTOMER
    — promover a ADMIN é sempre um ato deliberado (npm run admin:create).
  */
  if (!record) {
    record = await adoptIdentity(identity.authId, identity.email);
    if (!record) return null;
  }

  if (!record.active) return null;

  const { active: _active, ...user } = record;
  return user;
}

/** Cria (ou vincula) a linha de `users` de uma credencial já existente. */
async function adoptIdentity(authId: string, email: string) {
  // O e-mail pode já ter uma linha — caso de base migrada do provedor local.
  const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (byEmail) {
    logger.info("auth:identity_linked", { authId });
    return prisma.user
      .update({
        where: { id: byEmail.id },
        data: { authUserId: authId },
        select: userSelect,
      })
      .catch(() => null);
  }

  logger.info("auth:identity_adopted", { authId });
  return prisma.user
    .create({
      data: {
        authUserId: authId,
        email,
        // Sem perfil ainda: a tela /minha-conta pede nome e telefone.
        name: email.split("@")[0],
        phone: "",
        role: "CUSTOMER",
      },
      select: userSelect,
    })
    .catch(() => null);
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

/** Encerra a sessão deste aparelho. */
export async function destroyCurrentSession() {
  await getIdentityProvider().signOut();
  const store = await cookies();
  store.delete(CSRF_COOKIE);
}

/** Encerra as sessões do usuário em todos os aparelhos. */
export async function destroyAllSessions(appUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: appUserId },
    select: { authUserId: true },
  });
  await getIdentityProvider().signOutEverywhere(user?.authUserId ?? appUserId);
}

// ------------------------------- CSRF / origem ------------------------------

/**
 * Proteção CSRF em duas camadas para toda requisição que altera estado:
 *
 *  1. Origin/Referer precisa bater com a origem da própria aplicação.
 *     Um site malicioso não consegue forjar esse cabeçalho.
 *  2. Double-submit: o cabeçalho x-csrf-token tem de ser igual ao cookie
 *     ds_csrf E carregar uma assinatura HMAC válida do servidor. Outra
 *     origem não consegue ler o cookie (SameSite=Lax, domínio nosso) nem
 *     forjar a assinatura (não tem o SESSION_SECRET).
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

  /*
    Requisição sem sessão nenhuma (login, cadastro, recuperação de senha) não
    tem o que proteger com token: quem responde por ela é a checagem de
    origem acima, mais o limite de tentativas da própria rota.

    Havendo sessão, o token é OBRIGATÓRIO. A checagem não pode depender da
    presença do cookie ds_csrf: quem conseguisse suprimi-lo passaria livre.
  */
  const temSessao = store
    .getAll()
    .some((cookie) => cookie.name === "ds_session" || /^sb-.*-auth-token/.test(cookie.name));
  if (!temSessao) return;

  const cookieToken = store.get(CSRF_COOKIE)?.value ?? "";
  const provided = h.get(CSRF_HEADER) ?? "";

  if (!provided || provided !== cookieToken || !(await verifyCsrfToken(provided))) {
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
