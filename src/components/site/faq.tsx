"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";

/*
  Perguntas frequentes em sanfona.

  As respostas NÃO são escritas aqui. Elas chegam prontas da página, montadas
  a partir das configurações reais da loja (horário, formas de pagamento,
  regras de agendamento, endereço). Se o administrador mudar a taxa, o
  horário ou desligar o PIX no painel, esta seção muda junto — nenhuma
  resposta de mentira fica congelada no código.

  Por que é componente de cliente e não <details>: com <details>, o navegador
  esconde o conteúdo fechado de um jeito que varia entre versões, e a altura
  não anima de forma confiável. Aqui o estado é nosso, e o botão leva
  aria-expanded + aria-controls — o leitor de tela anuncia aberto/fechado
  exatamente como faria com o elemento nativo.
*/

export type Pergunta = { id: string; pergunta: string; resposta: string };

export function PerguntasFrequentes({ perguntas }: { perguntas: Pergunta[] }) {
  // Uma aberta por vez, e a primeira já vem aberta: a seção fechada inteira
  // parece uma lista de títulos sem conteúdo.
  const [aberta, setAberta] = useState<string | null>(perguntas[0]?.id ?? null);

  return (
    <ul className="divide-y divide-[var(--glass-edge)]">
      {perguntas.map((item, indice) => {
        const estaAberta = aberta === item.id;
        return (
          <li
            key={item.id}
            className="sanfona reveal"
            data-aberta={estaAberta ? "true" : "false"}
            data-reveal-order={indice}
          >
            <h3>
              <button
                type="button"
                id={`pergunta-${item.id}`}
                aria-expanded={estaAberta}
                aria-controls={`resposta-${item.id}`}
                onClick={() => setAberta(estaAberta ? null : item.id)}
                className="tap flex w-full items-center justify-between gap-4 py-5 text-left text-base font-bold transition-colors hover:text-brand"
              >
                {item.pergunta}
                {/*
                  O sinal gira de + para × ao abrir. Um só elemento: dois
                  riscos, e o de pé vira horizontal na rotação.
                */}
                <span
                  aria-hidden="true"
                  className={cx(
                    "relative grid size-8 shrink-0 place-items-center rounded-full bg-brand-500/15 text-brand",
                    "transition-transform duration-300 motion-reduce:transition-none",
                    estaAberta ? "rotate-45" : "",
                  )}
                >
                  <span className="absolute h-0.5 w-3.5 rounded-full bg-current" />
                  <span className="absolute h-3.5 w-0.5 rounded-full bg-current" />
                </span>
              </button>
            </h3>
            {/*
              Fechada, a resposta tem altura zero e fica recortada — mas
              continuaria no fio do leitor de tela. `inert` e `aria-hidden`
              tiram o texto recolhido da árvore de acessibilidade, para que
              quem ouve a página escute a mesma coisa que quem a vê.
            */}
            <div
              id={`resposta-${item.id}`}
              role="region"
              aria-labelledby={`pergunta-${item.id}`}
              aria-hidden={estaAberta ? undefined : true}
              inert={!estaAberta}
              className="sanfona-corpo"
            >
              <p className="muted pr-12 pb-5 text-sm leading-relaxed">{item.resposta}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
