import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getPublicSettings, type PublicSettings } from "@/server/services/settings";
import { logger } from "@/server/logger";

export const metadata: Metadata = {
  title: {
    default: "DS Espetos — Espetos na brasa, peça pelo site",
    template: "%s | DS Espetos",
  },
  description:
    "Espetos de porco, carne, toscana, frango e frango com bacon direto da brasa. " +
    "Peça pelo celular, escolha entrega ou retirada e pague com PIX.",
  applicationName: "DS Espetos",
  formatDetection: { telephone: true },
  openGraph: {
    title: "DS Espetos",
    description: "Espetos na brasa, do jeito certo. Peça pelo site.",
    type: "website",
    locale: "pt_BR",
  },
  robots: { index: true, follow: true },
};

/**
 * O layout raiz lê o estado AO VIVO da loja (aberto/fechado, telefone,
 * endereço, horários) do banco. Sem isto, o Next pré-renderiza no build as
 * páginas que são Client Components — /carrinho, /checkout, /login,
 * /minha-conta… — e congela esse estado no HTML.
 *
 * O sintoma era grave: a home dizia "Aberto agora" e o carrinho, aberto
 * segundos depois, dizia "FECHADO" — com o botão de finalizar desabilitado,
 * matando o pedido de um cliente real.
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1714" },
  ],
  width: "device-width",
  initialScale: 1,
  // Não bloqueia o zoom: quem precisa ampliar o texto tem que conseguir.
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // As configurações são lidas no servidor para a primeira pintura já sair
  // com o nome da loja e o estado aberto/fechado corretos.
  let settings: PublicSettings | null = null;
  try {
    settings = await getPublicSettings();
  } catch (error) {
    // Banco fora do ar não pode deixar a página em branco.
    logger.error("layout:settings_failed", { error: String(error) });
  }

  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">
        {/* Atalho para quem navega por teclado pular direto ao conteúdo. */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-coal-900"
        >
          Pular para o conteúdo
        </a>
        <Providers initialSettings={settings}>{children}</Providers>
      </body>
    </html>
  );
}
