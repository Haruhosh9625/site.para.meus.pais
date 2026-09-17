import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/server/db";
import { getPublicSettings } from "@/server/services/settings";
import { formatCents } from "@/lib/money";
import { LogoMark } from "@/components/site/logo";

export const dynamic = "force-dynamic";

/**
 * Página inicial.
 *
 * Renderizada no servidor: o cardápio em destaque e o estado aberto/fechado
 * já chegam prontos no HTML, então o celular pinta a tela rápido mesmo em
 * conexão ruim.
 *
 * SOBRE O DESENHO DESTA PÁGINA
 *
 * O herói é escuro de propósito, nos dois temas. Dois motivos:
 *
 *  1. comida na brasa se fotografa no escuro — fundo claro achata o
 *     contraste do fogo;
 *  2. vidro só parece vidro quando há algo atrás para refratar. Sobre uma
 *     chapa branca, `backdrop-filter` não produz nada visível. A malha de
 *     gradiente da classe `.mesh` é o que dá substância às peças de vidro
 *     que flutuam por cima.
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

  const agendado = settings ? !settings.allowDelivery : true;
  // Três itens com foto para a pilha do herói. Sem foto, a moldura ficaria
  // vazia — então filtramos antes de escolher.
  const destaquesHeroi = highlights.filter((produto) => produto.imageUrl).slice(0, 3);
  const fechamento = settings ? closesAt(settings) : null;

  // A frase da faixa deslizante sai dos próprios espetos do cardápio.
  const palavras = [
    "Feito na brasa",
    "Todos a R$ 8,00",
    agendado ? "Retirada agendada" : "Entrega e retirada",
    "PIX na hora",
    "Sem app, sem cadastro chato",
  ];

  return (
    <>
      {/* ================================ herói =============================== */}
      <section className="mesh relative overflow-hidden">
        {/*
          A faixa começa acima do topo e vaza para fora da tela: o corte
          nas bordas é o que dá a impressão de um cenário maior do que a
          janela, em vez de um bloco que começa e termina ali.
        */}
        <div className="relative z-1 mx-auto max-w-6xl px-4 pt-10 pb-16 sm:pt-16 sm:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            {/* ----------------------------- texto ---------------------------- */}
            <div>
              {settings && (
                <p className="reveal mb-6 inline-flex">
                  <span className="glass-dark inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold">
                    <span
                      aria-hidden="true"
                      className={
                        settings.isOpen
                          ? "relative flex size-2"
                          : "relative flex size-2 opacity-60"
                      }
                    >
                      {settings.isOpen && (
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                      )}
                      <span
                        className={
                          "relative inline-flex size-2 rounded-full " +
                          (settings.isOpen ? "bg-emerald-400" : "bg-coal-400")
                        }
                      />
                    </span>
                    {settings.isOpen ? (
                      <>
                        Aberto agora
                        {fechamento && (
                          <span className="text-coal-300">· pedidos até {fechamento}</span>
                        )}
                      </>
                    ) : (
                      <>
                        Fechado
                        {settings.nextOpening && (
                          <span className="text-coal-300">· abrimos {settings.nextOpening}</span>
                        )}
                      </>
                    )}
                  </span>
                </p>
              )}

              <h1 className="display reveal text-[clamp(3.25rem,11vw,6.5rem)]">
                Espeto
                <br />
                na brasa,
                <br />
                <span className="text-brand-400">do jeito certo.</span>
              </h1>

              <p className="reveal mt-7 max-w-md text-lg leading-relaxed text-coal-200">
                Porco, carne, toscana, frango e frango com bacon — todos a{" "}
                <strong className="font-bold text-white">R$ 8,00</strong>. Monte seu pedido em
                segundos
                {agendado ? ", escolha a hora e retire no balcão." : " e escolha entrega ou retirada."}
              </p>

              <div className="reveal mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/cardapio"
                  className="tap glass-sheen relative isolate inline-flex items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-brand-400 to-brand-500 px-8 py-4 text-base font-bold tracking-wide text-coal-900 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45),0_16px_40px_-16px_rgb(245_179_1/0.6)] transition-all duration-200 hover:from-brand-300 hover:to-brand-400 active:translate-y-px motion-reduce:active:translate-y-0"
                >
                  Ver o cardápio
                </Link>
                <Link
                  href="/meus-pedidos"
                  className="tap glass-dark glass-sheen relative isolate inline-flex items-center justify-center overflow-hidden rounded-2xl px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/15"
                >
                  Acompanhar pedido
                </Link>
              </div>

              {/* Três fatos, em uma tira de vidro só. */}
              <dl className="reveal glass-dark mt-10 grid max-w-lg grid-cols-3 divide-x divide-white/10 overflow-hidden">
                {[
                  { termo: "Pagamento", valor: "PIX, cartão\nou dinheiro" },
                  { termo: "Preparo", valor: `~${settings?.prepTimeMinutes ?? 30} min\nna chapa` },
                  {
                    termo: "Receba",
                    valor: agendado ? "Retirada\nagendada" : "Entrega ou\nretirada",
                  },
                ].map((fato) => (
                  <div key={fato.termo} className="px-4 py-4">
                    {/*
                      coal-300, não coal-400: medido em pixel, o rótulo em
                      coal-400 sobre o vidro escuro dava 3,5:1 — abaixo dos
                      4,5:1 que texto pequeno exige. Em coal-300 sobe para
                      5,8:1.
                    */}
                    <dt className="eyebrow text-coal-300">{fato.termo}</dt>
                    <dd className="mt-1.5 text-sm leading-snug font-semibold whitespace-pre-line">
                      {fato.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* ------------------------- o produto ---------------------------- */}
            {/*
              Três fotos em moldura de vidro, ligeiramente tortas e
              sobrepostas. Peça alinhada no gabarito parece catálogo; peça
              torta parece objeto que alguém colocou ali. A do meio é a
              maior e fica na frente.
            */}
            <div className="relative hidden h-[30rem] items-center justify-center lg:flex">
              {/* A brasa por trás da pilha. */}
              <div
                aria-hidden="true"
                className="absolute size-80 rounded-full bg-brand-500/30 blur-[90px]"
              />

              {destaquesHeroi.map((produto, index) => {
                // As laterais são mais estreitas e recuam para trás: a
                // legenda da peça do meio precisa ficar inteira à vista.
                const layout = [
                  "left-0 top-10 w-44 -rotate-8 z-1",
                  "left-1/2 top-0 w-60 -translate-x-1/2 rotate-2 z-3",
                  "right-0 bottom-10 w-44 rotate-7 z-2",
                ][index];

                return (
                  <figure
                    key={produto.id}
                    className={`glass-dark reveal absolute overflow-hidden p-2 ${layout}`}
                    data-reveal-order={index}
                  >
                    <div className="relative aspect-3/4 overflow-hidden rounded-xl bg-coal-950">
                      {produto.imageUrl && (
                        <Image
                          src={produto.imageUrl}
                          alt={produto.name}
                          fill
                          sizes="256px"
                          priority={index === 1}
                          className="object-cover"
                        />
                      )}
                    </div>
                    <figcaption className="flex items-baseline justify-between gap-2 px-1.5 pt-2.5 pb-1">
                      <span className="truncate text-xs font-bold">{produto.name}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-brand-400">
                        {formatCents(produto.priceCents)}
                      </span>
                    </figcaption>
                  </figure>
                );
              })}

              {/* O monograma vira selo, pequeno, no canto da pilha. */}
              <p className="glass-dark absolute -bottom-2 left-6 z-3 flex items-center gap-2.5 rounded-full py-2 pr-4 pl-2">
                <LogoMark className="size-8" />
                <span className="text-xs leading-tight font-bold">
                  Feito na hora
                  <span className="block font-medium text-coal-300">nunca pronto esperando</span>
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* ============================ faixa deslizante ======================== */}
        <div className="relative z-1 border-y border-white/10 bg-coal-950/40 py-3.5">
          <div className="marquee gap-8">
            {/*
              A lista aparece duas vezes para o laço da animação não ter
              costura. A segunda cópia é decorativa: `aria-hidden` evita que
              o leitor de tela anuncie tudo em dobro.
            */}
            {[0, 1].map((copia) => (
              <ul
                key={copia}
                aria-hidden={copia === 1 ? "true" : undefined}
                className="flex shrink-0 items-center gap-8"
              >
                {palavras.map((palavra) => (
                  <li
                    key={palavra}
                    className="display flex shrink-0 items-center gap-8 text-lg text-coal-300"
                  >
                    {palavra}
                    <span aria-hidden="true" className="text-brand-500">
                      ✦
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </section>

      {/* ============================= como funciona ========================== */}
      <section className="wash mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <header className="mb-10 max-w-xl">
          <p className="eyebrow reveal text-brand">Simples assim</p>
          <h2 className="display reveal mt-3 text-[clamp(2rem,5vw,3rem)]">
            Do celular à brasa
            <br />
            em quatro passos.
          </h2>
        </header>

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: "01",
              title: "Monte o pedido",
              text: "Escolha os espetos, o Completo e a bebida.",
            },
            agendado
              ? {
                  step: "02",
                  title: "Escolha o horário",
                  text: "Diga a hora em que vai buscar. Deixamos pronto para esse momento.",
                }
              : {
                  step: "02",
                  title: "Entrega ou retirada",
                  text: "Informe o endereço ou venha buscar.",
                },
            { step: "03", title: "Pague com PIX", text: "O código aparece na hora, direto na tela." },
            {
              step: "04",
              title: "Acompanhe",
              text: agendado
                ? "Veja o status até o pedido ficar pronto para retirada."
                : "Veja o status do preparo até a entrega.",
            },
          ].map((item, index) => (
            <li
              key={item.step}
              data-reveal-order={index}
              className="panel reveal lift relative overflow-hidden p-6"
            >
              {/*
                O número é grande e quase apagado, atrás do texto: marca o
                passo sem competir com o título.
              */}
              <span
                aria-hidden="true"
                className="display pointer-events-none absolute -top-3 right-3 text-7xl text-brand-500/15"
              >
                {item.step}
              </span>
              <h3 className="relative text-lg font-bold">{item.title}</h3>
              <p className="muted relative mt-2 text-sm leading-relaxed">{item.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* =============================== destaques ============================ */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:pb-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow reveal text-brand">Na chapa agora</p>
            <h2 className="display reveal mt-3 text-[clamp(2rem,5vw,3rem)]">Do cardápio</h2>
          </div>
          <Link
            href="/cardapio"
            className="glass glass-sheen reveal tap inline-flex shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors hover:bg-[var(--glass-bg-strong)]"
          >
            Ver tudo
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((product, index) => (
            <li key={product.id} data-reveal-order={index % 4}>
              <Link
                href="/cardapio"
                className="panel reveal lift group block overflow-hidden focus-visible:outline-offset-4"
              >
                <div className="relative aspect-4/3 overflow-hidden bg-coal-900">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <div className="muted flex h-full items-center justify-center text-4xl">🍢</div>
                  )}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-coal-950/80 to-transparent"
                  />
                  <p className="absolute right-2.5 bottom-2.5">
                    <span className="glass-pill-dark inline-block px-3 py-1.5 text-sm font-bold tabular-nums">
                      {formatCents(product.priceCents)}
                    </span>
                  </p>
                </div>
                <div className="p-4">
                  <p className="eyebrow text-[var(--text-muted)]">{product.category.name}</p>
                  <h3 className="mt-1.5 leading-tight font-bold">{product.name}</h3>
                  <p className="muted mt-1.5 line-clamp-2 text-sm">{product.description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ========================= aviso sobre o Completo ===================== */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="panel reveal relative flex flex-col gap-5 overflow-hidden p-7 sm:flex-row sm:items-center sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-brand-400/25 blur-3xl"
          />
          <span className="relative text-5xl" aria-hidden="true">
            🍽️
          </span>
          <div className="relative flex-1">
            <h2 className="display text-2xl">O Completo é um item à parte</h2>
            <p className="muted mt-2 text-sm leading-relaxed">
              Ele não vem junto com o espeto. Se quiser, adicione o Completo ao carrinho
              separadamente — assim você monta o pedido exatamente do jeito que quer.
            </p>
          </div>
          <Link
            href="/cardapio"
            className="tap glass-sheen relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-brand-400 to-brand-500 px-6 py-3.5 text-sm font-bold text-coal-900 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45),0_12px_30px_-14px_rgb(245_179_1/0.7)] transition-all hover:from-brand-300 hover:to-brand-400"
          >
            Adicionar ao pedido
          </Link>
        </div>
      </section>

      {/* ============================ chamada final =========================== */}
      <section className="mesh relative overflow-hidden">
        <div className="relative z-1 mx-auto max-w-4xl px-4 py-20 text-center sm:py-24">
          <h2 className="display reveal text-[clamp(2.5rem,8vw,4.5rem)]">
            A brasa já está
            <br />
            <span className="display-outline text-brand-400">acesa.</span>
          </h2>
          <p className="reveal muted mx-auto mt-6 max-w-md text-lg text-coal-300">
            {agendado
              ? "Escolha os espetos, marque a hora e busque quentinho no balcão."
              : "Escolha os espetos e receba quentinho em casa."}
          </p>
          <Link
            href="/cardapio"
            className="tap glass-sheen reveal relative isolate mt-9 inline-flex items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-brand-400 to-brand-500 px-10 py-4.5 text-lg font-bold tracking-wide text-coal-900 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45),0_20px_50px_-18px_rgb(245_179_1/0.7)] transition-all hover:from-brand-300 hover:to-brand-400 active:translate-y-px motion-reduce:active:translate-y-0"
          >
            Pedir agora
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
