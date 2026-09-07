import type { NotificationChannel, OrderStatus } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { logger } from "../logger";

/**
 * Sistema de notificações.
 *
 * Hoje toda notificação é gravada no banco e aparece para o cliente dentro do
 * site (canal IN_APP). Os canais externos — WhatsApp, e-mail e push — já têm
 * o ponto de extensão pronto: basta implementar o `send` do adaptador
 * correspondente e ligar a variável de ambiente. Nada mais no sistema muda,
 * porque quem dispara os eventos só conhece `notifyOrderEvent`.
 */

export type NotificationPayload = {
  userId: string;
  orderId?: string | null;
  event: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export interface NotificationAdapter {
  channel: NotificationChannel;
  enabled(): boolean;
  send(payload: NotificationPayload & { to: { email: string; phone: string; name: string } }): Promise<void>;
}

/** Canal interno: a notificação já está no banco, nada mais a fazer. */
const inAppAdapter: NotificationAdapter = {
  channel: "IN_APP",
  enabled: () => true,
  async send() {
    /* persistido por `notify` */
  },
};

/**
 * E-mail. Para ativar: NOTIFY_EMAIL_ENABLED=true e implemente o envio aqui
 * (Resend, SendGrid, SES...). As credenciais devem vir de variáveis de
 * ambiente — nunca do código.
 */
const emailAdapter: NotificationAdapter = {
  channel: "EMAIL",
  enabled: () => env.notifications.emailEnabled,
  async send(payload) {
    throw new Error(
      `Canal de e-mail habilitado mas sem provedor configurado (destino: ${payload.to.email}). ` +
        "Implemente o envio em src/server/services/notifications.ts.",
    );
  },
};

/**
 * WhatsApp. Para ativar: NOTIFY_WHATSAPP_ENABLED=true e implemente a chamada
 * à API (Cloud API da Meta, Twilio, Z-API...).
 */
const whatsappAdapter: NotificationAdapter = {
  channel: "WHATSAPP",
  enabled: () => env.notifications.whatsappEnabled,
  async send(payload) {
    throw new Error(
      `Canal de WhatsApp habilitado mas sem provedor configurado (destino: ${payload.to.phone}). ` +
        "Implemente o envio em src/server/services/notifications.ts.",
    );
  },
};

/** Push (Web Push / FCM). Para ativar: NOTIFY_PUSH_ENABLED=true. */
const pushAdapter: NotificationAdapter = {
  channel: "PUSH",
  enabled: () => env.notifications.pushEnabled,
  async send() {
    throw new Error(
      "Canal de push habilitado mas sem provedor configurado. " +
        "Implemente o envio em src/server/services/notifications.ts.",
    );
  },
};

const adapters: NotificationAdapter[] = [inAppAdapter, emailAdapter, whatsappAdapter, pushAdapter];

/**
 * Grava a notificação e tenta despachá-la nos canais ativos.
 * Nunca lança: uma falha de notificação não pode derrubar um pedido.
 */
export async function notify(payload: NotificationPayload): Promise<void> {
  const user = await prisma.user
    .findUnique({
      where: { id: payload.userId },
      select: { email: true, phone: true, name: true },
    })
    .catch(() => null);

  for (const adapter of adapters) {
    const enabled = adapter.enabled();
    let record;
    try {
      record = await prisma.notification.create({
        data: {
          userId: payload.userId,
          orderId: payload.orderId ?? null,
          channel: adapter.channel,
          status: enabled ? "PENDING" : "SKIPPED",
          title: payload.title,
          body: payload.body,
          event: payload.event,
          sentAt: adapter.channel === "IN_APP" && enabled ? new Date() : null,
        },
      });
    } catch (error) {
      logger.warn("notification:persist_failed", { event: payload.event, error: String(error) });
      continue;
    }

    if (!enabled || adapter.channel === "IN_APP") {
      if (adapter.channel === "IN_APP") {
        await prisma.notification
          .update({ where: { id: record.id }, data: { status: "SENT" } })
          .catch(() => undefined);
      }
      continue;
    }

    try {
      await adapter.send({
        ...payload,
        to: {
          email: user?.email ?? "",
          phone: user?.phone ?? "",
          name: user?.name ?? "",
        },
      });
      await prisma.notification.update({
        where: { id: record.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("notification:send_failed", { channel: adapter.channel, event: payload.event });
      await prisma.notification
        .update({ where: { id: record.id }, data: { status: "FAILED", error: message.slice(0, 500) } })
        .catch(() => undefined);
    }
  }

  // Webhook genérico opcional: permite plugar qualquer automação externa.
  if (env.notifications.webhookUrl) {
    void fetch(env.notifications.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, at: new Date().toISOString() }),
    }).catch(() => undefined);
  }
}

/** Mensagens por status, na linguagem que o cliente vê. */
const STATUS_MESSAGE: Record<OrderStatus, { title: string; body: string }> = {
  AWAITING_PAYMENT: {
    title: "Pedido criado",
    body: "Seu pedido foi criado e está aguardando a confirmação do pagamento.",
  },
  PAYMENT_CONFIRMED: {
    title: "Pagamento confirmado",
    body: "Recebemos seu pagamento! Já vamos preparar seu pedido.",
  },
  RECEIVED: {
    title: "Pedido recebido",
    body: "A DS Espetos recebeu seu pedido e ele entrou na fila.",
  },
  PREPARING: {
    title: "Em preparação",
    body: "Seu pedido já está na chapa. Não vai demorar!",
  },
  READY: {
    title: "Pedido pronto",
    body: "Seu pedido está pronto.",
  },
  OUT_FOR_DELIVERY: {
    title: "Saiu para entrega",
    body: "Seu pedido saiu para entrega e chega logo.",
  },
  DELIVERED: {
    title: "Pedido entregue",
    body: "Pedido entregue. Obrigado por escolher a DS Espetos!",
  },
  PICKED_UP: {
    title: "Pedido retirado",
    body: "Pedido retirado. Obrigado por escolher a DS Espetos!",
  },
  CANCELLED: {
    title: "Pedido cancelado",
    body: "Seu pedido foi cancelado. Em caso de dúvida, fale com a gente.",
  },
};

/** Notifica o cliente sobre uma mudança de status do pedido. */
export async function notifyOrderStatus(params: {
  userId: string;
  orderId: string;
  orderNumber: number;
  status: OrderStatus;
}) {
  const message = STATUS_MESSAGE[params.status];
  await notify({
    userId: params.userId,
    orderId: params.orderId,
    event: `order.status.${params.status}`,
    title: `Pedido #${String(params.orderNumber).padStart(6, "0")} — ${message.title}`,
    body: message.body,
  });
}
