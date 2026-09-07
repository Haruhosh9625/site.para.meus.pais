"use client";

import { formatCents } from "@/lib/money";
import { cx } from "@/components/ui";

/**
 * Como formatar os valores de um gráfico.
 *
 * É uma string, e não uma função, de propósito: estes gráficos são Client
 * Components e são usados também por Server Components (o dashboard do
 * admin). React não consegue serializar uma função atravessando essa
 * fronteira — passar `valueFormatter={(v) => ...}` de um Server Component
 * quebraria a página em produção.
 */
export type ValueFormat = "money" | "units" | "number";

function formatValue(value: number, format: ValueFormat): string {
  switch (format) {
    case "money":
      return formatCents(value);
    case "units":
      return `${value} un.`;
    default:
      return new Intl.NumberFormat("pt-BR").format(value);
  }
}

/**
 * Gráficos em SVG puro.
 *
 * Sem biblioteca externa de propósito: são poucos formatos, o pacote fica
 * leve (importa no celular) e nada precisa de script de terceiros.
 * Todo gráfico vem acompanhado de uma tabela para leitores de tela.
 */

/* ------------------------------ cartão de KPI ------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  trend,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  /** Variação percentual em relação ao período anterior. */
  trend?: number | null;
  tone?: "neutral" | "brand" | "success" | "warning";
}) {
  const toneClass = {
    neutral: "",
    brand: "border-brand-300 dark:border-brand-900/50",
    success: "border-emerald-300 dark:border-emerald-900/50",
    warning: "border-amber-300 dark:border-amber-900/50",
  }[tone];

  return (
    <div className={cx("surface p-4", toneClass)}>
      <p className="muted text-xs font-semibold tracking-wide uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {hint && <p className="muted text-xs">{hint}</p>}
        {trend !== undefined && trend !== null && Number.isFinite(trend) && (
          <span
            className={cx(
              "text-xs font-bold",
              trend > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : trend < 0
                  ? "text-red-600 dark:text-red-400"
                  : "muted",
            )}
          >
            {trend > 0 ? "▲" : trend < 0 ? "▼" : "="} {Math.abs(Math.round(trend))}%
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ gráfico de barras -------------------------- */

export function BarChart({
  data,
  title,
  format = "money",
  height = 180,
}: {
  data: Array<{ label: string; value: number; sublabel?: string }>;
  title: string;
  format?: ValueFormat;
  height?: number;
}) {
  const valueFormatter = (value: number) => formatValue(value, format);
  const max = Math.max(1, ...data.map((point) => point.value));
  const chartId = title.replace(/\s+/g, "-").toLowerCase();

  // A altura da barra é calculada em PIXELS, não em porcentagem.
  // Porcentagem dentro de uma coluna flex de altura automática resolve para
  // zero — as barras simplesmente não apareciam. Reservamos espaço para o
  // rótulo do eixo e o valor que surge no hover.
  const AXIS_SPACE = 20;
  const track = Math.max(20, height - AXIS_SPACE);

  // Com muitos dias, mostrar todo rótulo os faz colidir. Mantemos um a cada
  // N — e sempre o último, que é o dia de hoje.
  const passo = data.length > 20 ? 5 : data.length > 12 ? 2 : 1;

  if (data.length === 0) {
    return <p className="muted py-8 text-center text-sm">Sem dados no período.</p>;
  }

  return (
    <figure>
      <figcaption className="sr-only">{title}</figcaption>

      <div
        className={cx(
          "flex items-end overflow-x-auto pb-1",
          // Com 30 colunas, `gap-1` (4px cada) somava 116px e fazia o gráfico
          // estourar o cartão, escondendo justamente a coluna de hoje.
          data.length > 20 ? "gap-px" : data.length > 12 ? "gap-0.5" : "gap-1",
        )}
        style={{ height }}
        role="presentation"
      >
        {data.map((point, index) => {
          const ratio = point.value / max;
          return (
            <div
              key={`${point.label}-${index}`}
              // Largura mínima pequena: com 30 dias, `min-w-6` somava mais que
              // a largura do cartão e a última coluna — justamente a de hoje,
              // onde está o faturamento — ficava cortada fora da vista.
              className="group relative flex min-w-1.5 flex-1 flex-col items-center justify-end gap-1"
            >
              {/*
                Fora do fluxo (absolute): em flow, o texto "R$ 659,00" — mesmo
                invisível — alargava a coluna e empurrava o gráfico para fora
                da área visível.
              */}
              <span
                className={cx(
                  "pointer-events-none absolute bottom-full mb-1 rounded bg-coal-900 px-1.5 py-0.5",
                  "text-[10px] font-semibold tabular-nums whitespace-nowrap text-white opacity-0",
                  "transition-opacity group-hover:opacity-100 dark:bg-coal-100 dark:text-coal-900",
                  // Nas pontas o balão é ancorado para dentro: centralizado,
                  // ele transbordaria o cartão e criava barra de rolagem.
                  index === 0
                    ? "left-0"
                    : index === data.length - 1
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2",
                )}
              >
                {point.value > 0 ? valueFormatter(point.value) : ""}
              </span>
              <div
                className={cx(
                  "w-full rounded-t-md transition-colors",
                  point.value > 0 ? "bg-brand-500 group-hover:bg-brand-600" : "bg-[var(--surface-sunken)]",
                )}
                style={{
                  height: point.value > 0 ? Math.max(4, Math.round(ratio * track)) : 2,
                }}
                title={`${point.label}: ${valueFormatter(point.value)}`}
              />
              <span className="muted h-3 max-w-full truncate text-[10px] whitespace-nowrap">
                {index % passo === 0 || index === data.length - 1 ? point.label : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* A mesma informação em tabela, para leitores de tela. */}
      <table className="sr-only" aria-describedby={chartId}>
        <caption id={chartId}>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Período</th>
            <th scope="col">Valor</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point, index) => (
            <tr key={`${point.label}-row-${index}`}>
              <th scope="row">{point.sublabel ?? point.label}</th>
              <td>{valueFormatter(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* ------------------------- barras horizontais (ranking) -------------------- */

export function RankingBars({
  data,
  format = "number",
  emptyMessage = "Sem dados no período.",
}: {
  data: Array<{ label: string; value: number; caption?: string }>;
  format?: ValueFormat;
  emptyMessage?: string;
}) {
  const valueFormatter = (value: number) => formatValue(value, format);
  const max = Math.max(1, ...data.map((point) => point.value));

  if (data.length === 0) {
    return <p className="muted py-6 text-center text-sm">{emptyMessage}</p>;
  }

  return (
    <ol className="space-y-2.5">
      {data.map((point, index) => (
        <li key={`${point.label}-${index}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">
              <span className="muted mr-1.5 tabular-nums">{index + 1}.</span>
              {point.label}
            </span>
            <span className="shrink-0 font-bold tabular-nums">{valueFormatter(point.value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.max(3, (point.value / max) * 100)}%` }}
            />
          </div>
          {point.caption && <p className="muted mt-0.5 text-xs">{point.caption}</p>}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------ divisão em rosca --------------------------- */

export function DonutBreakdown({
  segments,
  total,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  total: number;
}) {
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <svg viewBox="0 0 100 100" className="size-32 shrink-0 -rotate-90" role="img"
        aria-label={`Distribuição por forma de pagamento, total ${formatCents(total)}`}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--surface-sunken)" strokeWidth="14" />
        {segments.map((segment) => {
          const length = (segment.value / sum) * circumference;
          const element = (
            <circle
              key={segment.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="14"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return element;
        })}
      </svg>

      <dl className="w-full space-y-2 text-sm">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              {segment.label}
            </dt>
            <dd className="font-semibold tabular-nums">
              {formatCents(segment.value)}
              <span className="muted ml-1.5 text-xs">
                {Math.round((segment.value / sum) * 100)}%
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
