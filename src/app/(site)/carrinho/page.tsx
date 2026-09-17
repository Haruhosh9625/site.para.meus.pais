"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart, useStoreSettings } from "@/components/providers";
import { QuantityStepper } from "@/components/site/product-card";
import { formatCents } from "@/lib/money";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { cx } from "@/lib/cx";

/**
 * Carrinho.
 *
 * Nenhum valor é somado no navegador: a tabela abaixo mostra exatamente o
 * que /api/cart/quote devolveu — preço unitário, subtotal por linha, taxa de
 * entrega, desconto e total, todos calculados no servidor.
 */
export default function CarrinhoPage() {
  const {
    items,
    quote,
    quoting,
    quoteError,
    setQuantity,
    remove,
    clear,
    deliveryType,
    setDeliveryType,
    couponCode,
    setCouponCode,
    refreshQuote,
  } = useCart();
  const { settings } = useStoreSettings();
  const [couponInput, setCouponInput] = useState(couponCode);
  const [confirmClear, setConfirmClear] = useState(false);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="display mb-7 text-[clamp(2.25rem,7vw,3.25rem)]">Carrinho</h1>
        <EmptyState
          icon="🛒"
          title="Seu carrinho está vazio"
          description="Escolha seus espetos, o Completo e a bebida no cardápio."
          action={
            <Link href="/cardapio">
              <Button size="lg">Ir para o cardápio</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const couponWarning = quote?.warnings.find((warning) => warning.toLowerCase().includes("cupom"));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-8 md:pb-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="display text-[clamp(2.25rem,7vw,3.25rem)]">Carrinho</h1>
        {confirmClear ? (
          <div className="flex items-center gap-2">
            <span className="muted text-sm">Esvaziar?</span>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                clear();
                setConfirmClear(false);
              }}
            >
              Sim
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
              Não
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
            Esvaziar
          </Button>
        )}
      </div>

      {quoteError && <ErrorState message={quoteError} onRetry={refreshQuote} />}

      {quote?.warnings
        .filter((warning) => warning !== couponWarning)
        .map((warning) => (
          <p
            key={warning}
            role="status"
            className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
          >
            {warning}
          </p>
        ))}

      {/* ------------------------------- itens ------------------------------ */}
      <ul className="panel divide-y overflow-hidden">
        {(quote?.lines ?? []).map((line) => (
          <li key={line.productId} className="flex gap-3 p-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
              {line.imageUrl ? (
                <Image src={line.imageUrl} alt="" fill sizes="80px" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl" aria-hidden="true">
                  🍢
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{line.name}</h2>
                <button
                  type="button"
                  onClick={() => remove(line.productId)}
                  className="muted shrink-0 text-xs font-semibold underline underline-offset-2 hover:text-red-600"
                  aria-label={`Remover ${line.name} do carrinho`}
                >
                  Remover
                </button>
              </div>

              <p className="muted mt-0.5 text-sm">
                Preço unitário: {formatCents(line.unitPriceCents)}
              </p>

              <div className="mt-3 flex items-center justify-between gap-3">
                <QuantityStepper
                  value={line.quantity}
                  label={line.name}
                  size="sm"
                  onChange={(next) => setQuantity(line.productId, next)}
                />
                <p className="font-bold tabular-nums">
                  <span className="sr-only">Subtotal: </span>
                  {formatCents(line.subtotalCents)}
                </p>
              </div>
            </div>
          </li>
        ))}

        {quoting && !quote && (
          <li className="muted flex items-center gap-2 p-6 text-sm">
            <Spinner className="size-4" /> Calculando os valores...
          </li>
        )}
      </ul>

      {/* ---------------------- entrega ou retirada -------------------------
          Enquanto a loja não entrega, não há escolha a fazer: todo pedido é
          retirada agendada. Mostrar duas opções com uma desabilitada só
          confunde — então o bloco inteiro aparece apenas quando a entrega
          está ligada em /admin/configuracoes. */}
      {settings?.allowDelivery ? (
      <fieldset className="panel mt-4 p-4">
        <legend className="px-1 text-sm font-semibold">Como você quer receber?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              { value: "DELIVERY", label: "Entrega", enabled: settings?.allowDelivery ?? true },
              { value: "PICKUP", label: "Retirada", enabled: settings?.allowPickup ?? true },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={cx(
                "tap flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors",
                deliveryType === option.value
                  ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
                  : "hover:bg-[var(--surface-sunken)]",
                !option.enabled && "cursor-not-allowed opacity-40",
              )}
            >
              <input
                type="radio"
                name="deliveryType"
                value={option.value}
                checked={deliveryType === option.value}
                disabled={!option.enabled}
                onChange={() => setDeliveryType(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        {deliveryType === "DELIVERY" && (
          <p className="muted mt-2 text-xs">
            A taxa exata é calculada no checkout, de acordo com o bairro de entrega.
          </p>
        )}
      </fieldset>
      ) : (
        <p className="panel mt-4 flex items-start gap-2.5 p-4 text-sm">
          <span className="text-lg leading-none" aria-hidden="true">🏪</span>
          <span>
            <strong className="block">Retirada agendada</strong>
            <span className="muted">
              Ainda não fazemos entrega. No próximo passo você escolhe a hora em que vai
              buscar e deixamos tudo pronto para esse horário.
            </span>
          </span>
        </p>
      )}

      {/* -------------------------------- cupom ----------------------------- */}
      <div className="panel mt-4 p-4">
        <label htmlFor="cupom" className="text-sm font-semibold">
          Cupom de desconto
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="cupom"
            value={couponInput}
            onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
            placeholder="Digite o código"
            autoCapitalize="characters"
            className="flex-1 rounded-xl border bg-[var(--surface)] px-3.5 py-3 text-base uppercase"
          />
          <Button
            variant="outline"
            onClick={() => setCouponCode(couponInput.trim())}
            disabled={quoting}
          >
            Aplicar
          </Button>
        </div>
        {couponWarning && (
          <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
            {couponWarning}
          </p>
        )}
        {quote?.coupon && (
          <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Cupom {quote.coupon.code} aplicado.{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                setCouponInput("");
                setCouponCode("");
              }}
            >
              Remover
            </button>
          </p>
        )}
      </div>

      {/* -------------------------------- resumo ---------------------------- */}
      <div className="panel mt-4 p-4">
        <h2 className="mb-3 font-bold">Resumo</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="muted">Subtotal</dt>
            <dd className="font-medium tabular-nums">{formatCents(quote?.subtotalCents ?? 0)}</dd>
          </div>

          {deliveryType === "DELIVERY" && (
            <div className="flex justify-between">
              <dt className="muted">Taxa de entrega</dt>
              <dd className="font-medium tabular-nums">
                {quote && quote.deliveryFeeCents === 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Grátis</span>
                ) : (
                  formatCents(quote?.deliveryFeeCents ?? 0)
                )}
              </dd>
            </div>
          )}

          {(quote?.discountCents ?? 0) > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <dt>Desconto{quote?.coupon ? ` (${quote.coupon.code})` : ""}</dt>
              <dd className="font-medium tabular-nums">
                − {formatCents(quote?.discountCents ?? 0)}
              </dd>
            </div>
          )}

          <div className="flex justify-between border-t pt-3 text-lg font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCents(quote?.totalCents ?? 0)}</dd>
          </div>
        </dl>

        {quote && !quote.meetsMinimum && (
          <p
            role="status"
            className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
          >
            Faltam <strong>{formatCents(quote.missingForMinimumCents)}</strong> em produtos para
            atingir o pedido mínimo de {formatCents(quote.minOrderCents)}.
          </p>
        )}

        {settings && !settings.isOpen && (
          <p
            role="status"
            className="mt-3 rounded-xl bg-coal-900 px-3 py-2 text-sm text-white dark:bg-coal-950"
          >
            <strong>{settings.storeName} — FECHADO.</strong>{" "}
            {settings.nextOpening
              ? `Abrimos ${settings.nextOpening}. Você pode montar o pedido agora e finalizar quando abrirmos.`
              : "Consulte nossos horários de funcionamento."}
          </p>
        )}
      </div>

      {/*
        Botão fixo: finalizar sempre ao alcance do polegar.

        No celular é uma placa de vidro solta, empilhada acima da barra de
        navegação; no desktop volta para o fluxo normal da página, sem
        vidro nem posição fixa.
      */}
      <div
        className="fixed inset-x-0 z-40 px-3 md:static md:mt-4 md:px-0"
        style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="action-bar mx-auto max-w-3xl">
          <Link href="/checkout" className="block">
            <Button
              size="lg"
              fullWidth
              disabled={
                quoting ||
                !quote ||
                quote.lines.length === 0 ||
                !quote.meetsMinimum ||
                (settings ? !settings.isOpen : false)
              }
            >
              {settings && !settings.isOpen
                ? "Loja fechada"
                : `${settings?.allowDelivery ? "Finalizar pedido" : "Escolher horário"} · ${formatCents(
                    quote?.totalCents ?? 0,
                  )}`}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
