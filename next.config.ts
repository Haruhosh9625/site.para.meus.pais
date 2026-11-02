import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança aplicados a todas as respostas.
 * A CSP é restritiva: nada de scripts externos, nada de eval.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client"],
  /*
    A rota de upload grava em `resolve(process.cwd(), UPLOAD_DIR)`, com o
    diretório vindo do ambiente. Sem saber o caminho, o rastreador de
    arquivos do Next.js inclui o projeto inteiro no pacote dessa função:
    .git, as skills do agente, o código-fonte e até arquivos que o próprio
    build apaga no fim, como .next/export-detail.json.

    Esse último derrubava o deploy na Vercel. O build terminava bem, e o
    empacotamento quebrava com "ENOENT: lstat .next/export-detail.json",
    porque a Vercel confere cada arquivo rastreado e ele já não existia.

    A rota não precisa de nada disto em tempo de execução: só do próprio
    código compilado e das dependências, que continuam incluídos.
  */
  outputFileTracingExcludes: {
    "/api/admin/uploads": [
      "./.git/**/*",
      "./.claude/**/*",
      "./src/**/*",
      "./scripts/**/*",
      "./prisma/**/*",
      "./skills-lock.json",
      "./.next/static/**/*",
      "./.next/cache/**/*",
      "./.next/types/**/*",
      "./.next/diagnostics/**/*",
      "./.next/export-detail.json",
      "./.next/lock",
      "./.next/trace",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
