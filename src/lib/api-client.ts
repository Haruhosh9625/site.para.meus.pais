"use client";

/**
 * Cliente HTTP do navegador.
 *
 * Responsabilidades:
 *  - anexar o token CSRF (lido do cookie `ds_csrf`) em toda requisição que
 *    altera estado — é a metade "double-submit" da proteção CSRF;
 *  - normalizar o envelope { ok, data, error } que a API sempre devolve;
 *  - transformar erro em uma exceção com mensagem legível em português,
 *    já com os erros por campo quando a validação falha.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, status: number, code: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Envia FormData sem serializar (upload de imagem). */
  formData?: FormData;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? (options.body || options.formData ? "POST" : "GET");
  const headers: Record<string, string> = {};

  if (method !== "GET") {
    const csrf = readCookie("ds_csrf");
    if (csrf) headers["x-csrf-token"] = csrf;
  }
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(path, {
    method,
    headers,
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    signal: options.signal,
    credentials: "same-origin",
  });

  let payload: { ok?: boolean; data?: T; error?: { message?: string; code?: string; details?: unknown } };
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      "Não foi possível falar com o servidor. Verifique sua conexão.",
      response.status,
      "network_error",
    );
  }

  if (!response.ok || payload.ok === false) {
    const details = payload.error?.details;
    const fieldErrors =
      details && typeof details === "object" && !Array.isArray(details)
        ? (details as Record<string, string>)
        : {};
    throw new ApiError(
      payload.error?.message ?? "Algo deu errado. Tente novamente.",
      response.status,
      payload.error?.code ?? "error",
      fieldErrors,
    );
  }

  return payload.data as T;
}

/** Mensagem amigável para qualquer erro que chegue à interface. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Algo deu errado. Tente novamente.";
}
