"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { DeliveryType, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { api, errorMessage } from "@/lib/api-client";
import { formatCents } from "@/lib/money";
import { formatDateTime, formatPhone, formatRelative, formatTime } from "@/lib/format";
import {
  DELIVERY_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";
import { statusTone } from "@/components/site/order-status";
import { Badge, EmptyState, ErrorState, Select, Skeleton } from "@/components/ui";
import { cx } from "@/lib/cx";

type OrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryType: DeliveryType;
  totalCents: number;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  scheduledFor: string | null;
  createdAt: string;
  addressSnapshot: { neighborhood?: string; street?: string; number?: string } | null;
  items: Array<{ id: string; productNameSnapshot: string; quantity: number }>;
  user: { name: string; email: string };
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

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "all", label: "Todos os status" },
  ...(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((status) => ({
    value: status,
    label: ORDER_STATUS_LABEL[status],
  })),
];

function OrdersList() {
  const params = useSearchParams();

  const [period, setPeriod] = useState(params.get("period") ?? "today");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [deliveryType, setDeliveryType] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [summary, setSummary] = useState({ count: 0, revenueCents: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const query = useMemo(() => {
    const searchParams = new URLSearchParams({
      period,
      status,
      paymentStatus,
      paymentMethod,
      deliveryType,
      limit: "60",
    });
    if (search.trim()) searchParams.set("search", search.trim());
    if (period === "custom") {
      if (from) searchParams.set("from", from);
      if (to) searchParams.set("to", to);
    }
    return searchParams.toString();
  }, [period, status, paymentStatus, paymentMethod, deliveryType, search, from, to]);

  const load = useCallback(async () => {
    try {
      const data = await api<{
        orders: OrderRow[];
        total: number;
        summary: { count: number; revenueCents: number };
      }>(`/api/admin/orders?${query}`);
      setOrders(data.orders);
      setSummary(data.summary);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [query]);

  // A busca digitada só dispara depois de uma pausa, para não consultar a
  // cada tecla.
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 250);
    return () => clearTimeout(timeout);
  }, [load]);

  // A cozinha deixa esta tela aberta: atualiza sozinha a cada 20 segundos.
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => void load(), 20_000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-[clamp(1.9rem,4vw,2.5rem)]">Pedidos</h1>
          <p className="muted text-sm">
            {summary.count} {summary.count === 1 ? "pedido" : "pedidos"} ·{" "}
            {formatCents(summary.revenueCents)} no período
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
            className="size-4 accent-[var(--brand-ink)]"
          />
          Atualizar automaticamente
        </label>
      </header>

      {/* ------------------------------- filtros ---------------------------- */}
      <section className="panel p-4" aria-label="Filtros">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="f-search" className="mb-1 block text-xs font-semibold">
              Buscar
            </label>
            <input
              id="f-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nº do pedido, nome, telefone ou e-mail"
              className="w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="f-period" className="mb-1 block text-xs font-semibold">
              Período
            </label>
            <Select id="f-period" value={period} onChange={(e) => setPeriod(e.target.value)} className="py-2.5 text-sm">
              {PERIODS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="f-status" className="mb-1 block text-xs font-semibold">
              Status do pedido
            </label>
            <Select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)} className="py-2.5 text-sm">
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="f-payment-status" className="mb-1 block text-xs font-semibold">
              Status do pagamento
            </label>
            <Select id="f-payment-status" value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)} className="py-2.5 text-sm">
              <option value="all">Todos</option>
              {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((key) => (
                <option key={key} value={key}>{PAYMENT_STATUS_LABEL[key]}</option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="f-method" className="mb-1 block text-xs font-semibold">
              Forma de pagamento
            </label>
            <Select id="f-method" value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)} className="py-2.5 text-sm">
              <option value="all">Todas</option>
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((key) => (
                <option key={key} value={key}>{PAYMENT_METHOD_LABEL[key]}</option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="f-delivery" className="mb-1 block text-xs font-semibold">
              Recebimento
            </label>
            <Select id="f-delivery" value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value)} className="py-2.5 text-sm">
              <option value="all">Todos</option>
              <option value="DELIVERY">Entrega</option>
              <option value="PICKUP">Retirada</option>
            </Select>
          </div>
        </div>

        {period === "custom" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="f-from" className="mb-1 block text-xs font-semibold">De</label>
              <input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label htmlFor="f-to" className="mb-1 block text-xs font-semibold">Até</label>
              <input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-sm" />
            </div>
          </div>
        )}
      </section>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Nenhum pedido encontrado"
          description="Ajuste os filtros ou escolha outro período."
        />
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/admin/pedidos/${order.id}`}
                className={cx(
                  "panel block p-4 transition-shadow hover:shadow-[var(--shadow-soft)]",
                  order.status === "CANCELLED" && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      <span className="tabular-nums">#{String(order.number).padStart(6, "0")}</span>
                      <Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABEL[order.status]}</Badge>
                      {order.paymentStatus === "PAID" ? (
                        <Badge tone="success">Pago</Badge>
                      ) : (
                        <Badge tone="warning">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Badge>
                      )}
                    </p>
                    <p className="muted mt-1 text-sm">
                      {order.customerName} · {formatPhone(order.customerPhone)}
                    </p>
                    {/* Na operação do dia, o horário combinado vale mais que
                        a hora em que o pedido entrou. */}
                    {order.scheduledFor ? (
                      <p className="text-xs font-semibold">
                        {order.deliveryType === "PICKUP" ? "Retirada" : "Entrega"} às{" "}
                        <span className="tabular-nums">{formatTime(order.scheduledFor)}</span>
                        <span className="muted font-normal">
                          {" "}
                          · pedido {formatRelative(order.createdAt)}
                        </span>
                      </p>
                    ) : (
                      <p className="muted text-xs">
                        {formatDateTime(order.createdAt)} ({formatRelative(order.createdAt)})
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold tabular-nums">{formatCents(order.totalCents)}</p>
                    <p className="muted text-xs">
                      {PAYMENT_METHOD_LABEL[order.paymentMethod]} ·{" "}
                      {DELIVERY_TYPE_LABEL[order.deliveryType]}
                    </p>
                  </div>
                </div>

                <p className="muted mt-2 line-clamp-1 border-t pt-2 text-sm">
                  {order.items.map((item) => `${item.quantity}× ${item.productNameSnapshot}`).join(", ")}
                </p>

                {order.notes && (
                  <p className="mt-1 line-clamp-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                    Obs.: {order.notes}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OrdersClient() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <OrdersList />
    </Suspense>
  );
}
