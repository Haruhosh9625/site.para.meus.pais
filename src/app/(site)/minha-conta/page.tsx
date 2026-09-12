"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage, ApiError } from "@/lib/api-client";
import { useSession, useToast } from "@/components/providers";
import { formatAddress, formatDate } from "@/lib/format";
import { Button, Field, Input, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { cx } from "@/lib/cx";

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

type Notification = {
  id: string;
  title: string;
  body: string;
  orderId: string | null;
  readAt: string | null;
  createdAt: string;
};

const EMPTY = {
  label: "Casa",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  postalCode: "",
  reference: "",
  isDefault: false,
};

type Tab = "dados" | "enderecos" | "senha" | "avisos";

export default function MinhaContaPage() {
  const { user, loading: sessionLoading, refresh, logout } = useSession();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>("dados");

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          icon="🔐"
          title="Entre na sua conta"
          description="Faça login para ver e editar seus dados."
          action={
            <Link href="/login?redirect=/minha-conta">
              <Button size="lg">Entrar</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "dados", label: "Meus dados" },
    { key: "enderecos", label: "Endereços" },
    { key: "senha", label: "Senha" },
    { key: "avisos", label: "Avisos" },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Minha conta</h1>
          <p className="muted mt-1 text-sm">
            Cliente desde {formatDate(user.createdAt)}
            {user.role === "ADMIN" && " · Administrador"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void logout()}>
          Sair da conta
        </Button>
      </div>

      {user.role === "ADMIN" && (
        <Link href="/admin" className="mb-4 block">
          <div className="surface flex items-center justify-between p-4 transition-shadow hover:shadow-[var(--shadow-soft)]">
            <div>
              <p className="font-semibold">Painel administrativo</p>
              <p className="muted text-sm">Pedidos, cardápio, clientes e financeiro</p>
            </div>
            <span aria-hidden="true">→</span>
          </div>
        </Link>
      )}

      <div role="tablist" aria-label="Seções da conta" className="mb-4 flex gap-1 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cx(
              "tap rounded-lg px-4 text-sm font-semibold whitespace-nowrap transition-colors",
              tab === item.key
                ? "bg-brand-500 text-coal-900"
                : "bg-[var(--surface-sunken)] hover:bg-[var(--surface)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "dados" && <ProfileForm user={user} onSaved={refresh} push={push} />}
      {tab === "enderecos" && <AddressManager push={push} />}
      {tab === "senha" && <PasswordForm push={push} />}
      {tab === "avisos" && <NotificationList />}
    </div>
  );
}

/* ------------------------------- dados pessoais ---------------------------- */

