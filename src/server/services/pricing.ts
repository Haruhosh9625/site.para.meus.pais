import type { DeliveryType } from "@prisma/client";
import { prisma } from "../db";
import { badRequest } from "../errors";
import { percentOf } from "@/lib/money";
import { getSettings, type SettingsWithAreas } from "./settings";

/**
 * Motor de precificação.
 *
 * REGRA CENTRAL DO SISTEMA: o navegador nunca informa preços. Ele manda
 * apenas `productId` e `quantity`; todo valor unitário vem do banco e todas
 * as somas acontecem aqui, no servidor. Se o cliente adulterar o carrinho no
 * DevTools, o total cobrado continua sendo o correto.
 *
 * Cada produto é uma linha independente — em particular o "Completo" é um
 * item próprio, e nunca embutido no preço de um espeto.
 */

export type QuoteInput = {
  items: Array<{ productId: string; quantity: number }>;
  deliveryType: DeliveryType;
  /** Bairro de entrega, usado para achar a taxa da área atendida. */
  neighborhood?: string | null;
  couponCode?: string | null;
  userId?: string | null;
};

export type QuoteLine = {
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
};

export type Quote = {
  lines: QuoteLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  itemCount: number;
  coupon: { id: string; code: string; description: string } | null;
  minOrderCents: number;
  /** Falta este valor em produtos para atingir o pedido mínimo. */
  missingForMinimumCents: number;
  meetsMinimum: boolean;
  estimatedMinutes: number;
  /** Avisos não bloqueantes (ex.: cupom inválido foi ignorado). */
  warnings: string[];
};

/** Junta linhas repetidas do mesmo produto e descarta quantidades inválidas. */
function normalizeItems(items: QuoteInput["items"]) {
  const merged = new Map<string, number>();
  for (const item of items) {
    const qty = Math.floor(item.quantity);
    if (!item.productId || !Number.isFinite(qty) || qty <= 0) continue;
    merged.set(item.productId, Math.min(99, (merged.get(item.productId) ?? 0) + qty));
  }
  return merged;
}

/** Taxa de entrega válida para um bairro, considerando as áreas atendidas. */
export function resolveDeliveryFee(
  settings: SettingsWithAreas,
  deliveryType: DeliveryType,
  neighborhood?: string | null,
  subtotalCents = 0,
): { feeCents: number; etaMinutes: number; minOrderCents: number } {
  if (deliveryType === "PICKUP") {
    return {
      feeCents: 0,
      etaMinutes: settings.prepTimeMinutes,
      minOrderCents: settings.minOrderCents,
    };
  }

  const normalized = neighborhood?.trim().toLowerCase();
  const area = normalized
    ? settings.deliveryAreas.find((a) => a.neighborhood.trim().toLowerCase() === normalized)
    : undefined;

  const baseFee = area ? area.feeCents : settings.deliveryFeeCents;
  const minOrder = area && area.minOrderCents > 0 ? area.minOrderCents : settings.minOrderCents;
  const eta = (area ? area.etaMinutes : settings.deliveryTimeMinutes) + settings.prepTimeMinutes;

  // Frete grátis acima de um valor, quando configurado.
  const freeAbove = settings.freeDeliveryAboveCents;
  const feeCents = freeAbove > 0 && subtotalCents >= freeAbove ? 0 : baseFee;

  return { feeCents, etaMinutes: eta, minOrderCents: minOrder };
}

/**
 * Calcula o desconto de um cupom sobre o subtotal.
 * Devolve `error` quando o cupom não pode ser usado (motivo legível).
 */
export async function evaluateCoupon(
  code: string,
  subtotalCents: number,
  userId?: string | null,
): Promise<
  | { ok: true; coupon: { id: string; code: string; description: string }; discountCents: number }
  | { ok: false; error: string }
