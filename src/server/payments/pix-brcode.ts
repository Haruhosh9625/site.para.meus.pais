/**
 * Gerador de "PIX Copia e Cola" (BR Code) conforme o padrão EMV QRCPS-MPM
 * adotado pelo Banco Central.
 *
 * O payload é montado como uma sequência de campos ID + tamanho + valor e
 * termina com um CRC-16/CCITT-FALSE calculado sobre tudo que veio antes.
 * O código gerado aqui é válido de verdade: qualquer app bancário lê.
 *
 * Usado pelo provedor "manual", em que a chave PIX é da própria loja e a
 * confirmação do pagamento é feita depois pelo backend (webhook do banco ou
 * baixa manual pelo administrador autenticado) — nunca pelo cliente.
 */

function field(id: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${id}${length}${value}`;
}

/** Remove acentos e caracteres fora do conjunto aceito pelo padrão. */
function sanitize(value: string, maxLength: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 $%*+\-./:]/g, "")
    .trim()
    .slice(0, maxLength)
    .toUpperCase();
}

/** CRC-16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF). */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type BrCodeInput = {
  /** Chave PIX: CPF/CNPJ, e-mail, telefone (+55...) ou chave aleatória. */
  pixKey: string;
  /** Valor em centavos. */
  amountCents: number;
  receiverName: string;
  receiverCity: string;
  /** Identificador do pedido (aparece na conciliação do recebedor). */
  txid: string;
  description?: string;
};

export function generatePixBrCode(input: BrCodeInput): string {
  const name = sanitize(input.receiverName || "RECEBEDOR", 25);
  const city = sanitize(input.receiverCity || "BRASIL", 15);
  // O txid aceita apenas alfanuméricos, com no máximo 25 caracteres.
  const txid = (input.txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  // Merchant Account Information — GUI do PIX + chave (+ descrição opcional).
  const merchantAccount =
    field("00", "br.gov.bcb.pix") +
    field("01", input.pixKey) +
    (input.description ? field("02", sanitize(input.description, 72)) : "");

  const amount = (input.amountCents / 100).toFixed(2);

  const payload =
    field("00", "01") + // Payload Format Indicator
    field("01", "12") + // Point of Initiation: 12 = QR de uso único
    field("26", merchantAccount) +
    field("52", "0000") + // Merchant Category Code
    field("53", "986") + // Moeda: 986 = BRL
    field("54", amount) +
    field("58", "BR") + // País
    field("59", name) +
    field("60", city) +
    field("62", field("05", txid)) + // Additional Data — Reference Label
    "6304"; // ID + tamanho do CRC, que entra no cálculo

  return payload + crc16(payload);
}
