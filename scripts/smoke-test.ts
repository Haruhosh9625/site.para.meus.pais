/**
 * Teste end-to-end da DS Espetos — `npm run test:e2e`.
 *
 * Sobe contra uma instância REAL da aplicação (padrão http://localhost:3000)
 * e exercita o caminho completo do cliente e do administrador, batendo nas
 * mesmas rotas HTTP que o navegador usa: nada é simulado ou "mockado".
 *
 * Cobre:
 *   cadastro, login, logout, cardápio, carrinho, cálculo de preços,
 *   cupons, checkout, criação de pedido, idempotência, pagamento PIX,
 *   webhook assinado, confirmação automática, mudança de status,
 *   histórico, painel administrativo, CRUD de produtos, clientes,
 *   financeiro, controle de acesso e tratamento de erros.
 *
 * Pré-requisitos:
 *   - aplicação rodando (npm run dev ou npm run build && npm start)
 *   - banco migrado e com seed
 *   - MANUAL_WEBHOOK_SECRET definido no .env (para testar o webhook)
 */

import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CHART_COLORS } from "../src/lib/constants";

const BASE_URL = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@dsespetos.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const WEBHOOK_SECRET = process.env.MANUAL_WEBHOOK_SECRET ?? "";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/**
 * Fuso da loja, lido de /api/schedule no começo da rodada.
 *
 * O processo do teste pode rodar em UTC enquanto o servidor roda em horário
 * de Brasília — é justamente o caso de um cliente com o celular em outro
 * fuso. Toda hora que o teste envia ou compara passa por aqui, de modo que
 * "HH:MM" significa sempre hora de balcão.
 */
let fusoDaLoja = "America/Sao_Paulo";

