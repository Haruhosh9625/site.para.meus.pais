"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/providers";
import { LogoMark } from "@/components/site/logo";
import { Button, cx } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2Z" },
  { href: "/admin/produtos", label: "Cardápio", icon: "M4 6h16M4 12h16M4 18h16" },
  { href: "/admin/clientes", label: "Clientes", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" },
  { href: "/admin/financeiro", label: "Financeiro", icon: "M12 3v18M7 7h7a3 3 0 0 1 0 6H7m0 0h8" },
  { href: "/admin/cupons", label: "Cupons", icon: "M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" },
  { href: "/admin/configuracoes", label: "Configurações", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" },
] as const;

function NavIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/**
 * Estrutura do painel: barra lateral no desktop, gaveta no celular.
 * O painel funciona em qualquer tela — o dono da espetaria muitas vezes
 * acompanha os pedidos pelo próprio celular.
 */
export function AdminShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useSession();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const navigation = (
    <nav aria-label="Navegação do painel" className="flex flex-col gap-1">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={cx(
            "tap flex items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
            isActive(item.href)
              ? "bg-brand-600 text-white"
              : "hover:bg-[var(--surface-sunken)]",
          )}
        >
          <NavIcon path={item.icon} />
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--surface-muted)] lg:flex-row">
      {/* --------------------------- barra lateral --------------------------- */}
      <aside className="hidden w-64 shrink-0 border-r bg-[var(--surface)] p-4 lg:flex lg:flex-col">
        <Link href="/admin" className="mb-6 flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span>
            <span className="block text-sm font-extrabold">DS Espetos</span>
            <span className="muted block text-[11px] font-semibold tracking-wider uppercase">
              Painel
            </span>
          </span>
        </Link>

        {navigation}

        <div className="mt-auto space-y-2 border-t pt-4">
          <p className="muted truncate px-3 text-xs">Conectado como {userName}</p>
          <Link href="/" className="block">
            <Button variant="outline" size="sm" fullWidth>
              Ver o site
            </Button>
          </Link>
          <Button variant="ghost" size="sm" fullWidth onClick={() => void logout()}>
            Sair
          </Button>
        </div>
      </aside>

      {/* ------------------------- cabeçalho mobile -------------------------- */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-[var(--surface)] px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="admin-menu"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          className="tap -ml-2 inline-flex items-center justify-center rounded-lg px-2 hover:bg-[var(--surface-sunken)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" className="size-6" aria-hidden="true">
            <path d={open ? "M6 6l12 12M18 6 6 18" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
        <Link href="/admin" className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="text-sm font-extrabold">Painel</span>
        </Link>
        <Link href="/" className="ml-auto text-sm font-semibold text-brand-600">
          Ver site
        </Link>
      </header>

      {open && (
        <div id="admin-menu" className="fade-in border-b bg-[var(--surface)] p-4 lg:hidden">
          {navigation}
          <div className="mt-4 border-t pt-4">
            <Button variant="ghost" size="sm" fullWidth onClick={() => void logout()}>
              Sair
            </Button>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
