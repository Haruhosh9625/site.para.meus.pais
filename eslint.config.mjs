import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // next-env.d.ts é gerado pelo Next a cada build; os *.mjs da raiz são
    // utilitários de captura de tela usados durante o desenvolvimento.
    // `.claude/` guarda as skills do agente, código de terceiros instalado
    // por `npx skills add` (JavaScript minificado incluso). Não é código do
    // projeto: lintá-lo só enterraria os avisos que importam.
    ignores: ["node_modules/**", ".next/**", "next-env.d.ts", "*.mjs", ".claude/**"],
  },
  {
    rules: {
      // Preferimos avisar sobre variáveis não usadas, permitindo o prefixo _
      // para descartes intencionais (ex.: const { deliveryAreas: _areas, ...rest }).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
];

export default config;
