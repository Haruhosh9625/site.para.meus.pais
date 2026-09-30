"use client";

import { useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/money";

/*
  Números que andam até o valor novo em vez de trocar de repente.

  Por que isto existe: quando o subtotal salta de R$ 24,00 para R$ 32,00 num
  quadro só, o olho não registra que mudou — a pessoa aperta "+" e precisa
  conferir se a conta acompanhou. Com a contagem, o movimento é o recibo:
  dá para ver o dinheiro subindo.

  Regras que o componente respeita:

  - A CONTA NÃO É FEITA AQUI. O valor final é sempre o que o servidor mandou
    (services/pricing.ts). A animação só percorre o caminho entre o número
    antigo e o novo; o texto final é exatamente formatCents(valor).
  - Na primeira pintura mostra o valor cheio, sem animar de zero. Animar a
    montagem faria a página parecer que está carregando quando não está,
    e o servidor renderiza o número certo no HTML.
  - prefers-reduced-motion pula a contagem por completo.
*/

const DURACAO_PADRAO = 420;

/** Curva que sai rápido e freia no fim: a chegada é o que o olho lê. */
function suavizar(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function preferemMenosMovimento(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Percorre de um número a outro com requestAnimationFrame.
 * Devolve o valor corrente já arredondado para inteiro.
 */
function useContagem(alvo: number, duracao = DURACAO_PADRAO): number {
  const [valor, setValor] = useState(alvo);
  // Guarda o alvo anterior para saber de onde partir sem re-disparar o efeito.
  const atualRef = useRef(alvo);
  const quadroRef = useRef<number | null>(null);

  useEffect(() => {
    const inicio = atualRef.current;
    if (inicio === alvo) return;

    if (preferemMenosMovimento()) {
      atualRef.current = alvo;
      setValor(alvo);
      return;
    }

    const t0 = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - t0) / duracao);
      const corrente = Math.round(inicio + (alvo - inicio) * suavizar(t));
      atualRef.current = corrente;
      setValor(corrente);
      if (t < 1) {
        quadroRef.current = requestAnimationFrame(passo);
      } else {
        // Encosta no alvo exato: arredondamento no meio do caminho não pode
        // deixar o total final um centavo fora.
        atualRef.current = alvo;
        setValor(alvo);
        quadroRef.current = null;
      }
    };

    quadroRef.current = requestAnimationFrame(passo);
    return () => {
      if (quadroRef.current !== null) cancelAnimationFrame(quadroRef.current);
      quadroRef.current = null;
    };
  }, [alvo, duracao]);

  return valor;
}

/**
 * Dinheiro em centavos que conta até o valor novo.
 *
 * O texto que o leitor de tela anuncia é o valor final, não o intermediário:
 * ninguém precisa ouvir "R$ 3,17… R$ 5,42… R$ 8,00".
 */
export function ValorAnimado({
  cents,
  className,
  duracao,
}: {
  cents: number;
  className?: string;
  duracao?: number;
}) {
  const corrente = useContagem(cents, duracao);
  const formatado = formatCents(cents);

  return (
    <span className={className}>
      <span aria-hidden="true" className="tabular-nums">
        {formatCents(corrente)}
      </span>
      <span className="sr-only">{formatado}</span>
    </span>
  );
}

/** Contagem de inteiros (itens no carrinho, pedidos do dia, KPIs do painel). */
export function NumeroAnimado({
  value,
  className,
  duracao,
  sufixo,
}: {
  value: number;
  className?: string;
  duracao?: number;
  sufixo?: string;
}) {
  const corrente = useContagem(value, duracao);

  return (
    <span className={className}>
      <span aria-hidden="true" className="tabular-nums">
        {corrente.toLocaleString("pt-BR")}
        {sufixo}
      </span>
      <span className="sr-only">
        {value.toLocaleString("pt-BR")}
        {sufixo}
      </span>
    </span>
  );
}

/**
 * Número que conta de zero quando a seção entra na tela.
 *
 * Diferente de `NumeroAnimado`, que só anima quando o valor muda: este é
 * para faixas de estatística, onde a contagem É a graça da coisa.
 *
 * O HTML que o servidor manda já traz o número final. Só depois de montar,
 * no navegador, o valor visível volta para zero e sobe — assim quem está
 * sem JavaScript, quem usa leitor de tela e o robô de busca leem o número
 * certo, e não um zero.
 */
export function NumeroNaTela({
  value,
  className,
  prefixo,
  sufixo,
}: {
  value: number;
  className?: string;
  prefixo?: string;
  sufixo?: string;
}) {
  /*
    TRÊS FASES, E A ORDEM IMPORTA

    1. `montado` falso — é o que o servidor manda e o que o primeiro
       desenho no navegador repete: o número CHEIO. Sem isso, o HTML sairia
       com zero e quem está sem JavaScript, o leitor de tela e o robô de
       busca leriam zero.
    2. `montado` verdadeiro, `contando` falso — o visível PULA para zero,
       sem percurso. A primeira versão animava esse retorno, e uma faixa
       que já estivesse na tela contava de 8 até 0 antes de subir de novo.
    3. `contando` verdadeiro — sobe de zero até o valor, uma vez só.
  */
  const [montado, setMontado] = useState(false);
  const [contando, setContando] = useState(false);
  const noRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    // Com movimento reduzido nunca saímos da fase 1: fica o número cheio.
    if (preferemMenosMovimento()) return;
    setMontado(true);
  }, []);

  useEffect(() => {
    const no = noRef.current;
    if (!no || !montado || contando) return;

    if (!("IntersectionObserver" in window)) {
      setContando(true);
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas[0]?.isIntersecting) return;
        setContando(true);
        observador.disconnect();
      },
      // Dispara um pouco antes de encostar na borda: a contagem começa
      // enquanto a faixa ainda sobe, e não depois de parada.
      { threshold: 0.4, rootMargin: "0px 0px -10% 0px" },
    );
    observador.observe(no);
    return () => observador.disconnect();
  }, [montado, contando]);

  const corrente = useContagem(contando ? value : 0, 900);
  const visivel = montado ? corrente : value;

  return (
    <span ref={noRef} className={className}>
      <span aria-hidden="true" className="tabular-nums">
        {prefixo}
        {visivel.toLocaleString("pt-BR")}
        {sufixo}
      </span>
      <span className="sr-only">
        {prefixo}
        {value.toLocaleString("pt-BR")}
        {sufixo}
      </span>
    </span>
  );
}

/**
 * Faz o filho "pular" a cada vez que `chave` muda de valor.
 *
 * Usado na pastilha de quantidade do carrinho: o ícone está no rodapé, longe
 * do botão que a pessoa apertou, e sem o pulo a mudança passa batida.
 */
export function Pulo({
  chave,
  className,
  children,
}: {
  chave: number | string;
  className?: string;
  children: React.ReactNode;
}) {
  const [pulando, setPulando] = useState(false);
  const primeiraRef = useRef(true);

  useEffect(() => {
    // Não pula na montagem: a página abriria já se sacudindo.
    if (primeiraRef.current) {
      primeiraRef.current = false;
      return;
    }
    setPulando(true);
    const t = setTimeout(() => setPulando(false), 420);
    return () => clearTimeout(t);
  }, [chave]);

  return <span className={`${className ?? ""} ${pulando ? "pulo" : ""}`.trim()}>{children}</span>;
}
