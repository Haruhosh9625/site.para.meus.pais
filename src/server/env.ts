/**
 * Leitura centralizada das variáveis de ambiente.
 *
 * Nenhum segredo (chave de gateway, secret de webhook, senha do banco)
 * aparece em código: tudo vem daqui, e este módulo só é importado
 * por código de servidor. Arquivos com "use client" nunca o alcançam.
 */

function required(name: string, fallbackInDev?: string): string {
  const value = process.env[name];
  if (value && value.trim() !== "") return value;
  if (process.env.NODE_ENV !== "production" && fallbackInDev !== undefined) {
    return fallbackInDev;
  }
  throw new Error(
    `Variável de ambiente obrigatória ausente: ${name}. Configure-a no .env (veja .env.example).`,
  );
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  get isProduction() {
    return this.nodeEnv === "production";
  },

  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get sessionSecret() {
    return required("SESSION_SECRET", "dev-only-session-secret-change-me");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3000").replace(/\/+$/, "");
  },

  /** Duração da sessão em dias. */
  get sessionDays() {
    return optionalNumber("SESSION_TTL_DAYS", 30);
  },

  /** Gateway ativo: manual | mercadopago | stripe | asaas | pagbank */
  get paymentProvider() {
    return optional("PAYMENT_PROVIDER", "manual").toLowerCase();
  },

  mercadopago: {
    get accessToken() {
      return optional("MERCADOPAGO_ACCESS_TOKEN");
    },
    get webhookSecret() {
      return optional("MERCADOPAGO_WEBHOOK_SECRET");
    },
  },
  stripe: {
    get secretKey() {
      return optional("STRIPE_SECRET_KEY");
    },
    get webhookSecret() {
      return optional("STRIPE_WEBHOOK_SECRET");
    },
  },
  asaas: {
    get apiKey() {
      return optional("ASAAS_API_KEY");
    },
    get webhookToken() {
      return optional("ASAAS_WEBHOOK_TOKEN");
    },
    get baseUrl() {
      return optional("ASAAS_BASE_URL", "https://api.asaas.com/v3");
    },
  },
  pagbank: {
    get token() {
      return optional("PAGBANK_TOKEN");
    },
    get webhookToken() {
      return optional("PAGBANK_WEBHOOK_TOKEN");
    },
    get baseUrl() {
      return optional("PAGBANK_BASE_URL", "https://api.pagseguro.com");
    },
  },

  /** Segredo compartilhado que autentica o webhook do provedor "manual". */
  get manualWebhookSecret() {
    return optional("MANUAL_WEBHOOK_SECRET");
  },

  /** Chave PIX estática usada pelo provedor "manual" (pagamento fora do gateway). */
  get pixKey() {
    return optional("PIX_KEY");
  },
  get pixReceiverName() {
    return optional("PIX_RECEIVER_NAME", "DS ESPETOS");
  },
  get pixReceiverCity() {
    return optional("PIX_RECEIVER_CITY", "SAO PAULO");
  },

  seedAdmin: {
    get email() {
      return optional("SEED_ADMIN_EMAIL");
    },
    get password() {
      return optional("SEED_ADMIN_PASSWORD");
    },
    get name() {
      return optional("SEED_ADMIN_NAME", "Administrador");
    },
    get phone() {
      return optional("SEED_ADMIN_PHONE", "00000000000");
    },
  },

  /** Diretório onde as imagens enviadas pelo admin são gravadas. */
  get uploadDir() {
    return optional("UPLOAD_DIR", "public/uploads");
  },
  get uploadsEnabled() {
    return optional("ENABLE_UPLOADS", "true") !== "false";
  },

  notifications: {
    get emailEnabled() {
      return optional("NOTIFY_EMAIL_ENABLED", "false") === "true";
    },
    get whatsappEnabled() {
      return optional("NOTIFY_WHATSAPP_ENABLED", "false") === "true";
    },
    get pushEnabled() {
      return optional("NOTIFY_PUSH_ENABLED", "false") === "true";
    },
    get webhookUrl() {
      return optional("NOTIFY_WEBHOOK_URL");
    },
  },
};
