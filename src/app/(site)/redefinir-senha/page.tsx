"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/providers";
import { Button, Field, Input, ErrorState } from "@/components/ui";
import { LogoMark } from "@/components/site/logo";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { push } = useToast();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (password !== confirmation) {
      setFieldErrors({ confirmation: "As senhas não conferem." });
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", body: { token, password } });
      push("Senha redefinida. Faça login com a nova senha.", "success");
      router.push("/login");
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="surface space-y-4 p-6 text-center">
        <p className="text-4xl" aria-hidden="true">🔗</p>
        <p className="text-sm">
          Link inválido ou incompleto. Solicite um novo link de redefinição.
        </p>
        <Link href="/recuperar-senha">
          <Button fullWidth>Solicitar novo link</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="surface space-y-4 p-6" noValidate>
      {error && <ErrorState message={error} />}
      <Field label="Nova senha" required hint="Mínimo de 8 caracteres, com letras e números."
        error={fieldErrors.password}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id} aria-describedby={describedBy} invalid={invalid}
            type="password" autoComplete="new-password" required minLength={8}
            value={password} onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </Field>
      <Field label="Confirmar nova senha" required error={fieldErrors.confirmation}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id} aria-describedby={describedBy} invalid={invalid}
            type="password" autoComplete="new-password" required
            value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" size="lg" fullWidth loading={loading}>
        Redefinir senha
      </Button>
    </form>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="mb-8 text-center">
        <LogoMark className="mx-auto size-14" />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Criar nova senha</h1>
      </div>
      <Suspense fallback={<div className="surface p-6">Carregando...</div>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
