"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { DeliveryType, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { api, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/providers";
import { formatCents } from "@/lib/money";
import { formatAddress, formatDateTime, formatPhone } from "@/lib/format";
import { DELIVERY_TYPE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/constants";
import { OrderStatusBadge, OrderTimeline } from "@/components/site/order-status";
import { Badge, Button, ErrorState, Skeleton, Spinner } from "@/components/ui";

type OrderPayload = {
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
  estimatedMinutes: number | null;
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
  statusHistory: Array<{ to: OrderStatus; createdAt: string }>;
};

type PaymentPayload = {
  id: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
  paidAt: string | null;
};

/**
 * Acompanhamento do pedido.
 *
 * A página se atualiza sozinha a cada 10 segundos enquanto o pedido está em
 * andamento. O botão de PIX apenas COPIA o código — quem confirma o
 * pagamento é o backend, pelo webhook do gateway. Não existe aqui nenhum
 * "já paguei" que mude o status.
 */
export default function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { push } = useToast();

  const [order, setOrder] = useState<OrderPayload | null>(null);
  const [payments, setPayments] = useState<PaymentPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ order: OrderPayload; payments: PaymentPayload[] }>(`/api/orders/${id}`);
      setOrder(data.order);
      setPayments(data.payments);
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

  // Atualização automática enquanto o pedido não terminou.
  useEffect(() => {
    if (!order) return;
    const finished = ["DELIVERED", "PICKED_UP", "CANCELLED"].includes(order.status);
    if (finished) return;

    const interval = setInterval(() => void load(), 10_000);
    return () => clearInterval(interval);
  }, [order, load]);

  async function regeneratePayment() {
    setRegenerating(true);
    try {
      await api(`/api/orders/${id}/payment`, { method: "POST" });
      await load();
      push("Nova cobrança gerada.", "success");
    } catch (caught) {
      push(errorMessage(caught), "error");
    } finally {
      setRegenerating(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      await api(`/api/orders/${id}/cancel`, { method: "POST", body: { reason: "Cancelado pelo cliente" } });
      await load();
      push("Pedido cancelado.", "info");
      setConfirmCancel(false);
    } catch (caught) {
      push(errorMessage(caught), "error");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <ErrorState message={error ?? "Pedido não encontrado."} onRetry={() => void load()} />
        <Link href="/meus-pedidos" className="mt-4 inline-block">
          <Button variant="outline">Ver meus pedidos</Button>
        </Link>
      </div>
    );
  }

  const pixPayment = payments.find(
    (payment) => payment.status === "PENDING" && payment.pixQrCode,
  );
  const cardCheckout = payments.find(
    (payment) => payment.status === "PENDING" && payment.checkoutUrl && !payment.pixQrCode,
  );
  const canCancel = ["AWAITING_PAYMENT", "PAYMENT_CONFIRMED", "RECEIVED"].includes(order.status);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="muted text-sm">Pedido</p>
          <h1 className="text-3xl font-extrabold tracking-tight tabular-nums">
            #{String(order.number).padStart(6, "0")}
          </h1>
          <p className="muted mt-1 text-sm">{formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OrderStatusBadge status={order.status} />
          <Badge tone={order.paymentStatus === "PAID" ? "success" : "warning"}>
            {PAYMENT_STATUS_LABEL[order.paymentStatus]}
          </Badge>
        </div>
      </div>

      {/* ------------------------------ pagamento --------------------------- */}
      {order.paymentStatus !== "PAID" && order.status !== "CANCELLED" && (
        <section className="surface mb-4 border-brand-300 p-5 dark:border-brand-900/50">
          <h2 className="mb-1 font-bold">
            {order.paymentMethod === "PIX"
              ? "Pague com PIX"
              : order.paymentMethod === "CARD"
                ? "Pagamento com cartão"
                : "Pagamento em dinheiro"}
          </h2>

          {order.paymentMethod === "PIX" && (
            <>
              {pixPayment ? (
                <>
                  <p className="muted mb-4 text-sm">
                    Abra o app do seu banco, escolha PIX Copia e Cola e use o código abaixo. A
                    confirmação é automática — esta página atualiza sozinha.
                  </p>

                  {pixPayment.pixQrCodeBase64 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/png;base64,${pixPayment.pixQrCodeBase64}`}
                      alt="QR Code do PIX"
                      className="mx-auto mb-4 size-56 rounded-xl border bg-white p-2"
                    />
                  )}

                  <label htmlFor="pix-code" className="mb-1.5 block text-sm font-medium">
                    Código PIX copia e cola
                  </label>
                  <textarea
                    id="pix-code"
                    readOnly
                    value={pixPayment.pixQrCode ?? ""}
                    onFocus={(event) => event.currentTarget.select()}
                    className="w-full rounded-xl border bg-[var(--surface-sunken)] p-3 font-mono text-xs break-all"
                    rows={4}
                  />

                  <Button
                    className="mt-3"
                    fullWidth
                    size="lg"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pixPayment.pixQrCode ?? "");
                        push("Código PIX copiado!", "success");
                      } catch {
                        push("Selecione o código acima e copie manualmente.", "info");
                      }
                    }}
                  >
                    Copiar código PIX
                  </Button>

                  {pixPayment.expiresAt && (
                    <p className="muted mt-2 text-center text-xs">
                      Este código expira em {formatDateTime(pixPayment.expiresAt)}.
                    </p>
                  )}

                  <p className="muted mt-4 flex items-center justify-center gap-2 text-center text-xs">
                    <Spinner className="size-3.5" /> Aguardando a confirmação do pagamento pelo banco...
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="muted text-sm">
                    A cobrança PIX ainda não foi gerada ou expirou. Gere uma nova para continuar.
                  </p>
                  <Button onClick={() => void regeneratePayment()} loading={regenerating} fullWidth>
                    Gerar código PIX
                  </Button>
                </div>
              )}
            </>
          )}

          {order.paymentMethod === "CARD" && (
            <>
              {cardCheckout?.checkoutUrl ? (
                <>
                  <p className="muted mb-3 text-sm">
                    Conclua o pagamento na página segura do nosso provedor.
                  </p>
                  <a href={cardCheckout.checkoutUrl} target="_blank" rel="noopener noreferrer">
                    <Button fullWidth size="lg">Pagar com cartão</Button>
                  </a>
                </>
              ) : (
                <p className="muted text-sm">
                  O pagamento com cartão será feito na entrega/retirada, na maquininha.
                </p>
              )}
            </>
          )}

          {order.paymentMethod === "CASH" && (
            <div className="text-sm">
              <p className="muted">
                Você pagará em dinheiro na {order.deliveryType === "DELIVERY" ? "entrega" : "retirada"}.
              </p>
              {order.changeForCents ? (
                <p className="mt-2 rounded-lg bg-[var(--surface-sunken)] p-3">
                  Você paga com <strong>{formatCents(order.changeForCents)}</strong> ·{" "}
                  <strong>Troco: {formatCents(order.changeForCents - order.totalCents)}</strong>
                </p>
              ) : (
                <p className="mt-2 rounded-lg bg-[var(--surface-sunken)] p-3">
                  Sem troco: valor exato de <strong>{formatCents(order.totalCents)}</strong>.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {order.paymentStatus === "PAID" && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
        >
          <strong>Pagamento confirmado</strong>
          {order.paidAt ? ` em ${formatDateTime(order.paidAt)}` : ""}. Seu pedido já está com a
          cozinha.
        </div>
      )}

      {/* ------------------------------- status ----------------------------- */}
      <section className="surface mb-4 p-5">
        <h2 className="mb-4 font-bold">Acompanhamento</h2>
        <OrderTimeline
          status={order.status}
          deliveryType={order.deliveryType}
          history={order.statusHistory}
        />
        {order.estimatedMinutes && !["DELIVERED", "PICKED_UP", "CANCELLED"].includes(order.status) && (
          <p className="muted border-t pt-3 text-sm">
            Tempo estimado: cerca de {order.estimatedMinutes} minutos.
          </p>
        )}
      </section>

      {/* -------------------------------- itens ----------------------------- */}
      <section className="surface mb-4 p-5">
        <h2 className="mb-3 font-bold">Itens</h2>
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

        <dl className="mt-3 space-y-2 border-t pt-3 text-sm">
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
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <dt>Desconto {order.couponCode ? `(${order.couponCode})` : ""}</dt>
              <dd className="tabular-nums">− {formatCents(order.discountCents)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-lg font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
          </div>
        </dl>
      </section>

      {/* ------------------------------- entrega ---------------------------- */}
      <section className="surface mb-4 p-5 text-sm">
        <h2 className="mb-3 font-bold">Entrega e contato</h2>
        <dl className="space-y-2">
          <div className="flex gap-2">
            <dt className="muted w-28 shrink-0">Recebimento</dt>
            <dd className="font-medium">{DELIVERY_TYPE_LABEL[order.deliveryType]}</dd>
          </div>
          {order.addressSnapshot && (
            <div className="flex gap-2">
              <dt className="muted w-28 shrink-0">Endereço</dt>
              <dd className="font-medium">{formatAddress(order.addressSnapshot)}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="muted w-28 shrink-0">Contato</dt>
            <dd className="font-medium">
              {order.customerName} · {formatPhone(order.customerPhone)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="muted w-28 shrink-0">Pagamento</dt>
            <dd className="font-medium">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</dd>
          </div>
          {order.notes && (
            <div className="flex gap-2">
              <dt className="muted w-28 shrink-0">Observações</dt>
              <dd className="font-medium">{order.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* -------------------------------- ações ----------------------------- */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/pedido/${order.id}/comprovante`} className="flex-1">
          <Button variant="outline" fullWidth>
            Ver comprovante
          </Button>
        </Link>
        <Link href="/meus-pedidos" className="flex-1">
          <Button variant="ghost" fullWidth>
            Meus pedidos
          </Button>
        </Link>
      </div>

      {canCancel && (
        <div className="mt-6 border-t pt-4">
          {confirmCancel ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
              <p className="text-sm font-medium text-red-900 dark:text-red-200">
                Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" onClick={() => void cancel()} loading={cancelling}>
                  Sim, cancelar pedido
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
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
              Cancelar este pedido
            </button>
          )}
        </div>
      )}
    </div>
  );
}
