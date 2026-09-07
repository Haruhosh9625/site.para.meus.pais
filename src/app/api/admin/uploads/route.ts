import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { route, created } from "@/server/api";
import { assertCsrf, requireAdmin } from "@/server/auth";
import { badRequest } from "@/server/errors";
import { env } from "@/server/env";
import { audit } from "@/server/audit";

/**
 * Upload de foto de produto.
 *
 * Grava em UPLOAD_DIR (padrão public/uploads) e devolve a URL pública.
 * Em produção serverless (Vercel, por exemplo) o disco é efêmero: nesse caso
 * desligue com ENABLE_UPLOADS=false e informe a URL da imagem hospedada em
 * S3/R2/Cloudinary direto no campo de foto do produto.
 */
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/svg+xml", "svg"],
]);

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

export const POST = route(async (request: Request) => {
  await assertCsrf();
  const admin = await requireAdmin();

  if (!env.uploadsEnabled) {
    throw badRequest(
      "Upload de arquivos está desativado (ENABLE_UPLOADS=false). " +
        "Informe a URL da imagem no campo de foto do produto.",
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Envie um arquivo no campo `file`.");

  const extension = ALLOWED.get(file.type);
  if (!extension) {
    throw badRequest("Formato não aceito. Use JPG, PNG, WebP, AVIF ou SVG.");
  }
  if (file.size > MAX_BYTES) throw badRequest("A imagem deve ter no máximo 3 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());

  // SVG pode carregar script: só aceitamos um subconjunto sem <script> nem
  // manipuladores de evento, evitando XSS armazenado.
  if (extension === "svg") {
    const text = buffer.toString("utf8");
    if (/<script|on\w+\s*=|javascript:/i.test(text)) {
      throw badRequest("Este SVG contém scripts e não pode ser enviado.");
    }
  }

  // Nome gerado pelo servidor: o nome original do arquivo nunca toca o disco
  // (evita path traversal e colisões).
  const filename = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${extension}`;
  const directory = resolve(process.cwd(), env.uploadDir);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, filename), buffer);

  const url = env.uploadDir.replace(/^public/, "").replace(/\/+$/, "") + `/${filename}`;

  await audit({
    action: "upload.created",
    userId: admin.id,
    metadata: { filename, size: file.size, type: file.type },
  });

  return created({ url: url.startsWith("/") ? url : `/${url}` });
});