/** Instante -> "HH:MM" no fuso da loja. */
function horaNaLoja(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoDaLoja,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Hora de retirada usada nos pedidos do teste, em "HH:MM".
 *
 * A loja trabalha por agendamento, então TODO pedido precisa de um horário.
 * O teste abre o expediente das 00:00 às 23:59 nos sete dias e zera a
 * antecedência mínima, de modo que "agora + 20 minutos" sempre valha — mesmo
 * quando a rodada acontece perto da meia-noite, porque nesse caso o horário
 * cai no expediente do dia seguinte e o horizonte do teste é de 1 dia.
 */
function horarioDeRetirada(minutosAdiante = 20): string {
  return horaNaLoja(new Date(Date.now() + minutosAdiante * 60000));
}

/** Cliente HTTP com cookie jar — imita um navegador de verdade. */
class Client {
  private cookies = new Map<string, string>();

  get csrf(): string | undefined {
    return this.cookies.get("ds_csrf");
  }

  get isLoggedIn(): boolean {
    return this.cookies.has("ds_session");
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private absorb(response: Response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      if (index === -1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === "" || /expires=Thu, 01 Jan 1970/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request<T = unknown>(
    path: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; ok: boolean; data: T; error?: { message: string; code: string } }> {
    const method = options.method ?? (options.body ? "POST" : "GET");
    const headers: Record<string, string> = {
      // Origin idêntico ao host: a checagem de CSRF exige isso.
      origin: BASE_URL,
      cookie: this.cookieHeader(),
      ...options.headers,
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (method !== "GET" && this.csrf) headers["x-csrf-token"] = this.csrf;

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      redirect: "manual",
    });
    this.absorb(response);

    let payload: { ok?: boolean; data?: T; error?: { message: string; code: string } } = {};
    const text = await response.text();
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }

    return {
      status: response.status,
      ok: response.ok && payload.ok !== false,
      data: payload.data as T,
      error: payload.error,
    };
  }
}

/**
 * Zera os contadores de rate limit.
 *
 * O teste dispara muito mais pedidos e logins do que uma pessoa real faria
 * em minutos, então bateria nos limites (que existem e são testados de
 * propósito na seção "Rate limiting"). Chamamos isto entre as fases para que
 * cada asserção veja o status que está realmente sendo verificado.
 */
async function clearRateLimits() {
  await prisma.rateLimit.deleteMany({});
}

async function waitForServer(): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/api/settings`);
      if (response.ok) return true;
    } catch {
      /* servidor ainda subindo */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function main() {
  console.log(`\n\x1b[1mDS Espetos — teste end-to-end\x1b[0m`);
  console.log(`Alvo: ${BASE_URL}\n`);

  if (!(await waitForServer())) {
    console.error("Servidor não respondeu. Suba a aplicação antes (npm run dev).");
    process.exit(1);
  }

  // A loja precisa estar aberta para o teste criar pedidos, independentemente
  // do dia e da hora em que o teste roda. Guardamos o estado original e o
  // restauramos no fim.
  //
  // Como a loja trabalha por AGENDAMENTO, o expediente também precisa aceitar
  // qualquer hora: abrimos das 00:00 às 23:59 nos sete dias, zeramos a
  // antecedência mínima e damos 1 dia de horizonte. Assim "agora + 20 min"
  // sempre é um horário válido — inclusive quando a rodada cai às 23:55 e o
  // horário resolve para a madrugada seguinte.
  const originalStore = await prisma.settings.findUnique({
    where: { id: "default" },
    select: {
      useManualSwitch: true,
      manualOpen: true,
      openingHours: true,
      minLeadMinutes: true,
      slotWindowMinutes: true,
      slotCapacity: true,
      scheduleHorizonDays: true,
    },
  });
  await prisma.settings.update({
    where: { id: "default" },
    data: {
      useManualSwitch: true,
      manualOpen: true,
      openingHours: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        open: "00:00",
        close: "23:59",
        closed: false,
      })),
      minLeadMinutes: 0,
      slotWindowMinutes: 30,
      slotCapacity: 0,
      scheduleHorizonDays: 1,
    },
  });

  // O fuso precisa ser conhecido antes do primeiro horário calculado.
  const fusoResposta = await fetch(`${BASE_URL}/api/schedule`)
    .then((r) => r.json() as Promise<{ data?: { rules?: { timezone?: string } } }>)
    .catch(() => null);
  fusoDaLoja = fusoResposta?.data?.rules?.timezone ?? fusoDaLoja;
  console.log(`Fuso da loja: ${fusoDaLoja}\n`);

  await clearRateLimits();

  const customer = new Client();
  const admin = new Client();
  const anonymous = new Client();
  const stamp = Date.now();
  const email = `cliente.teste.${stamp}@example.com`;
  const password = "SenhaSegura123";

  // ============================== cardápio ==================================
  section("Cardápio e configurações públicas");

  const settingsResponse = await anonymous.request<{ settings: { storeName: string; isOpen: boolean } }>(
    "/api/settings",
  );
  check("GET /api/settings responde", settingsResponse.ok);
  check(
    "Nome da loja é DS Espetos",
    settingsResponse.data?.settings.storeName === "DS Espetos",
    settingsResponse.data?.settings.storeName,
  );

  type MenuCategory = {
    name: string;
    slug: string;
    products: Array<{ id: string; name: string; priceCents: number; available: boolean }>;
  };
  const menu = await anonymous.request<{ categories: MenuCategory[] }>("/api/products");
  check("GET /api/products responde", menu.ok);

  const allProducts = (menu.data?.categories ?? []).flatMap((category) => category.products);
  const bySlugName = (name: string) => allProducts.find((product) => product.name === name);

  check("Cardápio traz as 3 categorias", (menu.data?.categories.length ?? 0) === 3);
  check("Cardápio traz os 7 produtos do seed", allProducts.length === 7, `${allProducts.length}`);

  const espetoCarne = bySlugName("Espeto de Carne");
  const completo = bySlugName("Completo");
  const refrigerante = bySlugName("Refrigerante 1 litro");

  check("Espeto de Carne custa R$ 8,00", espetoCarne?.priceCents === 800, `${espetoCarne?.priceCents}`);
  check("Completo custa R$ 12,00", completo?.priceCents === 1200, `${completo?.priceCents}`);
  check("Refrigerante 1L custa R$ 10,00", refrigerante?.priceCents === 1000, `${refrigerante?.priceCents}`);

  const espetos = menu.data?.categories.find((c) => c.slug === "espetos");
  check("Todos os 5 espetos custam R$ 8,00", espetos?.products.every((p) => p.priceCents === 800) === true);
  check(
    "Completo está em Acompanhamentos, não em Espetos",
    menu.data?.categories.find((c) => c.slug === "acompanhamentos")?.products.some((p) => p.name === "Completo") === true &&
      espetos?.products.some((p) => p.name === "Completo") === false,
  );

  if (!espetoCarne || !completo || !refrigerante) {
    console.error("\nCardápio incompleto — rode `npm run db:seed` antes do teste.");
    process.exit(1);
  }

  // ========================= cálculo de preços ==============================
  section("Cálculo de preços no servidor");

  // O exemplo do enunciado: 2 espetos + 1 completo + 1 refri = R$ 38,00
  const quote = await anonymous.request<{
    quote: {
      subtotalCents: number;
      totalCents: number;
      itemCount: number;
      lines: Array<{ name: string; unitPriceCents: number; quantity: number; subtotalCents: number }>;
    };
  }>("/api/cart/quote", {
    body: {
      items: [
        { productId: espetoCarne.id, quantity: 2 },
        { productId: completo.id, quantity: 1 },
        { productId: refrigerante.id, quantity: 1 },
      ],
      deliveryType: "PICKUP",
    },
  });

  check("POST /api/cart/quote responde", quote.ok);
  check(
    "2× Espeto de Carne = R$ 16,00",
    quote.data?.quote.lines.find((l) => l.name === "Espeto de Carne")?.subtotalCents === 1600,
  );
  check("Subtotal do exemplo = R$ 38,00", quote.data?.quote.subtotalCents === 3800, `${quote.data?.quote.subtotalCents}`);
  check("Total do exemplo = R$ 38,00 (retirada)", quote.data?.quote.totalCents === 3800);
  check("Contagem de itens = 4", quote.data?.quote.itemCount === 4);

  // Tentativa de manipular o preço pelo cliente.
  const tampered = await anonymous.request<{ quote: { subtotalCents: number } }>("/api/cart/quote", {
    body: {
      items: [{ productId: espetoCarne.id, quantity: 2, priceCents: 1, unitPriceCents: 1 }],
      deliveryType: "PICKUP",
    },
  });
  check(
    "Preço enviado pelo cliente é ignorado (R$ 16,00, não R$ 0,02)",
    tampered.data?.quote.subtotalCents === 1600,
    `${tampered.data?.quote.subtotalCents}`,
  );

  const negative = await anonymous.request("/api/cart/quote", {
    body: { items: [{ productId: espetoCarne.id, quantity: -5 }], deliveryType: "PICKUP" },
  });
  check("Quantidade negativa é rejeitada", !negative.ok && negative.status === 422);

  // ============================== cadastro ==================================
  section("Cadastro, login e sessão");
  await clearRateLimits();

  const weak = await anonymous.request("/api/auth/register", {
    body: { name: "Teste Fraco", email: `weak.${stamp}@example.com`, phone: "11999998888", password: "123" },
  });
  check("Senha fraca é rejeitada no cadastro", !weak.ok && weak.status === 422);

  const register = await customer.request<{ user: { id: string; email: string; role: string } }>(
    "/api/auth/register",
    {
      body: {
        name: "Cliente de Teste",
        email,
        phone: "11987654321",
        password,
        passwordConfirmation: password,
        address: {
          street: "Rua das Brasas",
          number: "123",
          neighborhood: "Centro",
          city: "São Paulo",
          state: "SP",
          postalCode: "01310100",
          isDefault: true,
        },
      },
    },
  );
  check("Cadastro cria a conta", register.ok, register.error?.message);
  check("Novo usuário nasce com papel CUSTOMER", register.data?.user.role === "CUSTOMER");
  check("Cadastro já abre a sessão (cookie httpOnly)", customer.isLoggedIn);
  check("Cookie de CSRF é entregue ao navegador", Boolean(customer.csrf));

  const duplicate = await anonymous.request("/api/auth/register", {
    body: { name: "Duplicado", email, phone: "11987654321", password },
  });
  check("E-mail duplicado é rejeitado", !duplicate.ok && duplicate.status === 409);

  const stored = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
  check("Senha é gravada como hash scrypt", stored?.passwordHash.startsWith("scrypt$") === true);
  check("Senha em texto puro não aparece no banco", !stored?.passwordHash.includes(password));

  const me = await customer.request<{ user: { email: string } }>("/api/me");
  check("GET /api/me devolve o usuário logado", me.data?.user.email === email);

  // CSRF: uma requisição sem o cabeçalho precisa ser barrada.
  const noCsrf = await fetch(`${BASE_URL}/api/me`, {
    method: "PATCH",
    headers: {
      origin: BASE_URL,
      "content-type": "application/json",
      cookie: `ds_session=${(customer as unknown as { cookies: Map<string, string> }).cookies.get("ds_session")}`,
    },
    body: JSON.stringify({ name: "Hacker", email, phone: "11987654321" }),
  });
  check("Requisição sem token CSRF é bloqueada", noCsrf.status === 403);

  const badOrigin = await customer.request("/api/me", {
    method: "PATCH",
    headers: { origin: "https://site-malicioso.example" },
    body: { name: "Invasor", email, phone: "11987654321" },
  });
  check("Requisição de outra origem é bloqueada", !badOrigin.ok && badOrigin.status === 403);

  const wrongPassword = await anonymous.request("/api/auth/login", {
    body: { email, password: "SenhaErrada999" },
  });
  check("Login com senha errada falha", !wrongPassword.ok && wrongPassword.status === 401);
  check(
    "Erro de login não revela se o e-mail existe",
    wrongPassword.error?.message === "E-mail ou senha incorretos.",
  );

  // ============================ controle de acesso ==========================
  section("Controle de acesso (RBAC)");

  const adminAsAnon = await anonymous.request("/api/admin/orders");
  check("Rota admin exige login", !adminAsAnon.ok && adminAsAnon.status === 401);

  const adminAsCustomer = await customer.request("/api/admin/orders");
  check("Cliente comum não acessa rota admin (403)", !adminAsCustomer.ok && adminAsCustomer.status === 403);

  const productAsCustomer = await customer.request("/api/admin/products", {
    body: { name: "Produto Pirata", priceCents: 1, categoryId: "x" },
  });
  check("Cliente não cria produto (403)", !productAsCustomer.ok && productAsCustomer.status === 403);

  const financeAsCustomer = await customer.request("/api/admin/finance");
  check("Cliente não vê o financeiro (403)", !financeAsCustomer.ok && financeAsCustomer.status === 403);

  // ================================ pedido ==================================
  section("Criação de pedido e checkout");
  await clearRateLimits();

  const idempotencyKey = `teste-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
  const orderPayload = {
    items: [
      { productId: espetoCarne.id, quantity: 2 },
      { productId: completo.id, quantity: 1 },
      { productId: refrigerante.id, quantity: 1 },
    ],
    deliveryType: "PICKUP" as const,
    paymentMethod: "PIX" as const,
    notes: "Teste automatizado",
    scheduledFor: horarioDeRetirada(),
    idempotencyKey,
  };

  type OrderResponse = {
    order: {
      id: string;
      number: number;
      status: string;
      paymentStatus: string;
      subtotalCents: number;
      totalCents: number;
      scheduledFor: string | null;
      items: Array<{ productNameSnapshot: string; unitPriceCents: number; quantity: number; subtotalCents: number }>;
    };
    payment: { id: string; pixQrCode: string | null; status: string } | null;
    duplicated?: boolean;
  };

  const created = await customer.request<OrderResponse>("/api/orders", { body: orderPayload });
  check("Pedido é criado", created.ok, created.error?.message);

  const order = created.data?.order;
  check("Pedido nasce em AWAITING_PAYMENT", order?.status === "AWAITING_PAYMENT");
  check("Pagamento nasce PENDING", order?.paymentStatus === "PENDING");
  check("Total do pedido = R$ 38,00", order?.totalCents === 3800, `${order?.totalCents}`);
  check("Pedido tem 3 linhas de item", order?.items.length === 3);
  check(
    "OrderItem guarda o preço praticado (snapshot)",
    order?.items.find((i) => i.productNameSnapshot === "Espeto de Carne")?.unitPriceCents === 800,
  );
  check("Número sequencial do pedido foi gerado", (order?.number ?? 0) > 0);

  // Idempotência: repetir o mesmo POST não pode criar outro pedido.
  const repeat = await customer.request<OrderResponse>("/api/orders", { body: orderPayload });
  check("Reenvio com a mesma chave não duplica o pedido", repeat.data?.order.id === order?.id);
  check("Resposta marca a requisição como duplicada", repeat.data?.duplicated === true);

  // ============================== pagamento PIX =============================
  section("Pagamento PIX e webhook");

  const payment = created.data?.payment;
  check("Cobrança PIX foi criada junto com o pedido", Boolean(payment?.id));
  check("Código PIX copia-e-cola foi gerado", Boolean(payment?.pixQrCode), payment?.pixQrCode?.slice(0, 20));
  check(
    "Código PIX começa com o cabeçalho EMV (000201)",
    payment?.pixQrCode?.startsWith("000201") === true,
  );
  check("Código PIX contém o domínio do BCB", payment?.pixQrCode?.includes("br.gov.bcb.pix") === true);
  check(
    "Valor no código PIX é 38.00",
    payment?.pixQrCode?.includes("540538.00") === true,
    payment?.pixQrCode ?? undefined,
  );

  // O cliente NÃO pode confirmar o próprio pagamento.
  const selfConfirm = await customer.request(`/api/admin/orders/${order?.id}/confirm-payment`, {
    method: "POST",
  });
  check("Cliente não consegue confirmar o próprio pagamento", !selfConfirm.ok && selfConfirm.status === 403);

  const beforeWebhook = await customer.request<{ order: { paymentStatus: string } }>(
    `/api/orders/${order?.id}`,
  );
  check(
    "Só abrir a página do pedido não confirma o pagamento",
    beforeWebhook.data?.order.paymentStatus === "PENDING",
  );

  if (!WEBHOOK_SECRET) {
    console.log("  \x1b[33m!\x1b[0m MANUAL_WEBHOOK_SECRET ausente — testes de webhook pulados.");
  } else {
    const providerPaymentId = `manual_${order?.id}`;

    // Assinatura errada precisa ser recusada.
    const badSignature = await fetch(`${BASE_URL}/api/webhooks/payments/manual`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": "assinatura-invalida" },
      body: JSON.stringify({ paymentId: providerPaymentId, status: "paid" }),
    });
    check("Webhook com assinatura inválida é recusado (401)", badSignature.status === 401);

    const afterBad = await customer.request<{ order: { paymentStatus: string } }>(
      `/api/orders/${order?.id}`,
    );
    check(
      "Webhook recusado não altera o pagamento",
      afterBad.data?.order.paymentStatus === "PENDING",
    );

    // Webhook assinado corretamente.
    const eventId = `evt-${stamp}`;
    const body = JSON.stringify({ eventId, paymentId: providerPaymentId, status: "paid" });
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

    const webhook = await fetch(`${BASE_URL}/api/webhooks/payments/manual`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": signature },
      body,
    });
    const webhookBody = (await webhook.json()) as { ok: boolean; handled: boolean };
    check("Webhook assinado é aceito (200)", webhook.status === 200);
    check("Webhook processa o pagamento", webhookBody.handled === true);

    const afterWebhook = await customer.request<{
      order: {
        paymentStatus: string;
        status: string;
        paidAt: string | null;
        statusHistory: Array<{ to: string }>;
      };
    }>(`/api/orders/${order?.id}`);
    check("Pagamento fica PAID após o webhook", afterWebhook.data?.order.paymentStatus === "PAID");
    // Pagamento confirmado é o que garante o horário: o pedido vai direto a
    // AGENDADO, passando por PAYMENT_CONFIRMED e deixando os dois no histórico.
    check(
      "Pedido pago avança para SCHEDULED automaticamente",
      afterWebhook.data?.order.status === "SCHEDULED",
      afterWebhook.data?.order.status,
    );
    check(
      "Histórico registra a confirmação do pagamento",
      afterWebhook.data?.order.statusHistory.some((entry) => entry.to === "PAYMENT_CONFIRMED") === true,
    );
    check("Data do pagamento é registrada", Boolean(afterWebhook.data?.order.paidAt));

    // Idempotência do webhook: reenviar o mesmo evento não pode duplicar nada.
    const replay = await fetch(`${BASE_URL}/api/webhooks/payments/manual`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": signature },
      body,
    });
    const replayBody = (await replay.json()) as { handled: boolean; message: string };
    check("Reenvio do mesmo evento é ignorado (idempotência)", replayBody.handled === false);

    const paymentsCount = await prisma.payment.count({ where: { orderId: order?.id } });
    check("Nenhum pagamento duplicado foi criado", paymentsCount === 1, `${paymentsCount}`);

    const events = await prisma.webhookEvent.count({ where: { provider: "manual", eventId } });
    check("Evento de webhook fica registrado uma única vez", events === 1);

    // A confirmação vinda do gateway precisa deixar rastro na auditoria,
    // mesmo sem um usuário humano por trás dela.
    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "payment.confirmed", entityId: payment?.id },
    });
    check("Confirmação pelo gateway é registrada na auditoria", auditRow !== null);
    check(
      "Auditoria identifica o autor como o gateway",
      (auditRow?.metadata as { source?: string } | null)?.source === "gateway",
    );

    const statusAudit = await prisma.auditLog.findFirst({
      where: { action: "order.status_changed", entityId: order?.id },
      orderBy: { createdAt: "asc" },
    });
    check("Mudança de status feita pelo sistema também é auditada", statusAudit !== null);
  }

  // ============================== agendamento ===============================
  section("Agendamento da retirada");
  await clearRateLimits();

  type ScheduleRules = {
    earliest: string | null;
    latest: string | null;
    minLeadMinutes: number;
    slotWindowMinutes: number;
    slotCapacity: number;
    horizonDays: number;
    closedToday: boolean;
    timezone: string;
    suggestions: Array<{ time: string; remaining: number | null }>;
  };
  type CheckResult = { valid: boolean; reason?: string; window?: { taken: number; capacity: number } };

  /** Ajusta as regras de agendamento direto no banco (sem passar pelo painel). */
  async function setScheduleRules(data: {
    minLeadMinutes?: number;
    slotWindowMinutes?: number;
    slotCapacity?: number;
    scheduleHorizonDays?: number;
    openingHours?: Array<{ weekday: number; open: string; close: string; closed: boolean }>;
  }) {
    await prisma.settings.update({
      where: { id: "default" },
      data: { ...data, openingHours: (data.openingHours ?? undefined) as never },
    });
  }

  /** Volta às regras usadas pelo resto do teste: tudo aberto, sem limite. */
  async function resetScheduleRules() {
    await setScheduleRules({
      minLeadMinutes: 0,
      slotWindowMinutes: 30,
      slotCapacity: 0,
      scheduleHorizonDays: 1,
      openingHours: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        open: "00:00",
        close: "23:59",
        closed: false,
      })),
    });
  }

  const rules = await anonymous.request<{ rules: ScheduleRules }>("/api/schedule");
  check("Regras de agendamento são públicas", rules.ok, rules.error?.message);
  check("Existe um primeiro horário possível", Boolean(rules.data?.rules.earliest));
  check("Existe um último horário do expediente", Boolean(rules.data?.rules.latest));
  check(
    "Regras informam o fuso da loja",
    (rules.data?.rules.timezone ?? "").includes("/"),
    rules.data?.rules.timezone,
  );
  check(
    "Tela recebe sugestões de horário com vaga",
    (rules.data?.rules.suggestions.length ?? 0) > 0,
    `${rules.data?.rules.suggestions.length}`,
  );

  // O pedido criado antes guardou o horário combinado.
  check("Pedido guarda o horário da retirada", Boolean(order?.scheduledFor), `${order?.scheduledFor}`);
  check(
    "Horário guardado é o que o cliente escolheu",
    order?.scheduledFor ? horaNaLoja(order.scheduledFor) === orderPayload.scheduledFor : false,
    `${order?.scheduledFor} vs ${orderPayload.scheduledFor}`,
  );

  // --------------------------- horário válido -------------------------------
  const primeiroHorario = rules.data?.rules.suggestions[0]?.time ?? horarioDeRetirada();
  const okCheck = await customer.request<CheckResult>("/api/schedule/check", {
    body: { scheduledFor: primeiroHorario },
  });
  check("Horário sugerido é aprovado", okCheck.data?.valid === true, okCheck.data?.reason);

  const lixo = await customer.request<CheckResult>("/api/schedule/check", {
    body: { scheduledFor: "25:99" },
  });
  check("Horário impossível é rejeitado", !lixo.ok || lixo.data?.valid === false);

  // -------------------------- antecedência mínima ---------------------------
  await setScheduleRules({ minLeadMinutes: 45, scheduleHorizonDays: 0 });

  const cedoDemais = await customer.request<CheckResult>("/api/schedule/check", {
    body: { scheduledFor: horarioDeRetirada(5) },
  });
  check("Horário sem antecedência é recusado", cedoDemais.data?.valid === false, cedoDemais.data?.reason);
  check(
    "Mensagem explica a antecedência mínima",
    (cedoDemais.data?.reason ?? "").includes("45"),
    cedoDemais.data?.reason,
  );

  const semAntecedencia = await customer.request("/api/orders", {
    body: {
      items: [{ productId: espetoCarne.id, quantity: 2 }],
      deliveryType: "PICKUP",
      paymentMethod: "PIX",
      scheduledFor: horarioDeRetirada(5),
      idempotencyKey: `lead-${stamp}`,
    },
  });
  check("Pedido sem antecedência é recusado no servidor", !semAntecedencia.ok);

  // ------------------------------- horizonte --------------------------------
  const amanha = new Date(Date.now() + 26 * 3600 * 1000);
  const amanhaIso = amanha.toISOString();
  const foraDoHorizonte = await customer.request<CheckResult>("/api/schedule/check", {
    body: { scheduledFor: amanhaIso },
  });
  check(
    "Com horizonte zero, só dá para agendar hoje",
    foraDoHorizonte.data?.valid === false,
    foraDoHorizonte.data?.reason,
  );
  check(
    "Mensagem explica que é só para hoje",
    (foraDoHorizonte.data?.reason ?? "").toLowerCase().includes("hoje"),
    foraDoHorizonte.data?.reason,
  );

  // ------------------------------- expediente -------------------------------
  await setScheduleRules({
    minLeadMinutes: 0,
    scheduleHorizonDays: 1,
    openingHours: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      open: "18:00",
      close: "23:00",
      closed: false,
    })),
  });

  const foraDoExpediente = await customer.request<CheckResult>("/api/schedule/check", {
    body: { scheduledFor: "05:00" },
  });
  check(
    "Horário fora do expediente é recusado",
    foraDoExpediente.data?.valid === false,
    foraDoExpediente.data?.reason,
  );
  check(
    "Mensagem informa a faixa de atendimento",
    (foraDoExpediente.data?.reason ?? "").includes("18:00"),
    foraDoExpediente.data?.reason,
  );

  const dentroDoExpediente = await customer.request<CheckResult>("/api/schedule/check", {
    body: { scheduledFor: "19:00" },
  });
  check(
    "Horário dentro do expediente é aprovado",
    dentroDoExpediente.data?.valid === true,
    dentroDoExpediente.data?.reason,
  );

  // -------------------------------- capacidade ------------------------------
  // Janela curta e capacidade 1: o segundo pedido no mesmo horário não cabe.
  await resetScheduleRules();
  await setScheduleRules({ slotWindowMinutes: 5, slotCapacity: 1 });
  await clearRateLimits();

  const horarioDisputado = horarioDeRetirada(95);

  const primeiroDaJanela = await customer.request<OrderResponse>("/api/orders", {
    body: {
      items: [{ productId: espetoCarne.id, quantity: 2 }],
      deliveryType: "PICKUP",
      paymentMethod: "PIX",
      scheduledFor: horarioDisputado,
      idempotencyKey: `vaga1-${stamp}`,
    },
  });
  check("Primeiro pedido ocupa a janela", primeiroDaJanela.ok, primeiroDaJanela.error?.message);

  const janelaCheia = await customer.request<CheckResult>("/api/schedule/check", {
    body: { scheduledFor: horarioDisputado },
  });
  check("Janela lotada é recusada na conferência", janelaCheia.data?.valid === false, janelaCheia.data?.reason);
  check(
    "Mensagem avisa que o horário está lotado",
    (janelaCheia.data?.reason ?? "").toLowerCase().includes("lotado"),
    janelaCheia.data?.reason,
  );

  const segundoDaJanela = await customer.request("/api/orders", {
    body: {
      items: [{ productId: espetoCarne.id, quantity: 1 }],
      deliveryType: "PICKUP",
      paymentMethod: "PIX",
      scheduledFor: horarioDisputado,
      idempotencyKey: `vaga2-${stamp}`,
    },
  });
  check("Segundo pedido na janela lotada é recusado", !segundoDaJanela.ok, segundoDaJanela.error?.message);

  // Cancelar libera a vaga: pedido cancelado não ocupa agenda.
  await customer.request(`/api/orders/${primeiroDaJanela.data?.order.id}/cancel`, {
    body: { reason: "Liberando a janela no teste" },
  });
  const janelaLiberada = await customer.request<CheckResult>("/api/schedule/check", {
    body: { scheduledFor: horarioDisputado },
  });
  check(
    "Cancelar o pedido devolve a vaga na agenda",
    janelaLiberada.data?.valid === true,
    janelaLiberada.data?.reason,
  );

  // ------------------------------- remarcação -------------------------------
  await resetScheduleRules();
  await clearRateLimits();

  const paraRemarcar = await customer.request<OrderResponse>("/api/orders", {
    body: {
      items: [{ productId: refrigerante.id, quantity: 1 }],
      deliveryType: "PICKUP",
      paymentMethod: "CASH",
      scheduledFor: horarioDeRetirada(40),
      idempotencyKey: `remarcar-${stamp}`,
    },
  });
  check("Pedido para remarcar é criado", paraRemarcar.ok, paraRemarcar.error?.message);

  const novoHorario = horarioDeRetirada(150);
  const remarcado = await customer.request<{ order: { scheduledFor: string; status: string } }>(
    `/api/orders/${paraRemarcar.data?.order.id}/reschedule`,
    { body: { scheduledFor: novoHorario } },
  );
  check("Cliente remarca a própria retirada", remarcado.ok, remarcado.error?.message);
  check(
    "Novo horário foi gravado",
    remarcado.data?.order.scheduledFor
      ? horaNaLoja(remarcado.data.order.scheduledFor) === novoHorario
      : false,
    `${remarcado.data?.order.scheduledFor} vs ${novoHorario}`,
  );

  const intruso = new Client();
  await intruso.request("/api/auth/register", {
    body: {
      name: "Cliente Intruso",
      email: `intruso.${stamp}@example.com`,
      phone: "11955556666",
      password,
    },
  });
  const remarcarAlheio = await intruso.request(
    `/api/orders/${paraRemarcar.data?.order.id}/reschedule`,
    { body: { scheduledFor: horarioDeRetirada(160) } },
  );
  check("Cliente não remarca pedido de outro cliente", !remarcarAlheio.ok && remarcarAlheio.status === 404);

  const agendaSemLogin = await anonymous.request("/api/admin/agenda");
  check("Agenda do painel exige login de admin", !agendaSemLogin.ok);

  const agendaComoCliente = await customer.request("/api/admin/agenda");
  check("Cliente não acessa a agenda do painel (403)", agendaComoCliente.status === 403);

  // ============================= painel admin ===============================
  section("Painel administrativo");
  await clearRateLimits();

  if (!ADMIN_PASSWORD) {
    console.log("  \x1b[33m!\x1b[0m SEED_ADMIN_PASSWORD ausente — testes de admin pulados.");
  } else {
    const adminLogin = await admin.request<{ user: { role: string } }>("/api/auth/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    check("Administrador consegue entrar", adminLogin.ok, adminLogin.error?.message);
    check("Papel do administrador é ADMIN", adminLogin.data?.user.role === "ADMIN");

    const dashboard = await admin.request<{
      metrics: { today: { orders: number; revenueCents: number }; topProducts: unknown[] };
    }>("/api/admin/dashboard");
    check("Dashboard responde", dashboard.ok);
    check("Dashboard conta o pedido de hoje", (dashboard.data?.metrics.today.orders ?? 0) >= 1);

    const orders = await admin.request<{ orders: Array<{ id: string }>; summary: { count: number } }>(
      "/api/admin/orders?period=today",
    );
    check("Listagem de pedidos responde", orders.ok);
    check("Pedido do teste aparece na listagem", orders.data?.orders.some((o) => o.id === order?.id) === true);

    const search = await admin.request<{ orders: Array<{ number: number }> }>(
      `/api/admin/orders?period=all&search=${order?.number}`,
    );
    check("Busca por número do pedido funciona", search.data?.orders.some((o) => o.number === order?.number) === true);

    const filtered = await admin.request<{ orders: Array<{ paymentMethod: string }> }>(
      "/api/admin/orders?period=all&paymentMethod=CARD",
    );
    check(
      "Filtro por forma de pagamento funciona",
      (filtered.data?.orders ?? []).every((o) => o.paymentMethod === "CARD"),
    );

    // ---------------------------- fluxo de status --------------------------
    const invalidJump = await admin.request(`/api/admin/orders/${order?.id}/status`, {
      body: { status: "DELIVERED" },
    });
    check("Pular etapas do status é bloqueado (409)", !invalidJump.ok && invalidJump.status === 409);

    // De AGENDADO a RETIRADO. RECEIVED não entra: é estado de delivery,
    // mantido no enum só pelos pedidos antigos do histórico.
    for (const status of ["PREPARING", "READY", "PICKED_UP"]) {
      const step = await admin.request<{ order: { status: string } }>(
        `/api/admin/orders/${order?.id}/status`,
        { body: { status } },
      );
      check(`Status avança para ${status}`, step.ok && step.data?.order.status === status, step.error?.message);
    }

    const wrongFinal = await admin.request(`/api/admin/orders/${order?.id}/status`, {
      body: { status: "DELIVERED" },
    });
    check("Pedido finalizado não muda mais de status", !wrongFinal.ok);

    // Notificações geradas pelas mudanças de status.
    const notifications = await customer.request<{ notifications: Array<{ event: string }> }>(
      "/api/notifications",
    );
    check(
      "Cliente recebe notificações das mudanças de status",
      (notifications.data?.notifications.length ?? 0) >= 4,
      `${notifications.data?.notifications.length}`,
    );
    check(
      "Notificação de pedido pronto foi gerada",
      notifications.data?.notifications.some((n) => n.event === "order.status.READY") === true,
    );

    // -------------------------- CRUD de produtos ---------------------------
    const productList = await admin.request<{
      products: Array<{ id: string; name: string; _count: { items: number } }>;
      categories: Array<{ id: string; name: string }>;
    }>("/api/admin/products");
    check("Listagem de produtos do admin responde", productList.ok);

    const categoryId = productList.data?.categories[0]?.id ?? "";
    const newProduct = await admin.request<{ product: { id: string; priceCents: number; name: string } }>(
      "/api/admin/products",
      {
        body: {
          name: `Espeto de Teste ${stamp}`,
          description: "Produto criado pelo teste automatizado",
          priceCents: 950,
          categoryId,
          available: true,
        },
      },
    );
    check("Admin cria produto", newProduct.ok, newProduct.error?.message);
    check("Produto criado com o preço correto", newProduct.data?.product.priceCents === 950);

    const productId = newProduct.data?.product.id ?? "";

    const updated = await admin.request<{ product: { priceCents: number; available: boolean } }>(
      `/api/admin/products/${productId}`,
      { method: "PATCH", body: { priceCents: 1100, available: false } },
    );
    check("Admin altera o preço do produto", updated.data?.product.priceCents === 1100);
    check("Admin marca o produto como indisponível", updated.data?.product.available === false);

    // Produto indisponível não pode ser comprado.
    const unavailableQuote = await customer.request<{ quote: { lines: unknown[]; warnings: string[] } }>(
      "/api/cart/quote",
      { body: { items: [{ productId, quantity: 1 }], deliveryType: "PICKUP" } },
    );
    check("Produto indisponível some do carrinho", unavailableQuote.data?.quote.lines.length === 0);
    check("Cliente é avisado sobre o item indisponível", (unavailableQuote.data?.quote.warnings.length ?? 0) > 0);

    const unavailableOrder = await customer.request("/api/orders", {
      body: {
        items: [{ productId, quantity: 1 }],
        deliveryType: "PICKUP",
        paymentMethod: "PIX",
        scheduledFor: horarioDeRetirada(),
      },
    });
    check("Pedido com produto indisponível é rejeitado", !unavailableOrder.ok);

    const deleted = await admin.request<{ deleted: boolean }>(`/api/admin/products/${productId}`, {
      method: "DELETE",
    });
    check("Produto nunca vendido é excluído de verdade", deleted.data?.deleted === true);

    // Produto já vendido: desativa em vez de excluir.
    const soldProductDelete = await admin.request<{ deleted: boolean; message: string }>(
      `/api/admin/products/${espetoCarne.id}`,
      { method: "DELETE" },
    );
    check(
      "Produto já vendido é desativado, não excluído",
      soldProductDelete.data?.deleted === false,
      soldProductDelete.data?.message,
    );
    const stillThere = await prisma.product.findUnique({ where: { id: espetoCarne.id } });
    check("Produto vendido continua no banco (histórico preservado)", stillThere !== null);
    check("Produto vendido ficou inativo", stillThere?.active === false);

    // Reativa para não quebrar o cardápio depois do teste.
    await admin.request(`/api/admin/products/${espetoCarne.id}`, {
      method: "PATCH",
      body: { active: true, available: true },
    });
    const reactivated = await prisma.product.findUnique({ where: { id: espetoCarne.id } });
    check("Produto é reativado corretamente", reactivated?.active === true);

    // ------------------------------ clientes -------------------------------
    const customers = await admin.request<{
      customers: Array<{ email: string; orderCount: number; totalSpentCents: number }>;
    }>(`/api/admin/customers?search=${encodeURIComponent(email)}`);
    check("Busca de clientes funciona", customers.data?.customers.length === 1);
    check(
      "Cliente aparece com os pedidos que fez",
      (customers.data?.customers[0]?.orderCount ?? 0) >= 1,
      `${customers.data?.customers[0]?.orderCount}`,
    );
    check(
      "Valor gasto do cliente inclui o pedido de R$ 38,00",
      (customers.data?.customers[0]?.totalSpentCents ?? 0) >= 3800,
      `${customers.data?.customers[0]?.totalSpentCents}`,
    );
    check(
      "Resposta de clientes não expõe senha nem hash",
      !JSON.stringify(customers.data).toLowerCase().includes("passwordhash"),
    );

    // ------------------------------ financeiro -----------------------------
    const finance = await admin.request<{
      report: {
        grossRevenueCents: number;
        paidOrders: number;
        averageTicketCents: number;
        paymentBreakdown: { PIX: { revenueCents: number } };
      };
    }>("/api/admin/finance?period=today");
    check("Relatório financeiro responde", finance.ok);
    if (WEBHOOK_SECRET) {
      check(
        "Faturamento inclui o pedido pago",
        (finance.data?.report.grossRevenueCents ?? 0) >= 3800,
        `${finance.data?.report.grossRevenueCents}`,
      );
      check("Ticket médio é calculado", (finance.data?.report.averageTicketCents ?? 0) > 0);
      check(
        "Faturamento por PIX é contabilizado",
        (finance.data?.report.paymentBreakdown.PIX.revenueCents ?? 0) >= 3800,
      );
    }

    // ------------------------------- cupons --------------------------------
    const couponCode = `TESTE${stamp.toString().slice(-6)}`;
    const coupon = await admin.request<{ coupon: { id: string; code: string } }>("/api/admin/coupons", {
      body: {
        code: couponCode,
        description: "Cupom do teste automatizado",
        discountType: "PERCENT",
        discountValue: 10,
        minOrderCents: 1000,
        active: true,
      },
    });
    check("Admin cria cupom", coupon.ok, coupon.error?.message);

    const withCoupon = await customer.request<{
      quote: { subtotalCents: number; discountCents: number; totalCents: number };
    }>("/api/cart/quote", {
      body: {
        items: [{ productId: espetoCarne.id, quantity: 2 }, { productId: completo.id, quantity: 1 }],
        deliveryType: "PICKUP",
        couponCode,
      },
    });
    check("Cupom de 10% desconta R$ 2,80 de R$ 28,00", withCoupon.data?.quote.discountCents === 280,
      `${withCoupon.data?.quote.discountCents}`);
    check("Total com desconto = R$ 25,20", withCoupon.data?.quote.totalCents === 2520);

    const belowMinimum = await customer.request<{ quote: { discountCents: number; warnings: string[] } }>(
      "/api/cart/quote",
      {
        body: {
          items: [{ productId: espetoCarne.id, quantity: 1 }],
          deliveryType: "PICKUP",
          couponCode,
        },
      },
    );
    check("Cupom abaixo do mínimo não aplica desconto", belowMinimum.data?.quote.discountCents === 0);
    check("Cliente é avisado do motivo", (belowMinimum.data?.quote.warnings.length ?? 0) > 0);

    const fakeCoupon = await customer.request<{ quote: { discountCents: number } }>("/api/cart/quote", {
      body: {
        items: [{ productId: espetoCarne.id, quantity: 5 }],
        deliveryType: "PICKUP",
        couponCode: "CUPOM-QUE-NAO-EXISTE",
      },
    });
    check("Cupom inexistente não gera desconto", fakeCoupon.data?.quote.discountCents === 0);

    await prisma.coupon.deleteMany({ where: { code: couponCode } });

    // ----------------------------- configurações ---------------------------
    const settingsAdmin = await admin.request<{
      settings: { deliveryFeeCents: number; minOrderCents: number };
      paymentProviders: Array<{ id: string }>;
    }>("/api/admin/settings");
    check("Configurações do admin respondem", settingsAdmin.ok);
    check("Lista de gateways é exposta", (settingsAdmin.data?.paymentProviders.length ?? 0) >= 5);
    check(
      "Nenhuma credencial de gateway vaza para o painel",
      !/(access_?token|secret|api_?key)"\s*:\s*"[^"]{8,}/i.test(JSON.stringify(settingsAdmin.data)),
    );

    // Taxa de entrega configurável (e não fixa no código).
    const originalFee = settingsAdmin.data?.settings.deliveryFeeCents ?? 0;
    const base = settingsAdmin.data?.settings as Record<string, unknown>;
    const saveFee = await admin.request("/api/admin/settings", {
      method: "PUT",
      body: { ...base, deliveryFeeCents: 700, minOrderCents: 0 },
    });
    check("Admin altera a taxa de entrega", saveFee.ok, saveFee.error?.message);

    const deliveryQuote = await customer.request<{ quote: { deliveryFeeCents: number; totalCents: number } }>(
      "/api/cart/quote",
      {
        body: {
          items: [{ productId: espetoCarne.id, quantity: 2 }],
          deliveryType: "DELIVERY",
          neighborhood: "Centro",
        },
      },
    );
    check("Taxa configurada é aplicada no carrinho", deliveryQuote.data?.quote.deliveryFeeCents === 700);
    check("Total soma a taxa de entrega", deliveryQuote.data?.quote.totalCents === 2300);

    const pickupQuote = await customer.request<{ quote: { deliveryFeeCents: number } }>("/api/cart/quote", {
      body: { items: [{ productId: espetoCarne.id, quantity: 2 }], deliveryType: "PICKUP" },
    });
    check("Retirada não cobra taxa de entrega", pickupQuote.data?.quote.deliveryFeeCents === 0);

    // Pedido mínimo.
    await admin.request("/api/admin/settings", {
      method: "PUT",
      body: { ...base, deliveryFeeCents: 700, minOrderCents: 3000 },
    });
    const belowMin = await customer.request<{ quote: { meetsMinimum: boolean; missingForMinimumCents: number } }>(
      "/api/cart/quote",
      { body: { items: [{ productId: espetoCarne.id, quantity: 1 }], deliveryType: "PICKUP" } },
    );
    check("Pedido abaixo do mínimo é sinalizado", belowMin.data?.quote.meetsMinimum === false);
    check("Sistema informa quanto falta", belowMin.data?.quote.missingForMinimumCents === 2200);

    const blockedOrder = await customer.request("/api/orders", {
      body: {
        items: [{ productId: espetoCarne.id, quantity: 1 }],
        deliveryType: "PICKUP",
        paymentMethod: "PIX",
        scheduledFor: horarioDeRetirada(),
      },
    });
    check("Pedido abaixo do mínimo é recusado no servidor", !blockedOrder.ok);

    // Restaura as configurações originais.
    await admin.request("/api/admin/settings", {
      method: "PUT",
      body: { ...base, deliveryFeeCents: originalFee, minOrderCents: 0 },
    });

    // ------------------------- loja fechada bloqueia ------------------------
    await clearRateLimits();

    /**
     * O estado aberto/fechado precisa aparecer igual em TODAS as páginas.
     *
     * Já aconteceu de a home dizer "Aberto agora" e o carrinho — que é um
     * Client Component e por isso era pré-renderizado no build — servir um
     * HTML congelado dizendo "FECHADO", com o botão de finalizar desabilitado.
     * Estas asserções comparam o HTML entregue em várias rotas.
     */
    const paginasComStatus = ["/", "/carrinho", "/checkout", "/meus-pedidos"];

    const closeForHtml = await admin.request("/api/admin/settings", {
      method: "PUT",
      body: { ...base, deliveryFeeCents: originalFee, minOrderCents: 0, useManualSwitch: true, manualOpen: false },
    });
    check("Admin fecha a loja para o teste de coerência", closeForHtml.ok);

    for (const path of paginasComStatus) {
      const html = await fetch(`${BASE_URL}${path}`).then((r) => r.text());
      check(`Loja fechada aparece em ${path}`, html.includes("FECHADO"), "HTML sem o aviso");
    }

    const abertoDeNovo = await admin.request("/api/admin/settings", {
      method: "PUT",
      body: { ...base, deliveryFeeCents: originalFee, minOrderCents: 0, useManualSwitch: true, manualOpen: true },
    });
    check("Admin reabre para o teste de coerência", abertoDeNovo.ok);

    for (const path of paginasComStatus) {
      const html = await fetch(`${BASE_URL}${path}`).then((r) => r.text());
      check(
        `Loja aberta não mostra aviso de fechado em ${path}`,
        !html.includes("FECHADO"),
        "HTML com aviso de fechado obsoleto",
      );
    }
    const closeStore = await admin.request("/api/admin/settings", {
      method: "PUT",
      body: { ...base, deliveryFeeCents: originalFee, minOrderCents: 0, useManualSwitch: true, manualOpen: false },
    });
    check("Admin consegue fechar a loja", closeStore.ok);

    const closedOrder = await customer.request("/api/orders", {
      body: {
        items: [{ productId: espetoCarne.id, quantity: 2 }],
        deliveryType: "PICKUP",
        paymentMethod: "PIX",
        scheduledFor: horarioDeRetirada(),
      },
    });
    check("Loja fechada recusa novos pedidos", !closedOrder.ok);
    check(
      "Mensagem explica que a loja está fechada",
      closedOrder.error?.message.toLowerCase().includes("fechada") === true,
      closedOrder.error?.message,
    );

    const reopen = await admin.request("/api/admin/settings", {
      method: "PUT",
      body: { ...base, deliveryFeeCents: originalFee, minOrderCents: 0, useManualSwitch: true, manualOpen: true },
    });
    check("Admin reabre a loja", reopen.ok);

    const reopenedOrder = await customer.request<OrderResponse>("/api/orders", {
      body: {
        items: [{ productId: espetoCarne.id, quantity: 2 }],
        deliveryType: "PICKUP",
        paymentMethod: "PIX",
        scheduledFor: horarioDeRetirada(),
        idempotencyKey: `reopen-${stamp}`,
      },
    });
    check("Loja reaberta volta a aceitar pedidos", reopenedOrder.ok, reopenedOrder.error?.message);
  }

  // ============================ dinheiro e troco ============================
  section("Pagamento em dinheiro e troco");
  await clearRateLimits();

  const cashOrder = await customer.request<OrderResponse & { order: { changeForCents: number | null } }>(
    "/api/orders",
    {
      body: {
        items: [{ productId: espetoCarne.id, quantity: 2 }, { productId: completo.id, quantity: 1 }],
        deliveryType: "PICKUP",
        paymentMethod: "CASH",
        changeForCents: 5000,
        scheduledFor: horarioDeRetirada(),
        idempotencyKey: `cash-${stamp}`,
      },
    },
  );
  check("Pedido em dinheiro é criado", cashOrder.ok, cashOrder.error?.message);
  check("Total do pedido em dinheiro = R$ 28,00", cashOrder.data?.order.totalCents === 2800);
  check("Valor do troco é guardado", cashOrder.data?.order.changeForCents === 5000);
  check(
    "Troco calculado é R$ 22,00",
    (cashOrder.data?.order.changeForCents ?? 0) - (cashOrder.data?.order.totalCents ?? 0) === 2200,
  );

  const badChange = await customer.request("/api/orders", {
    body: {
      items: [{ productId: espetoCarne.id, quantity: 2 }],
      deliveryType: "PICKUP",
      paymentMethod: "CASH",
      changeForCents: 500,
      scheduledFor: horarioDeRetirada(),
      idempotencyKey: `badchange-${stamp}`,
    },
  });
  check("Troco menor que o total é recusado", !badChange.ok, badChange.error?.message);

  // =============================== histórico ================================
  section("Histórico e isolamento entre contas");
  await clearRateLimits();

  const history = await customer.request<{ orders: Array<{ id: string }>; total: number }>("/api/orders");
  check("Histórico do cliente responde", history.ok);
  check("Histórico traz os pedidos do cliente", (history.data?.total ?? 0) >= 2);

  // Outro cliente não pode ver o pedido alheio.
  const other = new Client();
  await other.request("/api/auth/register", {
    body: {
      name: "Outro Cliente",
      email: `outro.${stamp}@example.com`,
      phone: "11911112222",
      password,
    },
  });
  const stolen = await other.request(`/api/orders/${order?.id}`);
  check("Cliente não acessa pedido de outro cliente (404)", !stolen.ok && stolen.status === 404);

  const stolenCancel = await other.request(`/api/orders/${order?.id}/cancel`, { method: "POST" });
  check("Cliente não cancela pedido de outro cliente", !stolenCancel.ok);

  // ============================= cancelamento ===============================
  section("Cancelamento");
  await clearRateLimits();

  const cancelTarget = await customer.request<OrderResponse>("/api/orders", {
    body: {
      items: [{ productId: refrigerante.id, quantity: 1 }],
      deliveryType: "PICKUP",
      paymentMethod: "CASH",
      scheduledFor: horarioDeRetirada(),
      idempotencyKey: `cancel-${stamp}`,
    },
  });
  check("Pedido para cancelamento é criado", cancelTarget.ok);

  const cancelled = await customer.request<{ order: { status: string } }>(
    `/api/orders/${cancelTarget.data?.order.id}/cancel`,
    { body: { reason: "Teste de cancelamento" } },
  );
  check("Cliente cancela o próprio pedido", cancelled.ok && cancelled.data?.order.status === "CANCELLED");

  const doubleCancel = await customer.request(`/api/orders/${cancelTarget.data?.order.id}/cancel`, {
    method: "POST",
  });
  check("Pedido já cancelado não cancela de novo", !doubleCancel.ok && doubleCancel.status === 409);

  // ========================== tratamento de erros ===========================
  section("Tratamento de erros e validação");
  await clearRateLimits();

  const notFound = await customer.request("/api/orders/id-que-nao-existe");
  check("Pedido inexistente devolve 404", notFound.status === 404);

  const emptyCart = await customer.request("/api/orders", {
    body: {
      items: [],
      deliveryType: "PICKUP",
      paymentMethod: "PIX",
      scheduledFor: horarioDeRetirada(),
    },
  });
  check("Carrinho vazio é rejeitado", !emptyCart.ok && emptyCart.status === 422);

  const badJson = await fetch(`${BASE_URL}/api/cart/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL },
    body: "{ isso não é json",
  });
  check("JSON inválido devolve 400, não 500", badJson.status === 400);

  const badMethod = await customer.request("/api/orders", {
    body: {
      items: [{ productId: espetoCarne.id, quantity: 1 }],
      deliveryType: "PICKUP",
      paymentMethod: "BITCOIN",
      scheduledFor: horarioDeRetirada(),
    },
  });
  check("Forma de pagamento inválida é rejeitada", !badMethod.ok && badMethod.status === 422);

  const missingAddress = await customer.request("/api/orders", {
    body: {
      items: [{ productId: espetoCarne.id, quantity: 2 }],
      deliveryType: "DELIVERY",
      paymentMethod: "PIX",
      scheduledFor: horarioDeRetirada(),
      idempotencyKey: `noaddr-${stamp}`,
    },
  });
  check(
    "Entrega sem endereço é rejeitada",
    !missingAddress.ok || missingAddress.status === 400,
    missingAddress.error?.message,
  );

  const xss = await customer.request<{ user: { name: string } }>("/api/me", {
    method: "PATCH",
    body: {
      name: "Cliente <script>alert(1)</script>",
      email,
      phone: "11987654321",
    },
  });
  check(
    "Entrada com script é aceita como texto puro (React escapa na renderização)",
    xss.ok && typeof xss.data?.user.name === "string",
  );

  const sqlInjection = await customer.request<{ quote: { lines: unknown[] } }>("/api/cart/quote", {
    body: {
      items: [{ productId: "'; DROP TABLE products; --", quantity: 1 }],
      deliveryType: "PICKUP",
    },
  });
  check("Tentativa de SQL injection não quebra a consulta", sqlInjection.ok);
  const productsStillExist = await prisma.product.count();
  check("Tabela de produtos continua intacta", productsStillExist >= 7, `${productsStillExist}`);

  // ============================== rate limiting =============================
  section("Rate limiting");

  const attempts = await Promise.all(
    Array.from({ length: 12 }, () =>
      new Client().request("/api/auth/login", {
        body: { email: `naoexiste.${stamp}@example.com`, password: "SenhaQualquer1" },
      }),
    ),
  );
  check(
    "Excesso de tentativas de login é bloqueado (429)",
    attempts.some((attempt) => attempt.status === 429),
  );

  // ================================ logout ==================================
  section("Logout");

  const logout = await customer.request("/api/auth/logout", { method: "POST" });
  check("Logout responde", logout.ok);
  check("Cookie de sessão é removido", !customer.isLoggedIn);

  const afterLogout = await customer.request<{ user: unknown }>("/api/me");
  check("Depois do logout não há usuário", afterLogout.data?.user === null);

  const protectedAfterLogout = await customer.request("/api/orders");
  check("Rota protegida exige login novamente", !protectedAfterLogout.ok && protectedAfterLogout.status === 401);

  // ============================ páginas do site =============================
  section("Páginas renderizam");

  const pages = [
    "/",
    "/cardapio",
    "/carrinho",
    "/checkout",
    "/login",
    "/cadastro",
    "/recuperar-senha",
    "/meus-pedidos",
    "/minha-conta",
  ];
  for (const path of pages) {
    const response = await fetch(`${BASE_URL}${path}`);
    check(`GET ${path} responde 200`, response.status === 200, `${response.status}`);
  }

  // O dashboard já renderizou em branco por conta de constantes e funções
  // exportadas de módulos "use client" chegando como undefined no servidor.
  // Estas asserções olham o HTML entregue e pegariam a regressão de novo.
  if (ADMIN_PASSWORD) {
    const dashboardHtml = await fetch(`${BASE_URL}/admin`, {
      headers: {
        cookie: `ds_session=${(admin as unknown as { cookies: Map<string, string> }).cookies.get("ds_session")}`,
      },
    }).then((response) => response.text());

    check("Dashboard entrega HTML (não redireciona o admin)", dashboardHtml.includes("Dashboard"));
    check(
      "Cartões de indicador aparecem no HTML",
      dashboardHtml.includes("FATURAMENTO HOJE") || dashboardHtml.includes("Faturamento hoje"),
    );
    check(
      "Rosca de pagamentos sai com cor (constante cruzou a fronteira servidor/cliente)",
      dashboardHtml.includes(CHART_COLORS.pix),
      "cor da fatia PIX ausente no HTML",
    );
    check(
      "Barras do gráfico têm altura real (não zero)",
      /height:\s*(?!0(px)?[;"])\d+px/.test(dashboardHtml),
      "nenhuma barra com altura em pixels",
    );
    check(
      "Selos de status renderizam com o tom correto",
      dashboardHtml.includes("Aguardando pagamento") || dashboardHtml.includes("Nenhum pedido ainda"),
    );

    // A agenda é um Server Component e já quebrou inteira por importar `cx`
    // de um módulo "use client". Esta asserção pega a regressão.
    const agendaHtml = await fetch(`${BASE_URL}/admin/agenda`, {
      headers: {
        cookie: `ds_session=${(admin as unknown as { cookies: Map<string, string> }).cookies.get("ds_session")}`,
      },
    }).then((response) => response.text());

    check("Agenda do painel entrega HTML", agendaHtml.includes("Agenda"));
    check(
      "Agenda não caiu na tela de erro",
      !agendaHtml.includes("Algo deu errado"),
      "página de erro renderizada",
    );
    check(
      "Agenda mostra a regra de capacidade em vigor",
      /janelas? de \d+ min/.test(agendaHtml),
      "texto da janela ausente",
    );
  }

  const adminPage = await fetch(`${BASE_URL}/admin`, { redirect: "manual" });
  check(
    "/admin redireciona quem não está logado",
    adminPage.status === 307 || adminPage.status === 302,
    `${adminPage.status}`,
  );

  const missingPage = await fetch(`${BASE_URL}/pagina-que-nao-existe`);
  check("Página inexistente devolve 404", missingPage.status === 404);

  // ================================ limpeza =================================
  if (originalStore) {
    await prisma.settings.update({
      where: { id: "default" },
      data: { ...originalStore, openingHours: originalStore.openingHours as never },
    });
  }

  // Orders não têm cascade a partir de User (de propósito: um pedido nunca
  // deve desaparecer junto com o cliente). Então apagamos na ordem certa.
  const testUsers = await prisma.user.findMany({
    where: { OR: [{ email }, { email: { contains: `.${stamp}@example.com` } }] },
    select: { id: true },
  });
  const testUserIds = testUsers.map((user) => user.id);
  if (testUserIds.length > 0) {
    await prisma.order.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }
  await clearRateLimits();

  // ================================ resumo ==================================
  console.log(`\n${"─".repeat(60)}`);
  console.log(`\x1b[1mResultado:\x1b[0m ${passed} passaram, ${failed} falharam`);
  if (failures.length > 0) {
    console.log("\n\x1b[31mFalhas:\x1b[0m");
    failures.forEach((failure) => console.log(`  • ${failure}`));
  }
  console.log(`${"─".repeat(60)}\n`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error("\nErro fatal no teste:", error);
  await prisma.$disconnect();
  process.exit(1);
});
