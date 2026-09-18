/**
 * Dinheiro no DS Espetos é SEMPRE inteiro em centavos.
 * Nada de Number com casas decimais circulando pelo sistema: R$ 8,00 é 800.
 * Isso remove por completo a classe de bugs de ponto flutuante
 * (0.1 + 0.2 !== 0.3) em subtotais, descontos e troco.
 */

/** Formata centavos como moeda brasileira: 800 -> "R$ 8,00" */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** Formata centavos sem o símbolo: 800 -> "8,00" */
export function formatCentsPlain(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Converte texto digitado pelo usuário ("8,00", "R$ 8.00", "8") em centavos.
 * Devolve null quando não é um valor monetário válido.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }

  const cleaned = input
    .toString()
    .trim()
    .replace(/[R$\s ]/gi, "");

  if (cleaned === "") return null;

  // "1.234,56" (pt-BR) -> "1234.56" | "1234.56" (en) permanece
  let normalized = cleaned;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Aplica um percentual (em pontos: 10 = 10%) sobre um valor em centavos. */
export function percentOf(cents: number, percentPoints: number): number {
  return Math.round((cents * percentPoints) / 100);
}

/** Garante que um valor de centavos é um inteiro não negativo e finito. */
export function assertCents(value: unknown, field = "valor"): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} deve ser um inteiro de centavos não negativo`);
  }
  return value;
}
