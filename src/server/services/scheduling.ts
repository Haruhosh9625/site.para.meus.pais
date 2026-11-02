import { prisma } from "../db";
import { env } from "../env";
import { badRequest } from "../errors";
import { getSettings, parseOpeningHours, type SettingsWithAreas } from "./settings";

/**
 * Agendamento de retirada.
 *
 * A DS Espetos ainda não entrega: o cliente escolhe a hora em que vai buscar
 * e a loja prepara para aquele horário. Este módulo é a única autoridade
 * sobre "esse horário pode?" — a tela ajuda o cliente a escolher, mas quem
 * decide é o servidor.
 *
 * Três perguntas a responder para cada horário:
 *   1. cai dentro do expediente daquele dia?
 *   2. respeita a antecedência mínima (a cozinha precisa de tempo)?
 *   3. ainda há vaga na janela (ou a capacidade é ilimitada)?
 */

/** Status que ocupam uma vaga na agenda. Cancelado não ocupa. */
const OCCUPYING_STATUSES = [
  "AWAITING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "SCHEDULED",
  "RECEIVED",
  "PREPARING",
  "READY",
] as const;

export type ScheduleWindow = {
  /** Início da janela de capacidade que contém o horário pedido. */
  start: Date;
  end: Date;
  /** Agendamentos já ocupando a janela. */
  taken: number;
  /** 0 significa capacidade ilimitada. */
  capacity: number;
  full: boolean;
};

