"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { QuantityStepper } from "./product-card";
import { ValorAnimado } from "./numbers";
import { useCart, useCartDrawer, useStoreSettings } from "@/components/providers";
import { Button, Spinner } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { cx } from "@/lib/cx";

/*
  Gaveta do carrinho.

  Serve para uma coisa: deixar a pessoa conferir e ajustar o pedido sem sair
  do cardápio. Quem sai do cardápio para ver o carrinho, volta e perde o
  lugar onde estava — e some a vontade de somar um espeto a mais.

  Os valores são os mesmos de /api/cart/quote. NADA é somado aqui: a gaveta
  só desenha o que o servidor calculou, igualzinho à página do carrinho.
  Finalizar continua acontecendo no checkout, com a cotação refeita no
  servidor antes de criar o pedido.
*/

export function CartDrawer() {
  const { open, closeDrawer } = useCartDrawer();
  const { items, itemCount, quote, quoting, quoteError, setQuantity, remove } = useCart();
  const { settings } = useStoreSettings();

  const painelRef = useRef<HTMLDivElement | null>(null);
  const focoAnteriorRef = useRef<HTMLElement | null>(null);

  /*
    Teclado: Esc fecha, e o foco vai para dentro da gaveta ao abrir e volta
    para o botão que a abriu ao fechar. Sem devolver o foco, quem navega por
    Tab é jogado de volta para o começo da página.
  */
  useEffect(() => {
    if (!open) return;

    focoAnteriorRef.current = document.activeElement as HTMLElement | null;
    const primeiro = painelRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea",
    );
    primeiro?.focus();

    const noTeclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        closeDrawer();
        return;
      }

      // Prende o Tab dentro da gaveta enquanto ela está aberta.
      if (evento.key !== "Tab" || !painelRef.current) return;
      const focaveis = Array.from(
        painelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focaveis.length === 0) return;

      const inicio = focaveis[0];
      const fim = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === inicio) {
        evento.preventDefault();
        fim.focus();
      } else if (!evento.shiftKey && document.activeElement === fim) {
        evento.preventDefault();
        inicio.focus();
      }
    };

    document.addEventListener("keydown", noTeclado);
    return () => {
      document.removeEventListener("keydown", noTeclado);
      focoAnteriorRef.current?.focus?.();
    };
  }, [open, closeDrawer]);

  const linhas = quote?.lines ?? [];
  const vazio = items.length === 0;
  const modoRetirada = settings ? !settings.allowDelivery : false;

  return (
    <div
      className={cx("fixed inset-0 z-[70] no-print", open ? "" : "pointer-events-none")}
      aria-hidden={open ? undefined : true}
    >
      {/* Véu: escurece e desfoca a página, e fechar clicando fora é esperado. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar carrinho"
        onClick={closeDrawer}
        data-aberta={open ? "true" : "false"}
        className="gaveta-veu absolute inset-0 cursor-default"
      />

      <div
        ref={painelRef}
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-label="Seu carrinho"
        data-aberta={open ? "true" : "false"}
        className={cx(
          "glass-strong gaveta absolute inset-y-0 right-0 flex w-full max-w-md flex-col",
          "!rounded-l-3xl !rounded-r-none border-y-0 border-r-0",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--glass-edge)] px-5 py-4">
          <div>
            <p className="eyebrow">Seu pedido</p>
            <h2 className="text-lg font-bold">
              {itemCount === 0
                ? "Carrinho vazio"
                : `${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Fechar carrinho"
            className="tap flex size-10 items-center justify-center rounded-xl text-xl transition-colors hover:bg-[var(--glass-bg-strong)]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {vazio ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="text-5xl" aria-hidden="true">
                🍢
              </span>
              <p className="muted text-sm">
                Nada por aqui ainda. Escolha os espetos e eles aparecem nesta lista.
              </p>
              <Button onClick={closeDrawer} variant="outline" size="sm">
                Ver o cardápio
              </Button>
            </div>
          ) : quoteError ? (
            <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {quoteError}
            </p>
          ) : linhas.length === 0 && quoting ? (
            <div className="muted flex items-center gap-2 text-sm">
              <Spinner className="size-4" /> Somando…
            </div>
          ) : (
            <ul className="space-y-3">
              {linhas.map((linha) => (
                <li key={linha.productId} className="panel flex gap-3 p-2.5">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-coal-900">
                    {linha.imageUrl && (
                      <Image
                        src={linha.imageUrl}
                        alt={linha.name}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-bold">{linha.name}</p>
                      <button
                        type="button"
                        onClick={() => remove(linha.productId)}
                        aria-label={`Remover ${linha.name} do carrinho`}
                        className="muted shrink-0 text-xs font-semibold underline decoration-dotted hover:text-red-600"
                      >
                        remover
                      </button>
                    </div>
                    <p className="muted text-xs tabular-nums">
                      {formatCents(linha.unitPriceCents)} cada
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <QuantityStepper
                        size="sm"
                        value={linha.quantity}
                        label={linha.name}
                        onChange={(proximo) => setQuantity(linha.productId, proximo)}
                      />
                      <ValorAnimado
                        cents={linha.subtotalCents}
                        className="text-sm font-bold text-brand"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!vazio && (
          <footer className="border-t border-[var(--glass-edge)] px-5 pt-4 pb-5">
            <dl className="space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="muted">Subtotal</dt>
                <dd>
                  <ValorAnimado cents={quote?.subtotalCents ?? 0} className="font-semibold" />
                </dd>
              </div>

              {!!quote?.discountCents && (
                <div className="flex items-baseline justify-between text-emerald-600 dark:text-emerald-400">
                  <dt>Desconto{quote.coupon ? ` (${quote.coupon.code})` : ""}</dt>
                  <dd className="font-semibold tabular-nums">
                    − {formatCents(quote.discountCents)}
                  </dd>
                </div>
              )}

              {/*
                A taxa só aparece quando existe: no modo retirada não há linha
                de entrega nenhuma, e mostrar "R$ 0,00" faz a pessoa procurar
                onde escolher endereço.
              */}
              {!modoRetirada && !!quote?.deliveryFeeCents && (
                <div className="flex items-baseline justify-between">
                  <dt className="muted">Entrega</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatCents(quote.deliveryFeeCents)}
                  </dd>
                </div>
              )}

              <div className="flex items-baseline justify-between border-t border-[var(--glass-edge)] pt-2.5">
                <dt className="font-bold">Total</dt>
                <dd>
                  <ValorAnimado
                    cents={quote?.totalCents ?? 0}
                    className="text-xl font-bold text-brand"
                  />
                </dd>
              </div>
            </dl>

            {quote && !quote.meetsMinimum && (
              <p className="mt-3 rounded-xl bg-brand-500/12 px-3 py-2 text-xs font-semibold text-[var(--brand-ink)]">
                Faltam {formatCents(quote.missingForMinimumCents)} para o pedido mínimo de{" "}
                {formatCents(quote.minOrderCents)}.
              </p>
            )}

            <div className="mt-4 grid gap-2">
              <Link href="/checkout" onClick={closeDrawer} className="block">
                <Button
                  size="lg"
                  fullWidth
                  /* Mesma trava da página do carrinho: sem mínimo, sem avançar. */
                  disabled={quoting || !quote || !quote.meetsMinimum}
                >
                  {modoRetirada ? "Agendar retirada" : "Finalizar pedido"}
                </Button>
              </Link>
              <Link
                href="/carrinho"
                onClick={closeDrawer}
                className="muted text-center text-xs font-semibold underline decoration-dotted"
              >
                Abrir o carrinho completo
              </Link>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
