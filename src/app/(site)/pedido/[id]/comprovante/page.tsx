import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings";
import { formatCents } from "@/lib/money";
import { formatAddress, formatDate, formatDateTime, formatPhone, formatTime } from "@/lib/format";
import {
  DELIVERY_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * Comprovante do pedido.
 *
 * Renderizado no servidor e pensado para o papel: o CSS de impressão
 * (globals.css) esconde a navegação e ajusta as margens, então "Imprimir"
 * gera tanto a via de papel quanto o PDF (via "Salvar como PDF" do próprio
 * navegador, em qualquer sistema).
 */
export default async function ComprovantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/pedido/${id}/comprovante`);

  const [order, settings] = await Promise.all([
    prisma.order.findFirst({
      // Cliente vê só o próprio comprovante; admin vê qualquer um.
      where: user.role === "ADMIN" ? { id } : { id, userId: user.id },
      include: {
        items: { orderBy: { productNameSnapshot: "asc" } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    getSettings(),
  ]);

  if (!order) notFound();

  const address = order.addressSnapshot as {
    street: string; number: string; complement: string | null; neighborhood: string;
    city: string; state: string; postalCode: string; reference: string | null;
  } | null;

  const payment = order.payments[0] ?? null;
  const changeDue =
    order.changeForCents !== null ? order.changeForCents - order.totalCents : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/pedido/${order.id}`}
          className="text-sm font-semibold text-brand-600 underline-offset-4 hover:underline"
        >
          ← Voltar ao pedido
        </Link>
        <PrintButton />
      </div>

      <article className="print-sheet surface p-6 sm:p-8">
        {/* ------------------------------ cabeçalho ------------------------- */}
        <header className="border-b border-dashed pb-5 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight uppercase">
            {settings.storeName}
          </h1>
          {settings.addressStreet && (
            <p className="muted mt-1 text-xs">
              {settings.addressStreet}, {settings.addressNumber} — {settings.addressNeighborhood}
              <br />
              {settings.addressCity}/{settings.addressState}
              {settings.addressPostalCode ? ` — CEP ${settings.addressPostalCode}` : ""}
            </p>
          )}
          {(settings.phone || settings.whatsapp) && (
            <p className="muted mt-1 text-xs">
              {settings.phone && `Tel: ${formatPhone(settings.phone)}`}
              {settings.phone && settings.whatsapp && " · "}
              {settings.whatsapp && `WhatsApp: ${formatPhone(settings.whatsapp)}`}
            </p>
          )}
        </header>

        <div className="border-b border-dashed py-4 text-center">
          <p className="text-xs font-semibold tracking-widest uppercase">Comprovante de pedido</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums">
            #{String(order.number).padStart(6, "0")}
          </p>
          <p className="muted mt-1 text-xs">{formatDateTime(order.createdAt)}</p>
        </div>

        {/* O horário combinado é o dado mais importante do comprovante:
            é por ele que a cozinha separa e o cliente confere. */}
        {order.scheduledFor && (
          <div className="border-b border-dashed py-3 text-center">
            <p className="text-xs font-semibold tracking-widest uppercase">
              {order.deliveryType === "PICKUP" ? "Retirar às" : "Entregar às"}
            </p>
            <p className="text-2xl font-extrabold tabular-nums">
              {formatTime(order.scheduledFor)}
            </p>
            <p className="muted text-xs">{formatDate(order.scheduledFor)}</p>
          </div>
        )}

        {/* -------------------------------- itens --------------------------- */}
        <section className="border-b border-dashed py-4">
          <h2 className="mb-3 text-xs font-bold tracking-widest uppercase">Produtos</h2>
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Quantidade</th>
                <th scope="col">Preço unitário</th>
                <th scope="col">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="py-1.5">
                    <span className="font-medium tabular-nums">{item.quantity} × </span>
                    {item.productNameSnapshot}
                    <span className="muted block text-xs">
                      {formatCents(item.unitPriceCents)} cada
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">
                    {formatCents(item.subtotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ------------------------------- valores -------------------------- */}
        <section className="border-b border-dashed py-4">
          <dl className="space-y-1.5 text-sm">
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
                <dt className="muted">
                  Desconto{order.couponCode ? ` (${order.couponCode})` : ""}
                </dt>
                <dd className="tabular-nums">− {formatCents(order.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-base font-extrabold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
            </div>
            {changeDue !== null && changeDue >= 0 && (
              <>
                <div className="flex justify-between pt-1">
                  <dt className="muted">Cliente paga com</dt>
                  <dd className="tabular-nums">{formatCents(order.changeForCents ?? 0)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Troco</dt>
                  <dd className="tabular-nums">{formatCents(changeDue)}</dd>
                </div>
              </>
            )}
          </dl>
        </section>

        {/* ------------------------------ pagamento ------------------------- */}
        <section className="border-b border-dashed py-4 text-sm">
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-4">
              <dt className="muted">Pagamento</dt>
              <dd className="font-semibold">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="muted">Status do pagamento</dt>
              <dd className="font-semibold">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</dd>
            </div>
            {order.paidAt && (
              <div className="flex justify-between gap-4">
                <dt className="muted">Pago em</dt>
                <dd>{formatDateTime(order.paidAt)}</dd>
              </div>
            )}
            {payment?.provider && payment.provider !== "manual" && (
              <div className="flex justify-between gap-4">
                <dt className="muted">Processado por</dt>
                <dd className="capitalize">{payment.provider}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="muted">Status do pedido</dt>
              <dd className="font-semibold">{ORDER_STATUS_LABEL[order.status]}</dd>
            </div>
          </dl>
        </section>

        {/* -------------------------------- cliente ------------------------- */}
        <section className="border-b border-dashed py-4 text-sm">
          <h2 className="mb-2 text-xs font-bold tracking-widest uppercase">Cliente</h2>
          <p className="font-medium">{order.customerName}</p>
          <p className="muted">{formatPhone(order.customerPhone)}</p>
          <p className="muted mt-2">
            <strong className="font-semibold">{DELIVERY_TYPE_LABEL[order.deliveryType]}</strong>
            {address && <> — {formatAddress(address)}</>}
          </p>
          {address?.reference && <p className="muted">Referência: {address.reference}</p>}
          {order.notes && (
            <p className="mt-2">
              <strong className="font-semibold">Observações:</strong> {order.notes}
            </p>
          )}
        </section>

        <footer className="muted pt-4 text-center text-xs">
          <p>Obrigado pela preferência!</p>
          <p className="mt-1">
            Emitido em {formatDateTime(new Date())} · Documento não fiscal
          </p>
        </footer>
      </article>
    </div>
  );
}
