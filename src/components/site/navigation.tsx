"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./logo";
import { Pulo } from "./numbers";
import { useCart, useCartDrawer, useSession, useStoreSettings } from "@/components/providers";
import { Badge, Button } from "@/components/ui";
import { cx } from "@/lib/cx";
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

/* ------------------------------- contador --------------------------------- */

/**
 * Pastilha com a quantidade de itens no carrinho.
 *
 * Ela pula a cada mudança. O ícone do carrinho fica no canto oposto ao botão
 * que a pessoa acabou de apertar; sem o pulo, o número troca sem ninguém ver.
 */
function ContadorDoCarrinho({ itemCount }: { itemCount: number }) {
  if (itemCount <= 0) return null;
  return (
    <Pulo
      chave={itemCount}
      className="absolute -top-0.5 right-1 flex size-5 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-coal-900"
    >
      {itemCount > 99 ? "99+" : itemCount}
    </Pulo>
  );
}

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

/**
 * Quantos pixels de rolagem já passaram do limite.
 *
 * A barra no topo muda de peso quando a página sai do começo: em repouso é
 * quase invisível, rolando fica com mais corpo e sombra. Um detalhe pequeno
 * que o olho lê como "isto flutua acima do conteúdo".
 */
function useScrolled(limite = 12) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const aoRolar = () => setScrolled(window.scrollY > limite);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, [limite]);

  return scrolled;
}