export type ScheduleRules = {
  /** Primeiro horário que ainda pode ser escolhido hoje. */
  earliest: Date | null;
  /** Último horário do expediente de hoje. */
  latest: Date | null;
  minLeadMinutes: number;
  slotWindowMinutes: number;
  slotCapacity: number;
  /** 0 = somente hoje. */
  horizonDays: number;
  /** Horário de funcionamento de hoje, para a tela explicar o limite. */
  todayOpen: string | null;
  todayClose: string | null;
  closedToday: boolean;
  timezone: string;
  suggestions: Array<{ time: string; at: Date; remaining: number | null }>;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function atMinutes(day: Date, minutes: number): Date {
  const result = new Date(day);
  result.setHours(0, 0, 0, 0);
  result.setMinutes(minutes);
  return result;
}

/**
 * Faixa de funcionamento de um dia, em Date.
 *
 * Quando o fechamento é menor que a abertura (ex.: 18:00 às 02:00), a faixa
 * atravessa a meia-noite e o fim cai no dia seguinte.
 */
export function openingRangeFor(
  settings: Pick<SettingsWithAreas, "openingHours">,
  day: Date,
): { open: Date; close: Date } | null {
  const hours = parseOpeningHours(settings.openingHours);
  const entry = hours.find((h) => h.weekday === day.getDay());
  if (!entry || entry.closed) return null;

  const openMinutes = toMinutes(entry.open);
  const closeMinutes = toMinutes(entry.close);

  const open = atMinutes(day, openMinutes);
  const close =
    closeMinutes > openMinutes
      ? atMinutes(day, closeMinutes)
      : atMinutes(new Date(day.getTime() + 86400000), closeMinutes);

  return { open, close };
}

/** Regras vigentes, para a tela orientar o cliente antes de ele errar. */
export async function getScheduleRules(now = new Date()): Promise<ScheduleRules> {
  const settings = await getSettings();
  const hours = parseOpeningHours(settings.openingHours);
  const today = hours.find((h) => h.weekday === now.getDay());
  const range = openingRangeFor(settings, now);

  // O primeiro horário possível é o maior entre a abertura e "agora + lead".
  const leadLimit = new Date(now.getTime() + settings.minLeadMinutes * 60000);
  const earliest = range ? new Date(Math.max(range.open.getTime(), leadLimit.getTime())) : null;

  const usableEarliest = earliest && range && earliest <= range.close ? earliest : null;

  return {
    earliest: usableEarliest,
    latest: range?.close ?? null,
    minLeadMinutes: settings.minLeadMinutes,
    slotWindowMinutes: settings.slotWindowMinutes,
    slotCapacity: settings.slotCapacity,
    horizonDays: settings.scheduleHorizonDays,
    todayOpen: today && !today.closed ? today.open : null,
    todayClose: today && !today.closed ? today.close : null,
    closedToday: !today || today.closed,
    /** Fuso em que os horários acima devem ser lidos. */
    timezone: env.timezone,
    /** Sugestões de horário com vaga, para o cliente escolher em um toque. */
    suggestions:
      usableEarliest && range
        ? await suggestWindows(usableEarliest, range.close, settings)
        : [],
  };
}

/**
 * Primeiras janelas com vaga a partir de um horário.
 *
 * São atalhos, não uma grade fechada: o cliente continua podendo digitar
 * qualquer hora. Janelas lotadas ficam de fora — não faz sentido sugerir
 * um horário que o servidor vai recusar.
 *
 * A ocupação sai de UMA consulta e é distribuída nas janelas em memória.
 * Perguntar ao banco janela por janela custaria dezenas de consultas em
 * cada carregamento do checkout.
 */
async function suggestWindows(
  from: Date,
  until: Date,
  settings: SettingsWithAreas,
  limit = 6,
): Promise<Array<{ time: string; at: Date; remaining: number | null }>> {
  const step = Math.max(1, settings.slotWindowMinutes);
  const capacity = settings.slotCapacity;

  // Arredonda para o início da próxima janela cheia (18:07 -> 18:30).
  const startOfDay = new Date(from);
  startOfDay.setHours(0, 0, 0, 0);
  const fromMinutes = Math.floor((from.getTime() - startOfDay.getTime()) / 60000);
  const first = atMinutes(from, Math.ceil(fromMinutes / step) * step);

  // Sem limite de capacidade, nenhuma janela lota: nem precisa consultar.
  const occupied = new Map<number, number>();
  if (capacity > 0) {
    const orders = await prisma.order.findMany({
      where: {
        scheduledFor: { gte: first, lte: until },
        status: { in: [...OCCUPYING_STATUSES] },
      },
      select: { scheduledFor: true },
    });
    for (const order of orders) {
      if (!order.scheduledFor) continue;
      const dayStart = new Date(order.scheduledFor);
      dayStart.setHours(0, 0, 0, 0);
      const index = Math.floor((order.scheduledFor.getTime() - dayStart.getTime()) / 60000 / step);
      const key = dayStart.getTime() + index * step * 60000;
      occupied.set(key, (occupied.get(key) ?? 0) + 1);
    }
  }

  const out: Array<{ time: string; at: Date; remaining: number | null }> = [];
  // O teto de voltas evita varrer um expediente de 24h janela por janela.
  for (let i = 0; i < 96 && out.length < limit; i++) {
    const cursor = new Date(first.getTime() + i * step * 60000);
    if (cursor > until) break;

    const taken = occupied.get(cursor.getTime()) ?? 0;
    if (capacity > 0 && taken >= capacity) continue;

    out.push({
      time:
        `${cursor.getHours().toString().padStart(2, "0")}:` +
        `${cursor.getMinutes().toString().padStart(2, "0")}`,
      at: cursor,
      remaining: capacity > 0 ? Math.max(0, capacity - taken) : null,
    });
  }
  return out;
}

/** Janela de capacidade que contém um horário, com a ocupação atual. */
export async function getWindowFor(
  scheduledFor: Date,
  options: { ignoreOrderId?: string } = {},
): Promise<ScheduleWindow> {
  const settings = await getSettings();
  const windowMinutes = Math.max(1, settings.slotWindowMinutes);

  // Janelas ancoradas na meia-noite: 30 min gera 18:00, 18:30, 19:00...
  const startOfDay = new Date(scheduledFor);
  startOfDay.setHours(0, 0, 0, 0);
  const minutesFromMidnight = Math.floor((scheduledFor.getTime() - startOfDay.getTime()) / 60000);
  const windowIndex = Math.floor(minutesFromMidnight / windowMinutes);

  const start = new Date(startOfDay.getTime() + windowIndex * windowMinutes * 60000);
  const end = new Date(start.getTime() + windowMinutes * 60000);

  const taken = await prisma.order.count({
    where: {
      scheduledFor: { gte: start, lt: end },
      status: { in: [...OCCUPYING_STATUSES] },
      ...(options.ignoreOrderId ? { id: { not: options.ignoreOrderId } } : {}),
    },
  });

  const capacity = settings.slotCapacity;
  return { start, end, taken, capacity, full: capacity > 0 && taken >= capacity };
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * O horário cabe na janela de dias que a loja aceita?
 *
 * Com horizonte 0 só dá para agendar hoje. A madrugada conta como parte do
 * turno de hoje quando o expediente atravessa a meia-noite, então a conta é
 * feita sobre a faixa de funcionamento e não sobre o dia do calendário.
 */
function dentroDoHorizonte(
  scheduledFor: Date,
  settings: SettingsWithAreas,
  now: Date,
): boolean {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (scheduledFor < startOfToday) return false;

  const lastAllowedDay = new Date(startOfToday);
  lastAllowedDay.setDate(lastAllowedDay.getDate() + settings.scheduleHorizonDays + 1);

  const rangeToday = openingRangeFor(settings, startOfToday);
  if (rangeToday !== null && scheduledFor <= rangeToday.close) return true;

  return scheduledFor < lastAllowedDay;
}

/**
 * Transforma o que a tela enviou em um instante.
 *
 * A tela manda só "19:30" — hora de balcão, do jeito que o cliente digitou.
 * Resolver isso aqui, e não no navegador, tem dois motivos:
 *   • o servidor roda no fuso da loja (env.ts fixa TZ), então "19:30" é
 *     19:30 na DS Espetos mesmo que o celular do cliente esteja em outro
 *     fuso — do contrário ele agendaria uma hora que não existe no balcão;
 *   • quando o expediente atravessa a madrugada, "00:30" pertence ao turno
 *     de hoje e cai no calendário de amanhã. Quem sabe o expediente é o
 *     servidor.
 *
 * Datas ISO completas continuam aceitas (o painel e a API usam), para que o
 * formato não amarre quem chama.
 */
function resolveScheduleInput(
  input: string | Date,
  settings: SettingsWithAreas,
  now: Date,
): Date {
  if (input instanceof Date) return new Date(input);

  const match = HHMM.exec(input.trim());
  if (!match) return new Date(input);

  const minutes = Number(match[1]) * 60 + Number(match[2]);
  const leadLimit = new Date(now.getTime() + settings.minLeadMinutes * 60000);

  const hoje = atMinutes(now, minutes);
  const amanha = atMinutes(new Date(now.getTime() + 86400000), minutes);

  // O primeiro candidato que respeita a antecedência, o horizonte E cai no
  // expediente. O horizonte entra aqui, e não só na validação: sem ele,
  // "agora + 5 min" com 45 de antecedência viraria o dia seguinte e o
  // cliente ouviria "só dá para hoje" em vez da antecedência que faltou.
  const viavel = (candidate: Date) =>
    candidate >= leadLimit && dentroDoHorizonte(candidate, settings, now);

  for (const candidate of [hoje, amanha]) {
    if (!viavel(candidate)) continue;
    const dentro = [candidate, new Date(candidate.getTime() - 86400000)].some((day) => {
      const range = openingRangeFor(settings, day);
      return range !== null && candidate >= range.open && candidate <= range.close;
    });
    if (dentro) return candidate;
  }

  // Nenhum cai no expediente. Devolvemos o primeiro que pelo menos respeita
  // a antecedência E o horizonte, para que a validação reclame do motivo
  // VERDADEIRO: quem digita 05:00 às 20:00 precisa ouvir "atendemos das
  // 18:00 às 23:00", não "agende com 30 minutos de antecedência".
  const plausivel = [hoje, amanha].find(viavel);
  // Se nem isso existe, fica o de hoje: aí a reclamação certa é a
  // antecedência, que é o que de fato impede o horário pedido.
  return plausivel ?? hoje;
}

/**
 * Valida um horário de retirada e devolve o Date normalizado.
 *
 * Lança erro legível — a mensagem vai direto para a tela do cliente.
 */
export async function validateScheduledFor(
  input: string | Date,
  options: { now?: Date; ignoreOrderId?: string } = {},
): Promise<Date> {
  const now = options.now ?? new Date();
  const settings = await getSettings();

  const scheduledFor = resolveScheduleInput(input, settings, now);
  if (Number.isNaN(scheduledFor.getTime())) {
    throw badRequest("Horário de retirada inválido.");
  }

  // Segundos e milissegundos não interessam: o combinado é hora e minuto.
  scheduledFor.setSeconds(0, 0);

  // ---------------------------- antecedência --------------------------------
  // Vem antes do horizonte de propósito: um horário que já passou é sempre
  // problema de antecedência, e essa é a mensagem que ajuda o cliente.
  const leadLimit = new Date(now.getTime() + settings.minLeadMinutes * 60000);
  if (scheduledFor < leadLimit) {
    throw badRequest(
      settings.minLeadMinutes === 0
        ? "Esse horário já passou. Escolha um horário à frente."
        : `Agende com pelo menos ${settings.minLeadMinutes} minutos de antecedência.`,
    );
  }

  // ------------------------------- horizonte --------------------------------
  if (!dentroDoHorizonte(scheduledFor, settings, now)) {
    throw badRequest(
      settings.scheduleHorizonDays === 0
        ? "Os agendamentos são apenas para hoje."
        : `Só é possível agendar até ${settings.scheduleHorizonDays} dia(s) à frente.`,
    );
  }

  // ------------------------------ expediente --------------------------------
  // Tenta a faixa do próprio dia e a do dia anterior (madrugada).
  const candidateDays = [
    scheduledFor,
    new Date(scheduledFor.getTime() - 86400000),
  ];
  const dentroDoExpediente = candidateDays.some((day) => {
    const range = openingRangeFor(settings, day);
    return range !== null && scheduledFor >= range.open && scheduledFor <= range.close;
  });

  if (!dentroDoExpediente) {
    const range = openingRangeFor(settings, scheduledFor);
    throw badRequest(
      range
        ? `Nesse dia atendemos das ${range.open.getHours().toString().padStart(2, "0")}:` +
            `${range.open.getMinutes().toString().padStart(2, "0")} às ` +
            `${range.close.getHours().toString().padStart(2, "0")}:` +
            `${range.close.getMinutes().toString().padStart(2, "0")}. Escolha um horário nessa faixa.`
        : "Estamos fechados nesse dia. Escolha outro horário.",
    );
  }

  // ------------------------------ capacidade --------------------------------
  const window = await getWindowFor(scheduledFor, { ignoreOrderId: options.ignoreOrderId });
  if (window.full) {
    const hh = window.start.getHours().toString().padStart(2, "0");
    const mm = window.start.getMinutes().toString().padStart(2, "0");
    throw badRequest(
      `O horário das ${hh}:${mm} já está lotado (${window.capacity} agendamentos). ` +
        "Escolha outro horário.",
    );
  }

  return scheduledFor;
}

/** Agenda de um dia, para o painel administrativo. */
export async function getDaySchedule(day: Date) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 86400000); // cobre a madrugada

  const orders = await prisma.order.findMany({
    where: {
      scheduledFor: { gte: start, lt: end },
      status: { not: "CANCELLED" },
    },
    orderBy: { scheduledFor: "asc" },
    select: {
      id: true,
      number: true,
      scheduledFor: true,
      status: true,
      paymentStatus: true,
      totalCents: true,
      customerName: true,
      customerPhone: true,
      items: { select: { quantity: true, productNameSnapshot: true } },
    },
  });

  const settings = await getSettings();
  const windowMinutes = Math.max(1, settings.slotWindowMinutes);

  // Agrupa por janela, para a cozinha ver a carga de cada faixa.
  const windows = new Map<
    string,
    { start: Date; orders: typeof orders; items: number; ocupando: number }
  >();
  for (const order of orders) {
    if (!order.scheduledFor) continue;
    const dayStart = new Date(order.scheduledFor);
    dayStart.setHours(0, 0, 0, 0);
    const index = Math.floor(
      (order.scheduledFor.getTime() - dayStart.getTime()) / 60000 / windowMinutes,
    );
    const windowStart = new Date(dayStart.getTime() + index * windowMinutes * 60000);
    const key = windowStart.toISOString();
    const bucket = windows.get(key) ?? { start: windowStart, orders: [], items: 0, ocupando: 0 };
    bucket.orders.push(order);
    bucket.items += order.items.reduce((sum, item) => sum + item.quantity, 0);
    // A vaga é contada pela MESMA regra que aceita ou recusa um horário
    // (OCCUPYING_STATUSES). Um pedido já retirado não ocupa mais nada —
    // contá-lo aqui faria a tela dizer "lotado" enquanto o cliente ainda
    // conseguia agendar, uma contradição entre duas partes do sistema.
    if ((OCCUPYING_STATUSES as readonly string[]).includes(order.status)) {
      bucket.ocupando += 1;
    }
    windows.set(key, bucket);
  }

  return {
    orders,
    capacity: settings.slotCapacity,
    windowMinutes,
    windows: [...windows.values()]
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((bucket) => ({
        start: bucket.start,
        orders: bucket.orders.length,
        items: bucket.items,
        /** Pedidos que ainda ocupam vaga (exclui retirados e entregues). */
        occupied: bucket.ocupando,
        full: settings.slotCapacity > 0 && bucket.ocupando >= settings.slotCapacity,
      })),
  };
}
