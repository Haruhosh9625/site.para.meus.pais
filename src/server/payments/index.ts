import { env } from "../env";
import type { PaymentProvider } from "./types";
import { manualProvider } from "./providers/manual";
import { mercadoPagoProvider } from "./providers/mercadopago";
import { stripeProvider } from "./providers/stripe";
import { asaasProvider } from "./providers/asaas";
import { pagBankProvider } from "./providers/pagbank";

/**
 * Registro de gateways. Adicionar um novo é: implementar `PaymentProvider`
 * e incluí-lo neste mapa. Nenhuma rota ou tela precisa mudar.
 */
const PROVIDERS: Record<string, PaymentProvider> = {
  manual: manualProvider,
  mercadopago: mercadoPagoProvider,
  stripe: stripeProvider,
  asaas: asaasProvider,
  pagbank: pagBankProvider,
};

export function getProvider(id?: string): PaymentProvider {
  const key = (id ?? env.paymentProvider).toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(
      `Gateway de pagamento desconhecido: "${key}". ` +
        `Valores aceitos em PAYMENT_PROVIDER: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }
  return provider;
}

export function getActiveProvider(): PaymentProvider {
  return getProvider(env.paymentProvider);
}

export function listProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.isConfigured(),
    active: p.id === env.paymentProvider,
  }));
}

export * from "./types";
