/**
 * Token CSRF assinado, sem estado no banco.
 *
 * Antes o segredo de CSRF morava na linha da sessão. Com o Supabase Auth não
 * existe linha de sessão nossa — a sessão é um JWT em cookie —, então o token
 * passou a ser auto-verificável: `nonce.timestamp.HMAC(SESSION_SECRET, ...)`.
 * O servidor confere a assinatura e a validade sem consultar nada.
 *
 * Por que isso é seguro: o cookie é do nosso domínio e SameSite=Lax, então
 * um site malicioso não consegue LER o valor para repeti-lo no cabeçalho, e
 * não consegue forjar um novo porque não tem o SESSION_SECRET. Junto com a
 * conferência de Origin/Referer (em assertCsrf), são duas barreiras
 * independentes.
 *
 * Duas decisões de implementação, ambas para este módulo rodar TAMBÉM no
 * middleware, que o Next executa no runtime Edge:
 *
 *  • usa Web Crypto (globalThis.crypto), não `node:crypto` — que não existe
 *    no Edge. Por isso as funções são assíncronas;
 *  • lê SESSION_SECRET direto de process.env em vez de importar
 *    src/server/env.ts, que mexe em process.env.TZ e é feito para o runtime
 *    Node.
 */

export const CSRF_COOKIE = "ds_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Validade do token. Recarregar a página emite outro. */
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET ausente: sem ele não há proteção de CSRF.");
  }
  return "dev-only-session-secret-change-me";
}

async function sign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparação em tempo constante, sem depender de node:crypto. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Emite um token novo: "nonce.timestamp.assinatura". */
export async function issueCsrfToken(): Promise<string> {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const issuedAt = Math.floor(Date.now() / 1000).toString(36);
  const payload = `${nonce}.${issuedAt}`;
  return `${payload}.${await sign(payload)}`;
}

/** Confere assinatura e validade. Não lança: devolve true/false. */
export async function verifyCsrfToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [nonce, issuedAt, signature] = parts;
  if (!nonce || !issuedAt || !signature) return false;

  if (!safeEqualHex(signature, await sign(`${nonce}.${issuedAt}`))) return false;

  const seconds = parseInt(issuedAt, 36);
  if (!Number.isFinite(seconds)) return false;

  const age = Math.floor(Date.now() / 1000) - seconds;
  // Tokens do futuro (relógio adiantado no proxy) também são recusados.
  return age >= -60 && age <= MAX_AGE_SECONDS;
}
