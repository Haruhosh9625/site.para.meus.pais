/**
 * Leitura centralizada das variáveis de ambiente.
 *
 * Nenhum segredo (chave de gateway, secret de webhook, senha do banco)
 * aparece em código: tudo vem daqui, e este módulo só é importado
 * por código de servidor. Arquivos com "use client" nunca o alcançam.
 */

/**
 * Fuso horário da loja.
 *
 * O agendamento é todo feito em hora de balcão: "18:00" no horário de
 * funcionamento significa 18:00 na DS Espetos, não 18:00 UTC. Servidores de
 * nuvem rodam em UTC por padrão, e sem isto um expediente das 18:00 às 23:00
 * viraria 15:00 às 20:00 na prática — pedidos legítimos recusados e horário
 * fora do expediente aceito.
 *
 * Node aplica a mudança de verdade quando `process.env.TZ` é atribuído (o
 * setter chama tzset), e este módulo é o primeiro carregado por todo código
 * de servidor. Quem hospeda pode sobrescrever com a variável TZ.
 */
if (!process.env.TZ || process.env.TZ.trim() === "") {
  process.env.TZ = "America/Sao_Paulo";
}

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

  /** Fuso usado em todo cálculo de horário (agendamento, expediente). */
  get timezone() {
    return optional("TZ", "America/Sao_Paulo");
  },

  /** Duração da sessão em dias. */
  get sessionDays() {
    return optionalNumber("SESSION_TTL_DAYS", 30);
  },

  /**
   * Provedor de identidade: supabase | local
   *
   * Sem AUTH_PROVIDER declarado, o padrão é `supabase` quando as variáveis
   * do Supabase estão preenchidas e `local` quando não estão — assim o
   * desenvolvimento e o teste end-to-end rodam sem credencial externa.
   *
   * Em produção o provedor local só entra se AUTH_PROVIDER=local estiver
   * declarado explicitamente (ver `assertAuthProviderSane`). Uma variável
   * esquecida no deploy precisa falhar alto, não cair sozinha para a senha
   * guardada neste banco.
   */
  get authProvider(): "supabase" | "local" {
    const declarado = optional("AUTH_PROVIDER").toLowerCase();
    if (declarado === "supabase" || declarado === "local") return declarado;
    return this.supabase.url && this.supabase.publishableKey ? "supabase" : "local";
  },

  get authProviderDeclared() {
    return optional("AUTH_PROVIDER").toLowerCase();
  },

  supabase: {
    /** https://<ref>.supabase.co — painel > Project Settings > Data API */
    get url() {
      return optional("SUPABASE_URL").replace(/\/+$/, "");
    },
    /**
     * Chave publicável (ou a legada `anon`).
     *
     * É pública por natureza: em qualquer aplicação Supabase ela vai para o
     * navegador. Não confere permissão nenhuma por si — quem decide é o
     * RLS e, aqui, o papel guardado na tabela `users`.
     */
    get publishableKey() {
      return optional("SUPABASE_PUBLISHABLE_KEY") || optional("SUPABASE_ANON_KEY");
    },
    /** Referência do projeto, deduzida da URL. Usada para achar os cookies. */
    get projectRef() {
      const match = /^https?:\/\/([^.]+)\./.exec(this.url);
      return match?.[1] ?? "";
    },
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
