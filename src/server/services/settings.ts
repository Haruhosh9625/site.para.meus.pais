import type { DeliveryArea, Settings } from "@prisma/client";
import { prisma } from "../db";

/**
 * Configurações do estabelecimento.
 *
 * Nenhuma regra de negócio com valor (taxa de entrega, pedido mínimo,
 * horário, métodos de pagamento aceitos) vive no código: tudo sai daqui,
 * e o administrador altera pelo painel em /admin/configuracoes.
 */

export type OpeningHour = {
  weekday: number; // 0 = domingo ... 6 = sábado
  open: string; // "18:00"
  close: string; // "23:00"
  closed: boolean;
};

export const DEFAULT_OPENING_HOURS: OpeningHour[] = [
  { weekday: 0, open: "18:00", close: "23:00", closed: false },
  { weekday: 1, open: "18:00", close: "23:00", closed: true },
  { weekday: 2, open: "18:00", close: "23:00", closed: false },
  { weekday: 3, open: "18:00", close: "23:00", closed: false },
  { weekday: 4, open: "18:00", close: "23:00", closed: false },
  { weekday: 5, open: "18:00", close: "23:59", closed: false },
  { weekday: 6, open: "18:00", close: "23:59", closed: false },
];

export type SettingsWithAreas = Settings & { deliveryAreas: DeliveryArea[] };

/** Lê a linha única de configurações, criando-a com os padrões se não existir. */
export async function getSettings(): Promise<SettingsWithAreas> {
  const existing = await prisma.settings.findUnique({
    where: { id: "default" },
    include: { deliveryAreas: { where: { active: true }, orderBy: { neighborhood: "asc" } } },
  });
  if (existing) return existing;

  return prisma.settings.create({
    data: { id: "default", openingHours: DEFAULT_OPENING_HOURS as never },
    include: { deliveryAreas: true },
  });
}

export function parseOpeningHours(value: unknown): OpeningHour[] {
  if (!Array.isArray(value)) return DEFAULT_OPENING_HOURS;
  const parsed = value.filter(
    (v): v is OpeningHour =>
      !!v &&
      typeof v === "object" &&
      typeof (v as OpeningHour).weekday === "number" &&
      typeof (v as OpeningHour).open === "string" &&
      typeof (v as OpeningHour).close === "string",
  );
  return parsed.length === 7 ? parsed : DEFAULT_OPENING_HOURS;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Diz se a loja está aberta AGORA e, quando fechada, qual é o próximo horário.
 *
 * Suporta faixas que viram a madrugada (ex.: 18:00 -> 02:00): nesse caso o
 * horário de fechamento é menor que o de abertura e a janela continua no dia
 * seguinte.
 */
export function getStoreStatus(
  settings: Pick<Settings, "openingHours" | "manualOpen" | "useManualSwitch">,
  now = new Date(),
): { open: boolean; reason: "manual" | "schedule"; nextOpening: string | null } {
  if (settings.useManualSwitch) {
    return {
      open: settings.manualOpen,
      reason: "manual",
      nextOpening: settings.manualOpen ? null : null,
    };
  }

  const hours = parseOpeningHours(settings.openingHours);
  const weekday = now.getDay();
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  const isOpenAt = (dayOffset: number) => {
    const day = (weekday - dayOffset + 7) % 7;
    const entry = hours.find((h) => h.weekday === day);
    if (!entry || entry.closed) return false;
    const open = toMinutes(entry.open);
    const close = toMinutes(entry.close);
    if (close > open) {
      // Janela dentro do mesmo dia
      return dayOffset === 0 && minutesNow >= open && minutesNow < close;
    }
    // Janela que atravessa a meia-noite
    if (dayOffset === 0) return minutesNow >= open;
    if (dayOffset === 1) return minutesNow < close;
    return false;
  };

  const open = isOpenAt(0) || isOpenAt(1);
  if (open) return { open: true, reason: "schedule", nextOpening: null };

  // Procura a próxima abertura nos próximos 7 dias.
  const WEEKDAY_NAMES = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];
  for (let i = 0; i < 8; i++) {
    const day = (weekday + i) % 7;
    const entry = hours.find((h) => h.weekday === day);
    if (!entry || entry.closed) continue;
    const openMin = toMinutes(entry.open);
    if (i === 0 && minutesNow >= openMin) continue;
    const when = i === 0 ? "hoje" : i === 1 ? "amanhã" : WEEKDAY_NAMES[day];
    return { open: false, reason: "schedule", nextOpening: `${when} às ${entry.open}` };
  }

  return { open: false, reason: "schedule", nextOpening: null };
}

/** Formato enxuto entregue ao navegador (sem nada sensível). */
export async function getPublicSettings() {
  const settings = await getSettings();
  const status = getStoreStatus(settings);
  return {
    storeName: settings.storeName,
    logoUrl: settings.logoUrl,
    phone: settings.phone,
    whatsapp: settings.whatsapp,
    email: settings.email,
    address: {
      street: settings.addressStreet,
      number: settings.addressNumber,
      neighborhood: settings.addressNeighborhood,
      city: settings.addressCity,
      state: settings.addressState,
      postalCode: settings.addressPostalCode,
    },
    openingHours: parseOpeningHours(settings.openingHours),
    isOpen: status.open,
    nextOpening: status.nextOpening,
    deliveryFeeCents: settings.deliveryFeeCents,
    minOrderCents: settings.minOrderCents,
    freeDeliveryAboveCents: settings.freeDeliveryAboveCents,
    prepTimeMinutes: settings.prepTimeMinutes,
    deliveryTimeMinutes: settings.deliveryTimeMinutes,
    paymentMethods: {
      pix: settings.acceptPix,
      card: settings.acceptCard,
      cash: settings.acceptCash,
    },
    allowDelivery: settings.allowDelivery,
    allowPickup: settings.allowPickup,
    deliveryAreas: settings.deliveryAreas.map((a) => ({
      neighborhood: a.neighborhood,
      city: a.city,
      feeCents: a.feeCents,
      minOrderCents: a.minOrderCents,
      etaMinutes: a.etaMinutes,
    })),
  };
}

export type PublicSettings = Awaited<ReturnType<typeof getPublicSettings>>;
