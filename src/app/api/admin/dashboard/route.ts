import { route, ok } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { getDashboardMetrics } from "@/server/services/analytics";

export const GET = route(async () => {
  await requireAdmin();
  return ok({ metrics: await getDashboardMetrics() });
});

export const dynamic = "force-dynamic";
