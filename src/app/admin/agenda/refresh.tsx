"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Recarrega a agenda sozinha.
 *
 * Esta é a tela que fica aberta no balcão durante o expediente: se um pedido
 * novo entra e a página não se atualiza, a cozinha só descobre quando o
 * cliente chega. Recarrega a cada 30 segundos e imediatamente quando alguém
 * volta para a aba.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), seconds * 1000);
    const onFocus = () => router.refresh();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, seconds]);

  return null;
}
