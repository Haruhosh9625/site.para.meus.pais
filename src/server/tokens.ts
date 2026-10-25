import { createHash, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

/** Token opaco de alta entropia (256 bits) em base64url. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Hash determinístico usado para guardar tokens no banco sem guardar o valor real. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparação de strings em tempo constante. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** HMAC-SHA256 hexadecimal — usado na validação de assinatura de webhooks. */
export function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
