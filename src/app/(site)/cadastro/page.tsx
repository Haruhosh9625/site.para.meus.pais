"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage, ApiError } from "@/lib/api-client";
import { useSession, useToast } from "@/components/providers";
import { Button, Field, Input, ErrorState } from "@/components/ui";
import { cx } from "@/lib/cx";
import { LogoMark } from "@/components/site/logo";

/** Indicador simples da força da senha, só para orientar quem cadastra. */
function passwordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const labels = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte", "Excelente"];
  return { score, label: labels[Math.min(score, 5)] };
}

export default function CadastroPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const { push } = useToast();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    passwordConfirmation: "",
  });
  const [withAddress, setWithAddress] = useState(false);
  const [address, setAddress] = useState({
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    postalCode: "",
  });

  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const strength = passwordStrength(form.password);
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (form.password !== form.passwordConfirmation) {
      setFieldErrors({ passwordConfirmation: "As senhas não conferem." });
      return;
    }

    setLoading(true);
    try {
      const resposta = await api<{ needsEmailConfirmation?: boolean; message?: string }>(
        "/api/auth/register",
        {
          method: "POST",
          body: {
            ...form,
            address: withAddress ? { ...address, label: "Casa", isDefault: true } : undefined,
          },
        },
      );

      /*
        Quando o provedor de identidade exige confirmação por e-mail, a conta
        existe mas não há sessão aberta. Mandar a pessoa para o cardápio ali
        seria jogá-la de volta no login sem explicação.
      */
      if (resposta.needsEmailConfirmation) {
        setPendingConfirmation(
          resposta.message ??
            "Conta criada! Confirme seu e-mail pelo link que enviamos e depois entre no site.",
        );
        return;
      }

      await refresh();
      push("Conta criada! Bom apetite.", "success");
      router.push("/cardapio");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  // Conta criada, mas o provedor pede confirmação de e-mail: a tela troca
  // de assunto em vez de tentar entrar e falhar.
  if (pendingConfirmation) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-5xl" aria-hidden="true">📬</p>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Confirme seu e-mail</h1>
        <p className="muted mt-3">{pendingConfirmation}</p>
        <p className="muted mt-2 text-sm">
          Enviamos para <strong>{form.email}</strong>. Se não chegar, veja a caixa de spam.
        </p>
        <Link href="/login" className="mt-6 inline-block">
          <Button>Ir para o login</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="mb-8 text-center">
        <LogoMark className="mx-auto size-14" />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Criar sua conta</h1>
        <p className="muted mt-1 text-sm">É rápido — e depois é só pedir.</p>
      </div>

      <form onSubmit={handleSubmit} className="surface space-y-4 p-6" noValidate>
        {error && <ErrorState message={error} />}

        <Field label="Nome completo" required error={fieldErrors.name}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              autoComplete="name"
              required
              value={form.name}
              onChange={update("name")}
              placeholder="Maria da Silva"
            />
          )}
        </Field>

        <Field label="E-mail" required error={fieldErrors.email}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={update("email")}
              placeholder="voce@email.com"
            />
          )}
        </Field>

        <Field
          label="Telefone com DDD"
          required
          hint="Usamos para falar com você sobre o pedido."
          error={fieldErrors.phone}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={form.phone}
              onChange={update("phone")}
              placeholder="11987654321"
            />
          )}
        </Field>

        <Field
          label="Senha"
          required
          hint="Mínimo de 8 caracteres, com letras e números."
          error={fieldErrors.password}
        >
          {({ id, describedBy, invalid }) => (
            <>
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={form.password}
                onChange={update("password")}
              />
              {form.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <div
                        key={index}
                        className={cx(
                          "flex-1 rounded-full",
                          index < strength.score
                            ? strength.score <= 2
                              ? "bg-red-500"
                              : strength.score <= 3
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            : "bg-[var(--surface-sunken)]",
                        )}
                      />
                    ))}
                  </div>
                  <span className="muted text-xs">{strength.label}</span>
                </div>
              )}
            </>
          )}
        </Field>

        <Field label="Confirmar senha" required error={fieldErrors.passwordConfirmation}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="password"
              autoComplete="new-password"
              required
              value={form.passwordConfirmation}
              onChange={update("passwordConfirmation")}
            />
          )}
        </Field>

        {/* Endereço é opcional aqui: dá para informar depois, no checkout. */}
        <div className="rounded-xl border p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={withAddress}
              onChange={(event) => setWithAddress(event.target.checked)}
              className="size-5 accent-[var(--brand-ink)]"
            />
            <span className="text-sm font-medium">Quero cadastrar meu endereço de entrega agora</span>
          </label>

          {withAddress && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Rua" required error={fieldErrors["address.street"]}>
                    {({ id, invalid }) => (
                      <Input
                        id={id}
                        invalid={invalid}
                        required
                        autoComplete="address-line1"
                        value={address.street}
                        onChange={(e) => setAddress({ ...address, street: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <Field label="Número" required error={fieldErrors["address.number"]}>
                  {({ id, invalid }) => (
                    <Input
                      id={id}
                      invalid={invalid}
                      required
                      inputMode="numeric"
                      value={address.number}
                      onChange={(e) => setAddress({ ...address, number: e.target.value })}
                    />
                  )}
                </Field>
              </div>

              <Field label="Complemento">
                {({ id }) => (
                  <Input
                    id={id}
                    value={address.complement}
                    onChange={(e) => setAddress({ ...address, complement: e.target.value })}
                    placeholder="Apto, bloco, referência"
                  />
                )}
              </Field>

              <Field label="Bairro" required error={fieldErrors["address.neighborhood"]}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    required
                    value={address.neighborhood}
                    onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
                  />
                )}
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Cidade" required error={fieldErrors["address.city"]}>
                    {({ id, invalid }) => (
                      <Input
                        id={id}
                        invalid={invalid}
                        required
                        value={address.city}
                        onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <Field label="UF" required error={fieldErrors["address.state"]}>
                  {({ id, invalid }) => (
                    <Input
                      id={id}
                      invalid={invalid}
                      required
                      maxLength={2}
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })}
                      placeholder="SP"
                    />
                  )}
                </Field>
              </div>

              <Field label="CEP" required error={fieldErrors["address.postalCode"]}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    required
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={address.postalCode}
                    onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                    placeholder="00000000"
                  />
                )}
              </Field>
            </div>
          )}
        </div>

        <Button type="submit" size="lg" fullWidth loading={loading}>
          Criar conta
        </Button>

        <p className="muted pt-1 text-center text-sm">
          Já tem conta?{" "}
          <Link href="/login" className="font-semibold text-brand underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}
