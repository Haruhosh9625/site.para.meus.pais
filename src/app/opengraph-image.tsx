import { ImageResponse } from "next/og";
import { getPublicSettings } from "@/server/services/settings";

/**
 * Imagem de compartilhamento (Open Graph).
 *
 * É a figura que aparece quando alguém manda o link no WhatsApp, no
 * Instagram ou no Facebook — para uma espetaria, é praticamente a vitrine.
 * O site não tinha nenhuma: o link saía como um retângulo cinza.
 *
 * Desenhada em código, e não como PNG solto, por dois motivos:
 *   • acompanha as configurações — o nome da loja e o preço do espeto mais
 *     barato saem do banco, então a figura nunca fica desatualizada;
 *   • não há arquivo de imagem para alguém esquecer de trocar.
 *
 * Roda no runtime Node (e não no Edge) porque lê o banco pelo Prisma.
 */
export const runtime = "nodejs";
export const alt = "DS Espetos — espeto na brasa, do jeito certo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const settings = await getPublicSettings().catch(() => null);
  const nome = settings?.storeName ?? "DS Espetos";
  const agendado = settings ? !settings.allowDelivery : true;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#0a0a0d",
          // A mesma leitura do herói do site: brasa subindo da base, calor
          // batendo à esquerda, um respiro frio à direita.
          backgroundImage: [
            "radial-gradient(80% 55% at 50% 100%, rgba(249,115,22,0.6), transparent 72%)",
            "radial-gradient(46% 55% at 0% 4%, rgba(245,179,1,0.38), transparent 68%)",
            "radial-gradient(40% 46% at 100% 12%, rgba(99,102,241,0.18), transparent 72%)",
          ].join(","),
          color: "#f7f5f3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              backgroundColor: "#f5b301",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              // Letras, não emoji: o gerador de imagem do Next não embarca
              // fonte de emoji, e o 🔥 saía como um círculo vazio.
              fontSize: 24,
              fontWeight: 800,
              color: "#1b1714",
              letterSpacing: 1,
            }}
          >
            DS
          </div>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 6 }}>
            {nome.toUpperCase()}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 104, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>
            ESPETO NA BRASA,
          </span>
          <span
            style={{
              fontSize: 104,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: -2,
              color: "#fbbf24",
            }}
          >
            DO JEITO CERTO.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30 }}>
          {["Todos os espetos a R$ 8,00", agendado ? "Retirada agendada" : "Entrega e retirada", "Pague com PIX"].map(
            (texto, i) => (
              <div key={texto} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {i > 0 && <span style={{ color: "#f5b301" }}>·</span>}
                <span style={{ color: "#d3ccc4" }}>{texto}</span>
              </div>
            ),
          )}
        </div>
      </div>
    ),
    size,
  );
}
