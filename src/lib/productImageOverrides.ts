const TEMP_PRODUCT_IMAGE_OVERRIDES = [
  {
    url: "/temp-product-photos/galinhacaipira.png",
    aliases: ["galinha caipira"],
  },
  {
    url: "/temp-product-photos/joelho.png",
    aliases: ["joelho"],
  },
  {
    url: "/temp-product-photos/lagartinho_trairinha.png",
    aliases: ["lagartinho trairinha"],
  },
  {
    url: "/temp-product-photos/Lagarto Black angus.png",
    aliases: ["lagarto black angus", "largato black anguns", "lagarto black anguns"],
  },
  {
    url: "/temp-product-photos/Lingua.png",
    aliases: ["lingua"],
  },
  {
    url: "/temp-product-photos/linguica de frango.png",
    aliases: ["linguica de frango suasage", "linguica de frango sausage", "linguica de frango"],
  },
  {
    url: "/temp-product-photos/linguicadefumada.png",
    aliases: ["linguica defumada"],
  },
  {
    url: "/temp-product-photos/lombo.png",
    aliases: ["lombo"],
  },
  {
    url: "/temp-product-photos/macadepeitocomossos.png",
    aliases: ["maca de peito com osso black anguns", "maca de peito com osso black angus", "maca de peito com osso"],
  },
  {
    url: "/temp-product-photos/Macadepeito.png",
    aliases: ["maca de peito", "maca de peito 71", "maca de peito 71 2"],
  },
] as const;

function normalizeProductText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasValidProductImage(value: unknown) {
  const raw = String(value || "").trim();
  return Boolean(raw && raw !== "NULL");
}

export function resolvePriorityProductImage(
  name: unknown,
  fallbackUrl: unknown,
  extraNames: unknown[] = [],
) {
  const candidates = [name, ...extraNames]
    .map((item) => normalizeProductText(item))
    .filter(Boolean);

  for (const candidate of candidates) {
    for (const override of TEMP_PRODUCT_IMAGE_OVERRIDES) {
      if (override.aliases.some((alias) => candidate === alias || candidate.includes(alias))) {
        return override.url;
      }
    }
  }

  return hasValidProductImage(fallbackUrl) ? String(fallbackUrl) : null;
}
