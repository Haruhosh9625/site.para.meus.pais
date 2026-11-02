"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { DeliveryType, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { api, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/providers";
import { formatCents } from "@/lib/money";
import { formatAddress, formatDate, formatDateTime, formatPhone, formatTime } from "@/lib/format";
import {
  DELIVERY_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";
import { OrderStatusBadge, OrderTimeline } from "@/components/site/order-status";
import { Badge, Button, ErrorState, Skeleton, Textarea } from "@/components/ui";

type OrderDetail = {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryType: DeliveryType;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  changeForCents: number | null;
  couponCode: string | null;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  cancelReason: string | null;
  estimatedMinutes: number | null;
  scheduledFor: string | null;
  createdAt: string;
  paidAt: string | null;
  addressSnapshot: {
    street: string; number: string; complement: string | null; neighborhood: string;
    city: string; state: string; postalCode: string; reference: string | null;
  } | null;
  items: Array<{
    id: string; productNameSnapshot: string; unitPriceCents: number;
    quantity: number; subtotalCents: number;
  }>;
  payments: Array<{
    id: string; provider: string; providerPaymentId: string | null;
    status: PaymentStatus; amountCents: number; paidAt: string | null; createdAt: string;
  }>;
  statusHistory: Array<{ id: string; from: OrderStatus | null; to: OrderStatus; createdAt: string; note: string | null }>;
  user: { id: string; name: string; email: string; phone: string };
};

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { push } = useToast();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [allowed, setAllowed] = useState<OrderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ order: OrderDetail; allowedTransitions: OrderStatus[] }>(
        `/api/admin/orders/${id}`,
      );
      setOrder(data.order);
      setAllowed(data.allowedTransitions);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: OrderStatus) {
    setWorking(true);
    try {
      await api(`/api/admin/orders/${id}/status`, { method: "POST", body: { status } });
      await load();
      push(`Status alterado para "${ORDER_STATUS_LABEL[status]}".`, "success");
    } catch (caught) {
      push(errorMessage(caught), "error");
    } finally {
      setWorking(false);
    }
  }

  async function markAsPaid() {
    setWorking(true);
    try {
      await api(`/api/admin/orders/${id}/confirm-payment`, { method: "POST" });
      await load();
      push("Pagamento confirmado e registrado na auditoria.", "success");
      setConfirmPayment(false);
    } catch (caught) {
      push(errorMessage(caught), "error");
    } finally {
      setWorking(false);
    }
  }

  async function cancelOrder() {
    setWorking(true);
    try {
      await api(`/api/admin/orders/${id}/cancel`, {
        method: "POST",
        body: { reason: cancelReason || "Cancelado pelo administrador" },
      });
      await load();
      push("Pedido cancelado.", "info");
      setConfirmCancel(false);
    } catch (caught) {
      push(errorMessage(caught), "error");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <ErrorState message={error ?? "Pedido não encontrado."} onRetry={() => void load()} />
        <Link href="/admin/pedidos">
          <Button variant="outline">Voltar para pedidos</Button>
        </Link>
      </div>
    );
  }

  const changeDue =
    order.changeForCents !== null ? order.changeForCents - order.totalCents : null;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/pedidos"
          className="text-sm font-semibold text-brand underline-offset-4 hover:underline"
        >
          ← Todos os pedidos
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Imprimir pedido
          </Button>
          <Link href={`/pedido/${order.id}/comprovante`} target="_blank">
            <Button variant="ghost" size="sm">Comprovante</Button>
          </Link>
        </div>
      </div>

      <header className="panel flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <p className="muted text-sm">Pedido</p>
          <h1 className="text-3xl font-extrabold tracking-tight tabular-nums">
            #{String(order.number).padStart(6, "0")}
          </h1>
          <p className="muted mt-1 text-sm">Feito em {formatDateTime(order.createdAt)}</p>
          {order.scheduledFor && (
            <p className="mt-2 inline-flex items-baseline gap-2 rounded-xl bg-brand-100 px-3 py-1.5 dark:bg-brand-900/40">
              <span className="text-xs font-semibold tracking-wide uppercase">
                {order.deliveryType === "PICKUP" ? "Retirar às" : "Entregar às"}
              </span>
              <span className="text-xl font-extrabold tabular-nums">
                {formatTime(order.scheduledFor)}
              </span>
              <span className="muted text-xs">{formatDate(order.scheduledFor)}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <OrderStatusBadge status={order.status} />
          {order.status !== "AWAITING_PAYMENT" && (
            <Badge tone={order.paymentStatus === "PAID" ? "success" : "warning"}>
              {PAYMENT_STATUS_LABEL[order.paymentStatus]}
            </Badge>
          )}
          <p className="text-2xl font-extrabold tabular-nums">{formatCents(order.totalCents)}</p>
        </div>
      </header>

      {/* ------------------------------ ações ------------------------------- */}
      <section className="no-print surface p-5">
        <h2 className="mb-3 font-bold">Ações</h2>

        {order.paymentStatus !== "PAID" && order.status !== "CANCELLED" && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Pagamento ainda não confirmado ({PAYMENT_METHOD_LABEL[order.paymentMethod]}).
            </p>
            <p className="muted mt-1 text-xs">
              Use a baixa manual apenas quando você tiver conferido o recebimento (dinheiro na
              entrega, maquininha ou PIX na conta). A ação fica registrada com o seu nome no log
              de auditoria.
            </p>
            {confirmPayment ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void markAsPaid()} loading={working}>
                  Confirmo que recebi o pagamento
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmPayment(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button size="sm" className="mt-3" onClick={() => setConfirmPayment(true)}>
                Dar baixa no pagamento
              </Button>
            )}
          </div>
        )}

        {allowed.filter((status) => status !== "CANCELLED").length > 0 ? (
          <>
            <p className="muted mb-2 text-xs font-semibold tracking-wide uppercase">
              Avançar status
            </p>
            <div className="flex flex-wrap gap-2">
              {allowed
                .filter((status) => status !== "CANCELLED")
                .map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    onClick={() => void changeStatus(status)}
                    disabled={working}
                  >
                    {ORDER_STATUS_LABEL[status]}
                  </Button>
                ))}
            </div>
          </>
        ) : (
          <p className="muted text-sm">
            Este pedido está em um estado final. Nenhuma mudança de status é possível.
          </p>
        )}

        {allowed.includes("CANCELLED") && (
          <div className="mt-4 border-t pt-4">
            {confirmCancel ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
                <p className="mb-2 text-sm font-medium text-red-900 dark:text-red-200">
                  Cancelar o pedido #{String(order.number).padStart(6, "0")}? O cliente será
                  notificado e o cupom (se houver) volta a ficar disponível.
                </p>
                <Textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  placeholder="Motivo do cancelamento (opcional)"
                  className="mb-2"
                />
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" onClick={() => void cancelOrder()} loading={working}>
                    Confirmar cancelamento
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
                    Voltar
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="muted text-sm underline underline-offset-2 hover:text-red-600"
              >
                Cancelar pedido
              </button>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------ cliente --------------------------- */}
        <section className="panel p-5 text-sm">
          <h2 className="mb-3 font-bold">Cliente e entrega</h2>
          <dl className="space-y-2">
            <div className="flex gap-2">
              <dt className="muted w-24 shrink-0">Nome</dt>
              <dd className="font-medium">{order.customerName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="muted w-24 shrink-0">Telefone</dt>
              <dd className="font-medium">
                <a href={`tel:${order.customerPhone}`} className="underline underline-offset-2">
                  {formatPhone(order.customerPhone)}
                </a>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="muted w-24 shrink-0">E-mail</dt>
              <dd className="truncate font-medium">{order.user.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="muted w-24 shrink-0">Receber</dt>
              <dd className="font-medium">{DELIVERY_TYPE_LABEL[order.deliveryType]}</dd>
            </div>
            {order.scheduledFor && (
              <div className="flex gap-2">
                <dt className="muted w-24 shrink-0">Horário</dt>
                <dd className="font-medium">{formatDateTime(order.scheduledFor)}</dd>
              </div>
            )}
            {order.addressSnapshot && (
              <div className="flex gap-2">
                <dt className="muted w-24 shrink-0">Endereço</dt>
                <dd className="font-medium">
                  {formatAddress(order.addressSnapshot)}
                  {order.addressSnapshot.reference && (
                    <span className="muted block text-xs">
                      Ref.: {order.addressSnapshot.reference}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {order.notes && (
              <div className="flex gap-2">
                <dt className="muted w-24 shrink-0">Observações</dt>
                <dd className="font-medium text-amber-700 dark:text-amber-400">{order.notes}</dd>
              </div>
            )}
            {order.cancelReason && (
              <div className="flex gap-2">
                <dt className="muted w-24 shrink-0">Cancelamento</dt>
                <dd className="font-medium">{order.cancelReason}</dd>
              </div>
            )}
          </dl>
          <Link
            href={`/admin/clientes?search=${encodeURIComponent(order.user.email)}`}
            className="mt-3 inline-block text-sm font-semibold text-brand underline-offset-4 hover:underline"
          >
            Ver histórico deste cliente
          </Link>
        </section>

        {/* ------------------------------- itens ---------------------------- */}
        <section className="panel p-5">
          <h2 className="mb-3 font-bold">Itens do pedido</h2>
          <ul className="divide-y text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-2.5">
                <span>
                  <strong className="tabular-nums">{item.quantity}×</strong>{" "}
                  {item.productNameSnapshot}
                  <span className="muted block text-xs">
                    {formatCents(item.unitPriceCents)} cada
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatCents(item.subtotalCents)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="muted">Subtotal</dt>
              <dd className="tabular-nums">{formatCents(order.subtotalCents)}</dd>
            </div>
            {order.deliveryFeeCents > 0 && (
              <div className="flex justify-between">
                <dt className="muted">Taxa de entrega</dt>
                <dd className="tabular-nums">{formatCents(order.deliveryFeeCents)}</dd>
              </div>
            )}
            {order.discountCents > 0 && (
              <div className="flex justify-between">
                <dt className="muted">Desconto {order.couponCode ? `(${order.couponCode})` : ""}</dt>
                <dd className="tabular-nums">− {formatCents(order.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
            </div>
            {changeDue !== null && changeDue >= 0 && (
              <div className="flex justify-between rounded-lg bg-[var(--surface-sunken)] px-3 py-2 font-semibold">
                <dt>Levar troco de</dt>
                <dd className="tabular-nums">{formatCents(changeDue)}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ----------------------------- histórico -------------------------- */}
        <section className="panel p-5">
          <h2 className="mb-4 font-bold">Linha do tempo</h2>
          <OrderTimeline
            status={order.status}
            deliveryType={order.deliveryType}
            history={order.statusHistory}
          />
        </section>

        {/* ---------------------------- pagamentos -------------------------- */}
        <section className="panel p-5">
          <h2 className="mb-3 font-bold">Pagamentos</h2>
          {order.payments.length === 0 ? (
            <p className="muted text-sm">Nenhuma cobrança registrada.</p>
          ) : (
            <ul className="divide-y text-sm">
              {order.payments.map((payment) => (
                <li key={payment.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium capitalize">{payment.provider}</span>
                    <Badge tone={payment.status === "PAID" ? "success" : "warning"}>
                      {PAYMENT_STATUS_LABEL[payment.status]}
                    </Badge>
                  </div>
                  <p className="muted mt-0.5 text-xs">
                    {formatCents(payment.amountCents)} · criado em {formatDateTime(payment.createdAt)}
                    {payment.paidAt && ` · pago em ${formatDateTime(payment.paidAt)}`}
                  </p>
                  {payment.providerPaymentId && (
                    <p className="muted font-mono text-[11px] break-all">
                      ID: {payment.providerPaymentId}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
