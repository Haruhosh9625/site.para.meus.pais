import Link from "next/link";
import { getDaySchedule } from "@/server/services/scheduling";
import { getSettings, parseOpeningHours } from "@/server/services/settings";
import { formatCents } from "@/lib/money";
import { formatPhone, formatTime } from "@/lib/format";
import { ORDER_STATUS_LABEL, statusTone, WEEKDAY_LABEL } from "@/lib/constants";
import { Badge, EmptyState } from "@/components/ui";
import { cx } from "@/lib/cx";
import { AutoRefresh } from "./refresh";

/**
 * Agenda do dia.
 *
 * É a tela da operação: mostra a carga de cada janela e, dentro dela, quem
 * vem buscar o quê. Como a loja trabalha por hora marcada, esta página
 * substitui na prática a "fila de pedidos" de um delivery comum.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda" };

/** "2026-09-12" no fuso do servidor, que é o fuso da loja. */
function toDayParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function AdminAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const { dia } = await searchParams;

  const parsed = dia ? new Date(`${dia}T00:00:00`) : new Date();
  const day = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const [schedule, settings] = await Promise.all([getDaySchedule(day), getSettings()]);
  const hours = parseOpeningHours(settings.openingHours).find((h) => h.weekday === day.getDay());

  const previous = new Date(day.getTime() - 86400000);
  const next = new Date(day.getTime() + 86400000);
  const isToday = toDayParam(day) === toDayParam(new Date());

  const totalItems = schedule.orders.reduce(
    (sum, order) => sum + order.items.reduce((acc, item) => acc + item.quantity, 0),
    0,
  );
  const totalCents = schedule.orders.reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <div className="space-y-6">
      <AutoRefresh />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Agenda</h1>
          <p className="muted text-sm">
            {isToday ? "Hoje, " : ""}
            {WEEKDAY_LABEL[day.getDay()]} ·{" "}
            {hours && !hours.closed ? `${hours.open} às ${hours.close}` : "fechado"}
            {schedule.capacity > 0
              ? ` · até ${schedule.capacity} pedido(s) por janela de ${schedule.windowMinutes} min`
              : ` · janelas de ${schedule.windowMinutes} min, sem limite`}
          </p>
        </div>

        <nav aria-label="Trocar de dia" className="flex items-center gap-2 text-sm font-semibold">
          <Link
            href={`/admin/agenda?dia=${toDayParam(previous)}`}
            className="tap rounded-xl border px-3 hover:bg-[var(--surface-sunken)]"
          >
            ← Dia anterior
          </Link>
          {!isToday && (
            <Link href="/admin/agenda" className="tap rounded-xl border px-3 hover:bg-[var(--surface-sunken)]">
              Hoje
            </Link>
          )}
          <Link
            href={`/admin/agenda?dia=${toDayParam(next)}`}
            className="tap rounded-xl border px-3 hover:bg-[var(--surface-sunken)]"
          >
            Dia seguinte →
          </Link>
        </nav>
      </header>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "Agendamentos", value: String(schedule.orders.length) },
          { label: "Itens no dia", value: `${totalItems} un.` },
          { label: "Valor agendado", value: formatCents(totalCents) },
        ].map((stat) => (
          <div key={stat.label} className="surface p-4">
            <dt className="muted text-xs font-semibold tracking-wide uppercase">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-extrabold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {schedule.windows.length === 0 ? (
        <EmptyState
          title="Nenhum agendamento neste dia"
          description="Quando um cliente marcar um horário, ele aparece aqui automaticamente."
        />
      ) : (
        <ol className="space-y-4">
          {schedule.windows.map((window) => {
            const ordersInWindow = schedule.orders.filter(
              (order) =>
                order.scheduledFor !== null &&
                order.scheduledFor >= window.start &&
                order.scheduledFor.getTime() < window.start.getTime() + schedule.windowMinutes * 60000,
            );

            return (
              <li key={window.start.toISOString()} className="surface overflow-hidden">
                <div
                  className={cx(
                    "flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3",
                    window.full && "bg-amber-50 dark:bg-amber-950/30",
                  )}
                >
                  <h2 className="text-lg font-extrabold tabular-nums">
                    {formatTime(window.start)}
                    <span className="muted ml-2 text-sm font-medium">
                      até{" "}
                      {formatTime(
                        new Date(window.start.getTime() + schedule.windowMinutes * 60000),
                      )}
                    </span>
                  </h2>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span>
                      {window.orders} pedido{window.orders === 1 ? "" : "s"} · {window.items} itens
                    </span>
                    {window.full && <Badge tone="warning">Lotado</Badge>}
                    {schedule.capacity > 0 && !window.full && (
                      <Badge tone="success">
                        {schedule.capacity - window.occupied} vaga
                        {schedule.capacity - window.occupied === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </p>
                </div>

                <ul className="divide-y">
                  {ordersInWindow.map((order) => (
                    <li key={order.id}>
                      <Link
                        href={`/admin/pedidos/${order.id}`}
                        className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-sunken)]"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-bold">
                            <span className="tabular-nums">{formatTime(order.scheduledFor)}</span>
                            <span className="muted font-medium tabular-nums">
                              #{String(order.number).padStart(6, "0")}
                            </span>
                            <Badge tone={statusTone(order.status)}>
                              {ORDER_STATUS_LABEL[order.status]}
                            </Badge>
                            {/* Em "Aguardando pagamento" os dois selos dizem
                                a mesma coisa; o segundo só aparece quando
                                acrescenta informação. */}
                            {order.paymentStatus !== "PAID" &&
                              order.status !== "AWAITING_PAYMENT" && (
                                <Badge tone="warning">Não pago</Badge>
                              )}
                          </p>
                          <p className="muted mt-0.5 text-sm">
                            {order.customerName} · {formatPhone(order.customerPhone)}
                          </p>
                          <p className="mt-1 text-sm">
                            {order.items
                              .map((item) => `${item.quantity}× ${item.productNameSnapshot}`)
                              .join(", ")}
                          </p>
                        </div>
                        <p className="shrink-0 font-bold tabular-nums">
                          {formatCents(order.totalCents)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
