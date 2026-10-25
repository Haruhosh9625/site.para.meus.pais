type Level = "debug" | "info" | "warn" | "error";

/**
 * Log estruturado em JSON (uma linha por evento), pronto para ser
 * coletado por qualquer agregador em produção.
 *
 * Campos sensíveis são removidos antes de sair: nunca registramos senha,
 * hash, token, chave de API ou assinatura de webhook.
 */
const REDACT = /^(password|passwordHash|token|tokenHash|secret|apiKey|accessToken|authorization|signature|csrf)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.test(k) ? "[redacted]" : scrub(v, depth + 1);
  }
  return out;
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? (scrub(context) as Record<string, unknown>) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") emit("debug", m, c);
  },
  info: (m: string, c?: Record<string, unknown>) => emit("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => emit("error", m, c),
};
