"use client";

import { useEffect } from "react";

/**
 * Entrada por scroll dos elementos marcados com `.reveal`.
 *
 * Três cuidados que valem mais que o efeito em si:
 *
 *  • o estado inicial (invisível) só vale quando este componente marca
 *    `data-reveal-ready` no <html>. Sem JavaScript, a página aparece
 *    normalmente em vez de ficar em branco para sempre;
 *  • quem pediu menos animação no sistema recebe tudo já visível;
 *  • um MutationObserver pega os elementos que chegam depois — as listas
 *    do cardápio e do carrinho renderizam em duas etapas.
 */
export function Reveal() {
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

    const mutations = new MutationObserver(registrar);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      root.removeAttribute("data-reveal-ready");
    };
  }, []);

  return null;
}
