"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./logo";
import { useCart, useSession, useStoreSettings } from "@/components/providers";
import { Badge, Button, cx } from "@/components/ui";
import { formatPhone } from "@/lib/format";

/* ------------------------------- ícones ---------------------------------- */

function Icon({ path, className = "size-6" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  menu: "M4 6h16M4 12h16M4 18h16",
  cart: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  orders: "M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2ZM9 9h6M9 13h4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  close: "M6 6l12 12M18 6 6 18",
  admin: "M4 6h16M4 12h16M4 18h10",
} as const;

/* ------------------------------ status da loja ---------------------------- */

export function StoreStatusPill() {
  const { settings } = useStoreSettings();
  if (!settings) return null;

  return settings.isOpen ? (
    <Badge tone="success">
      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Aberto agora
    </Badge>
  ) : (
    <Badge tone="danger">
      <span className="size-1.5 rounded-full bg-red-500" aria-hidden="true" /> Fechado
    </Badge>
  );
}

/** Faixa de aviso exibida no topo quando a loja está fechada. */
export function ClosedBanner() {
  const { settings } = useStoreSettings();
  if (!settings || settings.isOpen) return null;

  return (
    <div
      role="status"
      className="bg-coal-900 px-4 py-2.5 text-center text-sm text-white dark:bg-coal-950"
    >
      <strong className="font-bold">{settings.storeName} — FECHADO</strong>
      {settings.nextOpening ? (
        <span className="ml-2 text-coal-200">Abrimos {settings.nextOpening}.</span>
      ) : (
        <span className="ml-2 text-coal-200">Consulte nossos horários.</span>
      )}
    </div>
  );
}

/* --------------------------------- header --------------------------------- */

export function SiteHeader() {
  const { user, logout } = useSession();
  const { itemCount } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Início" },
    { href: "/cardapio", label: "Cardápio" },
    { href: "/meus-pedidos", label: "Meus pedidos" },
  ];

  return (
    <>
      <ClosedBanner />
      <header className="sticky top-0 z-40 border-b bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Logo compact />

          <nav aria-label="Navegação principal" className="ml-4 hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={cx(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                    : "hover:bg-[var(--surface-sunken)]",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <StoreStatusPill />
            </div>

            {user?.role === "ADMIN" && (
              <Link
                href="/admin"
                className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-[var(--surface-sunken)] sm:block dark:text-brand-300"
              >
                Painel
              </Link>
            )}

            <Link
              href="/carrinho"
              className="tap relative hidden items-center justify-center rounded-xl px-3 hover:bg-[var(--surface-sunken)] md:inline-flex"
              aria-label={`Carrinho, ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
            >
              <Icon path={ICONS.cart} />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 right-1 flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>

            {user ? (
              <div className="hidden items-center gap-2 md:flex">
                <Link
                  href="/minha-conta"
                  className="tap inline-flex items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-[var(--surface-sunken)]"
                >
                  <Icon path={ICONS.user} className="size-5" />
                  <span className="max-w-24 truncate">{user.name.split(" ")[0]}</span>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => void logout()}>
                  Sair
                </Button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Link href="/login">
                  <Button variant="outline" size="sm">
                    Entrar
                  </Button>
                </Link>
                <Link href="/cadastro">
                  <Button size="sm">Criar conta</Button>
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="tap inline-flex items-center justify-center rounded-xl px-2 hover:bg-[var(--surface-sunken)] md:hidden"
              aria-expanded={menuOpen}
              aria-controls="menu-mobile"
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            >
              <Icon path={menuOpen ? ICONS.close : ICONS.menu} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="menu-mobile" className="fade-in border-t bg-[var(--surface)] px-4 py-3 md:hidden">
            <div className="mb-3 sm:hidden">
              <StoreStatusPill />
            </div>
            <nav aria-label="Menu" className="flex flex-col gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="tap flex items-center rounded-lg px-3 text-sm font-medium hover:bg-[var(--surface-sunken)]"
                >
                  {link.label}
                </Link>
              ))}
              {user?.role === "ADMIN" && (
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="tap flex items-center rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-[var(--surface-sunken)] dark:text-brand-300"
                >
                  Painel administrativo
                </Link>
              )}
              <div className="mt-2 border-t pt-3">
                {user ? (
                  <div className="flex flex-col gap-2">
                    <Link href="/minha-conta" onClick={() => setMenuOpen(false)}>
                      <Button variant="outline" fullWidth>
                        Minha conta
                      </Button>
                    </Link>
                    <Button variant="ghost" fullWidth onClick={() => void logout()}>
                      Sair
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link href="/login" onClick={() => setMenuOpen(false)}>
                      <Button variant="outline" fullWidth>
                        Entrar
                      </Button>
                    </Link>
                    <Link href="/cadastro" onClick={() => setMenuOpen(false)}>
                      <Button fullWidth>Criar conta</Button>
                    </Link>
                  </div>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}

/* ---------------------------- navegação inferior --------------------------- */

/**
 * Barra fixa no rodapé, visível apenas no celular.
 * É o caminho principal de navegação em telas pequenas — o carrinho fica
 * sempre a um toque de distância, em qualquer página.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { user } = useSession();

  // O painel administrativo tem a própria navegação.
  if (pathname.startsWith("/admin")) return null;

  const items = [
    { href: "/", label: "Início", icon: ICONS.home },
    { href: "/cardapio", label: "Cardápio", icon: ICONS.menu },
    { href: "/carrinho", label: "Carrinho", icon: ICONS.cart, badge: itemCount },
    { href: "/meus-pedidos", label: "Pedidos", icon: ICONS.orders },
    { href: user ? "/minha-conta" : "/login", label: user ? "Conta" : "Entrar", icon: ICONS.user },
  ];

  return (
    <nav
      aria-label="Navegação rápida"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-[var(--surface)]/98 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-brand-600" : "text-[var(--text-muted)]",
                )}
              >
                <span className="relative">
                  <Icon path={item.icon} className="size-6" />
                  {"badge" in item && (item.badge ?? 0) > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex min-w-4.5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                      {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* --------------------------------- rodapé --------------------------------- */

export function SiteFooter() {
  const { settings } = useStoreSettings();
  const year = new Date().getFullYear();
  const hasContact = Boolean(settings?.phone || settings?.whatsapp || settings?.address.street);

  // No celular, o rodapé é o último conteúdo do documento e precisa poder
  // rolar acima das duas barras fixas: a navegação inferior (~64px) e a
  // barra de ação de carrinho/checkout (~76px). Sem esta folga (pb-40), a
  // última linha do rodapé ficaria eternamente escondida atrás delas.
  return (
    <footer className="mt-16 border-t bg-[var(--surface)] pb-40 md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Logo />
          <p className="muted mt-3 max-w-xs text-sm">
            Espetos na brasa, refrigerante gelado e o nosso Completo. Peça pelo site e retire ou
            receba em casa.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">Horários</h2>
          <ul className="muted space-y-1 text-sm">
            {settings?.openingHours.map((hour) => (
              <li key={hour.weekday} className="flex justify-between gap-4">
                <span>
                  {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][hour.weekday]}
                </span>
                <span>{hour.closed ? "Fechado" : `${hour.open} - ${hour.close}`}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Só aparece quando o administrador já preencheu algum contato. */}
        <div hidden={!hasContact}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">Contato</h2>
          <ul className="muted space-y-2 text-sm">
            {settings?.phone && (
              <li>
                Telefone:{" "}
                <a className="underline underline-offset-2" href={`tel:${settings.phone}`}>
                  {formatPhone(settings.phone)}
                </a>
              </li>
            )}
            {settings?.whatsapp && (
              <li>
                WhatsApp:{" "}
                <a
                  className="underline underline-offset-2"
                  href={`https://wa.me/55${settings.whatsapp.replace(/\D/g, "")}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {formatPhone(settings.whatsapp)}
                </a>
              </li>
            )}
            {settings?.address.street && (
              <li>
                {settings.address.street}, {settings.address.number}
                <br />
                {settings.address.neighborhood} — {settings.address.city}/{settings.address.state}
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="muted border-t px-4 py-5 text-center text-xs">
        © {year} {settings?.storeName ?? "DS Espetos"}. Todos os direitos reservados.
      </div>
    </footer>
  );
}
