import { NextResponse, type NextRequest } from "next/server";

/**
 * Primeiro filtro das rotas administrativas.
 *
 * Sem cookie de sessão não há o que checar no banco: já devolvemos um
 * redirecionamento HTTP 307 de verdade para /login, sem nem renderizar a
 * página. É mais rápido e não depende de JavaScript no navegador.
 *
 * ATENÇÃO — isto NÃO é a autorização do sistema. O middleware só olha se o
 * cookie existe; ele não valida a sessão nem o papel do usuário. Quem
 * realmente protege são:
 *   - src/app/admin/layout.tsx  → confere a sessão e exige role ADMIN;
 *   - requireAdmin() em cada rota /api/admin/* → onde os dados de fato estão.
 * Um cookie forjado passa por aqui e é barrado nas duas camadas seguintes.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has("ds_session");

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirect=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(url, 307);
  }

  return NextResponse.next();
}

export const config = {
  // Só as páginas do painel. As rotas /api/admin/* têm a própria checagem,
  // que devolve 401/403 em JSON em vez de redirecionar.
  matcher: ["/admin", "/admin/:path*"],
};
