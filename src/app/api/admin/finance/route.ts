import { route, ok } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { getFinanceReport } from "@/server/services/analytics";
import { resolvePeriod, type PeriodKey } from "@/server/services/admin-filters";

export const GET = route(async (request: Request) => {
  await requireAdmin();
  const url = new URL(request.url);
  const period = (url.searchParams.get("period") ?? "today") as PeriodKey;
  const range = resolvePeriod(period, url.searchParams.get("from"), url.searchParams.get("to"));

  const report = await getFinanceReport({ gte: range.gte, lte: range.lte });
  return ok({ report, period, label: range.label });
});

export const dynamic = "force-dynamic";
