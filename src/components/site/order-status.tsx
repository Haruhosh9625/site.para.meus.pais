"use client";

import type { OrderStatus, DeliveryType } from "@prisma/client";
import { DELIVERY_FLOW, ORDER_STATUS_LABEL, PICKUP_FLOW, statusTone } from "@/lib/constants";
import { Badge } from "@/components/ui";
import { cx } from "@/lib/cx";

// Reexportado para as telas que já importavam daqui.
export { statusTone } from "@/lib/constants";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={statusTone(status)}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

/**
 * Linha do tempo do pedido.
 * O fluxo muda conforme entrega ou retirada — não faz sentido mostrar
 * "Saiu para entrega" em um pedido que o cliente vem buscar.
 */
export function OrderTimeline({
  status,
  deliveryType,
  history,
}: {
  status: OrderStatus;
  deliveryType: DeliveryType;
  history?: Array<{ to: OrderStatus; createdAt: string | Date }>;
}) {
  if (status === "CANCELLED") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
        <strong>Pedido cancelado.</strong> Se você não reconhece este cancelamento, fale com a loja.
      </div>
    );
  }

  const flow = deliveryType === "PICKUP" ? PICKUP_FLOW : DELIVERY_FLOW;
  const currentIndex = flow.indexOf(status);
  const timeOf = (step: OrderStatus) =>
    history?.find((entry) => entry.to === step)?.createdAt ?? null;

  return (
    <ol className="space-y-0">
      {flow.map((step, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        const at = timeOf(step);

        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cx(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                  done && "border-emerald-500 bg-emerald-500 text-white",
                  current && "border-brand-600 bg-brand-500 text-coal-900",
                  !done && !current && "border-[var(--border)] text-[var(--text-muted)]",
                )}
                aria-hidden="true"
              >
                {done ? "✓" : index + 1}
              </span>
              {index < flow.length - 1 && (
                <span
                  className={cx("w-0.5 flex-1", done ? "bg-emerald-500" : "bg-[var(--border)]")}
                  style={{ minHeight: "1.75rem" }}
                  aria-hidden="true"
                />
              )}
            </div>

            <div className="pb-6">
              <p
                className={cx(
                  "text-sm leading-7",
                  current ? "font-bold text-brand" : done ? "font-medium" : "muted",
                )}
              >
                {ORDER_STATUS_LABEL[step]}
                {current && <span className="sr-only"> (status atual)</span>}
              </p>
              {at && (
                <p className="muted text-xs">
                  {new Intl.DateTimeFormat("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(at))}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
