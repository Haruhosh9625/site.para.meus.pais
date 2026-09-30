"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage, ApiError } from "@/lib/api-client";
import { useSession, useToast } from "@/components/providers";
import { Button, Field, Input, ErrorState } from "@/components/ui";
import { LogoMark } from "@/components/site/logo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useSession();
  const { push } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const redirectTo = params.get("redirect") ?? "/minha-conta";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      await refresh();
      push("Bem-vindo de volta!", "success");
      router.push(redirectTo);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-10">
      <div className="mb-8 text-center">
        <LogoMark className="mx-auto size-14" />
        <h1 className="display mt-5 text-4xl">Entrar na sua conta</h1>
        <p className="muted mt-1 text-sm">Acompanhe seus pedidos e peça mais rápido.</p>
      </div>

      <form onSubmit={handleSubmit} className="panel space-y-4 p-6" noValidate>
        {error && <ErrorState message={error} />}

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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@email.com"
            />
          )}
        </Field>

        <Field label="Senha" required error={fieldErrors.password}>
          {({ id, describedBy, invalid }) => (
            <div className="relative">
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-2 px-2 text-xs font-semibold text-brand"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          )}
        </Field>

        <Button type="submit" size="lg" fullWidth loading={loading}>
          Entrar
        </Button>

        <div className="flex flex-col gap-2 pt-2 text-center text-sm">
          <Link href="/recuperar-senha" className="text-brand underline-offset-4 hover:underline">
            Esqueci minha senha
          </Link>
          <p className="muted">
            Ainda não tem conta?{" "}
            <Link href="/cadastro" className="font-semibold text-brand underline-offset-4 hover:underline">
              Criar conta
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-10">Carregando...</div>}>
      <LoginForm />
    </Suspense>
  );
}
