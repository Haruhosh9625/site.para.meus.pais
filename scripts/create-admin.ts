import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hashPassword, validatePasswordStrength } from "../src/server/password";

/**
 * Criação segura do administrador — `npm run admin:create`.
 *
 * Duas formas de usar:
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
  const interactive = !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD;

  const email = (process.env.ADMIN_EMAIL ?? (await ask("E-mail do administrador: ")))
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("E-mail inválido.");
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
      data: { passwordHash, role: "ADMIN", active: true },
    });
    // Invalida todas as sessões antigas após a troca de senha.
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    console.log(`Administrador atualizado: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      name: name.trim() || "Administrador",
      email,
      phone: phone.replace(/\D/g, "") || "00000000000",
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`Administrador criado: ${email}`);
}

main()
  .catch((error) => {
    console.error(`Erro: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
