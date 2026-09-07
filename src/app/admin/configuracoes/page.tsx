"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useStoreSettings, useToast } from "@/components/providers";
import { formatCents, parseMoneyToCents } from "@/lib/money";
import { WEEKDAY_LABEL } from "@/lib/constants";
import { Badge, Button, ErrorState, Field, Input, Skeleton, cx } from "@/components/ui";

type OpeningHour = { weekday: number; open: string; close: string; closed: boolean };

type DeliveryArea = {
  id: string;
  neighborhood: string;
  city: string;
  feeCents: number;
  minOrderCents: number;
  etaMinutes: number;
  active: boolean;
};

type Settings = {
  storeName: string;
  logoUrl: string | null;
  phone: string;
  whatsapp: string;
  email: string;
  addressStreet: string;
  addressNumber: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  openingHours: OpeningHour[];
  manualOpen: boolean;
  useManualSwitch: boolean;
  deliveryFeeCents: number;
  minOrderCents: number;
  freeDeliveryAboveCents: number;
  prepTimeMinutes: number;
  deliveryTimeMinutes: number;
  acceptPix: boolean;
  acceptCard: boolean;
  acceptCash: boolean;
  allowDelivery: boolean;
  allowPickup: boolean;
  deliveryAreas: DeliveryArea[];
};

type Provider = { id: string; label: string; configured: boolean; active: boolean };

/** Campo monetário: mostra reais para a pessoa, guarda centavos no estado. */
function MoneyField({
  label,
  hint,
  cents,
  onChange,
}: {
  label: string;
  hint?: string;
  cents: number;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState((cents / 100).toFixed(2).replace(".", ","));

  useEffect(() => {
    setText((cents / 100).toFixed(2).replace(".", ","));
  }, [cents]);

  return (
    <Field label={label} hint={hint}>
      {({ id }) => (
        <Input
          id={id}
          inputMode="decimal"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseMoneyToCents(event.target.value);
            if (parsed !== null) onChange(parsed);
          }}
          onBlur={() => setText((cents / 100).toFixed(2).replace(".", ","))}
        />
      )}
    </Field>
  );
}

