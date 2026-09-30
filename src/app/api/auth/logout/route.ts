import { route, ok } from "@/server/api";
import { assertCsrf, destroyCurrentSession, getCurrentUser } from "@/server/auth";
import { audit } from "@/server/audit";

export const POST = route(async () => {
  await assertCsrf();
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) await audit({ action: "auth.logout", userId: user.id });
  return ok({ loggedOut: true });
});
