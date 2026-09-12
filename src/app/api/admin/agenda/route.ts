import { route, ok } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { getDaySchedule } from "@/server/services/scheduling";

/**
 * Agenda de um dia, agrupada por janela de capacidade.
 * É a tela que a cozinha deixa aberta para saber a carga de cada horário.
 */
export const GET = route(async (request: Request) => {
  await requireAdmin();
  const url = new URL(request.url);
  const dayParam = url.searchParams.get("day");

  const day = dayParam ? new Date(`${dayParam}T00:00:00`) : new Date();
  if (Number.isNaN(day.getTime())) {
    return ok({ schedule: await getDaySchedule(new Date()) });
  }

  return ok({ schedule: await getDaySchedule(day) });
});

export const dynamic = "force-dynamic";
