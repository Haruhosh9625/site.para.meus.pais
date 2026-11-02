import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hashPassword, validatePasswordStrength } from "../src/server/password";

/**
 * Criação segura do administrador — `npm run admin:create`.
 *
 * O comportamento depende de quem guarda a senha (AUTH_PROVIDER):
 *
 * ── Supabase Auth (produção) ──
 * A senha mora no Supabase e este script não tem como criá-la sem a chave
 * de serviço — que de propósito não circula por aqui. Então o caminho é:
 *
 *   1. a pessoa cria a conta normalmente no site, em /cadastro;
 *   2. `npm run admin:create` PROMOVE essa conta a ADMIN.
 *
 * Sai melhor assim: a senha é escolhida pela própria pessoa, nunca passa
 * por um script, por um arquivo ou pelo histórico do shell.
 *
 *   ADMIN_EMAIL=dono@exemplo.com npm run admin:create
 *
 * ── Provedor local (desenvolvimento) ──
 * A senha mora neste banco, e o script cria a conta inteira. Duas formas:
 *
 *   1. Interativa (recomendada): a senha é digitada no terminal, sem eco,
 *      e não fica no histórico do shell nem em nenhum arquivo.
 *
 *        npm run admin:create
 *
 *   2. Por variáveis de ambiente (útil em CI/deploy):
 *
 *        ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create
 *
 * Em nenhum dos casos existe senha padrão embutida no código.
 */

const prisma = new PrismaClient();

/** Mesma dedução de src/server/env.ts, sem importar o módulo do servidor. */
function provedorDeIdentidade(): "supabase" | "local" {
  const declarado = (process.env.AUTH_PROVIDER ?? "").trim().toLowerCase();
  if (declarado === "supabase" || declarado === "local") return declarado;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  return url && key ? "supabase" : "local";
}

/** Promove uma conta existente a ADMIN. Não toca em senha. */
async function promover(email: string) {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (!existing) {
    throw new Error(
      `Não há conta com o e-mail ${email}.\n\n` +
        "Com o Supabase Auth a senha é definida pela própria pessoa. Peça para ela:\n" +
        "  1. abrir o site e criar a conta em /cadastro;\n" +
        "  2. confirmar o e-mail, se o projeto exigir confirmação.\n" +
        "Depois rode este comando de novo para promovê-la a administradora.",
    );
  }

  if (existing.role === "ADMIN") {
    await prisma.user.update({ where: { id: existing.id }, data: { active: true } });
    console.log(`${email} já é administrador (conta reativada, se estava inativa).`);
    return;
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: { role: "ADMIN", active: true },
  });
  console.log(`Administrador: ${email} promovido a ADMIN.`);
}

/** Lê a senha sem exibi-la no terminal. */
async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const output = stdout as unknown as { write: (chunk: string) => boolean };
  const originalWrite = output.write.bind(output);
  let muted = false;

  output.write = (chunk: string) => (muted ? true : originalWrite(chunk));

  const promise = rl.question(question);
  muted = true;
  try {
    const answer = await promise;
    return answer;
  } finally {
    muted = false;
    output.write = originalWrite;
    originalWrite("\n");
    rl.close();
  }
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const provider = provedorDeIdentidade();
  const interactive = !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD;

  const email = (process.env.ADMIN_EMAIL ?? (await ask("E-mail do administrador: ")))
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("E-mail inválido.");
  }

  if (provider === "supabase") {
    await promover(email);
    return;
  }

  const name =
    process.env.ADMIN_NAME ?? (interactive ? await ask("Nome (Enter para 'Administrador'): ") : "");
  const phone =
    process.env.ADMIN_PHONE ?? (interactive ? await ask("Telefone com DDD (opcional): ") : "");

  const password = process.env.ADMIN_PASSWORD ?? (await promptHidden("Senha: "));
  const strengthError = validatePasswordStrength(password);
  if (strengthError) throw new Error(strengthError);
  if (password.length < 10) {
    throw new Error("Para uma conta de administrador, use pelo menos 10 caracteres.");
  }

  if (interactive && !process.env.ADMIN_PASSWORD) {
    const confirmation = await promptHidden("Confirme a senha: ");
    if (confirmation !== password) throw new Error("As senhas não conferem.");
  }

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const answer = interactive
      ? await ask(`Usuário ${email} já existe. Redefinir a senha e promover a ADMIN? (s/N) `)
      : "s";
    if (answer.toLowerCase() !== "s") {
      console.log("Nada foi alterado.");
      return;
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: "ADMIN", active: true, authUserId: existing.id },
    });
    // Invalida todas as sessões antigas após a troca de senha.
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    console.log(`Administrador atualizado: ${email}`);
    return;
  }

  const criado = await prisma.user.create({
    data: {
      name: name.trim() || "Administrador",
      email,
      phone: phone.replace(/\D/g, "") || "00000000000",
      passwordHash,
      role: "ADMIN",
    },
    select: { id: true },
  });
  // No provedor local a identidade é o próprio id da linha.
  await prisma.user.update({ where: { id: criado.id }, data: { authUserId: criado.id } });
  console.log(`Administrador criado: ${email}`);
}

main()
  .catch((error) => {
    console.error(`Erro: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
