"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { Button, Field, Input, ErrorState } from "@/components/ui";
import { LogoMark } from "@/components/site/logo";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="mb-8 text-center">
        <LogoMark className="mx-auto size-14" />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Recuperar senha</h1>
      </div>

      {sent ? (
        <div className="surface space-y-4 p-6 text-center">
          <p className="text-4xl" aria-hidden="true">📬</p>
          <p role="status" className="text-sm">
            Se existir uma conta com <strong>{email}</strong>, enviamos as instruções para redefinir
            a senha. O link vale por 1 hora.
          </p>
          <Link href="/login">
            <Button variant="outline" fullWidth>Voltar para o login</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="surface space-y-4 p-6" noValidate>
          {error && <ErrorState message={error} />}
          <p className="muted text-sm">
            Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.
          </p>
          <Field label="E-mail" required>
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
          <Button type="submit" size="lg" fullWidth loading={loading}>
            Enviar instruções
          </Button>
          <p className="muted text-center text-sm">
            <Link href="/login" className="text-brand-600 underline-offset-4 hover:underline">
              Voltar para o login
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
