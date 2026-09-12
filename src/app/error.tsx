"use client";

import { useEffect } from "react";

/**
 * Última linha de defesa da interface: qualquer erro não tratado cai aqui
 * em vez de deixar a tela em branco.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro na aplicação:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl" aria-hidden="true">🔥</p>
      <h1 className="text-2xl font-extrabold tracking-tight">Algo deu errado</h1>
      <p className="muted max-w-md">
        Tivemos um problema ao carregar esta página. Tente de novo — se continuar, fale com a loja.
      </p>
      {error.digest && <p className="muted font-mono text-xs">Código: {error.digest}</p>}
      <button onClick={reset}
        className="tap mt-2 inline-flex items-center rounded-xl bg-brand-500 px-6 font-semibold text-coal-900">
        Tentar novamente
      </button>
    </div>
  );
}
