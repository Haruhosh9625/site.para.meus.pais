import { BottomNav, SiteFooter, SiteHeader } from "@/components/site/navigation";

/**
 * Layout das páginas do cliente.
 * A barra inferior só aparece no celular; no desktop a navegação fica no topo.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="conteudo" className="flex-1 pb-20 md:pb-0">
        {children}
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
