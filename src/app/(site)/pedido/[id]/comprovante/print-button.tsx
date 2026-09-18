"use client";

import { Button } from "@/components/ui";

/**
 * Aciona a impressão do navegador.
 * O mesmo diálogo oferece "Salvar como PDF" em Windows, macOS, Android e
 * iOS — por isso não carregamos nenhuma biblioteca de PDF no cliente.
 */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()} variant="outline">
      Imprimir / salvar PDF
    </Button>
  );
}
