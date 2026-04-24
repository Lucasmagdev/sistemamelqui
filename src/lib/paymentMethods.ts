export type SupportedPaymentMethod = "vemo" | "zelle" | "cartao" | "pix" | "dinheiro" | "square";

export const normalizePaymentMethodValue = (value: string | null | undefined) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "veo" || raw === "vemo") return "vemo";
  return raw;
};

export const getPaymentMethodLabel = (
  value: string | null | undefined,
  locale: "pt" | "en" = "pt",
) => {
  const normalized = normalizePaymentMethodValue(value);
  const isEn = locale === "en";

  switch (normalized) {
    case "vemo":
      return "Vemo";
    case "zelle":
      return "Zelle";
    case "cartao":
      return isEn ? "Card" : "Cartao";
    case "pix":
      return "Pix";
    case "dinheiro":
      return isEn ? "Cash" : "Dinheiro";
    case "square":
      return isEn ? "Credit/Debit Card (Square)" : "Cartão de Crédito/Débito (Square)";
    default:
      return value ? String(value) : isEn ? "Not informed" : "Nao informado";
  }
};

export const checkoutPaymentOptions = (locale: "pt" | "en" = "pt") => {
  const isEn = locale === "en";
  return [
    {
      value: "vemo",
      label: "Vemo",
      description: isEn ? "Receive QR code and payment link after confirmation." : "Receba QR code e link de pagamento apos a confirmacao.",
    },
    {
      value: "zelle",
      label: "Zelle",
      description: isEn ? "Receive QR code and payment link after confirmation." : "Receba QR code e link de pagamento apos a confirmacao.",
    },
    {
      value: "cartao",
      label: isEn ? "Card" : "Cartao",
      description: isEn ? "Payment in person at pickup or delivery." : "Pagamento presencial na retirada ou entrega.",
    },
    {
      value: "square",
      label: isEn ? "Credit/Debit Card (Online)" : "Cartão Online (Square)",
      description: isEn ? "Pay securely by card right now. Encrypted by Square." : "Pague com cartão agora. Criptografado pela Square.",
    },
  ] as const;
};

export const adminSalePaymentOptions = [
  { value: "vemo", label: "Vemo" },
  { value: "zelle", label: "Zelle" },
  { value: "cartao", label: "Cartao" },
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
] as const;
