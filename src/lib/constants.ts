import type { OrderStatus, PaymentMethod, PaymentStatus, DeliveryType } from "@prisma/client";

/** Tons usados nos selos de status (ver Badge em components/ui). */
export type StatusTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export const APP_NAME = "DS Espetos";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "Aguardando pagamento",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  SCHEDULED: "Agendado",
  RECEIVED: "Pedido recebido",
  PREPARING: "Em preparação",
  READY: "Pronto para retirada",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  DELIVERED: "Entregue",
  PICKED_UP: "Retirado",
  CANCELLED: "Cancelado",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  // "Pagamento pendente", e não "Aguardando pagamento": este último é o
  // rótulo do STATUS DO PEDIDO, e ver os dois textos idênticos lado a lado
  // parecia falha de renderização.
  PENDING: "Pagamento pendente",
  PAID: "Pago",
  FAILED: "Falhou",
  REFUNDED: "Reembolsado",
  CANCELLED: "Cancelado",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: "PIX",
  CARD: "Cartão",
  CASH: "Dinheiro",
};

export const DELIVERY_TYPE_LABEL: Record<DeliveryType, string> = {
  DELIVERY: "Entrega",
  PICKUP: "Retirada no estabelecimento",
};

/**
 * Ordem de exibição da linha do tempo.
 *
 * PICKUP_FLOW é o fluxo do agendamento, que é como a loja opera hoje:
 * o pedido fica "Agendado" até chegar a hora de ir para a chapa.
 * DELIVERY_FLOW permanece para o dia em que a entrega for ligada.
 */
export const PICKUP_FLOW: OrderStatus[] = [
  "AWAITING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "SCHEDULED",
  "PREPARING",
  "READY",
  "PICKED_UP",
];

export const DELIVERY_FLOW: OrderStatus[] = [
  "AWAITING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "SCHEDULED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export const FINAL_STATUSES: OrderStatus[] = ["DELIVERED", "PICKED_UP", "CANCELLED"];

export const WEEKDAY_LABEL = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/**
 * Cor do selo de cada status do pedido.
 *
 * Vive aqui, e não no componente de status, porque tanto Server Components
 * (o dashboard do admin) quanto Client Components precisam chamá-la — e uma
 * função exportada de um módulo "use client" não pode ser executada no
 * servidor.
 */
export function statusTone(status: OrderStatus): StatusTone {
  switch (status) {
    case "AWAITING_PAYMENT":
      return "warning";
    case "PAYMENT_CONFIRMED":
    case "SCHEDULED":
    case "RECEIVED":
      return "info";
    case "PREPARING":
      return "brand";
    case "READY":
    case "OUT_FOR_DELIVERY":
      return "info";
    case "DELIVERED":
    case "PICKED_UP":
      return "success";
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}

/**
 * Cores dos gráficos do painel.
 *
 * Definidas aqui (módulo neutro) e não no componente de gráficos porque
 * `charts.tsx` é "use client": constantes exportadas de um módulo cliente
 * chegam como `undefined` quando um Server Component as importa — foi
 * exatamente o que fazia a rosca do dashboard sair sem cor.
 *
 * Os três tons se distinguem também em escala de cinza (luminâncias
 * diferentes), então o gráfico continua legível impresso em preto e branco.
 */
export const CHART_COLORS = {
  pix: "#e05320",
  card: "#3f7d9e",
  cash: "#4f9d69",
} as const;
