/** Formatações de data e hora usadas nas telas. */

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeOnly = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "-" : dateTime.format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "-" : dateOnly.format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "-" : timeOnly.format(date);
}

/** "há 5 minutos", "há 2 horas"… para listas de pedidos. */
export function formatRelative(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffSeconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) return "agora mesmo";
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `há ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  const days = Math.floor(diffSeconds / 86400);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  return formatDate(date);
}

/** Telefone brasileiro: 11987654321 -> (11) 98765-4321 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

/** CEP: 01310100 -> 01310-100 */
export function formatPostalCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value;
}

export type AddressLike = {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  reference?: string | null;
};

export function formatAddress(address: AddressLike | null | undefined): string {
  if (!address) return "-";
  const parts = [
    `${address.street}, ${address.number}`,
    address.complement || null,
    address.neighborhood,
    `${address.city}/${address.state}`,
    formatPostalCode(address.postalCode),
  ].filter(Boolean);
  return parts.join(" - ");
}
