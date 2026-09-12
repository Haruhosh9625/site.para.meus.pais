import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { logger } from "../logger";
import { badRequest, conflict, unauthorized } from "../errors";
import type { IdentityProvider, IdentityRef, RegisterInput, RegisterResult } from "./types";

/**
 * Provedor Supabase Auth.
 *
 * O Supabase guarda a credencial (e faz o hash), emite o JWT da sessão em
 * cookies e envia os e-mails de confirmação e de redefinição de senha. Esta
 * aplicação nunca vê nem guarda a senha.
 *
 * Duas escolhas importantes:
 *
 *  • Tudo passa pelas NOSSAS rotas (/api/auth/*), e não direto do navegador
 *    para o Supabase. É o que mantém em pé o limite de tentativas, o log de
 *    auditoria e a criação da linha de `users` na mesma requisição.
 *  • Só a chave PUBLICÁVEL (anon) é usada. A chave de serviço não é
 *    necessária para nenhum destes fluxos e por isso nem é lida aqui —
 *    menos segredo em circulação, menos risco.
 */

type MutableCookie = { name: string; value: string; options: CookieOptions };

async function createClient(): Promise<SupabaseClient> {
  const store = await cookies();

  return createServerClient(env.supabase.url, env.supabase.publishableKey, {
    cookies: {
      getAll() {
        return store.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(list: MutableCookie[]) {
        try {
          for (const cookie of list) {
            store.set(cookie.name, cookie.value, {
              ...cookie.options,
              // Em HTTP local o navegador descartaria um cookie `secure`.
              secure: env.isProduction,
              sameSite: "lax",
              path: "/",
            });
          }
        } catch {
          /*
            Server Components não podem escrever cookies. Ignorar aqui é o
            padrão recomendado: a renovação do token acontece no middleware
            e nas rotas de API, que podem escrever. Sem este try/catch, ler
            o usuário em uma página derrubaria a página.
          */
        }
      },
    },
  });
}

/** Traduz os erros do Supabase para mensagens que o cliente entende. */
function traduzir(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.";
  }
  if (m.includes("password") && m.includes("should be at least")) {
    return "A senha é curta demais para a política do provedor de identidade.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  if (m.includes("expired") || m.includes("invalid") || m.includes("not found")) {
    return "Este link é inválido ou expirou. Solicite um novo.";
  }
  return "Não foi possível concluir a operação de login. Tente novamente.";
}

export const supabaseIdentity: IdentityProvider = {
  id: "supabase",
  label: "Supabase Auth",

  isConfigured: () => Boolean(env.supabase.url && env.supabase.publishableKey),

  async register(input: RegisterInput): Promise<RegisterResult> {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        // Guardado no próprio Supabase para que a linha de `users` possa ser
        // recriada se alguém entrar sem tê-la (ver auth.ts).
        data: { name: input.name, phone: input.phone },
        emailRedirectTo: `${env.appUrl}/login`,
      },
    });

    if (error) {
      logger.warn("supabase:signup_failed", { code: error.code ?? error.status });
      const traduzido = traduzir(error.message);
      throw traduzido.startsWith("Já existe") ? conflict(traduzido) : badRequest(traduzido);
    }
    if (!data.user) throw badRequest("O provedor de identidade não devolveu o usuário.");

    return {
      authId: data.user.id,
      // Sem sessão na resposta = o projeto exige confirmação de e-mail.
      needsEmailConfirmation: data.session === null,
    };
  },

  async startSession() {
    /* O signUp já gravou os cookies quando não há confirmação pendente. */
  },

  async signIn({ email, password }) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      logger.info("supabase:signin_failed", { code: error.code ?? error.status });
      throw unauthorized(traduzir(error.message));
    }
    if (!data.user) throw unauthorized("E-mail ou senha incorretos.");

    return { authId: data.user.id };
  },

  async signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  },

  async signOutEverywhere() {
    const supabase = await createClient();
    // "global" invalida os refresh tokens de todos os aparelhos.
    await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
  },

  async current(): Promise<IdentityRef | null> {
    const supabase = await createClient();
    // getUser (e não getSession) porque este valida o JWT junto ao servidor
    // do Supabase: um cookie adulterado não passa daqui.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) return null;
    return { authId: data.user.id, email: data.user.email };
  },

  async requestPasswordReset({ email }) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${env.appUrl}/redefinir-senha`,
    });
    // A resposta ao cliente é sempre a mesma, exista a conta ou não: quem
    // chama esta função não deve diferenciar. Só registramos a falha.
    if (error) logger.warn("supabase:reset_request_failed", { code: error.code ?? error.status });
    // O e-mail sai do Supabase; não há link para a aplicação entregar.
    return {};
  },

  async resetPassword({ token, password }) {
    const supabase = await createClient();

    // O link do e-mail volta com um `code` (fluxo PKCE). Trocá-lo por uma
    // sessão é o que autoriza a troca de senha em seguida.
    const { data: sessao, error: erroTroca } = await supabase.auth.exchangeCodeForSession(token);
    if (erroTroca || !sessao.user) {
      throw badRequest("Este link de redefinição é inválido ou expirou. Solicite um novo.");
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw badRequest(traduzir(error.message));

    return { authId: sessao.user.id };
  },

  async changePassword({ email, currentPassword, newPassword }) {
    const supabase = await createClient();

    // O Supabase não tem "confira esta senha": reautenticar é o jeito de
    // provar que quem está trocando sabe a senha atual. Sem isso, uma sessão
    // roubada trocaria a senha sozinha.
    const { error: erroSenha } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (erroSenha) throw badRequest("A senha atual está incorreta.");

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw badRequest(traduzir(error.message));
  },

  async updateEmail({ email }) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.updateUser({ email });
    if (error) throw badRequest(traduzir(error.message));

    // Quando o projeto exige confirmação, o endereço só muda depois que a
    // pessoa clica no link. Até então o e-mail do perfil NÃO pode mudar,
    // senão o login pararia de funcionar.
    const applied = data.user?.email?.toLowerCase() === email.toLowerCase();
    return { applied };
  },
};
