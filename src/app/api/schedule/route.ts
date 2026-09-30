import { route, ok } from "@/server/api";
import { getScheduleRules } from "@/server/services/scheduling";

/**
 * Regras vigentes de agendamento.
 *
 * A tela usa isto para orientar o cliente ANTES de ele escolher um horário
 * ruim: primeiro horário possível, último do expediente, antecedência mínima
 * e se hoje é dia de folga. A decisão final continua sendo do servidor.
 */
export const GET = route(async () => {
  return ok({ rules: await getScheduleRules() });
});

export const dynamic = "force-dynamic";
