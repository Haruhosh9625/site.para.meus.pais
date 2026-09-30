import { route, readJson, ok } from "@/server/api";
import { quoteSchema } from "@/server/validation";
import { getCurrentUser } from "@/server/auth";
import { buildQuote } from "@/server/services/pricing";

/**
 * Cotação do carrinho — a única fonte de verdade dos valores.
 *
 * O navegador manda apenas productId + quantity. Preços, taxa de entrega,
 * desconto e total são calculados no servidor a partir do banco.
 */
export const POST = route(async (request: Request) => {
  const body = quoteSchema.parse(await readJson(request));
  const user = await getCurrentUser();

  const quote = await buildQuote({
    items: body.items,
    deliveryType: body.deliveryType,
    neighborhood: body.neighborhood ?? null,
    couponCode: body.couponCode ?? null,
    userId: user?.id ?? null,
  });

  return ok({ quote });
});
