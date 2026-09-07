import { z } from "zod";

/**
 * Toda entrada que chega do navegador passa por aqui antes de tocar o banco.
 * Além de validar o formato, as transformações fazem a sanitização básica:
 * trim, normalização de e-mail e remoção de caracteres de controle.
 */

/** Remove caracteres de controle (U+0000-U+001F, U+007F) e espaços das pontas. */
const clean = (value: string) => value.replace(/[\u0000-\u001F\u007F]/g, "").trim();

export const nameSchema = z
  .string()
  .transform(clean)
  .pipe(z.string().min(2, "Informe seu nome completo.").max(120, "Nome muito longo."));

export const emailSchema = z
  .string()
  .transform((v) => clean(v).toLowerCase())
  .pipe(z.string().email("E-mail inválido.").max(180));

export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .min(10, "Telefone deve ter DDD + número (10 ou 11 dígitos).")
      .max(11, "Telefone deve ter no máximo 11 dígitos."),
  );

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(200, "Senha longa demais.")
  .refine((v) => /[a-zA-Z]/.test(v), "A senha deve conter pelo menos uma letra.")
  .refine((v) => /[0-9]/.test(v), "A senha deve conter pelo menos um número.");

export const postalCodeSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().length(8, "CEP deve ter 8 dígitos."));

export const shortText = (max: number, label = "Campo") =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().min(1, `${label} é obrigatório.`).max(max, `${label} muito longo.`));

/**
 * Texto opcional. Aceita string, null ou ausência do campo e devolve sempre
 * `string | undefined`.
 *
 * O `null` é aceito de propósito: a API devolve `null` para campos vazios,
 * e telas como /admin/configuracoes fazem "ler, alterar, salvar" reenviando
 * o objeto inteiro. Sem isso, salvar sem mexer no campo daria erro 422.
 */
export const optionalText = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined ? "" : clean(v)))
    .pipe(z.string().max(max))
    .transform((v) => (v === "" ? undefined : v));

export const addressSchema = z.object({
  label: optionalText(40),
  street: shortText(160, "Rua"),
  number: shortText(20, "Número"),
  complement: optionalText(80),
  neighborhood: shortText(80, "Bairro"),
  city: shortText(80, "Cidade"),
  state: z
    .string()
    .transform((v) => clean(v).toUpperCase())
    .pipe(z.string().length(2, "UF deve ter 2 letras.")),
  postalCode: postalCodeSchema,
  reference: optionalText(160),
  isDefault: z.boolean().optional(),
});

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    passwordConfirmation: z.string().optional(),
    address: addressSchema.optional(),
  })
  .refine((data) => !data.passwordConfirmation || data.passwordConfirmation === data.password, {
    message: "As senhas não conferem.",
    path: ["passwordConfirmation"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Token inválido."),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
});

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1, "Quantidade mínima é 1.").max(99, "Quantidade máxima é 99."),
});

export const quoteSchema = z.object({
  items: z.array(cartItemSchema).max(60),
  deliveryType: z.enum(["DELIVERY", "PICKUP"]),
  neighborhood: optionalText(80),
  couponCode: optionalText(40),
});

export const createOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1, "Adicione pelo menos um item ao carrinho.").max(60),
  deliveryType: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["PIX", "CARD", "CASH"]),
  addressId: z.string().min(1).optional(),
  newAddress: addressSchema.optional(),
  couponCode: optionalText(40),
  notes: optionalText(500),
  /** Valor em centavos que o cliente vai entregar (pagamento em dinheiro). */
  changeForCents: z.number().int().min(0).max(10_000_000).optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

export const productSchema = z.object({
  name: shortText(120, "Nome"),
  description: optionalText(600),
  priceCents: z.number().int().min(0, "Preço não pode ser negativo.").max(1_000_000),
  categoryId: z.string().min(1, "Selecione uma categoria."),
  imageUrl: optionalText(500),
  available: z.boolean().optional(),
  active: z.boolean().optional(),
  position: z.number().int().min(0).max(9999).optional(),
});

export const categorySchema = z.object({
  name: shortText(60, "Nome"),
  position: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

export const couponSchema = z.object({
  code: z
    .string()
    .transform((v) => clean(v).toUpperCase())
    .pipe(z.string().min(3, "Código muito curto.").max(40)),
  description: optionalText(200),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.number().int().min(1, "Valor do desconto deve ser maior que zero."),
  minOrderCents: z.number().int().min(0).optional(),
  maxDiscountCents: z.number().int().min(0).optional(),
  startsAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).nullable().optional(),
  active: z.boolean().optional(),
});

const openingHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  open: z.string().regex(/^\d{2}:\d{2}$/, "Horário deve estar no formato HH:MM."),
  close: z.string().regex(/^\d{2}:\d{2}$/, "Horário deve estar no formato HH:MM."),
  closed: z.boolean(),
});

export const settingsSchema = z.object({
  storeName: shortText(80, "Nome da empresa"),
  logoUrl: optionalText(500),
  phone: optionalText(20),
  whatsapp: optionalText(20),
  email: optionalText(180),
  addressStreet: optionalText(160),
  addressNumber: optionalText(20),
  addressNeighborhood: optionalText(80),
  addressCity: optionalText(80),
  addressState: optionalText(2),
  addressPostalCode: optionalText(10),
  openingHours: z.array(openingHourSchema).length(7, "Informe os 7 dias da semana."),
  manualOpen: z.boolean(),
  useManualSwitch: z.boolean(),
  deliveryFeeCents: z.number().int().min(0).max(100_000),
  minOrderCents: z.number().int().min(0).max(100_000),
  freeDeliveryAboveCents: z.number().int().min(0).max(1_000_000),
  prepTimeMinutes: z.number().int().min(0).max(600),
  deliveryTimeMinutes: z.number().int().min(0).max(600),
  acceptPix: z.boolean(),
  acceptCard: z.boolean(),
  acceptCash: z.boolean(),
  allowDelivery: z.boolean(),
  allowPickup: z.boolean(),
});

export const deliveryAreaSchema = z.object({
  neighborhood: shortText(80, "Bairro"),
  city: optionalText(80),
  feeCents: z.number().int().min(0).max(100_000),
  minOrderCents: z.number().int().min(0).max(100_000).optional(),
  etaMinutes: z.number().int().min(0).max(600).optional(),
  active: z.boolean().optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum([
    "AWAITING_PAYMENT",
    "PAYMENT_CONFIRMED",
    "RECEIVED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "PICKED_UP",
    "CANCELLED",
  ]),
  note: optionalText(300),
});

/** Gera um slug seguro para URLs a partir de um nome. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
