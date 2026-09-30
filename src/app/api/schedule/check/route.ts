import { z } from "zod";
import { route, readJson, ok } from "@/server/api";
import { getClientIp } from "@/server/auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { AppError } from "@/server/errors";
import { getWindowFor, validateScheduledFor } from "@/server/services/scheduling";

const schema = z.object({ scheduledFor: z.string().trim().min(1) });

/**
 * Confere um horário sem criar pedido.
 *
 * Serve para a tela avisar na hora ("esse horário está lotado") em vez de
 * deixar o cliente montar o pedido inteiro e tomar erro no final.
 */
export const POST = route(async (request: Request) => {
  const ip = await getClientIp();
  await enforceRateLimit(`schedule-check:${ip}`, 60, 60);

  const { scheduledFor } = schema.parse(await readJson(request));

  try {
    const valid = await validateScheduledFor(scheduledFor);
    const window = await getWindowFor(valid);
    return ok({
      valid: true,
      scheduledFor: valid.toISOString(),
      window: {
        start: window.start.toISOString(),
        end: window.end.toISOString(),
        taken: window.taken,
        capacity: window.capacity,
        remaining: window.capacity > 0 ? Math.max(0, window.capacity - window.taken) : null,
      },
    });
  } catch (error) {
    // Horário recusado não é falha da requisição: é resposta de negócio.
    if (error instanceof AppError && error.status === 400) {
      return ok({ valid: false, reason: error.message });
    }
    throw error;
  }
});

export const dynamic = "force-dynamic";
