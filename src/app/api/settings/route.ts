import { route, ok } from "@/server/api";
import { getPublicSettings } from "@/server/services/settings";

/** Configurações públicas da loja (nada sensível). */
export const GET = route(async () => {
  return ok({ settings: await getPublicSettings() });
});
