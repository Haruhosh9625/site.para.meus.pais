"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeliveryType, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { api, errorMessage } from "@/lib/api-client";
import { useSession } from "@/components/providers";
import { formatCents } from "@/lib/money";
import { formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { DELIVERY_TYPE_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { OrderStatusBadge } from "@/components/site/order-status";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";

type OrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryType: DeliveryType;
  totalCents: number;
  /** Horário combinado. Nulo nos pedidos feitos antes do agendamento. */
  scheduledFor: string | null;
  createdAt: string;
  items: Array<{ id: string; productNameSnapshot: string; quantity: number }>;
};

export default function MeusPedidosPage() {
  const { user, loading: sessionLoading } = useSession();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void api<{ orders: OrderRow[] }>("/api/orders")
      .then((data) => setOrders(data.orders))
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  }, [user, sessionLoading]);

  if (sessionLoading || loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="display mb-7 text-[clamp(2.25rem,7vw,3.25rem)]">Meus pedidos</h1>
        <EmptyState
          icon="🔐"
          title="Entre para ver seus pedidos"
          description="Seu histórico fica guardado na sua conta."
          action={
            <div className="flex gap-2">
              <Link href="/login?redirect=/meus-pedidos"><Button>Entrar</Button></Link>
              <Link href="/cadastro"><Button variant="outline">Criar conta</Button></Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="display mb-7 text-[clamp(2.25rem,7vw,3.25rem)]">Meus pedidos</h1>

      {error && <ErrorState message={error} />}

      {!error && orders.length === 0 && (
        <EmptyState
          icon="🍢"
          title="Você ainda não fez nenhum pedido"
          description="Que tal começar por um espeto de frango com bacon?"
          action={<Link href="/cardapio"><Button size="lg">Ver cardápio</Button></Link>}
        />
      )}

      <ul className="space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              href={`/pedido/${order.id}`}
              className="panel block p-4 transition-shadow hover:shadow-[var(--shadow-soft)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold tabular-nums">
                    #{String(order.number).padStart(6, "0")}
                  </p>
                  {order.scheduledFor ? (
                    <p className="text-xs font-semibold">
                      {order.deliveryType === "PICKUP" ? "Retirada" : "Entrega"} às{" "}
                      <span className="tabular-nums">{formatTime(order.scheduledFor)}</span>
                      <span className="muted font-normal">
                        {" "}
                        · {formatDateTime(order.scheduledFor)}
                      </span>
                    </p>
                  ) : (
                    <p className="muted text-xs">
                      {formatDateTime(order.createdAt)} · {formatRelative(order.createdAt)}
                    </p>
                  )}
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              <p className="muted mt-2 line-clamp-2 text-sm">
                {order.items
                  .map((item) => `${item.quantity}× ${item.productNameSnapshot}`)
                  .join(", ")}
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{DELIVERY_TYPE_LABEL[order.deliveryType]}</Badge>
                  <Badge>{PAYMENT_METHOD_LABEL[order.paymentMethod]}</Badge>
                  {order.paymentStatus === "PAID" ? (
                    <Badge tone="success">Pago</Badge>
                  ) : (
                    <Badge tone="warning">Aguardando pagamento</Badge>
                  )}
                </div>
                <p className="text-lg font-bold tabular-nums">{formatCents(order.totalCents)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
