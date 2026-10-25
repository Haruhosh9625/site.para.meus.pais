import { env } from "../env";
import { logger } from "../logger";
import { localIdentity } from "./local";
import { supabaseIdentity } from "./supabase";
import type { IdentityProvider } from "./types";

export type { IdentityProvider, IdentityRef, SessionUser } from "./types";
export { SESSION_COOKIE } from "./local";

const PROVIDERS: Record<"supabase" | "local", IdentityProvider> = {
  supabase: supabaseIdentity,
  local: localIdentity,
};

/**
 * Provedor de identidade em uso.
 *
 * Escolhido por AUTH_PROVIDER (ou deduzido da presença das variáveis do
 * Supabase). Nenhuma rota conhece o provedor: todas chamam esta função.
 */
export function getIdentityProvider(): IdentityProvider {
  // Conferido a cada uso, e não no carregamento do módulo: durante o
  // `next build` as variáveis do ambiente de produção ainda não existem, e
  // uma verificação no topo do arquivo quebraria a compilação.
  assertAuthProviderSane();

  const provider = PROVIDERS[env.authProvider];

  if (provider.id === "supabase" && !provider.isConfigured()) {
    throw new Error(
      "AUTH_PROVIDER=supabase mas faltam credenciais. Defina SUPABASE_URL e " +
        "SUPABASE_PUBLISHABLE_KEY no ambiente (veja .env.example).",
    );
  }

  return provider;
}

/**
 * Impede o pior acidente de deploy: subir em produção com a autenticação
 * local sem ter pedido isso.
 *
 * Se as variáveis do Supabase forem esquecidas no provedor de hospedagem, o
 * padrão cairia silenciosamente para o provedor local — e o sistema
 * continuaria "funcionando", com as senhas voltando para este banco. Melhor
 * derrubar o processo com uma mensagem clara.
 */
export function assertAuthProviderSane() {
  if (!env.isProduction) return;
  if (env.authProvider !== "local") return;
  if (env.authProviderDeclared === "local") {
    logger.warn("auth:local_provider_in_production", {
      message: "AUTH_PROVIDER=local em produção: as senhas ficam neste banco.",
    });
    return;
  }
  throw new Error(
    "Em produção a autenticação não cai para o provedor local por descuido. " +
      "Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY, ou declare " +
      "AUTH_PROVIDER=local de propósito.",
  );
}

/** Nomes dos cookies que indicam "existe sessão" — usado pelo middleware. */
export function sessionCookiePrefixes(): string[] {
  if (env.authProvider === "supabase") {
    const ref = env.supabase.projectRef;
    // @supabase/ssr grava sb-<ref>-auth-token (e .0/.1 quando o valor é grande).
    return ref ? [`sb-${ref}-auth-token`] : ["sb-"];
  }
  return ["ds_session"];
}
