import { BottomNav, SiteFooter, SiteHeader } from "@/components/site/navigation";

/**
 * Layout das páginas do cliente.
 * A barra inferior só aparece no celular; no desktop a navegação fica no topo.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      {/*
        A barra do topo é `fixed`, então o conteúdo precisa reservar a altura
        dela (60px da pílula + 12px/16px de folga). Embaixo, o mesmo para a
        barra de navegação do celular.
      */}
      {/*
        `wash` põe uma lavagem quente de gradiente atrás de TODAS as telas
        do cliente. Não é enfeite: é o que o vidro dos painéis tem para
        desfocar. Sobre branco chapado, `backdrop-filter` não produz nada
        visível e os cartões pareceriam apenas translúcidos.
      */}
      <main id="conteudo" className="wash flex-1 pt-[4.5rem] pb-24 sm:pt-[5rem] md:pb-0">
        {children}
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
