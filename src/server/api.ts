import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./errors";
import { logger } from "./logger";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function created<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

export function fail(message: string, status = 400, code = "bad_request", details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, code, details } }, { status });
}

/**
 * Converte qualquer exceção em uma resposta JSON consistente.
 *
 * Detalhes internos (stack, mensagem do Prisma, SQL) nunca vazam para o
 * cliente: erros inesperados viram sempre uma mensagem genérica, e o
 * detalhe real vai para o log do servidor.
 */
export function handleError(error: unknown) {
  if (error instanceof AppError) {
    if (error.status >= 500) logger.error("api:app_error", { message: error.message });
    return fail(error.message, error.status, error.code, error.details);
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const path = issue.path.join(".") || "_";
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return fail("Verifique os campos informados.", 422, "validation_error", fieldErrors);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return fail("Já existe um registro com esses dados.", 409, "conflict");
    }
    if (error.code === "P2025") {
      return fail("Registro não encontrado.", 404, "not_found");
    }
    logger.error("api:prisma_error", { code: error.code });
    return fail("Erro ao acessar os dados. Tente novamente.", 500, "database_error");
  }

  logger.error("api:unhandled", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return fail("Erro interno. Tente novamente em instantes.", 500, "internal_error");
}

/** Embrulha um handler de rota aplicando o tratamento de erros padrão. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleError(error);
    }
  };
}

/** Lê o corpo JSON com limite de tamanho e mensagem de erro amigável. */
export async function readJson(request: Request, maxBytes = 100_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new AppError("Corpo da requisição grande demais.", 413, "payload_too_large");
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("Corpo da requisição não é um JSON válido.", 400, "invalid_json");
  }
}
