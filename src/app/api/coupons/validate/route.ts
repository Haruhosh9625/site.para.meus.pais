import { z } from "zod";
import { route, readJson, ok } from "@/server/api";
import { getCurrentUser } from "@/server/auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { getClientIp } from "@/server/auth";
import { evaluateCoupon } from "@/server/services/pricing";

const schema = z.object({
  code: z.string().min(1).max(40),
  subtotalCents: z.number().int().min(0),
});

export const POST = route(async (request: Request) => {
  const ip = await getClientIp();
  // Impede varredura de códigos de cupom por tentativa e erro.
  await enforceRateLimit(`coupon:${ip}`, 20, 60 * 5);

  const body = schema.parse(await readJson(request));
  const user = await getCurrentUser();

  const result = await evaluateCoupon(body.code, body.subtotalCents, user?.id ?? null);
  if (!result.ok) return ok({ valid: false, error: result.error });

  return ok({ valid: true, coupon: result.coupon, discountCents: result.discountCents });
});
