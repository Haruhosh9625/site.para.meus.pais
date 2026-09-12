import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/server/db";
import { getPublicSettings } from "@/server/services/settings";
import { formatCents } from "@/lib/money";
import { LogoMark } from "@/components/site/logo";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Página inicial.
 *
 * Renderizada no servidor: o cardápio em destaque e o estado aberto/fechado
 * já chegam prontos no HTML, então o celular pinta a tela rápido mesmo em
 * conexão ruim.
 */
export default async function HomePage() {
  const [settings, highlights] = await Promise.all([
    getPublicSettings().catch(() => null),
    prisma.product
      .findMany({
        where: { active: true, available: true },
        orderBy: [{ category: { position: "asc" } }, { position: "asc" }],
        take: 7,
        select: {
          id: true,
          name: true,
          description: true,
          priceCents: true,
          imageUrl: true,
          category: { select: { name: true } },
        },
      })
      .catch(() => []),
  ]);

  return (
    <>
      {/* ------------------------------- herói ------------------------------ */}
      <section className="relative overflow-hidden bg-coal-900 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 55% at 50% 100%, rgba(224,83,32,.45) 0%, transparent 70%)," +
              "radial-gradient(40% 40% at 15% 20%, rgba(233,161,60,.22) 0%, transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              {settings && (
                <div className="mb-5">
                  {settings.isOpen ? (
                    <Badge tone="success">
                      <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                      {closesAt(settings)
                        ? `Aberto agora — pedidos até ${closesAt(settings)}`
                        : "Aberto agora"}
                    </Badge>
                  ) : (
                    <Badge tone="danger">
                      Fechado{settings.nextOpening ? ` — abrimos ${settings.nextOpening}` : ""}
                    </Badge>
                  )}
                </div>
              )}

              <h1 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Espeto na brasa,
                <br />
                <span className="text-brand-400">do jeito certo.</span>
              </h1>

              <p className="mt-5 max-w-lg text-lg text-coal-200">
                Porco, carne, toscana, frango e frango com bacon — todos a{" "}
                <strong className="text-white">R$ 8,00</strong>. Monte seu pedido em segundos
                {settings?.allowDelivery
                  ? " e escolha entrega ou retirada."
                  : ", escolha a hora e retire no balcão."}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/cardapio"
                  className="tap inline-flex items-center justify-center rounded-xl bg-brand-500 px-7 py-4 text-base font-bold text-coal-900 transition-colors hover:bg-brand-400"
                >
                  Ver o cardápio
                </Link>
                <Link
                  href="/meus-pedidos"
                  className="tap inline-flex items-center justify-center rounded-xl border border-white/25 px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Acompanhar pedido
                </Link>
              </div>

              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-coal-300">Pagamento</dt>
                  <dd className="font-semibold">PIX, cartão ou dinheiro</dd>
                </div>
                <div>
                  <dt className="text-coal-300">Preparo</dt>
                  <dd className="font-semibold">
                    ~{settings?.prepTimeMinutes ?? 30} min
                  </dd>
                </div>
                <div>
                  <dt className="text-coal-300">Receba</dt>
                  <dd className="font-semibold">
                    {settings?.allowDelivery ? "Entrega ou retirada" : "Retirada agendada"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="relative hidden justify-center lg:flex">
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="absolute -inset-8 rounded-full bg-brand-500/20 blur-3xl"
                />
                <LogoMark className="relative size-72 drop-shadow-2xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------- como funciona ------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { step: "1", title: "Monte o pedido", text: "Escolha os espetos, o Completo e a bebida." },
            settings?.allowDelivery
              ? { step: "2", title: "Entrega ou retirada", text: "Informe o endereço ou venha buscar." }
              : {
                  step: "2",
                  title: "Escolha o horário",
                  text: "Diga a hora em que vai buscar. Deixamos pronto para esse momento.",
                },
            { step: "3", title: "Pague com PIX", text: "O código aparece na hora, direto na tela." },
            {
              step: "4",
              title: "Acompanhe",
              text: settings?.allowDelivery
                ? "Veja o status do preparo até a entrega."
                : "Veja o status até o pedido ficar pronto para retirada.",
            },
          ].map((item) => (
            <li key={item.step} className="surface p-5">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-coal-900">
                {item.step}
              </span>
              <h2 className="mt-3 font-semibold">{item.title}</h2>
              <p className="muted mt-1 text-sm">{item.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------ destaques --------------------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Do cardápio</h2>
            <p className="muted text-sm">Todos os itens saem na brasa, feitos na hora.</p>
          </div>
          <Link
            href="/cardapio"
            className="shrink-0 text-sm font-semibold text-brand underline-offset-4 hover:underline"
          >
            Ver tudo
          </Link>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((product) => (
            <li key={product.id}>
              <Link
                href="/cardapio"
                className="surface group block overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]"
              >
                <div className="relative aspect-square overflow-hidden bg-[var(--surface-sunken)]">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="muted flex h-full items-center justify-center text-4xl">🍢</div>
                  )}
                </div>
                <div className="p-4">
                  <p className="muted text-[11px] font-semibold tracking-wider uppercase">
                    {product.category.name}
                  </p>
                  <h3 className="mt-1 font-semibold">{product.name}</h3>
                  <p className="muted mt-1 line-clamp-2 text-sm">{product.description}</p>
                  <p className="mt-3 text-lg font-bold text-brand">
                    {formatCents(product.priceCents)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------- aviso sobre o Completo -------------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="surface flex flex-col gap-4 border-brand-200 bg-brand-50 p-6 sm:flex-row sm:items-center dark:border-brand-900/40 dark:bg-brand-950/30">
          <span className="text-4xl" aria-hidden="true">
            🍽️
          </span>
          <div className="flex-1">
            <h2 className="font-bold">O Completo é um item à parte</h2>
            <p className="muted mt-1 text-sm">
              Ele não vem junto com o espeto. Se quiser, adicione o Completo ao carrinho
              separadamente — assim você monta o pedido exatamente do jeito que quer.
            </p>
          </div>
          <Link
            href="/cardapio"
            className="tap inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-coal-900 hover:bg-brand-400"
          >
            Adicionar ao pedido
          </Link>
        </div>
      </section>
    </>
  );
}

/**
 * Horário de fechamento previsto para hoje, ou null.
 *
 * Devolve null quando hoje é dia de folga no calendário — o que acontece
 * quando a loja está aberta pela chave manual do painel, fora do horário
 * habitual. Nesse caso o selo mostra só "Aberto agora", sem prometer um
 * horário que não existe na configuração.
 */
function closesAt(settings: {
  openingHours: Array<{ weekday: number; close: string; closed: boolean }>;
}): string | null {
  const today = settings.openingHours.find((hour) => hour.weekday === new Date().getDay());
  return today && !today.closed ? today.close : null;
}
