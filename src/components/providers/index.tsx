"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, errorMessage } from "@/lib/api-client";
import type { PublicSettings } from "@/server/services/settings";

/* ==========================================================================
   Sessão
   ========================================================================== */

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "CUSTOMER" | "ADMIN";
  createdAt: string;
};

type SessionContextValue = {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: CurrentUser | null }>("/api/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    window.location.href = "/";
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession precisa estar dentro de <Providers>");
  return context;
}

/* ==========================================================================
   Configurações da loja
   ========================================================================== */

const SettingsContext = createContext<{ settings: PublicSettings | null; reload: () => void }>({
  settings: null,
  reload: () => undefined,
});

function StoreSettingsProvider({
  initialSettings,
  children,
}: {
  initialSettings: PublicSettings | null;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState<PublicSettings | null>(initialSettings);

  const reload = useCallback(() => {
    void api<{ settings: PublicSettings }>("/api/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => undefined);
  }, []);

  /**
   * Revalida quando a pessoa volta para a aba.
   *
   * Alguém pode montar o carrinho às 22h50, deixar o celular de lado e voltar
   * às 23h10 — quando a loja já fechou. Sem isto, a tela continuaria dizendo
   * "Aberto agora" e o pedido só falharia no envio.
   */
  useEffect(() => {
    const revalidar = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", revalidar);
    window.addEventListener("focus", revalidar);
    return () => {
      document.removeEventListener("visibilitychange", revalidar);
      window.removeEventListener("focus", revalidar);
    };
  }, [reload]);

  const value = useMemo(() => ({ settings, reload }), [settings, reload]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useStoreSettings() {
  return useContext(SettingsContext);
}

/* ==========================================================================
   Carrinho

   O navegador guarda apenas { productId, quantity } no localStorage.
   Nenhum preço vive aqui: os valores exibidos vêm sempre de /api/cart/quote,
   calculados no servidor. Se alguém editar o localStorage, o máximo que
   consegue é mudar a quantidade — o preço continua sendo o do banco.
   ========================================================================== */

export type CartItem = { productId: string; quantity: number };

export type Quote = {
  lines: Array<{
    productId: string;
    name: string;
    imageUrl: string | null;
    unitPriceCents: number;
    quantity: number;
    subtotalCents: number;
  }>;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  itemCount: number;
  coupon: { id: string; code: string; description: string } | null;
  minOrderCents: number;
  missingForMinimumCents: number;
  meetsMinimum: boolean;
  estimatedMinutes: number;
  warnings: string[];
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  quote: Quote | null;
  quoting: boolean;
  quoteError: string | null;
  deliveryType: "DELIVERY" | "PICKUP";
  neighborhood: string;
  couponCode: string;
  setDeliveryType: (value: "DELIVERY" | "PICKUP") => void;
  setNeighborhood: (value: string) => void;
  setCouponCode: (value: string) => void;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  quantityOf: (productId: string) => number;
  refreshQuote: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "ds-espetos:cart:v1";
const PREFS_KEY = "ds-espetos:cart-prefs:v1";

function readStoredCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CartItem =>
          !!item && typeof item.productId === "string" && Number.isFinite(item.quantity),
      )
      .map((item) => ({ productId: item.productId, quantity: Math.min(99, Math.max(1, Math.floor(item.quantity))) }));
  } catch {
    return [];
  }
}

function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [deliveryType, setDeliveryTypeState] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [neighborhood, setNeighborhoodState] = useState("");
  const [couponCode, setCouponCodeState] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Carrega o que estava salvo no aparelho.
  useEffect(() => {
    setItems(readStoredCart());
    try {
      const prefs = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}");
      if (prefs.deliveryType === "PICKUP" || prefs.deliveryType === "DELIVERY") {
        setDeliveryTypeState(prefs.deliveryType);
      }
      if (typeof prefs.neighborhood === "string") setNeighborhoodState(prefs.neighborhood);
      if (typeof prefs.couponCode === "string") setCouponCodeState(prefs.couponCode);
    } catch {
      /* preferências ausentes ou corrompidas: seguimos com os padrões */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* modo privado / cota cheia: o carrinho segue funcionando na memória */
    }
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ deliveryType, neighborhood, couponCode }),
      );
    } catch {
      /* idem */
    }
  }, [deliveryType, neighborhood, couponCode, hydrated]);

  /** Recalcula a cotação no servidor sempre que o carrinho muda. */
  const runQuote = useCallback(
    async (currentItems: CartItem[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (currentItems.length === 0) {
        setQuote(null);
        setQuoteError(null);
        setQuoting(false);
        return;
      }

      setQuoting(true);
      try {
        const data = await api<{ quote: Quote }>("/api/cart/quote", {
          method: "POST",
          body: {
            items: currentItems,
            deliveryType,
            neighborhood: neighborhood || undefined,
            couponCode: couponCode || undefined,
          },
          signal: controller.signal,
        });
        setQuote(data.quote);
        setQuoteError(null);

        // O servidor removeu itens que saíram do cardápio: reflete no carrinho.
        const validIds = new Set(data.quote.lines.map((line) => line.productId));
        if (validIds.size !== currentItems.length) {
          setItems((prev) => prev.filter((item) => validIds.has(item.productId)));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setQuoteError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) setQuoting(false);
      }
    },
    [deliveryType, neighborhood, couponCode],
  );

  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => void runQuote(items), 120);
    return () => clearTimeout(timeout);
  }, [items, hydrated, runQuote]);

  const add = useCallback((productId: string, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (!existing) return [...prev, { productId, quantity: Math.min(99, quantity) }];
      return prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(99, item.quantity + quantity) }
          : item,
      );
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((item) => item.productId !== productId)
        : prev.map((item) =>
            item.productId === productId ? { ...item, quantity: Math.min(99, quantity) } : item,
          ),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setCouponCodeState("");
    setQuote(null);
  }, []);

  const quantityOf = useCallback(
    (productId: string) => items.find((item) => item.productId === productId)?.quantity ?? 0,
    [items],
  );

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount,
      quote,
      quoting,
      quoteError,
      deliveryType,
      neighborhood,
      couponCode,
      setDeliveryType: setDeliveryTypeState,
      setNeighborhood: setNeighborhoodState,
      setCouponCode: setCouponCodeState,
      add,
      setQuantity,
      remove,
      clear,
      quantityOf,
      refreshQuote: () => void runQuote(items),
    }),
    [
      items, itemCount, quote, quoting, quoteError, deliveryType, neighborhood, couponCode,
      add, setQuantity, remove, clear, quantityOf, runQuote,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart precisa estar dentro de <Providers>");
  return context;
}

