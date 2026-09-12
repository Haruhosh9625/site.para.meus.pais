"use client";

import Image from "next/image";
import { useCart, useToast } from "@/components/providers";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui";
import { cx } from "@/lib/cx";

export type MenuProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  available: boolean;
};

/** Controle − / quantidade / + usado no cardápio e no carrinho. */
export function QuantityStepper({
  value,
  onChange,
  label,
  size = "md",
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const buttonClass = cx(
    "tap flex items-center justify-center rounded-lg font-bold transition-colors",
    "hover:bg-[var(--surface-sunken)] disabled:opacity-40 disabled:hover:bg-transparent",
    size === "sm" ? "size-9 text-lg" : "size-11 text-xl",
  );

  return (
    <div className="inline-flex items-center rounded-xl border bg-[var(--surface)]">
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 0}
        aria-label={`Diminuir quantidade de ${label}`}
      >
        −
      </button>
      <span
        className={cx("min-w-9 text-center font-bold tabular-nums", size === "sm" ? "text-sm" : "")}
        aria-live="polite"
        aria-label={`${value} ${value === 1 ? "unidade" : "unidades"} de ${label}`}
      >
        {value}
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= 99}
        aria-label={`Aumentar quantidade de ${label}`}
      >
        +
      </button>
    </div>
  );
}

export function ProductCard({ product }: { product: MenuProduct }) {
  const { quantityOf, add, setQuantity } = useCart();
  const { push } = useToast();
  const quantity = quantityOf(product.id);
  const unavailable = !product.available;

  return (
    <article
      className={cx(
        "surface flex gap-3 overflow-hidden p-3 transition-shadow sm:flex-col sm:gap-0 sm:p-0",
        unavailable ? "opacity-60" : "hover:shadow-[var(--shadow-soft)]",
      )}
    >
      <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)] sm:size-auto sm:aspect-square sm:rounded-none">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 96px, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="muted flex h-full items-center justify-center text-3xl" aria-hidden="true">
            🍢
          </div>
        )}
        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-coal-900">
              Indisponível
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col sm:p-4">
        <h3 className="font-semibold text-balance">{product.name}</h3>
        <p className="muted mt-1 line-clamp-2 text-sm sm:line-clamp-3">{product.description}</p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <p className="text-lg font-bold text-brand">{formatCents(product.priceCents)}</p>

          {unavailable ? (
            <span className="muted text-xs font-semibold">Esgotado</span>
          ) : quantity > 0 ? (
            <QuantityStepper
              value={quantity}
              label={product.name}
              onChange={(next) => setQuantity(product.id, next)}
            />
          ) : (
            <Button
              size="sm"
              onClick={() => {
                add(product.id, 1);
                push(`${product.name} adicionado ao carrinho`, "success");
              }}
            >
              Adicionar
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
