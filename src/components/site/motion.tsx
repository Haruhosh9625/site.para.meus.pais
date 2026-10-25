"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Tudo que se move na página, em um componente só.
 *
 * São quatro comportamentos que compartilham o mesmo orçamento de
 * desempenho, e por isso moram juntos: se cada um tivesse o seu próprio
 * `addEventListener` de ponteiro e de rolagem, seriam oito listeners
 * disputando os mesmos quadros.
 *
 *   1. entrada por scroll dos elementos `.reveal`;
 *   2. brilho que acompanha o cursor nas peças `[data-spotlight]`;
 *   3. inclinação em perspectiva nas peças `[data-tilt]`;
 *   4. barra de progresso da rolagem.
 *
 * TRÊS REGRAS QUE VALEM PARA TODOS
 *
 *  • Nada liga com `prefers-reduced-motion: reduce`. Não é enfeite de
 *    acessibilidade: para quem tem enxaqueca vestibular, movimento de
 *    paralaxe causa mal-estar de verdade.
 *  • Brilho e inclinação são afordâncias de MOUSE. Em tela de toque não
 *    ligam — disparariam no toque e a peça ficaria torta depois de o dedo
 *    sair.
 *  • Toda escrita no DOM acontece dentro de um `requestAnimationFrame`.
 *    Um `pointermove` dispara dezenas de vezes por segundo; escrever
 *    direto no listener causaria mais recálculos de estilo do que quadros.
 */
export function Motion() {
  const pathname = usePathname();

  /* ------------------------ entrada por scroll -------------------------- */
  useEffect(() => {
    const root = document.documentElement;
    const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (semAnimacao || typeof IntersectionObserver === "undefined") return;

    root.setAttribute("data-reveal-ready", "");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          // Um leve atraso em cascata dentro do mesmo grupo: a lista entra
          // como uma onda, não como um bloco.
          const ordem = Number(entry.target.getAttribute("data-reveal-order") ?? 0);
          (entry.target as HTMLElement).style.transitionDelay = `${Math.min(ordem, 6) * 70}ms`;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    const registrar = () => {
      for (const node of document.querySelectorAll(".reveal:not(.is-in)")) {
        observer.observe(node);
      }
    };

    registrar();

    // As listas do cardápio e do carrinho renderizam em duas etapas; sem
    // isto, o que chega depois nunca apareceria.
    const mutations = new MutationObserver(registrar);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      root.removeAttribute("data-reveal-ready");
    };
  }, []);

  /* ------------------- brilho do cursor e inclinação -------------------- */
  useEffect(() => {
    const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const temMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (semAnimacao || !temMouse) return;

    let quadro = 0;
    let pendente: { x: number; y: number } | null = null;
    // A peça que estava sob o cursor no quadro anterior, para poder
    // desligar o brilho dela quando o cursor sai.
    let ultimoBrilho: HTMLElement | null = null;
    let ultimaInclinacao: HTMLElement | null = null;

    const aplicar = () => {
      quadro = 0;
      if (!pendente) return;
      const { x, y } = pendente;

      const alvo = document.elementFromPoint(x, y);
      const brilho = (alvo as HTMLElement | null)?.closest<HTMLElement>("[data-spotlight]") ?? null;
      const inclinacao = (alvo as HTMLElement | null)?.closest<HTMLElement>("[data-tilt]") ?? null;

      if (ultimoBrilho && ultimoBrilho !== brilho) {
        ultimoBrilho.style.setProperty("--spot", "0");
      }
      if (brilho) {
        const r = brilho.getBoundingClientRect();
        brilho.style.setProperty("--mx", `${((x - r.left) / r.width) * 100}%`);
        brilho.style.setProperty("--my", `${((y - r.top) / r.height) * 100}%`);
        brilho.style.setProperty("--spot", "1");
      }
      ultimoBrilho = brilho;

      if (ultimaInclinacao && ultimaInclinacao !== inclinacao) {
        ultimaInclinacao.style.setProperty("--rx", "0deg");
        ultimaInclinacao.style.setProperty("--ry", "0deg");
      }
      if (inclinacao) {
        const r = inclinacao.getBoundingClientRect();
        // −1 a 1 em cada eixo, a partir do centro da peça.
        const dx = (x - r.left) / r.width - 0.5;
        const dy = (y - r.top) / r.height - 0.5;
        // Ângulo máximo baixo de propósito: acima de ~7° o texto começa a
        // ficar ilegível e o efeito passa de material a brinquedo.
        const forca = Number(inclinacao.dataset.tilt || 6);
        inclinacao.style.setProperty("--ry", `${dx * forca}deg`);
        inclinacao.style.setProperty("--rx", `${-dy * forca}deg`);
      }
      ultimaInclinacao = inclinacao;
    };

    const aoMover = (evento: PointerEvent) => {
      pendente = { x: evento.clientX, y: evento.clientY };
      if (!quadro) quadro = requestAnimationFrame(aplicar);
    };

    const aoSair = () => {
      ultimoBrilho?.style.setProperty("--spot", "0");
      ultimaInclinacao?.style.setProperty("--rx", "0deg");
      ultimaInclinacao?.style.setProperty("--ry", "0deg");
      ultimoBrilho = null;
      ultimaInclinacao = null;
    };

    document.addEventListener("pointermove", aoMover, { passive: true });
    document.addEventListener("pointerleave", aoSair);
    window.addEventListener("blur", aoSair);

    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      document.removeEventListener("pointermove", aoMover);
      document.removeEventListener("pointerleave", aoSair);
      window.removeEventListener("blur", aoSair);
      aoSair();
    };
  }, []);

  /* --------------------- barra de progresso da rolagem ------------------ */
  useEffect(() => {
    const root = document.documentElement;
    let quadro = 0;

    const medir = () => {
      quadro = 0;
      const rolavel = root.scrollHeight - root.clientHeight;
      const fracao = rolavel > 0 ? Math.min(1, root.scrollTop / rolavel) : 0;
      root.style.setProperty("--progresso", fracao.toFixed(4));
    };

    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar, { passive: true });

    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
    };
  }, []);

  /* ------------------------- troca de página ---------------------------- */
  useEffect(() => {
    const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (semAnimacao) return;
    const alvo = document.getElementById("conteudo");
    if (!alvo) return;

    // Reinicia a animação removendo e recolocando a classe. Sem o
    // `void offsetWidth` no meio, o navegador agrupa as duas mudanças e
    // nada acontece.
    alvo.classList.remove("page-enter");
    void alvo.offsetWidth;
    alvo.classList.add("page-enter");
  }, [pathname]);

  return <div className="scroll-progress no-print" aria-hidden="true" />;
}
