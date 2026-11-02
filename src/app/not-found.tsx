import Link from "next/link";
import { LogoMark } from "@/components/site/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark className="size-16" />
      <h1 className="text-3xl font-extrabold tracking-tight">Página não encontrada</h1>
      <p className="muted max-w-md">
        O link pode estar quebrado ou a página foi removida. Que tal dar uma olhada no cardápio?
      </p>
      <div className="mt-2 flex gap-3">
        <Link href="/" className="tap inline-flex items-center rounded-xl border px-5 font-semibold">
          Início
        </Link>
        <Link href="/cardapio"
          className="tap inline-flex items-center rounded-xl bg-brand-500 px-5 font-semibold text-coal-900">
          Ver cardápio
        </Link>
      </div>
    </div>
  );
}
