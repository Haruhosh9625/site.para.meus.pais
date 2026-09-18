"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, ApiError } from "@/lib/api-client";
import { useCart, useSession, useStoreSettings, useToast } from "@/components/providers";
import { formatCents, parseMoneyToCents } from "@/lib/money";
import { formatAddress, formatPhone } from "@/lib/format";
import { Button, Field, Input, Textarea, ErrorState, Spinner } from "@/components/ui";
import { cx } from "@/lib/cx";
import { SchedulePicker } from "@/components/site/schedule-picker";

type Address = {
  id: string;
  label: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  reference: string | null;
  isDefault: boolean;
};

const EMPTY_ADDRESS = {
  label: "Casa",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  postalCode: "",
  reference: "",
};

/**
 * Checkout em uma página só, dividida em blocos.
 *
 * Poucos passos de propósito: no celular, cada tela extra é gente que
 * desiste do pedido. Tudo é conferido de novo no servidor ao enviar.
 *
 * A loja trabalha por AGENDAMENTO: ainda não há entrega, então o cliente
 * combina a hora em que vai buscar e a cozinha prepara para aquele horário.
 */
export default function CheckoutPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const { settings } = useStoreSettings();
  const { push } = useToast();
  const {
    items, quote, quoting, deliveryType, setDeliveryType,
    setNeighborhood, couponCode, clear,
  } = useCart();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS);
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CARD" | "CASH">("PIX");
  /** Hora da retirada, em "HH:MM". O servidor resolve o dia e confere a vaga. */
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduleOk, setScheduleOk] = useState(false);
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Chave de idempotência: garante que um clique duplo (ou uma conexão que
  // cai e volta) não crie dois pedidos iguais.
  const idempotencyKey = useRef(
    `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
  );

  // Sem login não há como fechar pedido — manda para o login e volta aqui.
  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login?redirect=/checkout");
  }, [sessionLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    void api<{ addresses: Address[] }>("/api/me/addresses")
      .then((data) => {
        setAddresses(data.addresses);
        const preferred = data.addresses.find((a) => a.isDefault) ?? data.addresses[0];
        if (preferred) {
          setAddressId(preferred.id);
          setNeighborhood(preferred.neighborhood);
        } else {
          setUseNewAddress(true);
        }
      })
      .catch(() => setUseNewAddress(true));
  }, [user, setNeighborhood]);

  // Enquanto a loja não entregar, o único jeito é retirar. Isso mora aqui
  // (e não em uma constante no código) para que ligar a entrega no painel
  // baste — nenhuma tela precisa mudar.
  useEffect(() => {
    if (settings && !settings.allowDelivery && deliveryType !== "PICKUP") {
      setDeliveryType("PICKUP");
    }
  }, [settings, deliveryType, setDeliveryType]);

  // Ajusta a forma de pagamento se a loja desabilitou a escolhida.
  useEffect(() => {
    if (!settings) return;
    const enabled = settings.paymentMethods;
    if (paymentMethod === "PIX" && !enabled.pix) setPaymentMethod(enabled.card ? "CARD" : "CASH");
    if (paymentMethod === "CARD" && !enabled.card) setPaymentMethod(enabled.pix ? "PIX" : "CASH");
    if (paymentMethod === "CASH" && !enabled.cash) setPaymentMethod(enabled.pix ? "PIX" : "CARD");
  }, [settings, paymentMethod]);

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === addressId) ?? null,
    [addresses, addressId],
  );

  const changeForCents = parseMoneyToCents(changeFor);
  const changeDueCents =
    changeForCents !== null && quote ? changeForCents - quote.totalCents : null;

  const changeError =
    paymentMethod === "CASH" && changeFor.trim() !== ""
      ? changeForCents === null
        ? "Informe um valor válido, por exemplo 50,00."
        : quote && changeForCents < quote.totalCents
          ? "O valor precisa ser maior ou igual ao total do pedido."
          : null
      : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (changeError) return;

    setSubmitting(true);
    try {
      const payload = {
        items,
        deliveryType,
        paymentMethod,
        addressId: deliveryType === "DELIVERY" && !useNewAddress ? (addressId ?? undefined) : undefined,
        newAddress:
          deliveryType === "DELIVERY" && useNewAddress
            ? { ...newAddress, isDefault: addresses.length === 0 }
            : undefined,
        couponCode: couponCode || undefined,
        notes: notes || undefined,
        changeForCents:
          paymentMethod === "CASH" && changeForCents !== null ? changeForCents : undefined,
        scheduledFor,
        idempotencyKey: idempotencyKey.current,
      };

      const data = await api<{ order: { id: string } }>("/api/orders", {
        method: "POST",
        body: payload,
      });

      clear();
      push(`Pedido agendado para ${scheduledFor}! Agora é só pagar.`, "success");
      router.push(`/pedido/${data.order.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
      // Um pedido que falhou merece uma chave nova na próxima tentativa.
      idempotencyKey.current = `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      setSubmitting(false);
    }
  }

  if (sessionLoading || !user) {
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-16">
        <Spinner /> Carregando...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-5xl" aria-hidden="true">🛒</p>
        <h1 className="display mt-5 text-4xl">Seu carrinho está vazio</h1>
        <p className="muted mt-2">Adicione itens do cardápio para finalizar um pedido.</p>
        <Link href="/cardapio" className="mt-6 inline-block">
          <Button size="lg">Ver cardápio</Button>
        </Link>
      </div>
    );
  }

  const methodEnabled = settings?.paymentMethods ?? { pix: true, card: true, cash: true };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl px-4 py-6 pb-8 md:pb-10" noValidate>
      <h1 className="display mb-2 text-[clamp(2.25rem,7vw,3.25rem)]">Finalizar pedido</h1>
      <p className="muted mb-6 text-sm">Confira tudo antes de confirmar.</p>

      {error && (
        <div className="mb-4">
          <ErrorState message={error} />
        </div>
      )}

      {/* ------------------------- 1. seus dados --------------------------- */}
      <section className="panel mb-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Step n={1} /> Seus dados
        </h2>
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="muted w-20 shrink-0">Nome</dt>
            <dd className="font-medium">{user.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="muted w-20 shrink-0">Telefone</dt>
            <dd className="font-medium">{formatPhone(user.phone)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="muted w-20 shrink-0">E-mail</dt>
            <dd className="truncate font-medium">{user.email}</dd>
          </div>
        </dl>
        <Link
          href="/minha-conta"
          className="mt-3 inline-block text-sm font-semibold text-brand underline-offset-4 hover:underline"
        >
          Editar meus dados
        </Link>
      </section>

      {/* ----------------------- 2. horário da retirada -------------------- */}
      <section className="panel mb-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Step n={2} /> Quando você vai retirar
        </h2>

        {/* A escolha só aparece quando a loja realmente entrega. */}
        {settings?.allowDelivery && (
          <div className="mb-4 grid grid-cols-2 gap-2">
            {(
              [
                { value: "DELIVERY", label: "Entrega", icon: "🛵", enabled: true },
                { value: "PICKUP", label: "Retirar no local", icon: "🏪", enabled: settings?.allowPickup ?? true },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cx(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-4 text-center transition-colors",
                  deliveryType === option.value
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                    : "hover:bg-[var(--surface-sunken)]",
                  !option.enabled && "pointer-events-none opacity-40",
                )}
              >
                <input
                  type="radio"
                  name="deliveryType"
                  checked={deliveryType === option.value}
                  disabled={!option.enabled}
                  onChange={() => setDeliveryType(option.value)}
                  className="sr-only"
                />
                <span className="text-2xl" aria-hidden="true">{option.icon}</span>
                <span className="text-sm font-semibold">{option.label}</span>
              </label>
            ))}
          </div>
        )}

        <SchedulePicker
          value={scheduledFor}
          onChange={setScheduledFor}
          onValidityChange={setScheduleOk}
          error={fieldErrors.scheduledFor}
        />

        {deliveryType === "PICKUP" && settings?.address.street && (
          <p className="muted mt-3 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm">
            Retire em: {settings.address.street}, {settings.address.number} —{" "}
            {settings.address.neighborhood}, {settings.address.city}/{settings.address.state}
          </p>
        )}

        {deliveryType === "DELIVERY" && (
          <div className="mt-4 space-y-3">
            {addresses.length > 0 && (
              <div className="space-y-2">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={cx(
                      "flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors",
                      !useNewAddress && addressId === address.id
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                        : "hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={!useNewAddress && addressId === address.id}
                      onChange={() => {
                        setUseNewAddress(false);
                        setAddressId(address.id);
                        setNeighborhood(address.neighborhood);
                      }}
                      className="mt-1 size-4 accent-[var(--brand-ink)]"
                    />
                    <span>
                      <strong className="block">{address.label}</strong>
                      <span className="muted">{formatAddress(address)}</span>
                    </span>
                  </label>
                ))}

                <label
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
                    useNewAddress ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40" : "hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={useNewAddress}
                    onChange={() => setUseNewAddress(true)}
                    className="size-4 accent-[var(--brand-ink)]"
                  />
                  <span className="font-medium">Entregar em outro endereço</span>
                </label>
              </div>
            )}

            {useNewAddress && (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Field label="Rua" required error={fieldErrors["newAddress.street"]}>
                      {({ id, invalid }) => (
                        <Input id={id} invalid={invalid} required autoComplete="address-line1"
                          value={newAddress.street}
                          onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })} />
                      )}
                    </Field>
                  </div>
                  <Field label="Número" required error={fieldErrors["newAddress.number"]}>
                    {({ id, invalid }) => (
                      <Input id={id} invalid={invalid} required inputMode="numeric"
                        value={newAddress.number}
                        onChange={(e) => setNewAddress({ ...newAddress, number: e.target.value })} />
                    )}
                  </Field>
                </div>

                <Field label="Complemento">
                  {({ id }) => (
                    <Input id={id} value={newAddress.complement}
                      onChange={(e) => setNewAddress({ ...newAddress, complement: e.target.value })}
                      placeholder="Apto, bloco" />
                  )}
                </Field>

                <Field label="Bairro" required error={fieldErrors["newAddress.neighborhood"]}
                  hint="A taxa de entrega depende do bairro.">
                  {({ id, invalid }) => (
                    <Input id={id} invalid={invalid} required value={newAddress.neighborhood}
                      onChange={(e) => {
                        setNewAddress({ ...newAddress, neighborhood: e.target.value });
                        setNeighborhood(e.target.value);
                      }} />
                  )}
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Field label="Cidade" required error={fieldErrors["newAddress.city"]}>
                      {({ id, invalid }) => (
                        <Input id={id} invalid={invalid} required value={newAddress.city}
                          onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} />
                      )}
                    </Field>
                  </div>
                  <Field label="UF" required error={fieldErrors["newAddress.state"]}>
                    {({ id, invalid }) => (
                      <Input id={id} invalid={invalid} required maxLength={2} value={newAddress.state}
                        onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value.toUpperCase() })}
                        placeholder="SP" />
                    )}
                  </Field>
                </div>

                <Field label="CEP" required error={fieldErrors["newAddress.postalCode"]}>
                  {({ id, invalid }) => (
                    <Input id={id} invalid={invalid} required inputMode="numeric" autoComplete="postal-code"
                      value={newAddress.postalCode}
                      onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                      placeholder="00000000" />
                  )}
                </Field>

                <Field label="Ponto de referência">
                  {({ id }) => (
                    <Input id={id} value={newAddress.reference}
                      onChange={(e) => setNewAddress({ ...newAddress, reference: e.target.value })}
                      placeholder="Perto da praça, portão azul..." />
                  )}
                </Field>
              </div>
            )}

            {!useNewAddress && selectedAddress && (
              <p className="muted text-sm">
                Entregando em: <strong>{formatAddress(selectedAddress)}</strong>
              </p>
            )}
          </div>
        )}
      </section>

      {/* ------------------------- 3. pagamento ---------------------------- */}
      <section className="panel mb-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Step n={3} /> Forma de pagamento
        </h2>

        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              { value: "PIX", label: "PIX", hint: "QR Code na hora", icon: "📱", enabled: methodEnabled.pix },
              {
                value: "CARD",
                label: "Cartão",
                hint: deliveryType === "PICKUP" ? "Na retirada" : "Na entrega",
                icon: "💳",
                enabled: methodEnabled.card,
              },
              { value: "CASH", label: "Dinheiro", hint: "Informe o troco", icon: "💵", enabled: methodEnabled.cash },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={cx(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors sm:flex-col sm:text-center",
                paymentMethod === option.value
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                  : "hover:bg-[var(--surface-sunken)]",
                !option.enabled && "pointer-events-none opacity-40",
              )}
            >
              <input
                type="radio"
                name="paymentMethod"
                checked={paymentMethod === option.value}
                disabled={!option.enabled}
                onChange={() => setPaymentMethod(option.value)}
                className="sr-only"
              />
              <span className="text-2xl" aria-hidden="true">{option.icon}</span>
              <span>
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="muted block text-xs">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {paymentMethod === "CASH" && (
          <div className="mt-4 rounded-xl border p-4">
            <Field
              label="Troco para quanto?"
              hint="Deixe em branco se tiver o valor exato."
              error={changeError ?? undefined}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  inputMode="decimal"
                  value={changeFor}
                  onChange={(event) => setChangeFor(event.target.value)}
                  placeholder="Ex.: 50,00"
                />
              )}
            </Field>
            {changeDueCents !== null && changeDueCents >= 0 && quote && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                Total {formatCents(quote.totalCents)} · Você paga com{" "}
                {formatCents(changeForCents ?? 0)} ·{" "}
                <strong>Troco: {formatCents(changeDueCents)}</strong>
              </p>
            )}
          </div>
        )}

        {paymentMethod === "PIX" && (
          <p className="muted mt-3 text-sm">
            Ao confirmar, o código PIX aparece na tela. Seu horário fica garantido assim que o
            pagamento for confirmado pelo sistema.
          </p>
        )}
      </section>

      {/* -------------------------- 4. observações ------------------------- */}
      <section className="panel mb-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Step n={4} /> Observações
        </h2>
        <Field label="Alguma observação para a cozinha?" error={fieldErrors.notes}>
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ex.: sem pimenta, capricha no molho, tocar a campainha..."
            />
          )}
        </Field>
      </section>

      {/* --------------------------- 5. resumo ----------------------------- */}
      <section className="panel mb-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Step n={5} /> Resumo do pedido
        </h2>

        <ul className="divide-y text-sm">
          {(quote?.lines ?? []).map((line) => (
            <li key={line.productId} className="flex justify-between gap-3 py-2.5">
              <span>
                <strong className="tabular-nums">{line.quantity}×</strong> {line.name}
                <span className="muted block text-xs">
                  {formatCents(line.unitPriceCents)} cada
                </span>
              </span>
              <span className="font-semibold tabular-nums">{formatCents(line.subtotalCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-3 space-y-2 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="muted">Subtotal</dt>
            <dd className="tabular-nums">{formatCents(quote?.subtotalCents ?? 0)}</dd>
          </div>
          {deliveryType === "DELIVERY" && (
            <div className="flex justify-between">
              <dt className="muted">Taxa de entrega</dt>
              <dd className="tabular-nums">
                {quote?.deliveryFeeCents === 0 ? "Grátis" : formatCents(quote?.deliveryFeeCents ?? 0)}
              </dd>
            </div>
          )}
          {(quote?.discountCents ?? 0) > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <dt>Desconto {quote?.coupon ? `(${quote.coupon.code})` : ""}</dt>
              <dd className="tabular-nums">− {formatCents(quote?.discountCents ?? 0)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-lg font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCents(quote?.totalCents ?? 0)}</dd>
          </div>
        </dl>

        {scheduledFor && (
          <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm">
            {deliveryType === "PICKUP" ? "Retirada" : "Entrega"} agendada para as{" "}
            <strong className="tabular-nums">{scheduledFor}</strong> de hoje.
          </p>
        )}
      </section>

      <div
        className="fixed inset-x-0 z-40 px-3 md:static md:px-0"
        style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="action-bar mx-auto max-w-2xl">
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={
              quoting ||
              !quote ||
              !quote.meetsMinimum ||
              Boolean(changeError) ||
              // Sem horário aprovado não há pedido: a loja trabalha agendada.
              // O servidor confere de novo — isto só evita a ida e volta.
              !scheduledFor ||
              !scheduleOk
            }
          >
            {scheduledFor ? `Agendar · ${formatCents(quote?.totalCents ?? 0)}` : "Escolha o horário"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-coal-900"
    >
      {n}
    </span>
  );
}