/* ==========================================================================
   Gaveta do carrinho

   Só o estado aberto/fechado vive aqui. A gaveta em si é
   components/site/cart-drawer.tsx — se o contexto morasse lá, providers
   importaria cart-drawer e cart-drawer importaria providers, e o ciclo
   quebraria o build.
   ========================================================================== */

const CartDrawerContext = createContext<{
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}>({ open: false, openDrawer: () => undefined, closeDrawer: () => undefined });

function CartDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  /*
    Enquanto a gaveta está aberta, a página atrás não rola. Sem isto, no
    celular o dedo arrastando dentro da gaveta leva o fundo embora e a pessoa
    fecha a gaveta num lugar diferente de onde estava.
  */
  useEffect(() => {
    if (!open) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [open]);

  const value = useMemo(() => ({ open, openDrawer, closeDrawer }), [open, openDrawer, closeDrawer]);
  return <CartDrawerContext.Provider value={value}>{children}</CartDrawerContext.Provider>;
}

export function useCartDrawer() {
  return useContext(CartDrawerContext);
}

/* ==========================================================================
   Avisos (toasts)
   ========================================================================== */

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

const ToastContext = createContext<{ push: (message: string, tone?: Toast["tone"]) => void }>({
  push: () => undefined,
});

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = ++counter.current;
    // No máximo 2 avisos ao mesmo tempo: no celular, uma pilha maior cobre
    // o botão de finalizar pedido.
    setToasts((prev) => [...prev.slice(-1), { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live faz o leitor de tela anunciar o aviso sem roubar o foco. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-40 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={
              "fade-in pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg " +
              (toast.tone === "success"
                ? "bg-emerald-600 text-white"
                : toast.tone === "error"
                  ? "bg-red-600 text-white"
                  : "bg-coal-900 text-white dark:bg-coal-100 dark:text-coal-900")
            }
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ========================================================================== */

export function Providers({
  children,
  initialSettings,
}: {
  children: ReactNode;
  initialSettings: PublicSettings | null;
}) {
  return (
    <ToastProvider>
      <SessionProvider>
        <StoreSettingsProvider initialSettings={initialSettings}>
          <CartProvider>
            <CartDrawerProvider>{children}</CartDrawerProvider>
          </CartProvider>
        </StoreSettingsProvider>
      </SessionProvider>
    </ToastProvider>
  );
}
