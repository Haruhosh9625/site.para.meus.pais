import { NextResponse } from "next/server";
import { getProvider } from "@/server/payments";
import { processWebhookEvent } from "@/server/services/payments";
import { logger } from "@/server/logger";
import { enforceRateLimit } from "@/server/rate-limit";
import { getClientIp } from "@/server/auth";

type Params = { params: Promise<{ provider: string }> };

/**
 * Webhook de pagamento — a ÚNICA porta pela qual um pagamento é confirmado
 * automaticamente.
 *
 * Sequência, para cada evento recebido:
 *   1. valida a assinatura (HMAC ou token) com o segredo do .env;
 *   2. registra o evento (chave única provider+eventId) — reentrega não
 *      reprocessa nada;
 *   3. reconsulta o status no gateway (server-to-server) e compara o valor;
 *   4. só então marca o pedido como "Pagamento confirmado".
 *
 * A rota é pública por natureza, mas nada aqui confia no corpo recebido.
 *
 * URL a cadastrar no gateway:
 *   https://SEU-DOMINIO/api/webhooks/payments/{mercadopago|stripe|asaas|pagbank|manual}
 */
export async function POST(request: Request, { params }: Params) {
  const { provider: providerId } = await params;

  // Sem CSRF aqui de propósito: a chamada vem de servidor para servidor,
  // e a autenticidade é garantida pela assinatura, não por cookie.
  const rawBody = await request.text();

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return NextResponse.json({ ok: false, error: "Gateway desconhecido." }, { status: 404 });
  }

  const ip = await getClientIp();
  const limit = await enforceRateLimit(`webhook:${providerId}:${ip}`, 300, 60).catch(() => null);
  if (limit === null) {
    return NextResponse.json({ ok: false, error: "Rate limit." }, { status: 429 });
  }

  const verification = await provider.verifyWebhook(rawBody, request.headers);
  if (!verification.ok) {
    logger.warn("webhook:rejected", { provider: providerId, reason: verification.reason, ip });
    return NextResponse.json(
      { ok: false, error: verification.reason },
      { status: verification.status ?? 401 },
    );
  }

  try {
    const result = await processWebhookEvent({
      providerId,
      eventId: verification.eventId,
      eventType: verification.eventType,
      providerPaymentId: verification.providerPaymentId,
      payload: verification.payload,
    });

    logger.info("webhook:processed", {
      provider: providerId,
      eventType: verification.eventType,
      handled: result.handled,
      reason: result.reason,
    });

    // 200 mesmo quando não houve ação: o gateway não deve ficar reenviando.
    return NextResponse.json({ ok: true, handled: result.handled, message: result.reason });
  } catch (error) {
    logger.error("webhook:processing_failed", {
      provider: providerId,
      error: error instanceof Error ? error.message : String(error),
    });
    // 500 faz o gateway tentar de novo — o que é o comportamento desejado
    // para uma falha nossa (banco fora do ar, por exemplo).
    return NextResponse.json({ ok: false, error: "Falha ao processar." }, { status: 500 });
  }
}

/** Alguns gateways validam a URL com um GET antes de ativar o webhook. */
export async function GET() {
  return NextResponse.json({ ok: true, message: "Webhook ativo." });
}

export const dynamic = "force-dynamic";