export default function AdminSettingsPage() {
  const { push } = useToast();
  const { reload } = useStoreSettings();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeProvider, setActiveProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newArea, setNewArea] = useState({ neighborhood: "", city: "", fee: "0,00", eta: "30" });

  const load = useCallback(async () => {
    try {
      const data = await api<{
        settings: Settings;
        paymentProviders: Provider[];
        activeProvider: string;
      }>("/api/admin/settings");
      setSettings(data.settings);
      setProviders(data.paymentProviders);
      setActiveProvider(data.activeProvider);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(changes: Partial<Settings>) {
    setSettings((prev) => (prev ? { ...prev, ...changes } : prev));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const { deliveryAreas: _areas, ...payload } = settings;
      await api("/api/admin/settings", { method: "PUT", body: payload });
      push("Configurações salvas.", "success");
      reload();
      await load();
    } catch (caught) {
      push(errorMessage(caught), "error");
    } finally {
      setSaving(false);
    }
  }

  async function addArea() {
    const feeCents = parseMoneyToCents(newArea.fee);
    if (!newArea.neighborhood.trim() || feeCents === null) {
      push("Informe o bairro e uma taxa válida.", "error");
      return;
    }
    try {
      await api("/api/admin/delivery-areas", {
        method: "POST",
        body: {
          neighborhood: newArea.neighborhood,
          city: newArea.city,
          feeCents,
          etaMinutes: Number(newArea.eta) || 30,
        },
      });
      setNewArea({ neighborhood: "", city: "", fee: "0,00", eta: "30" });
      push("Área de entrega salva.", "success");
      await load();
      reload();
    } catch (caught) {
      push(errorMessage(caught), "error");
    }
  }

  async function removeArea(id: string) {
    try {
      await api(`/api/admin/delivery-areas/${id}`, { method: "DELETE" });
      push("Área removida.", "info");
      await load();
      reload();
    } catch (caught) {
      push(errorMessage(caught), "error");
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Configurações</h1>
        <p className="muted text-sm">
          Tudo que muda o funcionamento da loja está aqui — nada disso está fixo no código.
        </p>
      </header>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      <form onSubmit={save} className="space-y-4">
        {/* ------------------------- aberto / fechado ---------------------- */}
        <section className="surface p-5">
          <h2 className="mb-3 font-bold">Status da loja</h2>

          <label className="flex items-start gap-3 rounded-xl border p-4">
            <input
              type="checkbox"
              checked={settings.useManualSwitch}
              onChange={(e) => patch({ useManualSwitch: e.target.checked })}
              className="mt-0.5 size-5 accent-[var(--color-brand-600)]"
            />
            <span>
              <span className="block text-sm font-semibold">Controlar manualmente</span>
              <span className="muted block text-xs">
                Ignora o horário de funcionamento e usa a chave abaixo. Útil para fechar mais cedo
                em um dia atípico.
              </span>
            </span>
          </label>

          {settings.useManualSwitch && (
            <label
              className={cx(
                "mt-2 flex items-center gap-3 rounded-xl border p-4",
                settings.manualOpen
                  ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-red-400 bg-red-50 dark:bg-red-950/30",
              )}
            >
              <input
                type="checkbox"
                checked={settings.manualOpen}
                onChange={(e) => patch({ manualOpen: e.target.checked })}
                className="size-5 accent-[var(--color-brand-600)]"
              />
              <span className="text-sm font-bold">
                {settings.manualOpen ? "LOJA ABERTA — aceitando pedidos" : "LOJA FECHADA"}
              </span>
            </label>
          )}
        </section>

        {/* ---------------------------- dados da loja ---------------------- */}
        <section className="surface space-y-4 p-5">
          <h2 className="font-bold">Dados do estabelecimento</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da empresa" required>
              {({ id }) => (
                <Input id={id} required value={settings.storeName}
                  onChange={(e) => patch({ storeName: e.target.value })} />
              )}
            </Field>
            <Field label="URL do logo" hint="Deixe vazio para usar o logo padrão.">
              {({ id }) => (
                <Input id={id} value={settings.logoUrl ?? ""}
                  onChange={(e) => patch({ logoUrl: e.target.value })}
                  placeholder="https://..." />
              )}
            </Field>
            <Field label="Telefone">
              {({ id }) => (
                <Input id={id} type="tel" value={settings.phone}
                  onChange={(e) => patch({ phone: e.target.value })} placeholder="1133334444" />
              )}
            </Field>
            <Field label="WhatsApp">
              {({ id }) => (
                <Input id={id} type="tel" value={settings.whatsapp}
                  onChange={(e) => patch({ whatsapp: e.target.value })} placeholder="11987654321" />
              )}
            </Field>
            <Field label="E-mail de contato">
              {({ id }) => (
                <Input id={id} type="email" value={settings.email}
                  onChange={(e) => patch({ email: e.target.value })} />
              )}
            </Field>
          </div>

          <h3 className="pt-2 text-sm font-semibold">Endereço do estabelecimento</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Rua">
                {({ id }) => (
                  <Input id={id} value={settings.addressStreet}
                    onChange={(e) => patch({ addressStreet: e.target.value })} />
                )}
              </Field>
            </div>
            <Field label="Número">
              {({ id }) => (
                <Input id={id} value={settings.addressNumber}
                  onChange={(e) => patch({ addressNumber: e.target.value })} />
              )}
            </Field>
            <Field label="Bairro">
              {({ id }) => (
                <Input id={id} value={settings.addressNeighborhood}
                  onChange={(e) => patch({ addressNeighborhood: e.target.value })} />
              )}
            </Field>
            <Field label="Cidade">
              {({ id }) => (
                <Input id={id} value={settings.addressCity}
                  onChange={(e) => patch({ addressCity: e.target.value })} />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="UF">
                {({ id }) => (
                  <Input id={id} maxLength={2} value={settings.addressState}
                    onChange={(e) => patch({ addressState: e.target.value.toUpperCase() })} />
                )}
              </Field>
              <Field label="CEP">
                {({ id }) => (
                  <Input id={id} value={settings.addressPostalCode}
                    onChange={(e) => patch({ addressPostalCode: e.target.value })} />
                )}
              </Field>
            </div>
          </div>
        </section>

        {/* ----------------------------- horários -------------------------- */}
        <section className="surface p-5">
          <h2 className="mb-1 font-bold">Horário de funcionamento</h2>
          <p className="muted mb-4 text-xs">
            Para virar a madrugada, use um horário de fechamento menor que o de abertura
            (ex.: 18:00 às 02:00).
          </p>

          <ul className="space-y-2">
            {settings.openingHours
              .slice()
              .sort((a, b) => a.weekday - b.weekday)
              .map((hour) => (
                <li key={hour.weekday} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                  <span className="w-32 text-sm font-medium">{WEEKDAY_LABEL[hour.weekday]}</span>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!hour.closed}
                      onChange={(event) =>
                        patch({
                          openingHours: settings.openingHours.map((entry) =>
                            entry.weekday === hour.weekday
                              ? { ...entry, closed: !event.target.checked }
                              : entry,
                          ),
                        })
                      }
                      className="size-4 accent-[var(--color-brand-600)]"
                    />
                    Aberto
                  </label>

                  {!hour.closed && (
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`open-${hour.weekday}`}>
                        Abertura de {WEEKDAY_LABEL[hour.weekday]}
                      </label>
                      <input
                        id={`open-${hour.weekday}`}
                        type="time"
                        value={hour.open}
                        onChange={(event) =>
                          patch({
                            openingHours: settings.openingHours.map((entry) =>
                              entry.weekday === hour.weekday
                                ? { ...entry, open: event.target.value }
                                : entry,
                            ),
                          })
                        }
                        className="rounded-lg border bg-[var(--surface)] px-2 py-1.5 text-sm"
                      />
                      <span className="muted text-sm">às</span>
                      <label className="sr-only" htmlFor={`close-${hour.weekday}`}>
                        Fechamento de {WEEKDAY_LABEL[hour.weekday]}
                      </label>
                      <input
                        id={`close-${hour.weekday}`}
                        type="time"
                        value={hour.close}
                        onChange={(event) =>
                          patch({
                            openingHours: settings.openingHours.map((entry) =>
                              entry.weekday === hour.weekday
                                ? { ...entry, close: event.target.value }
                                : entry,
                            ),
                          })
                        }
                        className="rounded-lg border bg-[var(--surface)] px-2 py-1.5 text-sm"
                      />
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </section>

        {/* ------------------------ entrega e pedido mínimo ---------------- */}
        <section className="surface space-y-4 p-5">
          <h2 className="font-bold">Entrega e pedido mínimo</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              label="Taxa de entrega padrão"
              hint="Usada quando o bairro não tem taxa própria."
              cents={settings.deliveryFeeCents}
              onChange={(cents) => patch({ deliveryFeeCents: cents })}
            />
            <MoneyField
              label="Pedido mínimo"
              hint="Em produtos, sem contar a entrega. Zero = sem mínimo."
              cents={settings.minOrderCents}
              onChange={(cents) => patch({ minOrderCents: cents })}
            />
            <MoneyField
              label="Frete grátis acima de"
              hint="Zero desativa o frete grátis."
              cents={settings.freeDeliveryAboveCents}
              onChange={(cents) => patch({ freeDeliveryAboveCents: cents })}
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Preparo (min)">
                {({ id }) => (
                  <Input id={id} type="number" min={0} value={settings.prepTimeMinutes}
                    onChange={(e) => patch({ prepTimeMinutes: Number(e.target.value) || 0 })} />
                )}
              </Field>
              <Field label="Entrega (min)">
                {({ id }) => (
                  <Input id={id} type="number" min={0} value={settings.deliveryTimeMinutes}
                    onChange={(e) => patch({ deliveryTimeMinutes: Number(e.target.value) || 0 })} />
                )}
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 border-t pt-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={settings.allowDelivery}
                onChange={(e) => patch({ allowDelivery: e.target.checked })}
                className="size-5 accent-[var(--color-brand-600)]" />
              Aceitar entrega
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={settings.allowPickup}
                onChange={(e) => patch({ allowPickup: e.target.checked })}
                className="size-5 accent-[var(--color-brand-600)]" />
              Aceitar retirada no local
            </label>
          </div>
        </section>

        {/* ------------------------ formas de pagamento -------------------- */}
        <section className="surface p-5">
          <h2 className="mb-3 font-bold">Formas de pagamento aceitas</h2>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={settings.acceptPix}
                onChange={(e) => patch({ acceptPix: e.target.checked })}
                className="size-5 accent-[var(--color-brand-600)]" />
              PIX
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={settings.acceptCard}
                onChange={(e) => patch({ acceptCard: e.target.checked })}
                className="size-5 accent-[var(--color-brand-600)]" />
              Cartão
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={settings.acceptCash}
                onChange={(e) => patch({ acceptCash: e.target.checked })}
                className="size-5 accent-[var(--color-brand-600)]" />
              Dinheiro
            </label>
          </div>

          <div className="mt-5 border-t pt-4">
            <h3 className="mb-2 text-sm font-semibold">Gateway de pagamento</h3>
            <p className="muted mb-3 text-xs">
              O gateway ativo é definido pela variável de ambiente{" "}
              <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5">PAYMENT_PROVIDER</code>{" "}
              — chaves e segredos nunca ficam no painel nem no navegador.
            </p>
            <ul className="flex flex-wrap gap-2">
              {providers.map((provider) => (
                <li key={provider.id}>
                  <Badge tone={provider.active ? "brand" : provider.configured ? "success" : "neutral"}>
                    {provider.label}
                    {provider.active && " · ativo"}
                    {!provider.active && provider.configured && " · configurado"}
                    {!provider.configured && " · sem credenciais"}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="muted mt-2 text-xs">
              Ativo agora: <strong>{activeProvider}</strong>
            </p>
          </div>
        </section>

        <div className="sticky bottom-0 -mx-4 border-t bg-[var(--surface)] px-4 py-3 sm:-mx-6 sm:px-6">
          <Button type="submit" size="lg" loading={saving}>
            Salvar configurações
          </Button>
        </div>
      </form>

      {/* --------------------------- áreas de entrega ---------------------- */}
      <section className="surface p-5">
        <h2 className="mb-1 font-bold">Bairros atendidos</h2>
        <p className="muted mb-4 text-xs">
          Cada bairro pode ter a própria taxa e tempo estimado. Bairros fora desta lista usam a
          taxa padrão.
        </p>

        {settings.deliveryAreas.length > 0 && (
          <ul className="mb-4 divide-y">
            {settings.deliveryAreas.map((area) => (
              <li key={area.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    {area.neighborhood}
                    {area.city && <span className="muted"> · {area.city}</span>}
                  </p>
                  <p className="muted text-xs">
                    Taxa {formatCents(area.feeCents)} · aprox. {area.etaMinutes} min
                    {area.minOrderCents > 0 && ` · mínimo ${formatCents(area.minOrderCents)}`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void removeArea(area.id)}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Bairro">
            {({ id }) => (
              <Input id={id} value={newArea.neighborhood}
                onChange={(e) => setNewArea({ ...newArea, neighborhood: e.target.value })} />
            )}
          </Field>
          <Field label="Cidade">
            {({ id }) => (
              <Input id={id} value={newArea.city}
                onChange={(e) => setNewArea({ ...newArea, city: e.target.value })} />
            )}
          </Field>
          <Field label="Taxa (R$)">
            {({ id }) => (
              <Input id={id} inputMode="decimal" value={newArea.fee}
                onChange={(e) => setNewArea({ ...newArea, fee: e.target.value })} />
            )}
          </Field>
          <Field label="Tempo (min)">
            {({ id }) => (
              <Input id={id} type="number" min={0} value={newArea.eta}
                onChange={(e) => setNewArea({ ...newArea, eta: e.target.value })} />
            )}
          </Field>
        </div>
        <Button className="mt-3" variant="outline" onClick={() => void addArea()}>
          + Adicionar bairro
        </Button>
      </section>
    </div>
  );
}
