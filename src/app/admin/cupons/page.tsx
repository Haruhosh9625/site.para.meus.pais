"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/providers";
import { formatCents, parseMoneyToCents } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Badge, Button, EmptyState, ErrorState, Field, Input, Select, Skeleton } from "@/components/ui";

type Coupon = {
  id: string;
  code: string;
  description: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minOrderCents: number;
  maxDiscountCents: number;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number | null;
  active: boolean;
  _count: { orders: number };
};

const EMPTY = {
  code: "",
  description: "",
  discountType: "PERCENT" as "PERCENT" | "FIXED",
  percentValue: "10",
  fixedValue: "5,00",
  minOrder: "0,00",
  maxDiscount: "0,00",
  startsAt: "",
  expiresAt: "",
  usageLimit: "",
  perUserLimit: "",
};

/**
 * Cupons de desconto.
 *
 * O módulo já é funcional: um cupom criado aqui passa a valer no checkout
 * imediatamente, com validação de período, valor mínimo, limite total e
 * limite por cliente — tudo conferido no servidor.
 */
export default function AdminCouponsPage() {
  const { push } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ coupons: Coupon[] }>("/api/admin/coupons");
      setCoupons(data.coupons);
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

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const minOrderCents = parseMoneyToCents(form.minOrder) ?? 0;
    const maxDiscountCents = parseMoneyToCents(form.maxDiscount) ?? 0;

    let discountValue: number;
    if (form.discountType === "PERCENT") {
      discountValue = Number(form.percentValue);
      if (!Number.isFinite(discountValue) || discountValue < 1 || discountValue > 100) {
        setFormError("O percentual deve estar entre 1 e 100.");
        return;
      }
    } else {
      const cents = parseMoneyToCents(form.fixedValue);
      if (cents === null || cents < 1) {
        setFormError("Informe um valor de desconto válido.");
        return;
      }
      discountValue = cents;
    }

    setSaving(true);
    try {
      await api("/api/admin/coupons", {
        method: "POST",
        body: {
          code: form.code,
          description: form.description,
          discountType: form.discountType,
          discountValue,
          minOrderCents,
          maxDiscountCents,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
          expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
          perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : null,
          active: true,
        },
      });
      push("Cupom criado e já valendo no checkout.", "success");
      setCreating(false);
      setForm(EMPTY);
      await load();
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(coupon: Coupon) {
    try {
      await api(`/api/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        body: { active: !coupon.active },
      });
      await load();
      push(coupon.active ? "Cupom desativado." : "Cupom ativado.", "success");
    } catch (caught) {
      push(errorMessage(caught), "error");
    }
  }

  async function remove(coupon: Coupon) {
    try {
      const result = await api<{ deleted: boolean; message?: string }>(
        `/api/admin/coupons/${coupon.id}`,
        { method: "DELETE" },
      );
      push(result.message ?? "Cupom excluído.", "info");
      setConfirmDelete(null);
      await load();
    } catch (caught) {
      push(errorMessage(caught), "error");
    }
  }

  function describeDiscount(coupon: Coupon): string {
    if (coupon.discountType === "PERCENT") {
      const cap = coupon.maxDiscountCents > 0 ? ` (até ${formatCents(coupon.maxDiscountCents)})` : "";
      return `${coupon.discountValue}% de desconto${cap}`;
    }
    return `${formatCents(coupon.discountValue)} de desconto`;
  }

  function couponState(coupon: Coupon): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
    if (!coupon.active) return { label: "Inativo", tone: "neutral" };
    const now = new Date();
    if (coupon.startsAt && new Date(coupon.startsAt) > now) return { label: "Agendado", tone: "warning" };
    if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return { label: "Expirado", tone: "danger" };
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      return { label: "Esgotado", tone: "danger" };
    }
    return { label: "Válido", tone: "success" };
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-[clamp(1.9rem,4vw,2.5rem)]">Cupons</h1>
          <p className="muted text-sm">
            {coupons.filter((c) => couponState(c).label === "Válido").length} válidos de{" "}
            {coupons.length} cadastrados
          </p>
        </div>
        <Button onClick={() => setCreating((value) => !value)}>
          {creating ? "Fechar" : "+ Novo cupom"}
        </Button>
      </header>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {creating && (
        <form onSubmit={create} className="panel space-y-4 p-5" noValidate>
          <h2 className="font-bold">Novo cupom</h2>
          {formError && <ErrorState message={formError} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Código" required hint="O cliente digita este código no carrinho.">
              {({ id }) => (
                <Input id={id} required value={form.code} autoCapitalize="characters"
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="BEMVINDO10" className="uppercase" />
              )}
            </Field>

            <Field label="Descrição">
              {({ id }) => (
                <Input id={id} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Desconto de boas-vindas" />
              )}
            </Field>

            <Field label="Tipo de desconto" required>
              {({ id }) => (
                <Select id={id} value={form.discountType}
                  onChange={(e) =>
                    setForm({ ...form, discountType: e.target.value as "PERCENT" | "FIXED" })}>
                  <option value="PERCENT">Percentual (%)</option>
                  <option value="FIXED">Valor fixo (R$)</option>
                </Select>
              )}
            </Field>

            {form.discountType === "PERCENT" ? (
              <Field label="Percentual" required hint="Entre 1 e 100.">
                {({ id }) => (
                  <Input id={id} type="number" min={1} max={100} required value={form.percentValue}
                    onChange={(e) => setForm({ ...form, percentValue: e.target.value })} />
                )}
              </Field>
            ) : (
              <Field label="Valor do desconto (R$)" required>
                {({ id }) => (
                  <Input id={id} inputMode="decimal" required value={form.fixedValue}
                    onChange={(e) => setForm({ ...form, fixedValue: e.target.value })} />
                )}
              </Field>
            )}

            <Field label="Valor mínimo do pedido (R$)" hint="0 = sem mínimo.">
              {({ id }) => (
                <Input id={id} inputMode="decimal" value={form.minOrder}
                  onChange={(e) => setForm({ ...form, minOrder: e.target.value })} />
              )}
            </Field>

            {form.discountType === "PERCENT" && (
              <Field label="Desconto máximo (R$)" hint="0 = sem teto.">
                {({ id }) => (
                  <Input id={id} inputMode="decimal" value={form.maxDiscount}
                    onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} />
                )}
              </Field>
            )}

            <Field label="Válido a partir de">
              {({ id }) => (
                <Input id={id} type="date" value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              )}
            </Field>

            <Field label="Expira em">
              {({ id }) => (
                <Input id={id} type="date" value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              )}
            </Field>

            <Field label="Limite total de usos" hint="Vazio = ilimitado.">
              {({ id }) => (
                <Input id={id} type="number" min={1} value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
              )}
            </Field>

            <Field label="Limite por cliente" hint="Vazio = ilimitado.">
              {({ id }) => (
                <Input id={id} type="number" min={1} value={form.perUserLimit}
                  onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} />
              )}
            </Field>
          </div>

          <div className="flex gap-2">
            <Button type="submit" loading={saving}>Criar cupom</Button>
            <Button type="button" variant="ghost" onClick={() => { setCreating(false); setForm(EMPTY); }}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {coupons.length === 0 ? (
        <EmptyState
          icon="🎟️"
          title="Nenhum cupom cadastrado"
          description="Crie um cupom quando quiser fazer uma promoção. A estrutura já está pronta."
          action={<Button onClick={() => setCreating(true)}>Criar primeiro cupom</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {coupons.map((coupon) => {
            const state = couponState(coupon);
            return (
              <li key={coupon.id} className="panel flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-40 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-bold">{coupon.code}</span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </p>
                  <p className="muted text-sm">
                    {describeDiscount(coupon)}
                    {coupon.minOrderCents > 0 && ` · mínimo ${formatCents(coupon.minOrderCents)}`}
                  </p>
                  {coupon.description && <p className="muted text-xs">{coupon.description}</p>}
                  <p className="muted mt-1 text-xs">
                    Usos: {coupon.usageCount}
                    {coupon.usageLimit !== null && ` / ${coupon.usageLimit}`}
                    {coupon.perUserLimit !== null && ` · máx. ${coupon.perUserLimit} por cliente`}
                    {coupon.startsAt && ` · a partir de ${formatDate(coupon.startsAt)}`}
                    {coupon.expiresAt && ` · até ${formatDate(coupon.expiresAt)}`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void toggle(coupon)}>
                    {coupon.active ? "Desativar" : "Ativar"}
                  </Button>
                  {confirmDelete === coupon.id ? (
                    <>
                      <Button size="sm" variant="danger" onClick={() => void remove(coupon)}>
                        {coupon._count.orders > 0 ? "Desativar" : "Excluir"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(coupon.id)}>
                      Excluir
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
