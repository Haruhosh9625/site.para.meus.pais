/**
 * Junta classes CSS, ignorando o que for falso.
 *
 * Mora em `lib/` — e não junto dos componentes — porque `components/ui`
 * é um módulo `"use client"`: funções exportadas de lá NÃO podem ser
 * chamadas por um Server Component. Tentar usar `cx` importado de
 * `@/components/ui` dentro de uma página de servidor quebra a página
 * inteira com "Attempted to call cx() from the server".
 *
 * Já aconteceu três vezes neste projeto (com `statusTone`, com
 * `CHART_COLORS` e com o próprio `cx` na página da agenda). Regra: o que
 * os dois lados usam vive em `src/lib/`.
 */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