> {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon || !coupon.active) return { ok: false, error: "Cupom inválido ou inativo." };

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, error: "Cupom ainda não está válido." };
  if (coupon.expiresAt && coupon.expiresAt < now) return { ok: false, error: "Cupom expirado." };
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false, error: "Cupom esgotado." };
  }
  if (subtotalCents < coupon.minOrderCents) {
    return {
      ok: false,
      error: `Cupom válido apenas em pedidos a partir de R$ ${(coupon.minOrderCents / 100)
        .toFixed(2)
        .replace(".", ",")}.`,
    };
  }
  if (coupon.perUserLimit !== null && userId) {
    const used = await prisma.order.count({
      where: { couponId: coupon.id, userId, status: { not: "CANCELLED" } },
    });
    if (used >= coupon.perUserLimit) return { ok: false, error: "Você já usou este cupom." };
  }

  let discountCents =
    coupon.discountType === "PERCENT"
      ? percentOf(subtotalCents, coupon.discountValue)
      : coupon.discountValue;

  if (coupon.discountType === "PERCENT" && coupon.maxDiscountCents > 0) {
    discountCents = Math.min(discountCents, coupon.maxDiscountCents);
  }
  // O desconto nunca pode superar o subtotal (o total jamais fica negativo).
  discountCents = Math.max(0, Math.min(discountCents, subtotalCents));

  return {
    ok: true,
    coupon: { id: coupon.id, code: coupon.code, description: coupon.description },
    discountCents,
  };
}

/**
 * Monta a cotação completa a partir dos IDs de produto.
 * É esta função — e só ela — que define quanto o cliente paga.
 */
export async function buildQuote(input: QuoteInput): Promise<Quote> {
  const settings = await getSettings();
  const merged = normalizeItems(input.items);
  const warnings: string[] = [];

  if (merged.size === 0) {
    return {
      lines: [],
      subtotalCents: 0,
      deliveryFeeCents: 0,
      discountCents: 0,
      totalCents: 0,
      itemCount: 0,
      coupon: null,
      minOrderCents: settings.minOrderCents,
      missingForMinimumCents: settings.minOrderCents,
      meetsMinimum: settings.minOrderCents === 0,
      estimatedMinutes: settings.prepTimeMinutes,
      warnings,
    };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: [...merged.keys()] }, active: true },
    select: {
      id: true,
      name: true,
      priceCents: true,
      imageUrl: true,
      available: true,
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: QuoteLine[] = [];

  for (const [productId, quantity] of merged) {
    const product = byId.get(productId);
    if (!product) {
      warnings.push("Um item do carrinho não está mais no cardápio e foi removido.");
      continue;
    }
    if (!product.available) {
      warnings.push(`"${product.name}" está indisponível no momento e foi removido do carrinho.`);
      continue;
    }
    lines.push({
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      unitPriceCents: product.priceCents,
      quantity,
      // Multiplicação de inteiros: exata, sem erro de arredondamento.
      subtotalCents: product.priceCents * quantity,
    });
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const delivery = resolveDeliveryFee(
    settings,
    input.deliveryType,
    input.neighborhood,
    subtotalCents,
  );

  let discountCents = 0;
  let coupon: Quote["coupon"] = null;
  if (input.couponCode) {
    const result = await evaluateCoupon(input.couponCode, subtotalCents, input.userId);
    if (result.ok) {
      coupon = result.coupon;
      discountCents = result.discountCents;
    } else {
      warnings.push(result.error);
    }
  }

  const totalCents = Math.max(0, subtotalCents + delivery.feeCents - discountCents);
  const missing = Math.max(0, delivery.minOrderCents - subtotalCents);

  return {
    lines,
    subtotalCents,
    deliveryFeeCents: delivery.feeCents,
    discountCents,
    totalCents,
    itemCount,
    coupon,
    minOrderCents: delivery.minOrderCents,
    missingForMinimumCents: missing,
    meetsMinimum: missing === 0,
    estimatedMinutes: delivery.etaMinutes,
    warnings,
  };
}

/** Valida a cotação para checkout, lançando erro legível quando algo impede. */
export function assertQuoteIsCheckoutable(quote: Quote) {
  if (quote.lines.length === 0) {
    throw badRequest("Seu carrinho está vazio ou os itens não estão mais disponíveis.");
  }
  if (!quote.meetsMinimum) {
    throw badRequest(
      `O pedido mínimo é de R$ ${(quote.minOrderCents / 100).toFixed(2).replace(".", ",")}.`,
    );
  }
}
