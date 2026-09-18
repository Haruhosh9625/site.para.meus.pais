import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { issueCsrfToken, CSRF_COOKIE } from "@/server/csrf";

/**
 * Middleware: três tarefas, todas leves.
 *
 * 1. Renova o token do Supabase Auth. O access token dura cerca de uma hora;
 *    só as rotas que podem escrever cookies conseguem renová-lo, e o
 *    middleware é a única que roda em TODA requisição. Sem isto a pessoa
 *    seria deslogada sozinha depois de um tempo navegando.
 *
 * 2. Emite o cookie de CSRF quando falta. O token é assinado (HMAC com o
 *    SESSION_SECRET) e o navegador o reenvia no cabeçalho x-csrf-token.
 *
 * 3. Redireciona /admin sem sessão para o login, com um 307 de verdade,
 *    sem nem renderizar a página.
 *
 * ATENÇÃO — o item 3 NÃO é a autorização do sistema. O middleware só olha se
 * o cookie existe; não valida a sessão nem o papel do usuário. Quem
 * realmente protege são:
 *   - src/app/admin/layout.tsx  → confere a sessão e exige role ADMIN;
 *   - requireAdmin() em cada rota /api/admin/* → onde os dados de fato estão.
 * Um cookie forjado passa por aqui e é barrado nas duas camadas seguintes.
 */

/** Prefixos de cookie que indicam "existe sessão", por provedor. */
function temCookieDeSessao(request: NextRequest): boolean {
  if (request.cookies.has("ds_session")) return true;
  // @supabase/ssr grava sb-<ref>-auth-token (e .0/.1 em valores grandes).
  return request.cookies.getAll().some((cookie) => /^sb-.*-auth-token/.test(cookie.name));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // ------------------------- 1. renova a sessão ----------------------------
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim() || "";

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          for (const cookie of list) request.cookies.set(cookie.name, cookie.value);
          response = NextResponse.next({ request });
          for (const cookie of list) {
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          }
        },
      },
    });
    // A chamada é o que dispara a renovação; o resultado não é usado aqui.
    await supabase.auth.getUser().catch(() => undefined);
  }

  // --------------------------- 2. cookie de CSRF ---------------------------
  if (!request.cookies.has(CSRF_COOKIE)) {
    response.cookies.set(CSRF_COOKIE, await issueCsrfToken(), {
      // Legível por JavaScript de propósito: o front precisa reenviá-lo no
      // cabeçalho (padrão double-submit).
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }

  // ------------------------ 3. porta do painel -----------------------------
  if (request.nextUrl.pathname.startsWith("/admin") && !temCookieDeSessao(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirect=${encodeURIComponent(request.nextUrl.pathname)}`;
    const redirect = NextResponse.redirect(url, 307);
    // Leva o cookie de CSRF junto: a tela de login precisa dele.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  /*
    Roda em tudo, menos arquivos estáticos e imagens — o cookie de CSRF e a
    renovação da sessão precisam alcançar qualquer navegação.
  */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|produtos/|uploads/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
