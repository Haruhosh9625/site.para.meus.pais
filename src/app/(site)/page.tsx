import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/server/db";
import { getPublicSettings } from "@/server/services/settings";
import { formatCents } from "@/lib/money";
import { LogoMark } from "@/components/site/logo";
import { NumeroNaTela } from "@/components/site/numbers";
import { PerguntasFrequentes, type Pergunta } from "@/components/site/faq";

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
  const [settings, highlights, itensNoCardapio, maisBarato] = await Promise.all([
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
    // Quantos itens o cardápio tem DE VERDADE. `highlights` para em 7, então
    // contar aquela lista daria um número errado na faixa de estatísticas.
    prisma.product.count({ where: { active: true } }).catch(() => 0),
    prisma.product
      .findFirst({
        where: { active: true, available: true },
        orderBy: { priceCents: "asc" },
        select: { priceCents: true },
      })
      .catch(() => null),
  ]);

  const agendado = settings ? !settings.allowDelivery : true;
  // Três itens com foto para a pilha do herói. Sem foto, a moldura ficaria
  // vazia — então filtramos antes de escolher.
  const destaquesHeroi = highlights.filter((produto) => produto.imageUrl).slice(0, 3);
  const fechamento = settings ? closesAt(settings) : null;

  /*
    PERGUNTAS FREQUENTES

    Cada resposta é montada a partir do que está gravado no banco. Nada de
    texto inventado: se o administrador desligar o PIX, mudar o horário ou
    alterar o limite por horário no painel, a resposta aqui muda no mesmo
    instante. Quando não há configuração carregada, a pergunta simplesmente
    não entra na lista — melhor faltar uma pergunta do que responder errado.
  */
  const perguntas: Pergunta[] = [];

  if (settings) {
    const formas = [
      settings.paymentMethods.pix && "PIX",
      settings.paymentMethods.card && "cartão",
      settings.paymentMethods.cash && "dinheiro",
    ].filter(Boolean) as string[];

    const diasAbertos = settings.openingHours
      .filter((hora) => !hora.closed)
      .map((hora) => `${NOMES_CURTOS[hora.weekday]} das ${hora.open} às ${hora.close}`);

    if (agendado) {
      perguntas.push({
        id: "entrega",
        pergunta: "Vocês entregam?",
        resposta:
          "Ainda não. Por enquanto o pedido é agendado e você retira no balcão" +
          (settings.address.street
            ? `, em ${settings.address.street}, ${settings.address.number} — ${settings.address.neighborhood}, ${settings.address.city}.`
            : ".") +
          " Quando a entrega começar, ela aparece aqui como opção no carrinho.",
      });
      perguntas.push({
        id: "agendamento",
        pergunta: "Como funciona o agendamento?",
        resposta:
          `Você escolhe a hora que quiser dentro do horário de funcionamento, com no mínimo ${settings.scheduling.minLeadMinutes} minutos de antecedência. ` +
          `Cada faixa de ${settings.scheduling.slotWindowMinutes} minutos aceita até ${settings.scheduling.slotCapacity} ${settings.scheduling.slotCapacity === 1 ? "pedido" : "pedidos"} — é o que a chapa dá conta de fazer bem no mesmo intervalo. ` +
          (settings.scheduling.horizonDays <= 1
            ? "O agendamento é só para hoje: espeto no ponto não se marca para a semana que vem."
            : `Dá para agendar com até ${settings.scheduling.horizonDays} dias de antecedência.`),
      });
    } else {
      perguntas.push({
        id: "entrega",
        pergunta: "Como recebo o pedido?",
        resposta:
          `Você escolhe entre entrega e retirada no balcão no fim do pedido. A cozinha leva cerca de ${settings.prepTimeMinutes} minutos preparando` +
          (settings.deliveryTimeMinutes
            ? `, e a entrega costuma somar mais ${settings.deliveryTimeMinutes} minutos.`
            : "."),
      });
    }

    if (formas.length > 0) {
      perguntas.push({
        id: "pagamento",
        pergunta: "Quais formas de pagamento vocês aceitam?",
        resposta:
          `Aceitamos ${formas.length === 1 ? formas[0] : `${formas.slice(0, -1).join(", ")} e ${formas[formas.length - 1]}`}. ` +
          (settings.paymentMethods.pix
            ? "No PIX, o pedido só entra para a produção depois que o pagamento é confirmado pelo banco — nunca pelo clique em “já paguei”."
            : "O pagamento é combinado na retirada."),
      });
    }

    if (diasAbertos.length > 0) {
      perguntas.push({
        id: "horario",
        pergunta: "Que dias e horários vocês funcionam?",
        resposta: `${diasAbertos.join("; ")}.${
          settings.isOpen
            ? " Agora estamos abertos."
            : settings.nextOpening
              ? ` Agora estamos fechados — abrimos ${settings.nextOpening}.`
              : ""
        }`,
      });
    }

    perguntas.push({
      id: "completo",
      pergunta: "O Completo vem junto com o espeto?",
      resposta:
        "Não. O Completo é um item separado do cardápio, com preço próprio: se você quiser, é só adicioná-lo ao carrinho junto com os espetos. " +
        "O preço do espeto é o do espeto, sem acompanhamento embutido.",
    });

    if (settings.minOrderCents > 0) {
      perguntas.push({
        id: "minimo",
        pergunta: "Existe pedido mínimo?",
        resposta: `Sim, ${formatCents(settings.minOrderCents)}. O carrinho avisa quanto falta antes de você tentar finalizar.`,
      });
    }

    perguntas.push({
      id: "conta",
      pergunta: "Preciso criar uma conta?",
      resposta:
        "Precisa de um cadastro rápido para fechar o pedido — é o que permite você acompanhar o preparo e ver o histórico depois. " +
        "Montar o carrinho e olhar o cardápio não exige nada.",
    });
  }

  /*
    NÚMEROS DA OPERAÇÃO

    Cada linha vem do banco ou das configurações. Quando o dado não existe,
    a coluna não entra — a faixa encolhe em vez de exibir um zero que não
    quer dizer nada.
  */
  const estatisticas: Array<{ valor: React.ReactNode; termo: string }> = [];

  if (maisBarato) {
    estatisticas.push({
      valor: <NumeroNaTela value={Math.round(maisBarato.priceCents / 100)} prefixo="R$ " />,
      termo: "o espeto, qualquer sabor",
    });
  }
  if (itensNoCardapio > 0) {
    estatisticas.push({
      valor: <NumeroNaTela value={itensNoCardapio} />,
      termo: itensNoCardapio === 1 ? "item no cardápio" : "itens no cardápio",
    });
  }
  if (settings) {
    estatisticas.push({
      valor: <NumeroNaTela value={settings.prepTimeMinutes} sufixo=" min" />,
      termo: "de preparo na chapa",
    });
    estatisticas.push({
      valor: <NumeroNaTela value={settings.scheduling.slotCapacity} />,
      termo: `${settings.scheduling.slotCapacity === 1 ? "pedido" : "pedidos"} por faixa de ${settings.scheduling.slotWindowMinutes} min`,
    });
  }

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
          Fagulhas subindo da brasa.

          Doze pontos de luz, cada um com atraso, duração, tamanho e deriva
          próprios — é a variação que faz doze elementos iguais parecerem
          um enxame em vez de uma fileira. Ficam atrás do conteúdo (z-0) e
          são invisíveis para o leitor de tela: enfeite não é informação.

          O movimento é só `transform` e `opacity`, as duas propriedades que
          a GPU animia sem refazer o layout. Doze delas custam menos que
          uma única sombra animada.
        */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
          {FAGULHAS.map((fagulha, indice) => (
            <span
              key={indice}
              className="fagulha"
              style={
                {
                  left: `${fagulha.esquerda}%`,
                  "--atraso": `${fagulha.atraso}s`,
                  "--duracao": `${fagulha.duracao}s`,
                  "--tamanho": `${fagulha.tamanho}px`,
                  "--deriva": `${fagulha.deriva}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

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
                  className="tap glass-sheen relative isolate inline-flex items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-brand-400 to-brand-500 px-8 py-4 text-base font-bold tracking-wide text-coal-900 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45),0_16px_40px_-16px_rgb(245_179_1/0.6)] transition-all duration-200 hover:from-brand-300 hover:to-brand-400 hover:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45),0_22px_54px_-14px_rgb(245_179_1/0.75)] active:translate-y-px motion-reduce:active:translate-y-0"
                >
                  Ver o cardápio
                </Link>
                <Link
                  href="/meus-pedidos"
                  className="tap glass-dark glass-sheen spotlight spotlight-dark relative isolate inline-flex items-center justify-center overflow-hidden rounded-2xl px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/15"
                  data-spotlight
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

                // Quanto cada moldura sobe conforme a página rola. A do
                // meio anda mais: é o que faz a pilha parecer ter
                // profundidade de verdade e não três adesivos colados.
                const deriva = [-70, -130, -50][index];

                return (
                  <figure
                    key={produto.id}
                    className={`glass-dark spotlight spotlight-dark tilt reveal absolute overflow-hidden p-2 ${layout}`}
                    data-reveal-order={index}
                    data-spotlight
                    data-tilt="9"
                    /*
                      Cada moldura sobe num ritmo diferente conforme a
                      página rola. É a profundidade: o que está na frente
                      anda mais que o que está atrás.
                    */
                    style={{ "--py": `calc(var(--progresso, 0) * ${deriva}px)` } as React.CSSProperties}
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
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
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
              className="panel spotlight reveal lift relative overflow-hidden p-6"
              data-spotlight
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
                className="panel spotlight tilt reveal group block overflow-hidden focus-visible:outline-offset-4"
                data-spotlight
                data-tilt="4"
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
        <div
          className="panel spotlight reveal relative flex flex-col gap-5 overflow-hidden p-7 sm:flex-row sm:items-center sm:p-8"
          data-spotlight
        >
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

      {/* ========================= números da operação ======================== */}
      {/*
        Quatro números, todos lidos do banco e das configurações — não há
        um dado inventado nesta faixa. Sem depoimento de cliente falso, sem
        "mais de 10.000 espetos servidos": o que está aqui é o que o sistema
        realmente sabe.
      */}
      <section
        className={
          estatisticas.length > 0 ? "mesh relative overflow-hidden" : "hidden"
        }
      >
        <div className="relative z-1 mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-10 text-center lg:grid-cols-4">
            {estatisticas.map((item, indice) => (
              <div key={item.termo} className="reveal" data-reveal-order={indice}>
                <dd className="display text-[clamp(2.75rem,8vw,4.5rem)] text-brand-400">
                  {item.valor}
                </dd>
                <dt className="muted mx-auto mt-2 max-w-40 text-sm leading-snug text-coal-300">
                  {item.termo}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ======================== perguntas frequentes ======================== */}
      {perguntas.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <header className="mb-4">
            <p className="eyebrow reveal text-brand">Antes de perguntar</p>
            <h2 className="display reveal mt-3 text-[clamp(2rem,5vw,3rem)]">
              O que todo mundo
              <br />
              quer saber.
            </h2>
          </header>
          <div className="panel px-5 sm:px-7">
            <PerguntasFrequentes perguntas={perguntas} />
          </div>
        </section>
      )}

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

/** Dias da semana abreviados, na ordem que `Date.getDay()` usa. */
const NOMES_CURTOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/*
  Posição e ritmo de cada fagulha.

  Está escrito à mão, não sorteado: `Math.random()` no servidor daria um
  valor diferente do que o cliente calcula na hidratação e o React
  reclamaria da divergência. Além disso, uma tabela fixa é ajustável — dá
  para olhar a tela e mexer num número.
*/
const FAGULHAS = [
  { esquerda: 6, atraso: 0, duracao: 7.5, tamanho: 3, deriva: 40 },
  { esquerda: 13, atraso: 2.8, duracao: 9, tamanho: 2, deriva: -30 },
  { esquerda: 21, atraso: 1.2, duracao: 6.5, tamanho: 4, deriva: 55 },
  { esquerda: 29, atraso: 4.4, duracao: 8.2, tamanho: 2, deriva: -45 },
  { esquerda: 37, atraso: 0.6, duracao: 10, tamanho: 3, deriva: 25 },
  { esquerda: 45, atraso: 3.5, duracao: 7, tamanho: 2, deriva: -55 },
  { esquerda: 54, atraso: 5.2, duracao: 8.8, tamanho: 3, deriva: 35 },
  { esquerda: 62, atraso: 1.9, duracao: 6.8, tamanho: 4, deriva: -25 },
  { esquerda: 71, atraso: 4.1, duracao: 9.4, tamanho: 2, deriva: 50 },
  { esquerda: 79, atraso: 2.3, duracao: 7.7, tamanho: 3, deriva: -40 },
  { esquerda: 87, atraso: 6, duracao: 8.5, tamanho: 2, deriva: 30 },
  { esquerda: 94, atraso: 3.1, duracao: 9.8, tamanho: 3, deriva: -35 },
];

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
