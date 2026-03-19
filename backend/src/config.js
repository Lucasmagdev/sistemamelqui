export function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "*") return "*";

  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

const configuredOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const serviceOrigins = [
  process.env.ZAPI_BASE_URL,
  "https://api.z-api.io",
]
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

export const config = Object.freeze({
  port: Number(process.env.PORT || 3001),
  kgToLb: 2.2046226218,
  maxBase64Bytes: Number(process.env.MAX_INVOICE_UPLOAD_BYTES || 15 * 1024 * 1024),
  perfLogsEnabled: /^(1|true|yes|on)$/i.test(String(process.env.PERF_LOGS || "").trim()),
  allowedOrigins: Array.from(new Set([...configuredOrigins, ...serviceOrigins])),
  status: Object.freeze({
    RECEBIDO: 0,
    CONFIRMADO: 1,
    PREPARO: 2,
    PRONTO: 3,
    ENTREGA: 4,
    CONCLUIDO: 5,
  }),
});
