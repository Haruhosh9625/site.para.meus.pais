import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Hash de senha com scrypt (KDF memory-hard recomendada pela OWASP).
 *
 * Parâmetros: N=2^15, r=8, p=3 — dentro das configurações mínimas
 * recomendadas pela OWASP Password Storage Cheat Sheet.
 * O formato guardado é autodescritivo, então os parâmetros podem ser
 * aumentados no futuro sem invalidar os hashes antigos:
 *
 *   scrypt$N$r$p$<salt-base64>$<hash-base64>
 *
 * A senha em texto puro NUNCA é gravada, logada ou devolvida por uma API.
 */
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEYLEN = 64;
const MAXMEM = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");

    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
      maxmem: MAXMEM,
    });

    // Comparação em tempo constante: evita ataques de temporização.
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Regras mínimas de senha, usadas no cadastro e na troca de senha. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (password.length > 200) return "A senha é longa demais (máximo 200 caracteres).";
  if (!/[a-zA-Z]/.test(password)) return "A senha deve conter pelo menos uma letra.";
  if (!/[0-9]/.test(password)) return "A senha deve conter pelo menos um número.";
  return null;
}
