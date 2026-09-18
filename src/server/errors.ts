/** Erro de aplicação com status HTTP — o handler da API o converte em resposta. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 400, code = "bad_request", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(msg, 400, "bad_request", details);
export const unauthorized = (msg = "Você precisa entrar na sua conta.") =>
  new AppError(msg, 401, "unauthorized");
export const forbidden = (msg = "Você não tem permissão para acessar isto.") =>
  new AppError(msg, 403, "forbidden");
export const notFound = (msg = "Não encontrado.") => new AppError(msg, 404, "not_found");
export const conflict = (msg: string) => new AppError(msg, 409, "conflict");
export const tooManyRequests = (msg = "Muitas tentativas. Tente novamente em instantes.") =>
  new AppError(msg, 429, "too_many_requests");
export const serverError = (msg = "Erro interno. Tente novamente.") =>
  new AppError(msg, 500, "internal_error");
