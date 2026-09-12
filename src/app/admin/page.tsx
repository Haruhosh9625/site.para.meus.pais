import Link from "next/link";
import { getDashboardMetrics } from "@/server/services/analytics";
import { getSettings, getStoreStatus } from "@/server/services/settings";
import { formatCents } from "@/lib/money";
import { formatRelative } from "@/lib/format";
import { BarChart, DonutBreakdown, RankingBars, StatCard } from "@/components/admin/charts";
import { Badge } from "@/components/ui";
import {
  CHART_COLORS,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  statusTone,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const [metrics, settings] = await Promise.all([getDashboardMetrics(), getSettings()]);
  const storeStatus = getStoreStatus(settings);

  const revenueTrend =
    metrics.yesterday.revenueCents > 0
      ? ((metrics.today.revenueCents - metrics.yesterday.revenueCents) /
          metrics.yesterday.revenueCents) *
        100
      : null;

  const paymentTotal =
    metrics.paymentBreakdown.PIX.revenueCents +
    metrics.paymentBreakdown.CARD.revenueCents +
    metrics.paymentBreakdown.CASH.revenueCents;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="muted text-sm">Visão geral da operação de hoje.</p>
        </div>
        <div className="flex items-center gap-2">
          {storeStatus.open ? (
            <Badge tone="success">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Loja aberta
            </Badge>
          ) : (
            <Badge tone="danger">Loja fechada</Badge>
          )}
          <Link
            href="/admin/configuracoes"
            className="text-sm font-semibold text-brand underline-offset-4 hover:underline"
          >
            Alterar
          </Link>
        </div>
      </header>

      {/* ------------------------------- KPIs de hoje ----------------------- */}
      <section aria-label="Indicadores de hoje">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Faturamento hoje"
            value={formatCents(metrics.today.revenueCents)}
            hint={`${metrics.today.paidOrders} ${metrics.today.paidOrders === 1 ? "pedido pago" : "pedidos pagos"}`}
            trend={revenueTrend}
            tone="brand"
          />
          <StatCard
            label="Pedidos hoje"
            value={String(metrics.today.orders)}
            hint={`${metrics.today.completed} concluídos · ${metrics.today.cancelled} cancelados`}
          />
          <StatCard
            label="Ticket médio hoje"
            value={formatCents(metrics.today.averageTicketCents)}
            hint="Sobre pedidos pagos"
          />
          <StatCard
            label="Faturamento 30 dias"
            value={formatCents(metrics.last30Days.revenueCents)}
            hint={`${metrics.last30Days.orders} pedidos · ticket ${formatCents(metrics.last30Days.averageTicketCents)}`}
          />
        </div>
      </section>

      {/* -------------------------------- fila ------------------------------ */}
      <section aria-label="Fila de produção">
        <h2 className="mb-3 text-sm font-bold tracking-wide uppercase">Fila agora</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/admin/pedidos?status=RECEIVED&period=all">
            <StatCard
              label="Pendentes"
              value={String(metrics.queue.pending)}
              hint="Aguardando pagamento ou início"
              tone="warning"
            />
          </Link>
          <Link href="/admin/pedidos?status=PREPARING&period=all">
            <StatCard
              label="Em preparação"
              value={String(metrics.queue.preparing)}
              hint="Na chapa agora"
              tone="brand"
            />
          </Link>
          <Link href="/admin/pedidos?status=READY&period=all">
            <StatCard
              label={settings.allowDelivery ? "Prontos / a caminho" : "Prontos"}
              value={String(metrics.queue.ready)}
              hint={
                settings.allowDelivery
                  ? "Aguardando entrega ou retirada"
                  : "Aguardando o cliente buscar"
              }
              tone="success"
            />
          </Link>
        </div>
      </section>

      {/* ------------------------------ gráficos ---------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface p-5 lg:col-span-2">
          <h2 className="mb-4 font-bold">Faturamento dos últimos 14 dias</h2>
          <BarChart
            title="Faturamento diário dos últimos 14 dias"
            data={metrics.dailySeries.map((point) => ({
              label: point.date.slice(8, 10) + "/" + point.date.slice(5, 7),
              sublabel: point.date,
              value: point.revenueCents,
            }))}
          />
        </section>

        <section className="surface p-5">
          <h2 className="mb-4 font-bold">Por forma de pagamento</h2>
          <p className="muted mb-3 text-xs">Últimos 30 dias</p>
          {paymentTotal > 0 ? (
            <DonutBreakdown
              total={paymentTotal}
              segments={[
                { label: "PIX", value: metrics.paymentBreakdown.PIX.revenueCents, color: CHART_COLORS.pix },
                { label: "Cartão", value: metrics.paymentBreakdown.CARD.revenueCents, color: CHART_COLORS.card },
                { label: "Dinheiro", value: metrics.paymentBreakdown.CASH.revenueCents, color: CHART_COLORS.cash },
              ]}
            />
          ) : (
            <p className="muted py-6 text-center text-sm">Sem pagamentos confirmados no período.</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* -------------------------- mais vendidos ------------------------- */}
        <section className="surface p-5">
          <h2 className="mb-1 font-bold">Produtos mais vendidos</h2>
          <p className="muted mb-4 text-xs">Últimos 30 dias, por quantidade</p>
          <RankingBars
            data={metrics.topProducts.map((product) => ({
              label: product.name,
              value: product.quantity,
              caption: `${formatCents(product.revenueCents)} em vendas`,
            }))}
            format="units"
            emptyMessage="Nenhuma venda registrada ainda."
          />
        </section>

        {/* -------------------------- pedidos recentes ---------------------- */}
        <section className="surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Últimos pedidos</h2>
            <Link
              href="/admin/pedidos"
              className="text-sm font-semibold text-brand underline-offset-4 hover:underline"
            >
              Ver todos
            </Link>
          </div>

          {metrics.recentOrders.length === 0 ? (
            <p className="muted py-6 text-center text-sm">Nenhum pedido ainda.</p>
          ) : (
            <ul className="divide-y">
              {metrics.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/pedidos/${order.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tabular-nums">
                        #{String(order.number).padStart(6, "0")}{" "}
                        <span className="muted font-normal">· {order.customerName}</span>
                      </p>
                      <p className="muted text-xs">
                        {formatRelative(order.createdAt)} · {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums">{formatCents(order.totalCents)}</p>
                      <Badge tone={statusTone(order.status)} className="mt-0.5">
                        {ORDER_STATUS_LABEL[order.status]}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
