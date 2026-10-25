"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { formatCents } from "@/lib/money";
import { BarChart, DonutBreakdown, RankingBars, StatCard } from "@/components/admin/charts";
import { CHART_COLORS } from "@/lib/constants";
import { Button, ErrorState, Select, Skeleton } from "@/components/ui";

type Report = {
  grossRevenueCents: number;
  netRevenueCents: number;
  productRevenueCents: number;
  deliveryFeesCents: number;
  discountsCents: number;
  paidOrders: number;
  totalOrders: number;
  averageTicketCents: number;
  cancelled: { count: number; amountCents: number };
  refunded: { count: number; amountCents: number };
  awaitingPayment: { count: number; amountCents: number };
  paymentBreakdown: {
    PIX: { revenueCents: number; orders: number };
    CARD: { revenueCents: number; orders: number };
    CASH: { revenueCents: number; orders: number };
  };
  topProducts: Array<{ productId: string; name: string; quantity: number; revenueCents: number }>;
  daily: Array<{ date: string; revenueCents: number; orders: number }>;
  deliverySplit: Array<{
    deliveryType: "DELIVERY" | "PICKUP";
    orders: number;
    revenueCents: number;
    feesCents: number;
  }>;
};

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "month", label: "Este mês" },
  { value: "all", label: "Todo o período" },
  { value: "custom", label: "Período personalizado" },
];

/**
 * Módulo financeiro.
 *
 * Faturamento conta apenas pedidos com pagamento CONFIRMADO e não
 * cancelados — um pedido criado mas não pago aparece separado, em
 * "aguardando pagamento", nunca somado à receita.
 */
