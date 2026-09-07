import { prisma } from "@/server/db";
import { route, readJson, ok } from "@/server/api";
import { assertCsrf, requireUser } from "@/server/auth";

/** Notificações internas do cliente. */
export const GET = route(async () => {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true, title: true, body: true, event: true,
      orderId: true, readAt: true, createdAt: true,
    },
  });
  const unread = notifications.filter((n) => !n.readAt).length;
  return ok({ notifications, unread });
});

/** Marca notificações como lidas. */
export const POST = route(async (request: Request) => {
  await assertCsrf();
  const user = await requireUser();
  const body = (await readJson(request)) as { ids?: string[]; all?: boolean };

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      readAt: null,
      ...(body.all ? {} : { id: { in: Array.isArray(body.ids) ? body.ids.slice(0, 100) : [] } }),
    },
    data: { readAt: new Date() },
  });

  return ok({ updated: true });
});

export const dynamic = "force-dynamic";
