"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
    "tap flex items-center justify-center rounded-xl font-bold transition-colors",
    "hover:bg-[var(--glass-bg-strong)] disabled:opacity-40 disabled:hover:bg-transparent",
    size === "sm" ? "size-9 text-lg" : "size-11 text-xl",
  );

  return (
    <div className="panel inline-flex items-center rounded-2xl">
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

/**
 * Botão que confirma o próprio toque.
 *
 * Por um instante ele vira "Adicionado ✓" antes de dar lugar ao controle de
 * quantidade. Sem isso, apertar "Adicionar" troca o botão por −/1/+ de
 * repente e a pessoa fica sem saber se foi ela que mudou a tela ou se errou
 * o toque. O aviso no rodapé some depois de alguns segundos; esta confirmação
 * nasce debaixo do dedo, onde o olho já estava.
 */
function BotaoAdicionar({ product }: { product: MenuProduct }) {
  const { add } = useCart();
  const { push } = useToast();
  const [confirmado, setConfirmado] = useState(false);
  const relogioRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (relogioRef.current) clearTimeout(relogioRef.current);
    };
  }, []);

  return (
    <Button
      size="sm"
      className={cx("sm:w-full", confirmado && "pointer-events-none")}
      onClick={() => {
        setConfirmado(true);
        push(`${product.name} adicionado ao carrinho`, "success");
        // O item entra no carrinho depois do quadro de confirmação: assim o
        // botão mostra "Adicionado" antes de ser substituído pelo −/1/+.
        relogioRef.current = setTimeout(() => add(product.id, 1), 480);
      }}
    >
      <span
        className={cx(
          "inline-flex items-center gap-1.5 transition-all duration-200",
          confirmado ? "scale-105" : "",
        )}
      >
        {confirmado ? "Adicionado ✓" : "Adicionar"}
      </span>
    </Button>
  );
}

export function ProductCard({ product }: { product: MenuProduct }) {
  const { quantityOf, setQuantity } = useCart();
  const quantity = quantityOf(product.id);
  const unavailable = !product.available;

  return (
    <article
      data-spotlight
      data-tilt="3.5"
      className={cx(
        "panel spotlight tilt reveal group relative flex gap-3 overflow-hidden p-3",
        "sm:flex-col sm:gap-0 sm:p-0",
        unavailable ? "opacity-60" : "lift",
      )}
    >
      <div
        className={cx(
          "relative size-24 shrink-0 overflow-hidden rounded-2xl bg-coal-900",
          "sm:size-auto sm:aspect-4/3 sm:rounded-none",
        )}
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 96px, (max-width: 1024px) 50vw, 33vw"
            /* A foto aproxima devagar no hover: o cartão ganha vida sem mexer no texto. */
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="muted flex h-full items-center justify-center text-3xl" aria-hidden="true">
            🍢
          </div>
        )}

        {/*
          Véu do escuro para o transparente no pé da foto. Dá lugar para a
          pastilha de preço pousar e amarra a imagem ao corpo do cartão.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 hidden h-2/5 bg-linear-to-t from-coal-950/80 to-transparent sm:block"
        />

        {/* O preço mora sobre a foto, em pastilha de vidro. */}
        <p className="absolute right-2.5 bottom-2.5 hidden sm:block">
          <span className="glass-pill-dark inline-block px-3 py-1.5 text-sm font-bold tabular-nums">
            {formatCents(product.priceCents)}
          </span>
        </p>

        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-coal-950/65">
            <span className="glass-pill px-3 py-1.5 text-[11px] font-bold tracking-wide uppercase">
              Indisponível
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col sm:p-4">
        <h3 className="text-base leading-tight font-bold text-balance">{product.name}</h3>
        <p className="muted mt-1.5 line-clamp-2 text-sm sm:line-clamp-3">{product.description}</p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          {/* No celular o preço fica na linha do botão; no desktop, sobre a foto. */}
          <p className="text-lg font-bold tabular-nums text-brand sm:hidden">
            {formatCents(product.priceCents)}
          </p>

          {unavailable ? (
            <span className="muted text-xs font-semibold">Esgotado</span>
          ) : quantity > 0 ? (
            <QuantityStepper
              value={quantity}
              label={product.name}
              onChange={(next) => setQuantity(product.id, next)}
            />
          ) : (
            <BotaoAdicionar product={product} />
          )}
        </div>
      </div>
    </article>
  );
}
