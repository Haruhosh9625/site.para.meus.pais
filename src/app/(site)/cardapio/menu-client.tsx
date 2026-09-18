"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProductCard, type MenuProduct } from "@/components/site/product-card";
import { useCart, useStoreSettings } from "@/components/providers";
import { formatCents } from "@/lib/money";
import { Button, EmptyState, Spinner } from "@/components/ui";
import { cx } from "@/lib/cx";

type Category = { id: string; name: string; slug: string; products: MenuProduct[] };

/**
 * Cardápio interativo.
 *
 * A barra de categorias fixa no topo e a barra de carrinho fixa no rodapé
 * fazem o pedido inteiro caber no polegar — sem sair da página.
 */
export function MenuClient({ categories }: { categories: Category[] }) {
  const { itemCount, quote, quoting } = useCart();
  const { settings } = useStoreSettings();
  const [activeCategory, setActiveCategory] = useState(categories[0]?.slug ?? "");
  const [search, setSearch] = useState("");

  // Destaca a categoria visível conforme a pessoa rola a página.
  useEffect(() => {
    if (search) return;
    const sections = categories
      .map((category) => document.getElementById(`categoria-${category.slug}`))
      .filter((element): element is HTMLElement => element !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCategory(visible.target.id.replace("categoria-", ""));
      },
      { rootMargin: "-120px 0px -65% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [categories, search]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return categories;
    return categories
      .map((category) => ({
        ...category,
        products: category.products.filter(
          (product) =>
            product.name.toLowerCase().includes(term) ||
            product.description.toLowerCase().includes(term),
        ),
      }))
      .filter((category) => category.products.length > 0);
  }, [categories, search]);

  const totalProducts = filtered.reduce((sum, category) => sum + category.products.length, 0);

  return (
    <div className="pb-8">
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <header className="mb-4">
          <h1 className="display text-[clamp(2.25rem,7vw,3.25rem)]">Cardápio</h1>
          <p className="muted mt-1 text-sm">
            Escolha os espetos, adicione o Completo se quiser e feche o pedido.
          </p>
        </header>

        <div className="mb-4">
          <label htmlFor="busca-cardapio" className="sr-only">
            Buscar no cardápio
          </label>
          <input
            id="busca-cardapio"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar item do cardápio..."
            className="panel w-full rounded-2xl px-5 py-3.5 text-base placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>

      {/* Abas de categoria: rolagem horizontal no celular. */}
      {!search && categories.length > 1 && (
        <nav
          aria-label="Categorias do cardápio"
          className="sticky top-[4.5rem] z-30 -mx-1 px-1 py-2 sm:top-[5rem]"
        >
          <ul className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => (
              <li key={category.id}>
                <a
                  href={`#categoria-${category.slug}`}
                  aria-current={activeCategory === category.slug ? "true" : undefined}
                  className={cx(
                    "tap inline-flex items-center rounded-full px-5 text-sm font-bold whitespace-nowrap transition-all",
                    activeCategory === category.slug
                      ? "bg-brand-500 text-coal-900"
                      : "glass-pill hover:bg-[var(--glass-bg-strong)]",
                  )}
                >
                  {category.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mx-auto max-w-5xl space-y-10 px-4 py-6">
        {totalProducts === 0 && (
          <EmptyState
            icon="🔍"
            title="Nada encontrado"
            description={
              search
                ? `Nenhum item corresponde a "${search}". Tente outra busca.`
                : "O cardápio está sendo atualizado. Volte em instantes."
            }
            action={
              search ? (
                <Button variant="outline" onClick={() => setSearch("")}>
                  Limpar busca
                </Button>
              ) : undefined
            }
          />
        )}

        {filtered.map((category) => (
          <section key={category.id} id={`categoria-${category.slug}`} className="scroll-mt-32">
            <h2 className="mb-4 text-xl font-bold tracking-tight">{category.name}</h2>

            {category.slug === "acompanhamentos" && (
              <p className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm dark:border-brand-900/40 dark:bg-brand-950/30">
                <strong>Atenção:</strong> o Completo é um item independente e não acompanha o
                espeto. Adicione-o separadamente se quiser.
              </p>
            )}

            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {category.products.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Barra do carrinho — sempre visível quando há itens. */}
      {itemCount > 0 && (
        <div
          className="fade-in fixed inset-x-0 bottom-19 z-40 px-3 md:bottom-4"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="action-bar action-bar-float mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {itemCount} {itemCount === 1 ? "item" : "itens"} no carrinho
              </p>
              <p className="muted flex items-center gap-1.5 text-sm">
                {quoting ? (
                  <>
                    <Spinner className="size-3.5" /> Calculando...
                  </>
                ) : (
                  <>Subtotal: {formatCents(quote?.subtotalCents ?? 0)}</>
                )}
              </p>
            </div>
            <Link href="/carrinho" className="shrink-0">
              <Button size="lg" disabled={settings ? !settings.isOpen : false}>
                {settings && !settings.isOpen ? "Loja fechada" : "Ver carrinho"}
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