export default function AdminFinancePage() {
  const [period, setPeriod] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ period });
      if (period === "custom") {
        if (from) query.set("from", from);
        if (to) query.set("to", to);
      }
      const data = await api<{ report: Report; label: string }>(`/api/admin/finance?${query}`);
      setReport(data.report);
      setLabel(data.label);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const paymentTotal = report
    ? report.paymentBreakdown.PIX.revenueCents +
      report.paymentBreakdown.CARD.revenueCents +
      report.paymentBreakdown.CASH.revenueCents
    : 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[clamp(1.9rem,4vw,2.5rem)]">Financeiro</h1>
          <p className="muted text-sm">{label}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="periodo" className="mb-1 block text-xs font-semibold">Período</label>
            <Select id="periodo" value={period} onChange={(e) => setPeriod(e.target.value)}
              className="py-2.5 text-sm">
              {PERIODS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div>
                <label htmlFor="fin-from" className="mb-1 block text-xs font-semibold">De</label>
                <input id="fin-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label htmlFor="fin-to" className="mb-1 block text-xs font-semibold">Até</label>
                <input id="fin-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-sm" />
              </div>
            </>
          )}
          <Button variant="outline" onClick={() => window.print()} className="no-print">
            Imprimir
          </Button>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {loading || !report ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <section aria-label="Indicadores financeiros">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Faturamento bruto"
                value={formatCents(report.grossRevenueCents)}
                hint={`${report.paidOrders} ${report.paidOrders === 1 ? "pedido pago" : "pedidos pagos"}`}
                tone="brand"
              />
              <StatCard
                label="Faturamento líquido"
                value={formatCents(report.netRevenueCents)}
                hint="Bruto menos reembolsos"
                tone="success"
              />
              <StatCard
                label="Ticket médio"
                value={formatCents(report.averageTicketCents)}
                hint="Sobre pedidos pagos"
              />
              <StatCard
                label="Total de pedidos"
                value={String(report.totalOrders)}
                hint={`${report.paidOrders} pagos · ${report.cancelled.count} cancelados`}
              />
            </div>
          </section>

          <section aria-label="Composição da receita">
            <h2 className="mb-3 text-sm font-bold tracking-wide uppercase">Composição</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Receita de produtos" value={formatCents(report.productRevenueCents)} />
              <StatCard label="Taxas de entrega" value={formatCents(report.deliveryFeesCents)} />
              <StatCard label="Descontos concedidos" value={`− ${formatCents(report.discountsCents)}`} />
              <StatCard
                label="Aguardando pagamento"
                value={formatCents(report.awaitingPayment.amountCents)}
                hint={`${report.awaitingPayment.count} ${report.awaitingPayment.count === 1 ? "pedido" : "pedidos"} — não contam na receita`}
                tone="warning"
              />
            </div>
          </section>

          <section aria-label="Perdas">
            <h2 className="mb-3 text-sm font-bold tracking-wide uppercase">
              Cancelamentos e reembolsos
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Cancelamentos"
                value={String(report.cancelled.count)}
                hint={`${formatCents(report.cancelled.amountCents)} em pedidos cancelados`}
              />
              <StatCard
                label="Reembolsos"
                value={String(report.refunded.count)}
                hint={`${formatCents(report.refunded.amountCents)} devolvidos`}
              />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="panel p-5 lg:col-span-2">
              <h2 className="mb-4 font-bold">Faturamento diário (30 dias)</h2>
              <BarChart
                title="Faturamento diário dos últimos 30 dias"
                data={report.daily.map((point) => ({
                  label: point.date.slice(8, 10),
                  sublabel: point.date,
                  value: point.revenueCents,
                }))}
                height={200}
              />
            </section>

            <section className="panel p-5">
              <h2 className="mb-4 font-bold">Por forma de pagamento</h2>
              {paymentTotal > 0 ? (
                <DonutBreakdown
                  total={paymentTotal}
                  segments={[
                    { label: "PIX", value: report.paymentBreakdown.PIX.revenueCents, color: CHART_COLORS.pix },
                    { label: "Cartão", value: report.paymentBreakdown.CARD.revenueCents, color: CHART_COLORS.card },
                    { label: "Dinheiro", value: report.paymentBreakdown.CASH.revenueCents, color: CHART_COLORS.cash },
                  ]}
                />
              ) : (
                <p className="muted py-6 text-center text-sm">Sem pagamentos no período.</p>
              )}

              <dl className="mt-4 space-y-1 border-t pt-3 text-xs">
                <div className="flex justify-between">
                  <dt className="muted">Pedidos por PIX</dt>
                  <dd className="font-semibold tabular-nums">{report.paymentBreakdown.PIX.orders}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="muted">Pedidos por cartão</dt>
                  <dd className="font-semibold tabular-nums">{report.paymentBreakdown.CARD.orders}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="muted">Pedidos em dinheiro</dt>
                  <dd className="font-semibold tabular-nums">{report.paymentBreakdown.CASH.orders}</dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel p-5">
              <h2 className="mb-4 font-bold">Produtos mais vendidos</h2>
              <RankingBars
                data={report.topProducts.map((product) => ({
                  label: product.name,
                  value: product.quantity,
                  caption: `${formatCents(product.revenueCents)} em vendas`,
                }))}
                format="units"
                emptyMessage="Nenhuma venda no período."
              />
            </section>

            <section className="panel p-5">
              <h2 className="mb-4 font-bold">Entrega x retirada</h2>
              {report.deliverySplit.length === 0 ? (
                <p className="muted py-6 text-center text-sm">Sem dados no período.</p>
              ) : (
                <dl className="space-y-3 text-sm">
                  {report.deliverySplit.map((row) => (
                    <div key={row.deliveryType} className="rounded-xl bg-[var(--surface-sunken)] p-3">
                      <dt className="font-semibold">
                        {row.deliveryType === "DELIVERY" ? "Entrega" : "Retirada no local"}
                      </dt>
                      <dd className="muted mt-1 text-xs">
                        {row.orders} {row.orders === 1 ? "pedido" : "pedidos"} ·{" "}
                        {formatCents(row.revenueCents)}
                        {row.feesCents > 0 && ` · ${formatCents(row.feesCents)} em taxas`}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