function ProfileForm({
  user,
  onSaved,
  push,
}: {
  user: { name: string; email: string; phone: string };
  onSaved: () => Promise<void>;
  push: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await api("/api/me", { method: "PATCH", body: form });
      await onSaved();
      push("Dados atualizados.", "success");
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="surface space-y-4 p-5" noValidate>
      {error && <ErrorState message={error} />}
      <Field label="Nome completo" required error={fieldErrors.name}>
        {({ id, invalid }) => (
          <Input id={id} invalid={invalid} required autoComplete="name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        )}
      </Field>
      <Field label="E-mail" required error={fieldErrors.email}>
        {({ id, invalid }) => (
          <Input id={id} invalid={invalid} required type="email" autoComplete="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        )}
      </Field>
      <Field label="Telefone com DDD" required error={fieldErrors.phone}>
        {({ id, invalid }) => (
          <Input id={id} invalid={invalid} required type="tel" autoComplete="tel" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        )}
      </Field>
      <Button type="submit" loading={loading}>Salvar alterações</Button>
    </form>
  );
}

/* --------------------------------- endereços ------------------------------- */

function AddressManager({
  push,
}: {
  push: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Address | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api<{ addresses: Address[] }>("/api/me/addresses");
      setAddresses(data.addresses);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(address: Address) {
    setEditing(address);
    setCreating(false);
    setForm({
      label: address.label,
      street: address.street,
      number: address.number,
      complement: address.complement ?? "",
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      reference: address.reference ?? "",
      isDefault: address.isDefault,
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api(`/api/me/addresses/${editing.id}`, { method: "PATCH", body: form });
        push("Endereço atualizado.", "success");
      } else {
        await api("/api/me/addresses", { method: "POST", body: form });
        push("Endereço adicionado.", "success");
      }
      setEditing(null);
      setCreating(false);
      setForm(EMPTY);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/me/addresses/${id}`, { method: "DELETE" });
      push("Endereço removido.", "info");
      setConfirmDelete(null);
      await load();
    } catch (caught) {
      push(errorMessage(caught), "error");
    }
  }

  if (loading) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-3">
      {error && <ErrorState message={error} />}

      {addresses.map((address) => (
        <div key={address.id} className="surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold">
                {address.label}
                {address.isDefault && (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
                    Padrão
                  </span>
                )}
              </p>
              <p className="muted mt-1 text-sm">{formatAddress(address)}</p>
              {address.reference && (
                <p className="muted mt-0.5 text-xs">Referência: {address.reference}</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => startEdit(address)}>
              Editar
            </Button>
            {confirmDelete === address.id ? (
              <>
                <Button size="sm" variant="danger" onClick={() => void remove(address.id)}>
                  Confirmar exclusão
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(address.id)}>
                Excluir
              </Button>
            )}
          </div>
        </div>
      ))}

      {addresses.length === 0 && !creating && (
        <EmptyState
          icon="📍"
          title="Nenhum endereço salvo"
          description="Cadastre um endereço para agilizar suas entregas."
        />
      )}

      {(creating || editing) && (
        <form onSubmit={save} className="surface space-y-3 p-5" noValidate>
          <h2 className="font-bold">{editing ? "Editar endereço" : "Novo endereço"}</h2>

          <Field label="Nome do endereço">
            {({ id }) => (
              <Input id={id} value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Casa, Trabalho..." />
            )}
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Rua" required>
                {({ id }) => (
                  <Input id={id} required value={form.street}
                    onChange={(e) => setForm({ ...form, street: e.target.value })} />
                )}
              </Field>
            </div>
            <Field label="Número" required>
              {({ id }) => (
                <Input id={id} required inputMode="numeric" value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })} />
              )}
            </Field>
          </div>

          <Field label="Complemento">
            {({ id }) => (
              <Input id={id} value={form.complement}
                onChange={(e) => setForm({ ...form, complement: e.target.value })} />
            )}
          </Field>

          <Field label="Bairro" required>
            {({ id }) => (
              <Input id={id} required value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
            )}
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Cidade" required>
                {({ id }) => (
                  <Input id={id} required value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })} />
                )}
              </Field>
            </div>
            <Field label="UF" required>
              {({ id }) => (
                <Input id={id} required maxLength={2} value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
              )}
            </Field>
          </div>

          <Field label="CEP" required>
            {({ id }) => (
              <Input id={id} required inputMode="numeric" value={form.postalCode}
                onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                placeholder="00000000" />
            )}
          </Field>

          <Field label="Ponto de referência">
            {({ id }) => (
              <Input id={id} value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            )}
          </Field>

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="size-5 accent-[var(--brand-ink)]" />
            Usar como endereço padrão
          </label>

          <div className="flex gap-2 pt-1">
            <Button type="submit" loading={saving}>Salvar</Button>
            <Button type="button" variant="ghost"
              onClick={() => { setEditing(null); setCreating(false); setForm(EMPTY); }}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {!creating && !editing && (
        <Button variant="outline" fullWidth
          onClick={() => { setCreating(true); setForm(EMPTY); }}>
          + Adicionar endereço
        </Button>
      )}
    </div>
  );
}

/* ---------------------------------- senha ---------------------------------- */

function PasswordForm({
  push,
}: {
  push: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (newPassword !== confirmation) {
      setFieldErrors({ confirmation: "As senhas não conferem." });
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      push("Senha alterada. As outras sessões foram encerradas.", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="surface space-y-4 p-5" noValidate>
      {error && <ErrorState message={error} />}
      <p className="muted text-sm">
        Ao trocar a senha, todas as sessões abertas em outros aparelhos são encerradas.
      </p>
      <Field label="Senha atual" required error={fieldErrors.currentPassword}>
        {({ id, invalid }) => (
          <Input id={id} invalid={invalid} required type="password" autoComplete="current-password"
            value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        )}
      </Field>
      <Field label="Nova senha" required hint="Mínimo de 8 caracteres, com letras e números."
        error={fieldErrors.newPassword}>
        {({ id, invalid }) => (
          <Input id={id} invalid={invalid} required type="password" autoComplete="new-password"
            minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        )}
      </Field>
      <Field label="Confirmar nova senha" required error={fieldErrors.confirmation}>
        {({ id, invalid }) => (
          <Input id={id} invalid={invalid} required type="password" autoComplete="new-password"
            value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        )}
      </Field>
      <Button type="submit" loading={loading}>Alterar senha</Button>
    </form>
  );
}

/* --------------------------------- avisos ---------------------------------- */

function NotificationList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ notifications: Notification[] }>("/api/notifications")
      .then((data) => {
        setNotifications(data.notifications);
        if (data.notifications.some((n) => !n.readAt)) {
          void api("/api/notifications", { method: "POST", body: { all: true } });
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-48" />;

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon="🔔"
        title="Nenhum aviso por aqui"
        description="Avisamos você sobre cada mudança nos seus pedidos."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {notifications.map((notification) => (
        <li key={notification.id} className="surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{notification.title}</p>
              <p className="muted mt-1 text-sm">{notification.body}</p>
            </div>
            {!notification.readAt && (
              <span className="mt-1 size-2 shrink-0 rounded-full bg-brand-600" aria-label="Não lido" />
            )}
          </div>
          {notification.orderId && (
            <Link href={`/pedido/${notification.orderId}`}
              className="mt-2 inline-block text-sm font-semibold text-brand underline-offset-4 hover:underline">
              Ver pedido
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