export function SiteHeader() {
  const { user, logout } = useSession();
  const { itemCount } = useCart();
  const { openDrawer } = useCartDrawer();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const scrolled = useScrolled();

  const links = [
    { href: "/", label: "Início" },
    { href: "/cardapio", label: "Cardápio" },
    { href: "/meus-pedidos", label: "Meus pedidos" },
  ];

  const naTelaDoPedido = pathname === "/carrinho" || pathname.startsWith("/checkout");

  return (
    <>
      <ClosedBanner />
      {/*
        A barra não encosta no topo: fica solta, como uma peça de vidro
        apoiada sobre a página. O conteúdo passa por baixo dela — é daí que
        vem a sensação de profundidade. O espaço que ela ocupa é reservado
        pelo padding do <main> em app/(site)/layout.tsx.
      */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
        <div
          className={cx(
            "glass glass-sheen pointer-events-auto mx-auto flex h-15 max-w-6xl items-center gap-3 px-3 sm:px-4",
            "transition-[background-color,box-shadow,border-color] duration-300",
            scrolled ? "glass-strong shadow-[var(--shadow-float)]" : "",
          )}
        >
          <Logo compact />

          <nav aria-label="Navegação principal" className="ml-4 hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={cx(
                  "relative rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                  pathname === link.href
                    ? "text-brand"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {link.label}
                {/* Sublinhado curto no item ativo: mais leve que uma pílula. */}
                {pathname === link.href && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-500"
                  />
                )}
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
                className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-[var(--surface-sunken)] sm:block"
              >
                Painel
              </Link>
            )}

            {/*
              Nas telas do carrinho e do checkout o ícone continua um link —
              abrir uma gaveta com a mesma lista que já está na tela só
              confundiria. Em qualquer outro lugar ele abre a gaveta, e a
              pessoa confere o pedido sem perder o lugar no cardápio.
            */}
            {naTelaDoPedido ? (
              <Link
                href="/carrinho"
                className="tap relative hidden items-center justify-center rounded-xl px-3 hover:bg-[var(--surface-sunken)] md:inline-flex"
                aria-label={`Carrinho, ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
              >
                <Icon path={ICONS.cart} />
                <ContadorDoCarrinho itemCount={itemCount} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={openDrawer}
                className="tap relative hidden items-center justify-center rounded-xl px-3 hover:bg-[var(--surface-sunken)] md:inline-flex"
                aria-label={`Abrir carrinho, ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
              >
                <Icon path={ICONS.cart} />
                <ContadorDoCarrinho itemCount={itemCount} />
              </button>
            )}

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

        {/*
          O painel do menu é irmão da pílula, não filho: assim ele desce
          como uma segunda placa de vidro em vez de esticar a barra. Precisa
          de `pointer-events-auto` porque o <header> inteiro é
          `pointer-events-none` — só as peças reais capturam o toque.
        */}
        {menuOpen && (
          <div
            id="menu-mobile"
            className="glass glass-strong fade-in pointer-events-auto mx-auto mt-2 max-w-6xl px-4 py-3 shadow-[var(--shadow-float)] md:hidden"
          >
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
                  className="tap flex items-center rounded-lg px-3 text-sm font-semibold text-brand hover:bg-[var(--surface-sunken)]"
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
  const { openDrawer } = useCartDrawer();
  const { user } = useSession();

  // O painel administrativo tem a própria navegação.
  if (pathname.startsWith("/admin")) return null;

  const items = [
    { href: "/", label: "Início", icon: ICONS.home },
    { href: "/cardapio", label: "Cardápio", icon: ICONS.menu },
    // `gaveta` diz que este item abre a gaveta em vez de navegar. O href
    // continua aí: sem JavaScript, o toque leva para /carrinho normalmente.
    { href: "/carrinho", label: "Carrinho", icon: ICONS.cart, badge: itemCount, gaveta: true },
    { href: "/meus-pedidos", label: "Pedidos", icon: ICONS.orders },
    { href: user ? "/minha-conta" : "/login", label: user ? "Conta" : "Entrar", icon: ICONS.user },
  ];

  return (
    <nav
      aria-label="Navegação rápida"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 md:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <ul className="glass glass-strong mx-auto flex max-w-lg shadow-[var(--shadow-float)]">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={
                  "gaveta" in item && item.gaveta && !active && !pathname.startsWith("/checkout")
                    ? (evento) => {
                        evento.preventDefault();
                        openDrawer();
                      }
                    : undefined
                }
                className={cx(
                  "relative flex flex-col items-center gap-1 rounded-[calc(var(--radius-glass)-4px)] py-2.5",
                  "text-[11px] font-semibold transition-colors",
                  active ? "text-brand" : "text-[var(--text-muted)]",
                )}
              >
                {/* Marca do item ativo: um risco de luz no alto do item. */}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand-500"
                  />
                )}
                <span className="relative">
                  <Icon path={item.icon} className="size-6" />
                  {"badge" in item && (item.badge ?? 0) > 0 && (
                    <Pulo
                      chave={item.badge ?? 0}
                      className="absolute -top-1.5 -right-2 flex min-w-4.5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-coal-900"
                    >
                      {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                    </Pulo>
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
  // O rodapé é escuro nos dois temas, fechando a página com o mesmo
  // material do herói: a leitura de cima a baixo vira brasa → conteúdo →
  // brasa, e não uma pilha de caixas brancas.
  //
  // Sem margem no topo, de propósito: a faixa clara que aparecia entre a
  // chamada final (escura) e o rodapé (escuro) cortava a página em duas.
  // O próprio fundo escuro do rodapé já faz a separação.
  return (
    <footer className="mesh relative overflow-hidden pb-40 md:pb-0">
      <div className="relative z-1 mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-coal-300">
            Espetos na brasa, refrigerante gelado e o nosso Completo. Peça pelo site
            {settings?.allowDelivery
              ? " e retire ou receba em casa."
              : ", escolha a hora e retire no balcão."}
          </p>
        </div>

        <div>
          <h2 className="eyebrow mb-4 text-brand-400">Horários</h2>
          <ul className="space-y-1.5 text-sm text-coal-300">
            {settings?.openingHours.map((hour) => (
              <li key={hour.weekday} className="flex justify-between gap-4">
                <span>
                  {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][hour.weekday]}
                </span>
                <span
                  className={
                    hour.closed ? "text-coal-500" : "font-semibold tabular-nums text-coal-100"
                  }
                >
                  {hour.closed ? "Fechado" : `${hour.open} - ${hour.close}`}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Só aparece quando o administrador já preencheu algum contato. */}
        <div hidden={!hasContact}>
          <h2 className="eyebrow mb-4 text-brand-400">Contato</h2>
          <ul className="space-y-2.5 text-sm text-coal-300">
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

      {/* coal-300 pelo mesmo motivo do rótulo no herói: em coal-400 este
          texto de 12px ficava em 4,4:1 sobre a malha. */}
      <div className="relative z-1 border-t border-white/10 px-4 py-6 text-center text-xs text-coal-300">
        © {year} {settings?.storeName ?? "DS Espetos"}. Todos os direitos reservados.
      </div>
    </footer>
  );
}
