import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { AdminShell } from "@/components/admin/shell";

export const dynamic = "force-dynamic";

/**
 * Portão do painel administrativo.
 *
 * Esta checagem no servidor é a primeira camada: quem não é ADMIN nunca
 * recebe o HTML do painel. A segunda camada está em cada rota de API
 * (`requireAdmin()`), que é a que realmente protege os dados — esconder o
 * menu não protegeria nada sozinho.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect("/login?redirect=/admin");
  if (user.role !== "ADMIN") redirect("/");

  return <AdminShell userName={user.name}>{children}</AdminShell>;
}
