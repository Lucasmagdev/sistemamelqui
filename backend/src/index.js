import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createAssistantService } from "./assistant.js";
import { config } from "./config.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createOrdersRouter } from "./routes/orders.js";
import { createStockRouter } from "./routes/stock.js";
import { createZapiRouter } from "./routes/zapi.js";
import { createDeliveryRoutesRouter } from "./routes/deliveryRoutes.js";

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(createCorsMiddleware());

const PORT = config.port;
const KG_TO_LB = config.kgToLb;
const MAX_B64_BYTES = config.maxBase64Bytes;
const PERF_LOGS_ENABLED = config.perfLogsEnabled;
const STATUS = config.status;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function createHttpError(status, message, detail = null) {
  const error = new Error(message);
  error.status = status;
  error.detail = detail;
  return error;
}

function logPerf(label, startedAt, meta = {}) {
  if (!PERF_LOGS_ENABLED) return;
  const elapsed = Date.now() - startedAt;
  const payload = Object.keys(meta || {}).length ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[perf] ${label} ${elapsed}ms${payload}`);
}

async function measureStep(label, task, metaBuilder = null) {
  const startedAt = Date.now();
  try {
    const result = await task();
    const meta = typeof metaBuilder === "function" ? metaBuilder(result) : (metaBuilder || {});
    logPerf(label, startedAt, meta);
    return result;
  } catch (error) {
    logPerf(label, startedAt, { error: error?.message || String(error) });
    throw error;
  }
}

async function requireAssistantAdmin(req) {
  const authHeader = String(req.headers?.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw createHttpError(401, "Acesso nao autorizado.", "Envie um token Bearer valido.");
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw createHttpError(401, "Acesso nao autorizado.", "Token Bearer ausente.");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData?.user) {
    throw createHttpError(401, "Sessao invalida.", authError?.message || null);
  }

  let profile = null;
  const email = String(authData.user.email || "").trim().toLowerCase();

  const byAuthUser = await supabase
    .from("users")
    .select("id, nome, email, tipo, auth_user_id, tenant_id")
    .eq("auth_user_id", authData.user.id)
    .order("id", { ascending: false })
    .limit(1);

  if (!byAuthUser.error && byAuthUser.data?.[0]) {
    profile = byAuthUser.data[0];
  }

  if (!profile && email) {
    const byEmail = await supabase
      .from("users")
      .select("id, nome, email, tipo, tenant_id")
      .eq("email", email)
      .order("id", { ascending: false })
      .limit(1);

    if (!byEmail.error && byEmail.data?.[0]) {
      profile = byEmail.data[0];
    }
  }

  if (!profile) {
    throw createHttpError(403, "Perfil administrativo nao encontrado.");
  }

  if (String(profile.tipo || "").toLowerCase() !== "admin") {
    throw createHttpError(403, "Acesso restrito a administradores.");
  }

  return {
    authUserId: authData.user.id,
    profileId: profile.id,
    tenantId: Number(profile.tenant_id || 1),
    name: profile.nome || authData.user.email || "admin",
    email: email || String(profile.email || "").trim().toLowerCase() || null,
  };
}

function parseNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseLooseNumber(value, fallback = NaN) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  let raw = String(value).trim();
  if (!raw) return fallback;

  raw = raw.replace(/[^\d,.-]/g, "");
  if (!raw) return fallback;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    raw = raw.replace(",", ".");
  }

  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

function roundQty(value, digits = 3) {
  return Number(parseNumber(value, 0).toFixed(digits));
}

function formatQuantity(value) {
  const num = parseNumber(value, 0);
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2).replace(/\.?0+$/, "");
}

function formatMoney(value) {
  const num = parseNumber(value, NaN);
  if (!Number.isFinite(num)) return null;
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDateForDisplay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR");
}

const BRAZIL_AREA_CODES = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24",
  "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46",
  "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

function isLikelyBrazilMobileLocal(digits) {
  return digits.length === 11
    && BRAZIL_AREA_CODES.has(digits.slice(0, 2))
    && digits.slice(2, 3) === "9";
}

function inferPhoneCountry(rawPhone) {
  const raw = String(rawPhone || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (raw.startsWith("+")) {
    if (digits.startsWith("55")) return "Brasil";
    if (digits.startsWith("1")) return "USA";
    return null;
  }

  if (raw.startsWith("00") && digits.length > 2) {
    const withoutPrefix = digits.slice(2);
    if (withoutPrefix.startsWith("55")) return "Brasil";
    if (withoutPrefix.startsWith("1")) return "USA";
    return null;
  }

  if (isLikelyBrazilMobileLocal(digits)) return "Brasil";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return "Brasil";
  if (digits.startsWith("1") && digits.length === 11) return "USA";
  if (digits.length === 10) return "USA";
  return null;
}

function normalizePhone(rawPhone) {
  const raw = String(rawPhone || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return digits;
  if (raw.startsWith("00") && digits.length > 2) return digits.slice(2);

  if (isLikelyBrazilMobileLocal(digits)) return `55${digits}`;
  if ((digits.startsWith("55") && (digits.length === 12 || digits.length === 13))
    || (digits.startsWith("1") && digits.length === 11)) {
    return digits;
  }
  if (digits.length === 10) return `1${digits}`;
  if (digits.length >= 11) return digits;
  return digits;
}

function isLikelyPhoneDigits(rawValue) {
  const digits = String(rawValue || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function normalizeLocale(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (raw.startsWith("en")) return "en";
  return "pt";
}

function normalizeStockUnit(value, fallback = "LB") {
  const raw = String(value || "").toUpperCase().trim();
  if (["LB", "LBS"].includes(raw)) return "LB";
  if (["KG", "KGS"].includes(raw)) return "KG";
  if (["UN", "UNIT", "UNIDADE"].includes(raw)) return "UN";
  return fallback;
}

function getAllowedSaleUnitsForStockUnit(stockUnit) {
  const normalized = normalizeStockUnit(stockUnit, "LB");
  return normalized === "UN" ? ["UN"] : ["LB", "KG"];
}

function isSaleUnitAllowedForStockUnit(saleUnit, stockUnit) {
  return getAllowedSaleUnitsForStockUnit(stockUnit).includes(normalizeStockUnit(saleUnit, "UN"));
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(query, target) {
  if (!query || !target) return 0;
  if (query === target) return 1;
  if (target.includes(query) || query.includes(target)) return 0.92;

  const qTokens = query.split(" ").filter(Boolean);
  const tTokens = target.split(" ").filter(Boolean);
  if (!qTokens.length || !tTokens.length) return 0;

  let hits = 0;
  for (const q of qTokens) {
    if (tTokens.some((t) => t.includes(q) || q.includes(t))) hits += 1;
  }

  return hits / Math.max(qTokens.length, tTokens.length);
}

function sanitizeInvoiceProductName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  return raw
    .replace(/^#?\d+\s*-\s*\d+\s*-\s*/i, "")
    .replace(/^#?\d+\s*-\s*/i, "")
    .replace(/^\d+\s+\d+\s*-\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function convertQuantity(value, fromUnit, toUnit) {
  const qty = parseNumber(value, NaN);
  if (!Number.isFinite(qty)) {
    throw createHttpError(400, "Quantidade invalida para conversao de unidade.");
  }

  const from = normalizeStockUnit(fromUnit, "LB");
  const to = normalizeStockUnit(toUnit, "LB");
  if (from === to) return qty;
  if (from === "KG" && to === "LB") return qty * KG_TO_LB;
  if (from === "LB" && to === "KG") return qty / KG_TO_LB;
  throw createHttpError(400, `Conversao de unidade nao suportada: ${from} -> ${to}`);
}

function resolveMessageLocale(order, client) {
  const orderLocale = order?.locale || order?.order_locale || order?.pedido_locale || order?.idioma;
  if (orderLocale) return normalizeLocale(orderLocale);
  const clientLocale = client?.preferred_locale || client?.locale || client?.idioma;
  if (clientLocale) return normalizeLocale(clientLocale);
  return normalizeLocale(process.env.DEFAULT_MESSAGE_LOCALE || "pt");
}

function resolveOrderCode(order) {
  const explicitCode =
    order?.codigo_pedido || order?.numero_pedido || order?.codigo || order?.code || order?.numero || null;

  if (explicitCode) {
    const code = String(explicitCode).trim();
    if (!code) return `IMP${order?.id}`;
    return code.toUpperCase().startsWith("IMP") ? code : `IMP${code}`;
  }

  return `IMP${order?.id}`;
}

function resolveDeliveryAddress(client) {
  const street = [client?.endereco_rua, client?.endereco_numero]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
  const complement = String(client?.endereco_complemento || "").trim();
  const locality = [client?.cidade, client?.estado, client?.cep]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
  const country = String(client?.pais || "").trim();
  return [street, complement, locality, country].filter(Boolean).join(" - ");
}

const ZAPI_MESSAGE_SETTINGS_KEYS = {
  confirmed: "zapi_template_confirmed",
  out_for_delivery: "zapi_template_out_for_delivery",
};

const VEMO_QR_SETTING_KEYS = ["vemo_qr_code_base64", "veo_qr_code_base64"];
const VEMO_PAYMENT_LINK_SETTING_KEYS = ["vemo_payment_link", "veo_payment_link"];
const ZELLE_QR_SETTING_KEYS = ["zelle_qr_code_base64"];
const ZELLE_PAYMENT_LINK_SETTING_KEYS = ["zelle_payment_link"];
const STORE_BRANDING_SETTINGS_KEYS = {
  companyName: "storefront_company_name",
  primaryColor: "storefront_primary_color",
  logoUrl: "storefront_logo_url",
  publicStoreUrl: "storefront_public_url",
};
const ZAPI_GROUP_SETTINGS_KEYS = {
  orderConfirmedGroupId: "zapi_group_order_confirmed_id",
  orderConfirmedGroupName: "zapi_group_order_confirmed_name",
};
const DEFAULT_STORE_BRANDING = {
  nomeEmpresa: "Sabor Imperial",
  corPrimaria: "#D4AF37",
  logoUrl: "/brand/logo-sabor-imperial.png",
  publicStoreUrl: String(process.env.FRONTEND_URL || "").trim() || null,
};

function normalizePublicStoreUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

const ZAPI_TEMPLATE_PLACEHOLDERS = [
  "{{nome}}",
  "{{codigo_pedido}}",
  "{{itens}}",
  "{{itens_bloco}}",
  "{{total_estimado}}",
  "{{total_bloco}}",
  "{{endereco_entrega}}",
  "{{endereco_bloco}}",
];

const DEFAULT_ZAPI_MESSAGE_TEMPLATES = {
  confirmed: {
    pt: [
      "Atualizacao do pedido: Ola {{nome}}, seu pedido {{codigo_pedido}} foi confirmado com sucesso!",
      "",
      "Ja comecamos a preparacao dos itens.",
      "Produtos vendidos por peso (KG/LB) podem ter pequena variacao de valor apos pesagem e embalagem.",
      "",
      "{{itens_bloco}}",
      "{{total_bloco}}",
    ].join("\n"),
    en: [
      "Order update: Hi {{nome}}, your order {{codigo_pedido}} was confirmed successfully!",
      "",
      "We have already started preparing your items.",
      "Products sold by weight (KG/LB) may have a small price variation after weighing and packaging.",
      "",
      "{{itens_bloco}}",
      "{{total_bloco}}",
    ].join("\n"),
  },
  out_for_delivery: {
    pt: [
      "Atualizacao de entrega: Ola {{nome}}, seu pedido {{codigo_pedido}} saiu para entrega!",
      "",
      "Em breve ele chegara ao endereco informado.",
      "{{endereco_bloco}}",
      "",
      "Obrigado pela preferencia.",
      "",
      "{{itens_bloco}}",
      "{{total_bloco}}",
    ].join("\n"),
    en: [
      "Delivery update: Hi {{nome}}, your order {{codigo_pedido}} is out for delivery!",
      "",
      "It will arrive at your address shortly.",
      "{{endereco_bloco}}",
      "",
      "Thank you for your preference.",
      "",
      "{{itens_bloco}}",
      "{{total_bloco}}",
    ].join("\n"),
  },
};

function parseJsonSafe(value, fallback = null) {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizePaymentMethod(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "veo" || raw === "vemo") return "vemo";
  return raw;
}

function isWhatsAppGroupId(value) {
  return /@g\.us$/i.test(String(value || "").trim());
}

async function loadSettingRow(tenantId, keys = []) {
  const settingKeys = Array.from(new Set((Array.isArray(keys) ? keys : [keys]).map((key) => String(key || "").trim()).filter(Boolean)));
  if (!settingKeys.length) return null;

  const { data, error } = await supabase
    .from("settings")
    .select("id, chave, valor, tenant_id")
    .in("chave", settingKeys)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("tenant_id", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw createHttpError(500, "Erro ao carregar configuracao.", error.message);
  }

  for (const key of settingKeys) {
    const row = (data || []).find((item) => String(item.chave || "").trim() === key);
    if (row) return row;
  }

  return null;
}

async function loadSettingValue(tenantId, keys = [], fallback = null) {
  const row = await loadSettingRow(tenantId, keys);
  const value = row?.valor;
  if (value === undefined || value === null || value === "") return fallback;
  return value;
}

async function hasSettingValue(tenantId, keys = []) {
  const settingKeys = Array.from(new Set((Array.isArray(keys) ? keys : [keys]).map((key) => String(key || "").trim()).filter(Boolean)));
  if (!settingKeys.length) return false;

  const { data, error } = await supabase
    .from("settings")
    .select("id, chave, tenant_id")
    .in("chave", settingKeys)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("tenant_id", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw createHttpError(500, "Erro ao verificar configuracao.", error.message);
  }

  for (const key of settingKeys) {
    const row = (data || []).find((item) => String(item.chave || "").trim() === key);
    if (row) return true;
  }

  return false;
}

async function saveSettingValue(tenantId, key, value) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) throw createHttpError(400, "Chave de configuracao invalida.");

  const existing = await supabase
    .from("settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("chave", normalizedKey)
    .order("id", { ascending: false })
    .limit(1);

  if (existing.error) {
    throw createHttpError(500, "Erro ao localizar configuracao.", existing.error.message);
  }

  if (existing.data?.[0]?.id) {
    const result = await supabase.from("settings").update({ valor: value }).eq("id", existing.data[0].id);
    if (result.error) {
      throw createHttpError(500, "Erro ao salvar configuracao.", result.error.message);
    }
    return existing.data[0].id;
  }

  const result = await supabase
    .from("settings")
    .insert([{ tenant_id: tenantId, chave: normalizedKey, valor: value }])
    .select("id")
    .single();

  if (result.error) {
    throw createHttpError(500, "Erro ao criar configuracao.", result.error.message);
  }

  return result.data?.id || null;
}

async function loadStoreBranding(tenantId = 1) {
  const [companyName, primaryColor, logoUrl, publicStoreUrl] = await Promise.all([
    loadSettingValue(tenantId, [STORE_BRANDING_SETTINGS_KEYS.companyName], DEFAULT_STORE_BRANDING.nomeEmpresa),
    loadSettingValue(tenantId, [STORE_BRANDING_SETTINGS_KEYS.primaryColor], DEFAULT_STORE_BRANDING.corPrimaria),
    loadSettingValue(tenantId, [STORE_BRANDING_SETTINGS_KEYS.logoUrl], DEFAULT_STORE_BRANDING.logoUrl),
    loadSettingValue(tenantId, [STORE_BRANDING_SETTINGS_KEYS.publicStoreUrl], DEFAULT_STORE_BRANDING.publicStoreUrl),
  ]);

  return {
    nomeEmpresa: String(companyName || DEFAULT_STORE_BRANDING.nomeEmpresa).trim() || DEFAULT_STORE_BRANDING.nomeEmpresa,
    corPrimaria: String(primaryColor || DEFAULT_STORE_BRANDING.corPrimaria).trim() || DEFAULT_STORE_BRANDING.corPrimaria,
    logoUrl: String(logoUrl || DEFAULT_STORE_BRANDING.logoUrl).trim() || DEFAULT_STORE_BRANDING.logoUrl,
    publicStoreUrl: normalizePublicStoreUrl(publicStoreUrl || DEFAULT_STORE_BRANDING.publicStoreUrl),
  };
}

async function saveStoreBranding(tenantId, branding = {}) {
  await Promise.all([
    saveSettingValue(tenantId, STORE_BRANDING_SETTINGS_KEYS.companyName, String(branding.nomeEmpresa || DEFAULT_STORE_BRANDING.nomeEmpresa).trim() || DEFAULT_STORE_BRANDING.nomeEmpresa),
    saveSettingValue(tenantId, STORE_BRANDING_SETTINGS_KEYS.primaryColor, String(branding.corPrimaria || DEFAULT_STORE_BRANDING.corPrimaria).trim() || DEFAULT_STORE_BRANDING.corPrimaria),
    saveSettingValue(tenantId, STORE_BRANDING_SETTINGS_KEYS.logoUrl, String(branding.logoUrl || DEFAULT_STORE_BRANDING.logoUrl).trim() || DEFAULT_STORE_BRANDING.logoUrl),
    saveSettingValue(tenantId, STORE_BRANDING_SETTINGS_KEYS.publicStoreUrl, normalizePublicStoreUrl(branding.publicStoreUrl || DEFAULT_STORE_BRANDING.publicStoreUrl) || ""),
  ]);

  return loadStoreBranding(tenantId);
}

async function loadZApiGroupConfig(tenantId = 1) {
  const [orderConfirmedGroupId, orderConfirmedGroupName] = await Promise.all([
    loadSettingValue(tenantId, [ZAPI_GROUP_SETTINGS_KEYS.orderConfirmedGroupId], null),
    loadSettingValue(tenantId, [ZAPI_GROUP_SETTINGS_KEYS.orderConfirmedGroupName], null),
  ]);

  return {
    orderConfirmedGroupId: String(orderConfirmedGroupId || "").trim() || null,
    orderConfirmedGroupName: String(orderConfirmedGroupName || "").trim() || null,
  };
}

async function saveZApiGroupConfig(tenantId, payload = {}) {
  await Promise.all([
    saveSettingValue(tenantId, ZAPI_GROUP_SETTINGS_KEYS.orderConfirmedGroupId, String(payload.orderConfirmedGroupId || "").trim()),
    saveSettingValue(tenantId, ZAPI_GROUP_SETTINGS_KEYS.orderConfirmedGroupName, String(payload.orderConfirmedGroupName || "").trim()),
  ]);

  return loadZApiGroupConfig(tenantId);
}

function isValueTooLongError(error) {
  const message = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "22001" || message.includes("value too long for type character varying");
}

function normalizeTemplateText(value, fallback = "") {
  const text = String(value || "").replace(/\r\n/g, "\n").trim();
  return text || fallback;
}

function cleanupRenderedMessage(value) {
  return String(value || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadZapiMessageTemplates(tenantId = 1) {
  const keys = Object.values(ZAPI_MESSAGE_SETTINGS_KEYS);
  const { data, error } = await supabase
    .from("settings")
    .select("chave, valor, tenant_id")
    .in("chave", keys)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

  if (error) {
    throw createHttpError(500, "Erro ao carregar templates da Z-API.", error.message);
  }

  const rowsByKey = new Map();
  for (const row of data || []) {
    const key = String(row.chave || "").trim();
    if (!key) continue;
    const existing = rowsByKey.get(key);
    const incomingTenant = Number(row.tenant_id || 0);
    const existingTenant = Number(existing?.tenant_id || 0);
    if (!existing || incomingTenant === tenantId || (!existingTenant && incomingTenant)) {
      rowsByKey.set(key, row);
    }
  }

  return {
    confirmed: {
      ...DEFAULT_ZAPI_MESSAGE_TEMPLATES.confirmed,
      ...(parseJsonSafe(rowsByKey.get(ZAPI_MESSAGE_SETTINGS_KEYS.confirmed)?.valor, {}) || {}),
    },
    out_for_delivery: {
      ...DEFAULT_ZAPI_MESSAGE_TEMPLATES.out_for_delivery,
      ...(parseJsonSafe(rowsByKey.get(ZAPI_MESSAGE_SETTINGS_KEYS.out_for_delivery)?.valor, {}) || {}),
    },
  };
}

async function saveZapiMessageTemplates(tenantId, templates) {
  const entries = [
    [ZAPI_MESSAGE_SETTINGS_KEYS.confirmed, templates.confirmed],
    [ZAPI_MESSAGE_SETTINGS_KEYS.out_for_delivery, templates.out_for_delivery],
  ];

  for (const [key, value] of entries) {
    const payload = {
      tenant_id: tenantId,
      chave: key,
      valor: JSON.stringify({
        pt: normalizeTemplateText(value?.pt),
        en: normalizeTemplateText(value?.en),
      }),
    };

    const existing = await supabase
      .from("settings")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("chave", key)
      .order("id", { ascending: false })
      .limit(1);

    if (existing.error) {
      throw createHttpError(500, "Erro ao localizar configuracao da Z-API.", existing.error.message);
    }

    if (existing.data?.[0]?.id) {
      const updateResult = await supabase.from("settings").update({ valor: payload.valor }).eq("id", existing.data[0].id);
      if (updateResult.error) {
        if (isValueTooLongError(updateResult.error)) {
          throw createHttpError(
            500,
            "Erro ao salvar configuracao da Z-API.",
            "A coluna settings.valor ainda esta curta. Execute o SQL banco de dados/ajuste_settings_valor_text.sql",
          );
        }
        throw createHttpError(500, "Erro ao salvar configuracao da Z-API.", updateResult.error.message);
      }
      continue;
    }

    const insertResult = await supabase.from("settings").insert([payload]);
    if (insertResult.error) {
      if (isValueTooLongError(insertResult.error)) {
        throw createHttpError(
          500,
          "Erro ao criar configuracao da Z-API.",
          "A coluna settings.valor ainda esta curta. Execute o SQL banco de dados/ajuste_settings_valor_text.sql",
        );
      }
      throw createHttpError(500, "Erro ao criar configuracao da Z-API.", insertResult.error.message);
    }
  }
}

async function loadVemoQrCode(tenantId = 1) {
  const value = await loadSettingValue(tenantId, VEMO_QR_SETTING_KEYS, null);
  return value ? String(value) : null;
}

async function loadVemoPaymentLink(tenantId = 1) {
  const value = await loadSettingValue(tenantId, VEMO_PAYMENT_LINK_SETTING_KEYS, null);
  return String(value || "").trim() || null;
}

async function saveVemoQrCode(tenantId, base64) {
  await saveSettingValue(tenantId, VEMO_QR_SETTING_KEYS[0], String(base64 || "").trim());
}

async function saveVemoPaymentLink(tenantId, paymentLink) {
  await saveSettingValue(tenantId, VEMO_PAYMENT_LINK_SETTING_KEYS[0], String(paymentLink || "").trim());
}

async function loadZelleQrCode(tenantId = 1) {
  const value = await loadSettingValue(tenantId, ZELLE_QR_SETTING_KEYS, null);
  return value ? String(value) : null;
}

async function loadZellePaymentLink(tenantId = 1) {
  const value = await loadSettingValue(tenantId, ZELLE_PAYMENT_LINK_SETTING_KEYS, null);
  return String(value || "").trim() || null;
}

async function saveZelleQrCode(tenantId, base64) {
  await saveSettingValue(tenantId, ZELLE_QR_SETTING_KEYS[0], String(base64 || "").trim());
}

async function saveZellePaymentLink(tenantId, paymentLink) {
  await saveSettingValue(tenantId, ZELLE_PAYMENT_LINK_SETTING_KEYS[0], String(paymentLink || "").trim());
}

function buildWalletPaymentCaption({ methodName, orderCode, orderTotal, locale, paymentLink }) {
  const isEn = locale === "en";
  const codeLine = orderCode ? `${isEn ? "Order" : "Pedido"}: ${orderCode}` : "";
  const totalLabel = formatMoney(orderTotal);
  const totalLine = totalLabel ? `${isEn ? "Estimated total" : "Total estimado"}: ${totalLabel}` : "";
  const linkLine = paymentLink
    ? [
        isEn ? "If you prefer, you can also pay using this link:" : "Se preferir, voce tambem pode pagar por este link:",
        paymentLink,
      ].join("\n")
    : "";

  return [
    isEn ? `${methodName} payment` : `Pagamento ${methodName}`,
    codeLine,
    "",
    isEn ? "Scan the QR Code to complete your payment." : "Escaneie o QR Code para concluir o pagamento.",
    totalLine,
    linkLine,
    "",
    isEn ? "If you need help, reply to this message." : "Se precisar de ajuda, responda esta mensagem.",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderNotificationTemplate(template, values) {
  let output = String(template || "");
  for (const [key, value] of Object.entries(values || {})) {
    const token = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    output = output.replace(token, String(value || ""));
  }
  return cleanupRenderedMessage(output);
}

function buildMessage({ type, name, code, orderItems, orderTotal, locale, deliveryAddress, templates, paymentMethod }) {
  const isEn = locale === "en";
  const safeName = String(name || "").trim() || (isEn ? "customer" : "cliente");
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  const itemsLines = (orderItems || []).map((item) => `- ${item.nome}: ${formatQuantity(item.quantidade)}`);
  const totalLabel = formatMoney(orderTotal) || "";
  const itemsBlock = itemsLines.length > 0
    ? `${isEn ? "Order items:" : "Itens do pedido:"}\n${itemsLines.join("\n")}`
    : "";
  const totalBlock = totalLabel ? `${isEn ? "Estimated total" : "Total estimado"}: ${totalLabel}` : "";
  const addressBlock = deliveryAddress
    ? `${isEn ? "Delivery address" : "Endereco de entrega"}: ${deliveryAddress}`
    : "";

  if (type === "review_request") {
    return cleanupRenderedMessage(
      isEn
        ? [
            `Hi ${safeName}, your order ${code} was completed successfully.`,
            "",
            "Your digital order note is available for consultation.",
            "Thank you for choosing us.",
          ].join("\n")
        : [
            `Ola ${safeName}, seu pedido ${code} foi concluido com sucesso.`,
            "",
            "Sua nota digital do pedido esta disponivel para consulta.",
            "Agradecemos a preferencia.",
          ].join("\n"),
    );
  }

  if (type === "confirmed" && normalizedPaymentMethod === "cartao") {
    return cleanupRenderedMessage(
      isEn
        ? [
            `Order update: Hi ${safeName}, your order ${code} was confirmed successfully!`,
            "",
            "Payment method: Card.",
            "Payment will be made in person at pickup or delivery.",
            "",
            itemsBlock,
            totalBlock,
          ].filter(Boolean).join("\n")
        : [
            `Atualizacao do pedido: Ola ${safeName}, seu pedido ${code} foi confirmado com sucesso!`,
            "",
            "Pagamento: Cartao.",
            "O pagamento sera feito presencialmente na retirada ou entrega.",
            "",
            itemsBlock,
            totalBlock,
          ].filter(Boolean).join("\n"),
    );
  }

  const templateByType = templates?.[type] || DEFAULT_ZAPI_MESSAGE_TEMPLATES[type] || {};
  const template = normalizeTemplateText(templateByType?.[isEn ? "en" : "pt"], DEFAULT_ZAPI_MESSAGE_TEMPLATES[type]?.[isEn ? "en" : "pt"] || "");

  return renderNotificationTemplate(template, {
    nome: safeName,
    codigo_pedido: code,
    itens: itemsLines.join("\n"),
    itens_bloco: itemsBlock,
    total_estimado: totalLabel,
    total_bloco: totalBlock,
    endereco_entrega: deliveryAddress || "",
    endereco_bloco: addressBlock,
  });
}

function formatPaymentMethodLabel(paymentMethod, locale = "pt") {
  const isEn = locale === "en";
  switch (normalizePaymentMethod(paymentMethod) || String(paymentMethod || "").toLowerCase()) {
    case "pix":
      return "Pix";
    case "cartao":
      return isEn ? "Card" : "Cartao";
    case "dinheiro":
      return isEn ? "Cash" : "Dinheiro";
    case "zelle":
      return "Zelle";
    case "vemo":
      return "Vemo";
    default:
      return paymentMethod ? String(paymentMethod) : (isEn ? "Not informed" : "Nao informado");
  }
}

async function insertStockMovementSafe(payload, duplicateScope = "movement") {
  const result = await supabase
    .from("stock_movements")
    .insert([payload])
    .select("id")
    .single();

  if (!result.error && result.data?.id) {
    return { inserted: true, movementId: Number(result.data.id) };
  }

  const duplicated = String(result.error?.message || "").toLowerCase().includes("duplicate") ||
    String(result.error?.code || "") === "23505";

  if (duplicated) {
    return { inserted: false, movementId: null, reason: `${duplicateScope}_duplicate` };
  }

  throw createHttpError(500, "Erro ao registrar movimentacao de estoque.", result.error?.message || null);
}

function isUniqueViolation(error) {
  return String(error?.message || "").toLowerCase().includes("duplicate") || String(error?.code || "") === "23505";
}

async function deleteStockMovementById(movementId) {
  if (!movementId) return;
  const { error } = await supabase.from("stock_movements").delete().eq("id", movementId);
  if (error) {
    throw createHttpError(500, "Erro ao limpar movimentacao temporaria de estoque.", error.message);
  }
}

async function updateBatchQuantityExpected({ batchId, expectedQty, nextQty, notFoundMessage, conflictMessage, genericMessage }) {
  const result = await supabase
    .from("batches")
    .update({ quantidade_disponivel: nextQty })
    .eq("id", batchId)
    .eq("quantidade_disponivel", expectedQty)
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw createHttpError(500, genericMessage, result.error.message);
  }

  if (!result.data) {
    const { data: batch, error: batchError } = await supabase
      .from("batches")
      .select("id, quantidade_disponivel")
      .eq("id", batchId)
      .maybeSingle();

    if (batchError) {
      throw createHttpError(500, genericMessage, batchError.message);
    }

    if (!batch) {
      throw createHttpError(404, notFoundMessage);
    }

    throw createHttpError(409, conflictMessage, {
      batchId,
      expectedQty,
      currentQty: parseNumber(batch.quantidade_disponivel, 0),
    });
  }
}

function formatDeliveryModeLabel(deliveryMode, locale = "pt") {
  const isEn = locale === "en";
  return String(deliveryMode || "").toLowerCase() === "retirada"
    ? (isEn ? "Store pickup" : "Retirada na loja")
    : (isEn ? "Delivery" : "Entrega");
}

function buildStoreOrderMessage({
  orderCode,
  clientName,
  clientPhone,
  orderItems,
  orderTotal,
  deliveryAddress,
  paymentMethod,
  deliveryMode,
  deliveryDate,
  deliveryTime,
  notes,
}) {
  const lines = [
    `Novo pedido ${orderCode}`,
    "",
    `Cliente: ${clientName || "Nao informado"}`,
    `Telefone: ${clientPhone || "Nao informado"}`,
    `Entrega: ${formatDeliveryModeLabel(deliveryMode, "pt")}`,
  ];

  if (deliveryAddress) lines.push(`Endereco: ${deliveryAddress}`);
  if (deliveryDate || deliveryTime) {
    lines.push(`Agendamento: ${[deliveryDate, deliveryTime].filter(Boolean).join(" ")}`);
  }

  lines.push(`Pagamento: ${formatPaymentMethodLabel(paymentMethod, "pt")}`);

  if (orderItems?.length) {
    lines.push("");
    lines.push("Itens:");
    for (const item of orderItems) {
      const qty = formatQuantity(item.quantidade);
      const cutType = item.tipo_corte ? ` | corte: ${item.tipo_corte}` : "";
      const itemNote = item.observacoes ? ` | obs: ${item.observacoes}` : "";
      lines.push(`- ${item.nome}: ${qty}${cutType}${itemNote}`);
    }
  }

  if (Number.isFinite(parseNumber(orderTotal, NaN))) {
    lines.push("");
    lines.push(`Total estimado: ${formatMoney(orderTotal)}`);
  }

  if (notes) {
    lines.push("");
    lines.push(`Observacoes gerais: ${notes}`);
  }

  return lines.join("\n");
}

function normalizeMessageEventType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeLocalMessageStatus(value) {
  const raw = normalizeMessageEventType(value);
  if (!raw) return "unknown";
  if (["queue", "queued", "pending", "sent", "enqueued"].includes(raw)) return "queued";
  if (["delivered", "delivery", "success", "received", "receive"].includes(raw)) return "delivered";
  if (["read", "seen"].includes(raw)) return "read";
  if (["failed", "error", "undelivered", "failed_to_send"].includes(raw)) return "failed";
  return "unknown";
}

function extractMessageIdentifier(payload, keys) {
  for (const key of keys) {
    const parts = key.split(".");
    let cursor = payload;
    let valid = true;
    for (const part of parts) {
      cursor = cursor?.[part];
      if (cursor === undefined || cursor === null) {
        valid = false;
        break;
      }
    }
    if (valid && String(cursor).trim()) return String(cursor).trim();
  }
  return null;
}

function extractStorePhoneCandidates(payload, path = "", depth = 0, collector = []) {
  if (payload === null || payload === undefined || depth > 6) return collector;

  if (typeof payload === "string" || typeof payload === "number") {
    const raw = String(payload).trim();
    if (!raw) return collector;

    const digits = raw.replace(/\D/g, "");
    const pathLabel = path || "root";
    const normalizedPath = pathLabel.toLowerCase();
    const hasPhoneHint = /(phone|number|mobile|cell|contact|owner|jid|wid|serialized|me|device|instance|connected|account|session)/i.test(pathLabel);

    if (isLikelyPhoneDigits(digits) && (hasPhoneHint || /@c\.us|@s\.whatsapp\.net/i.test(raw))) {
      let score = 0;
      if (/(^|\.)(phone|number|mobile|cell)$/.test(normalizedPath)) score += 8;
      if (/(connected|instance|device|me|account|owner|session)/.test(normalizedPath)) score += 5;
      if (/(jid|wid|serialized)/.test(normalizedPath)) score += 4;
      if (/^root$/.test(normalizedPath)) score -= 3;
      if (digits.length >= 12 && digits.length <= 13) score += 3;
      if (digits.length >= 14) score += 1;

      collector.push({
        path: pathLabel,
        raw,
        digits,
        normalized: normalizePhone(digits),
        score,
      });
    }

    return collector;
  }

  if (Array.isArray(payload)) {
    payload.forEach((item, index) => {
      extractStorePhoneCandidates(item, `${path}[${index}]`, depth + 1, collector);
    });
    return collector;
  }

  if (typeof payload === "object") {
    for (const [key, value] of Object.entries(payload)) {
      const nextPath = path ? `${path}.${key}` : key;
      extractStorePhoneCandidates(value, nextPath, depth + 1, collector);
    }
  }

  return collector;
}

function extractStorePhoneFromPayload(payload) {
  const explicitCandidate = extractMessageIdentifier(payload, [
    "phone",
    "number",
    "connectedPhone",
    "connectedNumber",
    "mobile",
    "cellphone",
    "device.phone",
    "device.number",
    "device.mobile",
    "me.phone",
    "me.number",
    "me.mobile",
    "me.id",
    "me.jid",
    "me.wid",
    "me._serialized",
    "instance.phone",
    "instance.number",
    "instance.mobile",
    "instance.owner",
    "instance.ownerPhone",
    "instance.ownerNumber",
    "instance.jid",
    "instance.wid",
    "data.phone",
    "data.number",
    "data.mobile",
    "data.me.phone",
    "data.me.number",
    "data.me.id",
    "data.me.jid",
    "data.connected.phone",
    "data.connected.number",
    "connected.phone",
    "connected.number",
    "connected.jid",
    "connected.wid",
    "account.phone",
    "account.number",
    "session.phone",
    "session.number",
    "owner.phone",
    "owner.number",
    "wid.user",
    "jid.user",
    "id.user",
    "id._serialized",
  ]);

  const explicitNormalized = normalizePhone(explicitCandidate);
  if (explicitNormalized && isLikelyPhoneDigits(explicitNormalized)) {
    return {
      phone: explicitNormalized,
      path: "explicit",
      raw: explicitCandidate,
      confidence: "high",
      candidates: [],
    };
  }

  const candidates = extractStorePhoneCandidates(payload)
    .filter((candidate) => isLikelyPhoneDigits(candidate.normalized))
    .sort((left, right) => right.score - left.score || right.normalized.length - left.normalized.length);

  if (!candidates.length) {
    return {
      phone: "",
      path: null,
      raw: null,
      confidence: "none",
      candidates: [],
    };
  }

  const winner = candidates[0];
  return {
    phone: winner.normalized,
    path: winner.path,
    raw: winner.raw,
    confidence: winner.score >= 10 ? "high" : winner.score >= 6 ? "medium" : "low",
    candidates: candidates.slice(0, 5),
  };
}

function extractWebhookMessageMeta(payload) {
  const ids =
    payload?.ids
    ?? payload?.data?.ids
    ?? payload?.value?.ids
    ?? payload?.message?.ids
    ?? [];

  const messageIds = Array.isArray(ids)
    ? ids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  const status =
    extractMessageIdentifier(payload, [
      "status",
      "messageStatus",
      "event",
      "eventType",
      "type",
      "data.status",
      "data.event",
      "value.status",
      "value.event",
      "message.status",
    ]) || null;

  return {
    messageId: extractMessageIdentifier(payload, [
      "messageId",
      "message_id",
      "id",
      "data.messageId",
      "data.message_id",
      "data.id",
      "value.messageId",
      "value.message_id",
      "value.id",
      "message.messageId",
      "message.id",
    ]) || messageIds[0] || null,
    messageIds,
    zaapId: extractMessageIdentifier(payload, [
      "zaapId",
      "zaap_id",
      "data.zaapId",
      "value.zaapId",
      "message.zaapId",
    ]),
    eventType: status,
    status,
  };
}

async function fetchOrderItems(orderId, locale = "pt") {
  const isEn = locale === "en";

  const byPedido = await supabase.from("order_items").select("*").eq("pedido_id", orderId);
  let items = !byPedido.error ? byPedido.data || [] : [];

  if (!items.length) {
    const byOrder = await supabase.from("order_items").select("*").eq("order_id", orderId);
    if (!byOrder.error) items = byOrder.data || [];
  }

  if (!items.length) return [];

  const productIds = Array.from(new Set(items.map((item) => item.produto_id || item.product_id).filter(Boolean)));

  let productsMap = new Map();
  if (productIds.length > 0) {
    const productsResult = await supabase.from("products").select("id, nome, nome_en").in("id", productIds);
    if (!productsResult.error) {
      productsMap = new Map((productsResult.data || []).map((prod) => {
        const productName = isEn ? (prod.nome_en || prod.nome || "Product") : (prod.nome || prod.nome_en || "Produto");
        return [String(prod.id), productName];
      }));
    }
  }

  return items.map((item) => ({
    nome: productsMap.get(String(item.produto_id || item.product_id)) || (isEn ? "Product" : "Produto"),
    quantidade: item.quantidade ?? item.quantity ?? 0,
  }));
}

async function fetchOrderItemsForStock(orderId) {
  const byPedido = await supabase.from("order_items").select("*").eq("pedido_id", orderId);
  let items = !byPedido.error ? byPedido.data || [] : [];

  if (!items.length) {
    const byOrder = await supabase.from("order_items").select("*").eq("order_id", orderId);
    if (!byOrder.error) items = byOrder.data || [];
  }

  return (items || [])
    .map((item) => ({
      productId: item.produto_id || item.product_id,
      quantity: parseNumber(item.quantidade ?? item.quantity, 0),
      unit: normalizeStockUnit(item.unidade || item.unit || null, "LB"),
    }))
    .filter((item) => item.productId && item.quantity > 0);
}

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) return { text: "", data: null };

  try {
    return { text, data: JSON.parse(text) };
  } catch {
    return { text, data: null };
  }
}

async function sendWhatsAppViaZApi({ phone, message }) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const baseUrl = process.env.ZAPI_BASE_URL || "https://api.z-api.io";

  if (!instanceId || !instanceToken) {
    return { ok: false, reason: "missing-zapi-config" };
  }

  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const normalizedTarget = String(phone || "").trim();
  let resolvedPhone = normalizedTarget;

  if (!isWhatsAppGroupId(normalizedTarget)) {
    const phoneExistsEndpoint = `${baseUrl}/instances/${instanceId}/token/${instanceToken}/phone-exists/${encodeURIComponent(normalizedTarget)}`;
    const phoneExistsResponse = await fetch(phoneExistsEndpoint, {
      method: "GET",
      headers,
    });
    const phoneExistsResult = await readApiResponse(phoneExistsResponse);

    if (!phoneExistsResponse.ok) {
      return {
        ok: false,
        reason: `zapi-phone-exists-http-${phoneExistsResponse.status}`,
        detail: phoneExistsResult.text || null,
      };
    }

    if (phoneExistsResult.data?.error) {
      return {
        ok: false,
        reason: "zapi-phone-exists-error",
        detail: phoneExistsResult.data?.message || phoneExistsResult.data?.error || phoneExistsResult.text || null,
      };
    }

    if (phoneExistsResult.data?.exists === false) {
      return { ok: false, reason: "phone-not-on-whatsapp" };
    }

    resolvedPhone = String(phoneExistsResult.data?.phone || normalizedTarget || "").replace(/\D/g, "");
    if (!resolvedPhone) {
      return { ok: false, reason: "phone-not-on-whatsapp" };
    }
  }

  const endpoint = `${baseUrl}/instances/${instanceId}/token/${instanceToken}/send-text`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: resolvedPhone, number: resolvedPhone, message, text: message }),
  });
  const sendResult = await readApiResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      reason: `zapi-http-${response.status}`,
      detail: sendResult.text || null,
    };
  }

  if (sendResult.data?.error) {
    return {
      ok: false,
      reason: "zapi-send-error",
      detail: sendResult.data?.message || sendResult.data?.error || sendResult.text || null,
    };
  }

  const messageId = sendResult.data?.messageId || sendResult.data?.id || null;
  if (!messageId) {
    return {
      ok: false,
      reason: "zapi-missing-message-id",
      detail: sendResult.text || null,
    };
  }

  return {
    ok: true,
    queued: true,
    phone: resolvedPhone,
    messageId,
    zaapId: sendResult.data?.zaapId || null,
  };
}

async function sendWhatsAppImageViaZApi({ phone, imageBase64, caption }) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const baseUrl = process.env.ZAPI_BASE_URL || "https://api.z-api.io";

  if (!instanceId || !instanceToken || !imageBase64) {
    return { ok: false, reason: "missing-zapi-config-or-image" };
  }

  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const image = imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  const endpoint = `${baseUrl}/instances/${instanceId}/token/${instanceToken}/send-image`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone, image, caption: caption || "" }),
  });
  const result = await readApiResponse(response);

  if (!response.ok) {
    return { ok: false, reason: `zapi-image-http-${response.status}`, detail: result.text || null };
  }
  if (result.data?.error) {
    return { ok: false, reason: "zapi-image-send-error", detail: result.data?.message || result.text || null };
  }
  return { ok: true, messageId: result.data?.messageId || null, zaapId: result.data?.zaapId || null };
}

async function sendStatusNotification({ previousStatus, newStatus, clientName, clientPhone, orderCode, orderItems, orderTotal, locale, deliveryAddress, tenantId, paymentMethod }) {
  let type = null;
  if (previousStatus === STATUS.RECEBIDO && newStatus === STATUS.CONFIRMADO) type = "confirmed";
  if (previousStatus === STATUS.PRONTO && newStatus === STATUS.ENTREGA) type = "out_for_delivery";
  if (previousStatus !== STATUS.CONCLUIDO && newStatus === STATUS.CONCLUIDO) type = "review_request";
  if (!type) return { sent: false, queued: false, reason: "no-notification-transition" };

  const eventType =
    type === "confirmed"
      ? "order_confirmed_client"
      : type === "review_request"
        ? "order_review_client"
        : "order_dispatched_client";

  const phone = normalizePhone(clientPhone);
  if (!phone) return { sent: false, queued: false, reason: "missing-phone", eventType };

  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  const templates = type === "review_request" ? null : await loadZapiMessageTemplates(Number(tenantId || 1));
  const message = buildMessage({
    type,
    name: clientName || "cliente",
    code: orderCode,
    orderItems,
    orderTotal,
    locale,
    deliveryAddress,
    templates,
    paymentMethod: normalizedPaymentMethod,
  });

  const sendResult = await sendWhatsAppViaZApi({ phone, message });
  if (!sendResult.ok) {
    return {
      sent: false,
      queued: false,
      reason: sendResult.reason,
      detail: sendResult.detail || null,
      eventType,
      messageText: message,
    };
  }

  let qr = null;
  if (type === "confirmed" && (normalizedPaymentMethod === "vemo" || normalizedPaymentMethod === "zelle")) {
    const paymentLink = normalizedPaymentMethod === "zelle"
      ? await loadZellePaymentLink(Number(tenantId || 1))
      : await loadVemoPaymentLink(Number(tenantId || 1));
    const qrCaption = buildWalletPaymentCaption({
      methodName: normalizedPaymentMethod === "zelle" ? "Zelle" : "Vemo",
      orderCode,
      orderTotal,
      locale,
      paymentLink,
    });
    const qrBase64 = normalizedPaymentMethod === "zelle"
      ? await loadZelleQrCode(Number(tenantId || 1))
      : await loadVemoQrCode(Number(tenantId || 1));
    if (!qrBase64) {
      qr = {
        attempted: true,
        sent: false,
        queued: false,
        reason: `missing-${normalizedPaymentMethod}-qr-code`,
        detail: null,
        caption: qrCaption,
        paymentLink,
        destinationPhone: phone,
        messageId: null,
        zaapId: null,
      };
    } else {
      try {
        const qrResult = await sendWhatsAppImageViaZApi({
          phone,
          imageBase64: qrBase64,
          caption: qrCaption,
        });

        qr = qrResult.ok
          ? {
              attempted: true,
              sent: true,
              queued: true,
              reason: null,
              detail: "pending",
              caption: qrCaption,
              paymentLink,
              destinationPhone: phone,
              messageId: qrResult.messageId || null,
              zaapId: qrResult.zaapId || null,
            }
          : {
              attempted: true,
              sent: false,
              queued: false,
              reason: qrResult.reason || `${normalizedPaymentMethod}-qr-send-failed`,
              detail: qrResult.detail || null,
              caption: qrCaption,
              paymentLink,
              destinationPhone: phone,
              messageId: qrResult.messageId || null,
              zaapId: qrResult.zaapId || null,
            };
      } catch (error) {
        qr = {
          attempted: true,
          sent: false,
          queued: false,
          reason: `${normalizedPaymentMethod}-qr-send-exception`,
          detail: error?.message || null,
          caption: qrCaption,
          paymentLink,
          destinationPhone: phone,
          messageId: null,
          zaapId: null,
        };
      }
    }
  }

  return {
    sent: true,
    queued: true,
    deliveryStatus: "pending",
    messageId: sendResult.messageId || null,
    zaapId: sendResult.zaapId || null,
    eventType,
    messageText: message,
    qr,
  };
}

function buildOrderConfirmedGroupMessage({
  orderCode,
  clientName,
  city,
  paymentMethod,
  orderTotal,
  orderItems,
}) {
  const itemsSummary = (orderItems || [])
    .slice(0, 8)
    .map((item) => `- ${item.nome}: ${formatQuantity(item.quantidade)}`)
    .join("\n");

  return [
    `Pedido confirmado ${orderCode}`,
    "",
    `Cliente: ${clientName || "Nao informado"}`,
    `Cidade: ${city || "Nao informada"}`,
    `Pagamento: ${formatPaymentMethodLabel(paymentMethod, "pt")}`,
    orderTotal ? `Total estimado: ${formatMoney(orderTotal)}` : "",
    itemsSummary ? "" : "",
    itemsSummary ? "Itens:" : "",
    itemsSummary,
  ]
    .filter(Boolean)
    .join("\n");
}

async function listZApiGroups() {
  const endpoint = buildZApiInstanceEndpoint("groups");
  if (!endpoint) {
    return { ok: false, configured: false, groups: [], reason: "missing-zapi-config" };
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers: buildZApiHeaders(),
  });
  const result = await readApiResponse(response);

  if (!response.ok) {
    return { ok: false, configured: true, groups: [], reason: result.text || `HTTP ${response.status}` };
  }

  const rows = Array.isArray(result.data) ? result.data : Array.isArray(result.data?.groups) ? result.data.groups : [];
  const groups = rows
    .map((group) => ({
      id: String(group?.id || group?.jid || group?.phone || group?.groupId || "").trim(),
      name: String(group?.subject || group?.name || group?.groupName || "").trim() || "Grupo sem nome",
    }))
    .filter((group) => group.id);

  return { ok: true, configured: true, groups, reason: null };
}

async function sendOrderConfirmedGroupNotification({
  tenantId,
  orderCode,
  clientName,
  city,
  paymentMethod,
  orderTotal,
  orderItems,
}) {
  const config = await loadZApiGroupConfig(Number(tenantId || 1));
  if (!config.orderConfirmedGroupId) {
    return { sent: false, queued: false, reason: "missing-group-config", messageText: null };
  }

  const message = buildOrderConfirmedGroupMessage({
    orderCode,
    clientName,
    city,
    paymentMethod,
    orderTotal,
    orderItems,
  });

  const sendResult = await sendWhatsAppViaZApi({
    phone: config.orderConfirmedGroupId,
    message,
  });

  if (!sendResult.ok) {
    return {
      sent: false,
      queued: false,
      reason: sendResult.reason || "group-send-failed",
      detail: sendResult.detail || null,
      groupId: config.orderConfirmedGroupId,
      groupName: config.orderConfirmedGroupName,
      messageText: message,
    };
  }

  return {
    sent: true,
    queued: true,
    groupId: config.orderConfirmedGroupId,
    groupName: config.orderConfirmedGroupName,
    messageId: sendResult.messageId || null,
    zaapId: sendResult.zaapId || null,
    messageText: message,
  };
}

async function sendStoreOrderNotification({
  orderId,
  orderCode,
  clientName,
  clientPhone,
  deliveryAddress,
  paymentMethod,
  deliveryMode,
  deliveryDate,
  deliveryTime,
  notes,
  orderItems,
  orderTotal,
}) {
  const storePhoneResult = await discoverStorePhoneFromZApi();
  if (!storePhoneResult.ok || !storePhoneResult.phone) {
    const failureResult = {
      ok: false,
      reason: storePhoneResult.reason || "store-phone-discovery-failed",
      detail: "Nao foi possivel descobrir o numero da instancia conectada.",
    };
    await persistWhatsAppAttempt({
      orderId,
      target: "store",
      eventType: "order_created_store",
      destinationPhone: null,
      messageText: null,
      payload: {
        orderCode,
        paymentMethod,
        deliveryMode,
        deliveryDate,
        deliveryTime,
      },
      sendResult: failureResult,
    });
    return {
      ...failureResult,
    };
  }

  const message = buildStoreOrderMessage({
    orderCode,
    clientName,
    clientPhone,
    orderItems,
    orderTotal,
    deliveryAddress,
    paymentMethod,
    deliveryMode,
    deliveryDate,
    deliveryTime,
    notes,
  });

  const sendResult = await sendWhatsAppViaZApi({
    phone: storePhoneResult.phone,
    message,
  });

  const logEntry = await persistWhatsAppAttempt({
    orderId,
    target: "store",
    eventType: "order_created_store",
    destinationPhone: storePhoneResult.phone,
    messageText: message,
    payload: {
      orderCode,
      paymentMethod,
      deliveryMode,
      deliveryDate,
      deliveryTime,
      storePhoneSource: storePhoneResult.source || null,
    },
    sendResult,
  });

  return {
    ...sendResult,
    eventType: "order_created_store",
    messageText: message,
    logId: logEntry?.id || null,
    storePhone: storePhoneResult.phone,
  };
}

async function fetchProductsByIds(productIds) {
  if (!productIds.length) return new Map();

  const { data, error } = await supabase
    .from("products")
    .select("id, nome, unidade, stock_unit, stock_enabled, stock_min")
    .in("id", productIds);

  if (error) {
    throw createHttpError(500, "Erro ao buscar produtos para estoque.", error.message);
  }

  return new Map(
    (data || []).map((product) => {
      const resolvedStockUnit = normalizeStockUnit(product.stock_unit || product.unidade || "LB", "LB");
      return [
        Number(product.id),
        {
          ...product,
          stock_unit: resolvedStockUnit,
          stock_enabled: Boolean(product.stock_enabled),
          stock_min: parseNumber(product.stock_min, 0),
        },
      ];
    }),
  );
}

async function syncLowStockAlerts(productIds) {
  const ids = Array.from(new Set((productIds || []).map((id) => Number(id)).filter(Boolean)));
  if (!ids.length) return;

  const [{ data: products, error: productsError }, { data: balances, error: balancesError }] = await Promise.all([
    supabase.from("products").select("id, stock_enabled, stock_min").in("id", ids),
    supabase.from("stock_balances").select("produto_id, saldo_qty").in("produto_id", ids),
  ]);

  if (productsError || balancesError) return;

  const balanceMap = new Map((balances || []).map((row) => [Number(row.produto_id), parseNumber(row.saldo_qty, 0)]));

  const { data: openEvents } = await supabase
    .from("stock_alert_events")
    .select("id, product_id")
    .eq("alert_type", "low_stock")
    .is("resolved_at", null)
    .in("product_id", ids);

  const openMap = new Map((openEvents || []).map((row) => [Number(row.product_id), row.id]));

  for (const product of products || []) {
    const productId = Number(product.id);
    const enabled = Boolean(product.stock_enabled);
    const min = parseNumber(product.stock_min, 0);
    const saldo = parseNumber(balanceMap.get(productId), 0);
    const isLow = enabled && saldo <= min;
    const openEventId = openMap.get(productId);

    if (isLow && !openEventId) {
      await supabase.from("stock_alert_events").insert([
        {
          product_id: productId,
          alert_type: "low_stock",
          payload: { saldo, stock_min: min },
        },
      ]);
    }

    if (!isLow && openEventId) {
      await supabase.from("stock_alert_events").update({ resolved_at: new Date().toISOString() }).eq("id", openEventId);
    }
  }
}

async function applyOrderStockExit(orderId) {
  const sourceId = String(orderId);

  const { data: alreadyApplied } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("source_type", "order")
    .eq("source_id", sourceId)
    .eq("tipo", "exit")
    .limit(1);

  if ((alreadyApplied || []).length > 0) {
    return { applied: false, reason: "already_applied", changedProducts: [] };
  }

  const itemRows = await fetchOrderItemsForStock(orderId);
  if (!itemRows.length) {
    return { applied: false, reason: "no_items", changedProducts: [] };
  }

  const aggregated = new Map();
  for (const row of itemRows) {
    const key = Number(row.productId);
    const current = aggregated.get(key) || { quantity: 0, unit: row.unit };
    current.quantity += row.quantity;
    aggregated.set(key, current);
  }

  const productIds = Array.from(aggregated.keys());
  const productMap = await fetchProductsByIds(productIds);

  const requiredByProduct = [];
  for (const productId of productIds) {
    const product = productMap.get(productId);
    if (!product || !product.stock_enabled) continue;

    const entry = aggregated.get(productId);
    const qtyInStockUnit = roundQty(convertQuantity(entry.quantity, entry.unit, product.stock_unit), 3);

    requiredByProduct.push({
      productId,
      productName: product.nome || `Produto ${productId}`,
      unit: product.stock_unit,
      required: qtyInStockUnit,
    });
  }

  if (!requiredByProduct.length) {
    return {
      applied: false,
      reason: "no_stock_controlled_items",
      changedProducts: [],
    };
  }

  const shortages = [];
  const consumptionPlan = [];

  for (const required of requiredByProduct) {
    const { data: batchesData, error: batchesError } = await supabase
      .from("batches")
      .select("id, produto_id, quantidade_disponivel, unidade, data_validade")
      .eq("produto_id", required.productId)
      .gt("quantidade_disponivel", 0)
      .order("data_validade", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (batchesError) throw createHttpError(500, "Erro ao buscar lotes para baixa de estoque.", batchesError.message);

    let remaining = required.required;
    const productPlan = [];

    for (const batch of batchesData || []) {
      if (remaining <= 0) break;

      const batchUnit = normalizeStockUnit(batch.unidade || required.unit, required.unit);
      const availableInBatchUnit = parseNumber(batch.quantidade_disponivel, 0);
      const availableInStockUnit = convertQuantity(availableInBatchUnit, batchUnit, required.unit);
      const consumeInStockUnit = Math.min(availableInStockUnit, remaining);
      const consumeInBatchUnit = roundQty(convertQuantity(consumeInStockUnit, required.unit, batchUnit), 3);

      if (consumeInBatchUnit <= 0) continue;

      productPlan.push({
        batchId: Number(batch.id),
        productId: required.productId,
        productUnit: required.unit,
        consumeInBatchUnit,
        consumeInStockUnit: roundQty(consumeInStockUnit, 3),
        availableBefore: availableInBatchUnit,
      });

      remaining = roundQty(remaining - consumeInStockUnit, 6);
    }

    if (remaining > 0) {
      shortages.push({
        product_id: required.productId,
        product_name: required.productName,
        required_qty: required.required,
        available_qty: roundQty(required.required - remaining, 3),
        unit: required.unit,
      });
      continue;
    }

    consumptionPlan.push(...productPlan);
  }

  if (shortages.length > 0) {
    throw createHttpError(409, "Estoque insuficiente para concluir o pedido.", { shortages });
  }

  const changedProducts = new Set();

  for (const step of consumptionPlan) {
    const nextQty = roundQty(step.availableBefore - step.consumeInBatchUnit, 3);
    const movementInsert = await insertStockMovementSafe({
      tipo: "exit",
      produto_id: step.productId,
      batch_id: step.batchId,
      qty: step.consumeInStockUnit,
      unit: step.productUnit,
      source_type: "order",
      source_id: sourceId,
      metadata: { reason: "order_concluded" },
    }, "order_exit");

    if (!movementInsert.inserted) continue;

    try {
      await updateBatchQuantityExpected({
        batchId: step.batchId,
        expectedQty: step.availableBefore,
        nextQty,
        notFoundMessage: "Lote nao encontrado para baixa de estoque do pedido.",
        conflictMessage: "Saldo do lote mudou durante a baixa do pedido. Recarregue e tente novamente.",
        genericMessage: "Erro ao atualizar saldo do lote.",
      });
    } catch (error) {
      await deleteStockMovementById(movementInsert.movementId);
      throw error;
    }

    changedProducts.add(step.productId);
  }

  await syncLowStockAlerts(Array.from(changedProducts));

  return {
    applied: true,
    reason: "exit_created",
    changedProducts: Array.from(changedProducts),
  };
}

async function applyOrderStockReversal(orderId, reason = "manual_status_reversal") {
  const sourceId = String(orderId);

  const { data: existingReversal } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("source_type", "order")
    .eq("source_id", sourceId)
    .eq("tipo", "reversal")
    .limit(1);

  if ((existingReversal || []).length > 0) {
    return { applied: false, reason: "already_reversed", changedProducts: [] };
  }

  const { data: exits, error: exitsError } = await supabase
    .from("stock_movements")
    .select("id, produto_id, batch_id, qty, unit")
    .eq("source_type", "order")
    .eq("source_id", sourceId)
    .eq("tipo", "exit");

  if (exitsError) throw createHttpError(500, "Erro ao buscar movimentacoes para estorno.", exitsError.message);
  if (!(exits || []).length) return { applied: false, reason: "no_exit_to_reverse", changedProducts: [] };

  const changedProducts = new Set();

  for (const movement of exits) {
    const normalizedUnit = normalizeStockUnit(movement.unit, "LB");
    const movementInsert = await insertStockMovementSafe({
      tipo: "reversal",
      produto_id: movement.produto_id,
      batch_id: movement.batch_id,
      qty: movement.qty,
      unit: normalizedUnit,
      source_type: "order",
      source_id: sourceId,
      metadata: { reversed_from_movement_id: movement.id, reason },
    }, "order_reversal");

    if (!movementInsert.inserted) {
      changedProducts.add(Number(movement.produto_id));
      continue;
    }

    if (movement.batch_id) {
      const { data: batch, error: batchError } = await supabase
        .from("batches")
        .select("id, quantidade_disponivel")
        .eq("id", movement.batch_id)
        .single();

      if (!batchError && batch) {
        const nextQty = roundQty(parseNumber(batch.quantidade_disponivel, 0) + parseNumber(movement.qty, 0), 3);
        try {
          await updateBatchQuantityExpected({
            batchId: movement.batch_id,
            expectedQty: parseNumber(batch.quantidade_disponivel, 0),
            nextQty,
            notFoundMessage: "Lote nao encontrado para estorno de estoque do pedido.",
            conflictMessage: "Saldo do lote mudou durante o estorno do pedido. Recarregue e tente novamente.",
            genericMessage: "Erro ao atualizar lote no estorno de estoque.",
          });
        } catch (error) {
          await deleteStockMovementById(movementInsert.movementId);
          throw error;
        }
      }
    }

    changedProducts.add(Number(movement.produto_id));
  }

  await syncLowStockAlerts(Array.from(changedProducts));

  return {
    applied: true,
    reason: "reversal_created",
    changedProducts: Array.from(changedProducts),
  };
}

async function buildStoreSaleStockPlan(itemsInput) {
  const productIds = Array.from(
    new Set(
      (itemsInput || [])
        .map((item) => Number(item.product_id || item.productId))
        .filter(Boolean),
    ),
  );
  const productMap = await fetchProductsByIds(productIds);
  const requiredByProduct = new Map();

  for (const item of itemsInput || []) {
    const productId = Number(item.product_id || item.productId);
    const quantity = parseNumber(item.quantity, 0);
    const unit = normalizeStockUnit(item.unit, "UN");
    if (!productId || quantity <= 0) continue;

    const product = productMap.get(productId);
    if (!product) {
      throw createHttpError(404, `Produto ${productId} nao encontrado para a venda presencial.`);
    }

    if (!product.stock_enabled) {
      throw createHttpError(409, `Produto ${product.nome || productId} sem controle de estoque ativo.`);
    }

    if (!isSaleUnitAllowedForStockUnit(unit, product.stock_unit)) {
      throw createHttpError(
        400,
        `Unidade ${unit} invalida para ${product.nome || `Produto ${productId}`}. Use ${getAllowedSaleUnitsForStockUnit(product.stock_unit).join(" ou ")}.`,
      );
    }

    const qtyInStockUnit = roundQty(convertQuantity(quantity, unit, product.stock_unit), 3);
    const current = requiredByProduct.get(productId) || {
      productId,
      productName: product.nome || `Produto ${productId}`,
      unit: product.stock_unit,
      required: 0,
    };
    current.required = roundQty(current.required + qtyInStockUnit, 3);
    requiredByProduct.set(productId, current);
  }

  const shortages = [];
  const consumptionPlan = [];

  for (const required of requiredByProduct.values()) {
    const { data: batchesData, error: batchesError } = await supabase
      .from("batches")
      .select("id, produto_id, quantidade_disponivel, unidade, data_validade")
      .eq("produto_id", required.productId)
      .gt("quantidade_disponivel", 0)
      .order("data_validade", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (batchesError) throw createHttpError(500, "Erro ao buscar lotes para baixa da venda presencial.", batchesError.message);

    let remaining = required.required;
    const productPlan = [];

    for (const batch of batchesData || []) {
      if (remaining <= 0) break;

      const batchUnit = normalizeStockUnit(batch.unidade || required.unit, required.unit);
      const availableInBatchUnit = parseNumber(batch.quantidade_disponivel, 0);
      const availableInStockUnit = convertQuantity(availableInBatchUnit, batchUnit, required.unit);
      const consumeInStockUnit = Math.min(availableInStockUnit, remaining);
      const consumeInBatchUnit = roundQty(convertQuantity(consumeInStockUnit, required.unit, batchUnit), 3);

      if (consumeInBatchUnit <= 0) continue;

      productPlan.push({
        batchId: Number(batch.id),
        productId: required.productId,
        productUnit: required.unit,
        consumeInBatchUnit,
        consumeInStockUnit: roundQty(consumeInStockUnit, 3),
        availableBefore: availableInBatchUnit,
      });

      remaining = roundQty(remaining - consumeInStockUnit, 6);
    }

    if (remaining > 0) {
      shortages.push({
        product_id: required.productId,
        product_name: required.productName,
        required_qty: required.required,
        available_qty: roundQty(required.required - remaining, 3),
        unit: required.unit,
      });
      continue;
    }

    consumptionPlan.push(...productPlan);
  }

  if (shortages.length > 0) {
    throw createHttpError(409, "Estoque insuficiente para registrar a venda presencial.", { shortages });
  }

  return consumptionPlan;
}

async function applyStoreSaleStockExit(storeSaleId, saleItems, reason = "store_sale_created") {
  const sourceId = `store_sale:${storeSaleId}`;

  const { data: existing } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("source_type", "manual")
    .eq("source_id", sourceId)
    .eq("tipo", "exit")
    .limit(1);

  if ((existing || []).length > 0) {
    return { applied: false, reason: "already_applied", changedProducts: [] };
  }

  const rollbackStoreSaleStockExit = async (appliedSteps, rollbackReason = "store_sale_rollback") => {
    if (!appliedSteps.length) return;

    const restoredProducts = new Set();

    for (let index = appliedSteps.length - 1; index >= 0; index -= 1) {
      const step = appliedSteps[index];
      const { data: batch, error: batchError } = await supabase
        .from("batches")
        .select("id, quantidade_disponivel")
        .eq("id", step.batchId)
        .single();

      if (batchError || !batch) {
        throw createHttpError(500, "Erro ao restaurar lote da venda presencial.", batchError?.message || null);
      }

      const restoredQty = roundQty(parseNumber(batch.quantidade_disponivel, 0) + step.consumeInBatchUnit, 3);
      const { error: updateError } = await supabase
        .from("batches")
        .update({ quantidade_disponivel: restoredQty })
        .eq("id", step.batchId);

      if (updateError) {
        throw createHttpError(500, "Erro ao restaurar saldo do lote da venda presencial.", updateError.message);
      }

      restoredProducts.add(step.productId);
    }

    const { error: deleteError } = await supabase
      .from("stock_movements")
      .delete()
      .eq("source_type", "manual")
      .eq("source_id", sourceId)
      .eq("tipo", "exit");

    if (deleteError) {
      throw createHttpError(500, "Erro ao remover movimentacoes parciais da venda presencial.", deleteError.message);
    }

    if (restoredProducts.size > 0) {
      await syncLowStockAlerts(Array.from(restoredProducts));
    }

    return { applied: true, reason: rollbackReason, changedProducts: Array.from(restoredProducts) };
  };

  const consumptionPlan = await buildStoreSaleStockPlan(saleItems);
  const changedProducts = new Set();
  const appliedSteps = [];

  try {
    for (const step of consumptionPlan) {
      const nextQty = roundQty(step.availableBefore - step.consumeInBatchUnit, 3);
      const movementInsert = await insertStockMovementSafe({
        tipo: "exit",
        produto_id: step.productId,
        batch_id: step.batchId,
        qty: step.consumeInStockUnit,
        unit: step.productUnit,
        source_type: "manual",
        source_id: sourceId,
        metadata: { reason, origin: "store_sale" },
      }, "store_sale_exit");

      if (!movementInsert.inserted) continue;

      try {
        await updateBatchQuantityExpected({
          batchId: step.batchId,
          expectedQty: step.availableBefore,
          nextQty,
          notFoundMessage: "Lote nao encontrado para baixa da venda presencial.",
          conflictMessage: "Saldo do lote mudou durante a venda presencial. Recarregue e tente novamente.",
          genericMessage: "Erro ao atualizar saldo do lote da venda presencial.",
        });
      } catch (error) {
        await deleteStockMovementById(movementInsert.movementId);
        throw error;
      }

      appliedSteps.push(step);

      changedProducts.add(step.productId);
    }
  } catch (error) {
    try {
      await rollbackStoreSaleStockExit(appliedSteps);
    } catch (rollbackError) {
      throw createHttpError(
        500,
        "Falha ao registrar venda presencial e ao restaurar o estoque.",
        {
          original: error?.message || null,
          rollback: rollbackError?.message || null,
        },
      );
    }
    throw error;
  }

  await syncLowStockAlerts(Array.from(changedProducts));

  return {
    applied: true,
    reason: "exit_created",
    changedProducts: Array.from(changedProducts),
    appliedSteps,
  };
}

async function revertStoreSaleStockExit(storeSaleId, reason = "store_sale_reversed") {
  const sourceId = `store_sale:${storeSaleId}`;
  const { data: exits, error: exitsError } = await supabase
    .from("stock_movements")
    .select("id, produto_id, batch_id, qty, unit")
    .eq("source_type", "manual")
    .eq("source_id", sourceId)
    .eq("tipo", "exit");

  if (exitsError) throw createHttpError(500, "Erro ao buscar movimentacoes da venda presencial.", exitsError.message);
  if (!(exits || []).length) return { applied: false, reason: "no_exit_to_reverse", changedProducts: [] };

  const changedProducts = new Set();

  for (const movement of exits) {
    if (movement.batch_id) {
      const { data: batch, error: batchError } = await supabase
        .from("batches")
        .select("id, quantidade_disponivel, unidade")
        .eq("id", movement.batch_id)
        .single();

      if (batchError || !batch) {
        throw createHttpError(500, "Erro ao localizar lote para estorno da venda presencial.", batchError?.message || null);
      }

      const movementUnit = normalizeStockUnit(movement.unit, "LB");
      const batchUnit = normalizeStockUnit(batch.unidade || movementUnit, movementUnit);
      const restoredQty = roundQty(parseNumber(batch.quantidade_disponivel, 0) + convertQuantity(parseNumber(movement.qty, 0), movementUnit, batchUnit), 3);

      await updateBatchQuantityExpected({
        batchId: movement.batch_id,
        expectedQty: parseNumber(batch.quantidade_disponivel, 0),
        nextQty: restoredQty,
        notFoundMessage: "Lote nao encontrado para estorno da venda presencial.",
        conflictMessage: "Saldo do lote mudou durante o estorno da venda presencial. Recarregue e tente novamente.",
        genericMessage: "Erro ao atualizar saldo do lote ao estornar a venda presencial.",
      });
    }

    changedProducts.add(Number(movement.produto_id));
  }

  const { error: deleteError } = await supabase
    .from("stock_movements")
    .delete()
    .eq("source_type", "manual")
    .eq("source_id", sourceId)
    .eq("tipo", "exit");

  if (deleteError) {
    throw createHttpError(500, "Erro ao remover movimentacoes antigas da venda presencial.", deleteError.message);
  }

  const reversalRows = (exits || []).map((movement) => ({
    tipo: "reversal",
    produto_id: movement.produto_id,
    batch_id: movement.batch_id,
    qty: movement.qty,
    unit: normalizeStockUnit(movement.unit, "LB"),
    source_type: "manual",
    source_id: `${sourceId}:reversal:${Date.now()}`,
    metadata: { reason, reversed_from_movement_id: movement.id, origin: "store_sale" },
  }));

  if (reversalRows.length) {
    const { error: reversalError } = await supabase.from("stock_movements").insert(reversalRows);
    if (reversalError && !isUniqueViolation(reversalError)) {
      throw createHttpError(500, "Erro ao registrar estorno da venda presencial.", reversalError.message);
    }
  }

  await syncLowStockAlerts(Array.from(changedProducts));
  return {
    applied: true,
    reason: reason || "store_sale_reversed",
    changedProducts: Array.from(changedProducts),
  };
}

async function loadSaleWithItems(storeSaleId) {
  const { data: sale, error: saleError } = await supabase
    .from("store_sales")
    .select("*")
    .eq("id", storeSaleId)
    .single();

  if (saleError || !sale) {
    throw createHttpError(404, "Venda presencial nao encontrada.", saleError?.message || null);
  }

  const { data: items, error: itemsError } = await supabase
    .from("store_sale_items")
    .select("*")
    .eq("store_sale_id", storeSaleId)
    .order("id", { ascending: true });

  if (itemsError) {
    throw createHttpError(500, "Erro ao carregar itens da venda presencial.", itemsError.message);
  }

  return { sale, items: items || [] };
}

async function resolveAttachmentSource(entityType, entityId) {
  if (entityType === "expense") {
    const { data, error } = await supabase
      .from("expenses")
      .select("id, attachment_bucket, attachment_path")
      .eq("id", entityId)
      .single();
    if (error || !data) throw createHttpError(404, "Despesa nao encontrada para anexos.", error?.message || null);
    return { bucket: data.attachment_bucket, path: data.attachment_path };
  }

  if (entityType === "employee-payment") {
    const { data, error } = await supabase
      .from("employee_payments")
      .select("id, attachment_bucket, attachment_path")
      .eq("id", entityId)
      .single();
    if (error || !data) throw createHttpError(404, "Pagamento nao encontrado para anexos.", error?.message || null);
    return { bucket: data.attachment_bucket, path: data.attachment_path };
  }

  if (entityType === "invoice-import") {
    const { data, error } = await supabase
      .from("invoice_imports")
      .select("id, file_bucket, file_path")
      .eq("id", entityId)
      .single();
    if (error || !data) throw createHttpError(404, "Importacao de nota nao encontrada.", error?.message || null);
    return { bucket: data.file_bucket, path: data.file_path };
  }

  throw createHttpError(400, "Tipo de anexo administrativo nao suportado.");
}

function isMissingRelationError(error, relationName) {
  const message = String(error?.message || "");
  return message.includes(`Could not find the table 'public.${relationName}'`) ||
    message.includes(`Could not find the '${relationName}' relation`) ||
    message.includes(`relation \"${relationName}\" does not exist`) ||
    message.includes(`relation \"public.${relationName}\" does not exist`) ||
    (message.includes("schema cache") && message.includes(relationName));
}

async function ensureInvoiceStockMovements(invoiceId) {
  const sourceId = String(invoiceId);
  const [{ data: batches, error: batchesError }, { data: movements, error: movementsError }] = await Promise.all([
    supabase
      .from("batches")
      .select("id, produto_id, quantidade, quantidade_disponivel, unidade, invoice_import_id")
      .eq("invoice_import_id", invoiceId),
    supabase
      .from("stock_movements")
      .select("id, batch_id, produto_id")
      .eq("source_type", "invoice")
      .eq("source_id", sourceId)
      .eq("tipo", "entry"),
  ]);

  if (batchesError || movementsError) {
    throw createHttpError(
      500,
      "Erro ao reconciliar movimentos de estoque da nota.",
      batchesError?.message || movementsError?.message,
    );
  }

  const existingBatchIds = new Set(
    (movements || [])
      .map((movement) => Number(movement.batch_id))
      .filter((id) => Number.isFinite(id) && id > 0),
  );

  const rowsToInsert = [];
  const changedProductsSet = new Set();
  for (const batch of batches || []) {
    const batchId = Number(batch.id);
    if (existingBatchIds.has(batchId)) continue;

    const qtyRaw = parseNumber(batch.quantidade, parseNumber(batch.quantidade_disponivel, NaN));
    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) continue;

    const productId = Number(batch.produto_id);
    rowsToInsert.push({
      tipo: "entry",
      produto_id: productId,
      batch_id: batchId,
      qty: roundQty(qtyRaw, 3),
      unit: normalizeStockUnit(batch.unidade || "LB", "LB"),
      source_type: "invoice",
      source_id: sourceId,
      metadata: {
        invoice_import_id: invoiceId,
        reconciled_from_batch: true,
      },
    });

    if (Number.isFinite(productId) && productId > 0) changedProductsSet.add(productId);
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("stock_movements")
      .insert(rowsToInsert);

    if (insertError) {
      throw createHttpError(500, "Erro ao inserir movimentos reconciliados da nota.", insertError.message);
    }
  }

  return {
    inserted_entries: rowsToInsert.length,
    total_batches: (batches || []).length,
    total_existing_entries: (movements || []).length,
    changed_products: Array.from(changedProductsSet),
  };
}

async function getStockBalanceRows() {
  const [{ data: products, error: productsError }, { data: balances, error: balancesError }] = await Promise.all([
    supabase
      .from("products")
      .select("id, nome, categoria, preco, unidade, stock_enabled, stock_min, stock_unit")
      .order("nome", { ascending: true }),
    supabase.from("stock_balances").select("produto_id, saldo_qty, last_movement_at"),
  ]);

  if (productsError || balancesError) {
    throw createHttpError(
      500,
      "Erro ao carregar painel de estoque.",
      productsError?.message || balancesError?.message,
    );
  }

  const balanceMap = new Map((balances || []).map((row) => [
    Number(row.produto_id),
    { saldo_qty: parseNumber(row.saldo_qty, 0), last_movement_at: row.last_movement_at },
  ]));

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: lots, error: lotsError } = await supabase
    .from("batches")
    .select("id, produto_id, data_validade, quantidade_disponivel")
    .gt("quantidade_disponivel", 0)
    .not("data_validade", "is", null)
    .lte("data_validade", in30Days);

  if (lotsError) throw createHttpError(500, "Erro ao carregar lotes do estoque.", lotsError.message);

  const lots7Map = new Map();
  const lots30Map = new Map();
  for (const lot of lots || []) {
    const productId = Number(lot.produto_id);
    const exp = String(lot.data_validade || "");
    lots30Map.set(productId, (lots30Map.get(productId) || 0) + 1);
    if (exp <= in7Days) lots7Map.set(productId, (lots7Map.get(productId) || 0) + 1);
  }

  const rows = (products || []).map((product) => {
    const productId = Number(product.id);
    const balance = balanceMap.get(productId) || { saldo_qty: 0, last_movement_at: null };
    const stockEnabled = Boolean(product.stock_enabled);
    const stockMin = parseNumber(product.stock_min, 0);
    const stockUnit = normalizeStockUnit(product.stock_unit || product.unidade || "LB", "LB");
    const saldo = roundQty(balance.saldo_qty, 3);
    const isLow = stockEnabled && saldo <= stockMin;

    return {
      product_id: productId,
      product_name: product.nome,
      category: product.categoria || "-",
      sale_price: parseNumber(product.preco, 0),
      stock_enabled: stockEnabled,
      stock_min: stockMin,
      stock_unit: stockUnit,
      saldo_qty: saldo,
      low_stock: isLow,
      status: stockEnabled ? (isLow ? "low" : "ok") : "disabled",
      lots_expiring_7d: lots7Map.get(productId) || 0,
      lots_expiring_30d: lots30Map.get(productId) || 0,
      last_movement_at: balance.last_movement_at,
    };
  });

  const summary = {
    total_products: rows.length,
    stock_enabled_products: rows.filter((row) => row.stock_enabled).length,
    low_stock_products: rows.filter((row) => row.low_stock).length,
    expiring_7d_products: rows.filter((row) => row.lots_expiring_7d > 0).length,
  };

  return { rows, summary };
}

async function getLowStockAlerts() {
  const { rows } = await getStockBalanceRows();
  const lowRows = rows
    .filter((row) => row.low_stock)
    .sort((a, b) => (a.saldo_qty - a.stock_min) - (b.saldo_qty - b.stock_min));

  const { data: openEvents } = await supabase
    .from("stock_alert_events")
    .select("id, product_id, alert_type, payload, triggered_at")
    .eq("alert_type", "low_stock")
    .is("resolved_at", null)
    .order("triggered_at", { ascending: false });

  return { current: lowRows, open_events: openEvents || [] };
}

function parseBase64Input(base64Input) {
  const raw = String(base64Input || "").trim();
  if (!raw) throw createHttpError(400, "Arquivo em base64 nao informado.");

  const match = raw.match(/^data:(.+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }

  return { mimeType: null, base64: raw };
}

function sanitizeFileName(fileName) {
  return String(fileName || "nota-fiscal.jpg")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
}

function sanitizeStorageSegment(value) {
  return String(value || "produto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "produto";
}

function inferMimeTypeFromPath(filePath = "") {
  const normalized = String(filePath || "").toLowerCase().trim();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  return "image/jpeg";
}

async function uploadBase64FileToStorage({
  bucket,
  fileName,
  fileBase64,
  folderPrefix,
  defaultFileName,
  contentType,
}) {
  const safeFileName = sanitizeFileName(fileName || defaultFileName || "arquivo.bin");
  const parsed = parseBase64Input(fileBase64);
  const mimeType = contentType || parsed.mimeType || inferMimeTypeFromPath(safeFileName);
  const buffer = Buffer.from(parsed.base64, "base64");

  if (!buffer.length) {
    throw createHttpError(400, "Arquivo vazio.");
  }

  if (buffer.length > MAX_B64_BYTES) {
    throw createHttpError(400, `Arquivo excede limite de ${MAX_B64_BYTES} bytes.`);
  }

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uniqueName = `${Date.now()}-${safeFileName}`;
  const filePath = `${folderPrefix}/${yyyy}/${mm}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw createHttpError(500, "Falha no upload para o Storage.", uploadError.message);
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return {
    bucket,
    filePath,
    fileUrl: publicUrlData?.publicUrl || null,
    mimeType,
    size: buffer.length,
  };
}

async function createSignedStorageUrl(bucket, filePath, expiresIn = 60 * 10) {
  if (!bucket || !filePath) {
    throw createHttpError(400, "Bucket e caminho do arquivo sao obrigatorios para gerar link seguro.");
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn);
  if (error) {
    throw createHttpError(500, "Falha ao gerar link assinado do anexo.", error.message);
  }

  return data?.signedUrl || null;
}

async function insertWhatsAppMessageLog(entry) {
  const payload = {
    order_id: entry.orderId || null,
    direction: entry.direction || "outbound",
    target: entry.target,
    event_type: entry.eventType,
    destination_phone: entry.destinationPhone || null,
    message_text: entry.messageText || null,
    payload: entry.payload || {},
    provider_response: entry.providerResponse || {},
    local_status: entry.localStatus || "unknown",
    error_detail: entry.errorDetail || null,
    message_id: entry.messageId || null,
    zaap_id: entry.zaapId || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("whatsapp_messages").insert([payload]).select("*").maybeSingle();
  if (error) {
    console.error("Falha ao registrar whatsapp_messages", error.message);
    return null;
  }

  return data;
}

async function persistWhatsAppAttempt({
  orderId,
  target,
  eventType,
  destinationPhone,
  messageText,
  payload,
  sendResult,
}) {
  return insertWhatsAppMessageLog({
    orderId,
    target,
    eventType,
    destinationPhone,
    messageText,
    payload,
    providerResponse: sendResult || {},
    localStatus: sendResult?.ok ? "queued" : (sendResult?.reason === "not_sent" ? "not_sent" : "failed"),
    errorDetail: sendResult?.detail || sendResult?.reason || null,
    messageId: sendResult?.messageId || null,
    zaapId: sendResult?.zaapId || null,
  });
}

async function updateWhatsAppMessageStatus({ messageId, zaapId, localStatus, providerResponse, errorDetail }) {
  let query = supabase
    .from("whatsapp_messages")
    .update({
      local_status: localStatus || "unknown",
      provider_response: providerResponse || {},
      error_detail: errorDetail || null,
      updated_at: new Date().toISOString(),
    })
    .select("*");

  if (messageId) {
    query = query.eq("message_id", messageId);
  } else if (zaapId) {
    query = query.eq("zaap_id", zaapId);
  } else {
    return null;
  }

  const { data, error } = await query;
  if (error) {
    console.error("Falha ao atualizar whatsapp_messages", error.message);
    return null;
  }
  return data || [];
}

async function updateWhatsAppMessagesByIds({ messageIds, localStatus, providerResponse, errorDetail }) {
  const ids = Array.from(new Set((messageIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .update({
      local_status: localStatus || "unknown",
      provider_response: providerResponse || {},
      error_detail: errorDetail || null,
      updated_at: new Date().toISOString(),
    })
    .in("message_id", ids)
    .select("*");

  if (error) {
    console.error("Falha ao atualizar whatsapp_messages por ids", error.message);
    return [];
  }

  return data || [];
}

async function discoverStorePhoneFromZApi() {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const baseUrl = process.env.ZAPI_BASE_URL || "https://api.z-api.io";
  const configuredStorePhone = normalizePhone(process.env.ZAPI_STORE_PHONE || process.env.STORE_NOTIFICATION_PHONE || "");

  if (!instanceId || !instanceToken) {
    return { ok: false, reason: "missing-zapi-config" };
  }

  const headers = {};
  if (clientToken) headers["Client-Token"] = clientToken;

  const candidateEndpoints = [
    `${baseUrl}/instances/${instanceId}/token/${instanceToken}/device`,
    `${baseUrl}/instances/${instanceId}/token/${instanceToken}/status`,
    `${baseUrl}/instances/${instanceId}/token/${instanceToken}/me`,
    `${baseUrl}/instances/${instanceId}/token/${instanceToken}/details`,
  ];

  const diagnostics = [];

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await fetch(endpoint, { method: "GET", headers });
      const result = await readApiResponse(response);
      diagnostics.push({
        endpoint,
        status: response.status,
        ok: response.ok,
        hasError: Boolean(result.data?.error),
      });

      if (!response.ok || result.data?.error) continue;

      const extracted = extractStorePhoneFromPayload(result.data);
      if (extracted.phone) {
        return {
          ok: true,
          phone: extracted.phone,
          source: endpoint,
          sourcePath: extracted.path,
          confidence: extracted.confidence,
          diagnostics,
        };
      }
    } catch {
      diagnostics.push({
        endpoint,
        status: null,
        ok: false,
        hasError: true,
      });
    }
  }

  if (configuredStorePhone) {
    return {
      ok: true,
      phone: configuredStorePhone,
      source: "env:ZAPI_STORE_PHONE",
      sourcePath: "env",
      confidence: "fallback",
      diagnostics,
    };
  }

  return {
    ok: false,
    reason: "store-phone-discovery-failed",
    diagnostics,
  };
}

function getZApiConfig() {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const baseUrl = process.env.ZAPI_BASE_URL || "https://api.z-api.io";

  return {
    configured: Boolean(instanceId && instanceToken),
    instanceId,
    instanceToken,
    clientToken,
    baseUrl,
  };
}

function buildZApiHeaders({ contentType = null } = {}) {
  const { clientToken } = getZApiConfig();
  const headers = {};
  if (contentType) headers["Content-Type"] = contentType;
  if (clientToken) headers["Client-Token"] = clientToken;
  return headers;
}

function buildZApiInstanceEndpoint(pathname) {
  const { configured, baseUrl, instanceId, instanceToken } = getZApiConfig();
  if (!configured) return null;
  return `${baseUrl}/instances/${instanceId}/token/${instanceToken}/${String(pathname || "").replace(/^\/+/, "")}`;
}

function getNestedValue(payload, keyPath) {
  const parts = String(keyPath || "").split(".").filter(Boolean);
  let cursor = payload;
  for (const part of parts) {
    cursor = cursor?.[part];
    if (cursor === undefined || cursor === null) return null;
  }
  return cursor;
}

function findFirstNestedValue(payload, keyPaths) {
  for (const keyPath of keyPaths) {
    const value = getNestedValue(payload, keyPath);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function normalizeBooleanLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;

  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;

  if (["true", "1", "yes", "y", "connected", "authenticated", "ready", "online", "open", "success"].includes(raw)) {
    return true;
  }

  if ([
    "false",
    "0",
    "no",
    "n",
    "disconnected",
    "not_connected",
    "not connected",
    "offline",
    "closed",
    "close",
    "qr",
    "qrcode",
    "qr code",
    "pairing",
    "connecting",
    "unauthenticated",
    "logout",
  ].includes(raw)) {
    return false;
  }

  return null;
}

function extractZApiConnectionInfo(payload) {
  const statusValue = findFirstNestedValue(payload, [
    "status",
    "instance.status",
    "connected.status",
    "session.status",
    "data.status",
    "value.status",
  ]);

  const connectedValue = findFirstNestedValue(payload, [
    "connected",
    "isConnected",
    "authenticated",
    "connected.connected",
    "instance.connected",
    "session.connected",
    "data.connected",
    "data.isConnected",
    "value.connected",
    "value.isConnected",
  ]);

  const connected = normalizeBooleanLike(connectedValue) ?? normalizeBooleanLike(statusValue);
  const phone = extractStorePhoneFromPayload(payload);

  return {
    connected: connected === true,
    connectedKnown: connected !== null,
    status: statusValue === null || statusValue === undefined ? null : String(statusValue).trim() || null,
    phone: phone.phone || null,
    phonePath: phone.path || null,
    phoneConfidence: phone.confidence || null,
  };
}

function normalizeQrCodeValue(value, fallbackMimeType = "image/png") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("data:image/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/\s+/g, "");
  return `data:${fallbackMimeType};base64,${normalized}`;
}

function extractZApiQrCodeDataUrl(payload, fallbackMimeType = "image/png") {
  if (!payload) return null;
  if (typeof payload === "string") return normalizeQrCodeValue(payload, fallbackMimeType);

  const candidate = findFirstNestedValue(payload, [
    "value",
    "qrCode",
    "qrcode",
    "base64",
    "image",
    "data.value",
    "data.qrCode",
    "data.qrcode",
    "data.base64",
    "data.image",
    "value.qrCode",
    "value.qrcode",
    "value.base64",
    "value.image",
  ]);

  return candidate ? normalizeQrCodeValue(candidate, fallbackMimeType) : null;
}

async function fetchZApiConnectionStatus() {
  const endpoint = buildZApiInstanceEndpoint("status");
  if (!endpoint) {
    return {
      ok: false,
      configured: false,
      connected: false,
      connectedKnown: false,
      status: null,
      reason: "missing-zapi-config",
      phone: null,
      phoneSource: null,
      phoneSourcePath: null,
      phoneConfidence: null,
      diagnostics: [],
    };
  }

  try {
    const response = await fetch(endpoint, { method: "GET", headers: buildZApiHeaders() });
    const result = await readApiResponse(response);
    const payload = result.data || null;
    const info = extractZApiConnectionInfo(payload);
    const shouldTreatAsConnected = info.connected === true;
    const diagnostics = [{
      endpoint,
      status: response.status,
      ok: response.ok,
      hasError: Boolean(payload?.error),
    }];

    if (!response.ok || (payload?.error && !shouldTreatAsConnected)) {
      return {
        ok: false,
        configured: true,
        connected: shouldTreatAsConnected,
        connectedKnown: info.connectedKnown,
        status: info.status,
        reason: payload?.message || payload?.error || `zapi-status-http-${response.status}`,
        phone: null,
        phoneSource: null,
        phoneSourcePath: null,
        phoneConfidence: null,
        diagnostics,
      };
    }

    let phone = info.phone || null;
    let phoneSource = endpoint;
    let phoneSourcePath = info.phonePath || null;
    let phoneConfidence = info.phoneConfidence || null;

    if (!phone) {
      const discovery = await discoverStorePhoneFromZApi();
      if (discovery.ok && discovery.phone) {
        phone = discovery.phone;
        phoneSource = discovery.source || endpoint;
        phoneSourcePath = discovery.sourcePath || null;
        phoneConfidence = discovery.confidence || null;
        diagnostics.push(...(Array.isArray(discovery.diagnostics) ? discovery.diagnostics : []));
      }
    }

    return {
      ok: true,
      configured: true,
      connected: info.connected,
      connectedKnown: info.connectedKnown,
      status: info.status,
      reason: null,
      phone,
      phoneSource,
      phoneSourcePath,
      phoneConfidence,
      diagnostics,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      connected: false,
      connectedKnown: false,
      status: null,
      reason: error?.message || "zapi-status-request-failed",
      phone: null,
      phoneSource: null,
      phoneSourcePath: null,
      phoneConfidence: null,
      diagnostics: [{
        endpoint,
        status: null,
        ok: false,
        hasError: true,
      }],
    };
  }
}

async function fetchZApiQrCode() {
  const endpoint = buildZApiInstanceEndpoint("qr-code/image");
  if (!endpoint) {
    return {
      ok: false,
      configured: false,
      qrCodeDataUrl: null,
      mimeType: null,
      reason: "missing-zapi-config",
    };
  }

  try {
    const response = await fetch(endpoint, { method: "GET", headers: buildZApiHeaders() });
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim() || null;

    if (contentType && contentType.startsWith("image/")) {
      if (!response.ok) {
        return {
          ok: false,
          configured: true,
          qrCodeDataUrl: null,
          mimeType: contentType,
          reason: `zapi-qr-http-${response.status}`,
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        ok: true,
        configured: true,
        qrCodeDataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
        mimeType: contentType,
        reason: null,
      };
    }

    const result = await readApiResponse(response);
    const payload = result.data || null;
    const connectionInfo = extractZApiConnectionInfo(payload);
    const qrCodeDataUrl = extractZApiQrCodeDataUrl(result.data || result.text || "", contentType || "image/png");
    const errorMessage = payload?.message || payload?.error || result.text || null;

    if (connectionInfo.connected) {
      return {
        ok: true,
        configured: true,
        qrCodeDataUrl: null,
        mimeType: contentType || null,
        reason: "already-connected",
      };
    }

    if (!response.ok || !qrCodeDataUrl) {
      return {
        ok: false,
        configured: true,
        qrCodeDataUrl: qrCodeDataUrl || null,
        mimeType: contentType,
        reason: errorMessage || `zapi-qr-http-${response.status}`,
      };
    }

    return {
      ok: true,
      configured: true,
      qrCodeDataUrl,
      mimeType: contentType || "image/png",
      reason: null,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      qrCodeDataUrl: null,
      mimeType: null,
      reason: error?.message || "zapi-qr-request-failed",
    };
  }
}

async function disconnectZApiInstance() {
  const endpoint = buildZApiInstanceEndpoint("disconnect");
  if (!endpoint) {
    return { ok: false, configured: false, reason: "missing-zapi-config" };
  }

  try {
    const response = await fetch(endpoint, { method: "GET", headers: buildZApiHeaders() });
    const result = await readApiResponse(response);
    const payload = result.data || null;

    if (!response.ok || payload?.error) {
      return {
        ok: false,
        configured: true,
        reason: payload?.message || payload?.error || result.text || `zapi-disconnect-http-${response.status}`,
      };
    }

    return { ok: true, configured: true, reason: null };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      reason: error?.message || "zapi-disconnect-request-failed",
    };
  }
}

function normalizeDateInput(value, fallback = null) {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function resolveRangeFromQuery(query) {
  const startRaw = String(query?.start || query?.date_from || "").trim();
  const endRaw = String(query?.end || query?.date_to || "").trim();
  const start = startRaw ? new Date(`${startRaw}T00:00:00.000Z`) : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  const end = endRaw ? new Date(`${endRaw}T23:59:59.999Z`) : new Date();
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: startRaw || start.toISOString().slice(0, 10),
    endDate: endRaw || end.toISOString().slice(0, 10),
  };
}

function resolveCurrentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function toDayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function buildCsvRow(values) {
  return values
    .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
    .join(",");
}

function getOrderClientId(order) {
  return order?.cliente_id || order?.client_id || null;
}

function buildClientAddress(client) {
  if (!client) return "-";
  return [
    [client.endereco_rua, client.endereco_numero].filter(Boolean).join(", "),
    client.endereco_complemento || null,
    [client.cidade, client.estado].filter(Boolean).join(" - "),
    client.cep || null,
  ]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim() || "-";
}

function normalizeCountryFilter(value) {
  const raw = String(value || "all").trim().toLowerCase();
  if (["br", "brazil", "brasil"].includes(raw)) return "br";
  if (["us", "usa", "eua", "united states"].includes(raw)) return "us";
  return "all";
}

function normalizeCountryLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (["br", "brazil", "brasil"].includes(raw)) return "Brasil";
  if (["us", "usa", "eua", "united states"].includes(raw)) return "USA";
  return String(value || "").trim() || null;
}

function detectClientCountry(client) {
  return normalizeCountryLabel(client?.pais) || inferPhoneCountry(client?.telefone) || "Outro";
}

async function enrichClientAdminRows(rows) {
  const ids = [...new Set((rows || []).map((row) => Number(row?.id)).filter(Boolean))];
  if (!ids.length) return rows || [];

  const { data, error } = await supabase
    .from("clients")
    .select("id, cidade, estado, pais, preferred_locale")
    .in("id", ids);

  if (error) {
    throw createHttpError(500, "Erro ao enriquecer dados de clientes.", error.message);
  }

  const detailMap = new Map((data || []).map((item) => [String(item.id), item]));
  return (rows || []).map((row) => {
    const detail = detailMap.get(String(row?.id));
    return {
      ...row,
      cidade: detail?.cidade || row?.cidade || null,
      estado: detail?.estado || row?.estado || null,
      pais: normalizeCountryLabel(detail?.pais || row?.pais) || null,
      preferred_locale: detail?.preferred_locale || row?.preferred_locale || null,
    };
  });
}

function renderClientCampaignMessage(template, client) {
  return String(template || "")
    .replace(/\{nome\}/gi, String(client?.nome || "cliente").trim() || "cliente")
    .trim();
}

async function createClientCampaignAudit(payload) {
  const { data, error } = await supabase
    .from("client_campaigns")
    .insert([{
      segment: payload.segment,
      search_term: payload.searchTerm || null,
      with_orders: Boolean(payload.withOrders),
      message_template: payload.messageTemplate,
      target_count: payload.targetCount || 0,
      valid_count: payload.validCount || 0,
      skipped_count: payload.skippedCount || 0,
      sent_count: payload.sentCount || 0,
      failed_count: payload.failedCount || 0,
      status: payload.status || "draft",
      created_by: payload.createdBy || null,
      metadata: payload.metadata || {},
      updated_at: new Date().toISOString(),
    }])
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error, "client_campaigns")) return null;
    throw createHttpError(500, "Erro ao registrar campanha de clientes.", error.message);
  }

  return data || null;
}

async function updateClientCampaignAudit(campaignId, patch) {
  if (!campaignId) return null;
  const { data, error } = await supabase
    .from("client_campaigns")
    .update({
      sent_count: patch.sentCount,
      failed_count: patch.failedCount,
      skipped_count: patch.skippedCount,
      valid_count: patch.validCount,
      status: patch.status,
      metadata: patch.metadata || {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error, "client_campaigns")) return null;
    throw createHttpError(500, "Erro ao atualizar campanha de clientes.", error.message);
  }

  return data || null;
}

async function insertClientCampaignRecipientAudit(entry) {
  const { error } = await supabase
    .from("client_campaign_recipients")
    .insert([{
      campaign_id: entry.campaignId || null,
      client_id: entry.clientId || null,
      client_name: entry.clientName || null,
      destination_phone: entry.destinationPhone || null,
      rendered_message: entry.renderedMessage || null,
      local_status: entry.localStatus || "unknown",
      error_detail: entry.errorDetail || null,
      provider_response: entry.providerResponse || {},
      message_id: entry.messageId || null,
      zaap_id: entry.zaapId || null,
      updated_at: new Date().toISOString(),
    }]);

  if (error && !isMissingRelationError(error, "client_campaign_recipients")) {
    throw createHttpError(500, "Erro ao registrar destinatario da campanha.", error.message);
  }
}

function normalizeClientSegment(value) {
  const raw = String(value || "all").trim().toLowerCase();
  if (["vip", "vips"].includes(raw)) return "vip";
  if (["non_vip", "nao_vip", "regular", "nonvip"].includes(raw)) return "non_vip";
  return "all";
}

function normalizeClientCampaignTime(value) {
  const raw = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  const [hour, minute] = raw.split(":").map((item) => Number.parseInt(item, 10));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeClientCampaignFilters(payload = {}) {
  return {
    segment: normalizeClientSegment(payload.segment),
    search: String(payload.search || "").trim(),
    withOrders: Boolean(payload.withOrders),
    country: normalizeCountryFilter(payload.country),
    city: String(payload.city || "").trim(),
    minOrders: Math.max(0, Number.parseInt(String(payload.minOrders || "0"), 10) || 0),
    onlyWithPhone: payload.onlyWithPhone !== false,
  };
}

function normalizeClientCampaignMedia(payload = {}) {
  const imageBase64 = String(payload.imageBase64 || "").trim();
  const imageFileName = String(payload.imageFileName || "").trim() || null;
  const imageMimeType = String(payload.imageMimeType || "").trim() || null;
  if (!imageBase64) {
    return {
      kind: "text",
      imageBase64: null,
      imageFileName: null,
      imageMimeType: null,
    };
  }

  return {
    kind: "image",
    imageBase64,
    imageFileName,
    imageMimeType,
  };
}

function extractStoragePathFromPublicUrl(bucket, fileUrl) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const raw = String(fileUrl || "").trim();
  const index = raw.indexOf(marker);
  if (index === -1) return null;
  return raw.slice(index + marker.length).split("?")[0] || null;
}

async function removeStorageObjectByPublicUrl(bucket, fileUrl) {
  const filePath = extractStoragePathFromPublicUrl(bucket, fileUrl);
  if (!filePath) return false;

  const { error } = await supabase.storage.from(bucket).remove([filePath]);
  if (error) {
    console.warn(`Falha ao remover arquivo antigo do bucket ${bucket}: ${error.message}`);
    return false;
  }

  return true;
}

async function uploadAdminProductImage({ productName, imageBase64, imageFileName }) {
  return uploadBase64FileToStorage({
    bucket: "produtos",
    fileName: imageFileName,
    fileBase64: imageBase64,
    folderPrefix: "products/admin-uploads",
    defaultFileName: `${sanitizeStorageSegment(productName)}.jpg`,
  });
}

function normalizeClientCampaignSchedule(payload = {}) {
  const mode = String(payload.mode || "now").trim().toLowerCase() === "schedule" ? "schedule" : "now";
  const scheduledAtRaw = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
  const scheduledAt = scheduledAtRaw && !Number.isNaN(scheduledAtRaw.getTime())
    ? scheduledAtRaw.toISOString()
    : null;
  const windowStart = normalizeClientCampaignTime(payload.windowStart);
  const windowEnd = normalizeClientCampaignTime(payload.windowEnd);
  return {
    mode,
    scheduledAt,
    windowStart,
    windowEnd,
  };
}

function clientCampaignTimeToMinutes(value) {
  const normalized = normalizeClientCampaignTime(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map((item) => Number.parseInt(item, 10));
  return (hour * 60) + minute;
}

function isClientCampaignWithinWindow(date, schedule = {}) {
  const start = clientCampaignTimeToMinutes(schedule.windowStart);
  const end = clientCampaignTimeToMinutes(schedule.windowEnd);
  if (start === null || end === null) return true;

  const current = (date.getHours() * 60) + date.getMinutes();
  if (start <= end) {
    return current >= start && current <= end;
  }

  return current >= start || current <= end;
}

function getNextClientCampaignWindowDate(schedule = {}, fromDate = new Date()) {
  const start = clientCampaignTimeToMinutes(schedule.windowStart);
  const end = clientCampaignTimeToMinutes(schedule.windowEnd);
  if (start === null || end === null) {
    return new Date(fromDate.getTime());
  }

  const next = new Date(fromDate.getTime());
  next.setSeconds(0, 0);
  const current = (next.getHours() * 60) + next.getMinutes();

  if (start <= end) {
    if (current <= start) {
      next.setHours(Math.floor(start / 60), start % 60, 0, 0);
      return next;
    }

    next.setDate(next.getDate() + 1);
    next.setHours(Math.floor(start / 60), start % 60, 0, 0);
    return next;
  }

  if (current <= end) {
    return next;
  }

  if (current < start) {
    next.setHours(Math.floor(start / 60), start % 60, 0, 0);
    return next;
  }

  next.setDate(next.getDate() + 1);
  next.setHours(Math.floor(start / 60), start % 60, 0, 0);
  return next;
}

const scheduledClientCampaignTimers = new Map();

function clearScheduledClientCampaign(campaignId) {
  const timer = scheduledClientCampaignTimers.get(String(campaignId));
  if (timer) {
    clearTimeout(timer);
    scheduledClientCampaignTimers.delete(String(campaignId));
  }
}

function normalizeSortDirection(value) {
  return String(value || "").trim().toLowerCase() === "desc" ? "desc" : "asc";
}

function escapeAdminSearchTerm(value) {
  return String(value || "")
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAdminSearchPattern(value) {
  const sanitized = escapeAdminSearchTerm(value);
  return sanitized ? `%${sanitized}%` : "";
}

function extractOrderSearchId(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  const stripped = raw.startsWith("IMP") ? raw.slice(3) : raw;
  const parsed = Number.parseInt(stripped.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function isMissingFunctionError(error, functionName) {
  const message = String(error?.message || "");
  return message.includes(`Could not find the function public.${functionName}`) ||
    message.includes(`function public.${functionName}`) ||
    message.includes(`Could not choose the best candidate function between: public.${functionName}`) ||
    message.includes("PGRST202");
}

function shouldFallbackOrdersOptimizedPath(error) {
  const message = String(error?.message || error?.detail || "");
  return message.includes("admin_orders_enriched") ||
    message.includes("order_items") ||
    message.includes("schema cache");
}

let cachedOrdersClientColumn = null;
let cachedOrderItemsOrderColumn = null;

async function resolveOrdersClientColumn() {
  if (cachedOrdersClientColumn) return cachedOrdersClientColumn;

  const byCliente = await supabase.from("orders").select("cliente_id").limit(1);
  if (!byCliente.error) {
    cachedOrdersClientColumn = "cliente_id";
    return cachedOrdersClientColumn;
  }

  if (!isMissingColumnInSchemaCache(byCliente.error, "cliente_id")) {
    cachedOrdersClientColumn = "cliente_id";
    return cachedOrdersClientColumn;
  }

  const byClient = await supabase.from("orders").select("client_id").limit(1);
  if (!byClient.error) {
    cachedOrdersClientColumn = "client_id";
    return cachedOrdersClientColumn;
  }

  cachedOrdersClientColumn = "cliente_id";
  return cachedOrdersClientColumn;
}

async function resolveOrderItemsOrderColumn() {
  if (cachedOrderItemsOrderColumn) return cachedOrderItemsOrderColumn;

  const byPedido = await supabase.from("order_items").select("pedido_id").limit(1);
  if (!byPedido.error) {
    cachedOrderItemsOrderColumn = "pedido_id";
    return cachedOrderItemsOrderColumn;
  }

  if (!isMissingColumnInSchemaCache(byPedido.error, "pedido_id")) {
    cachedOrderItemsOrderColumn = "pedido_id";
    return cachedOrderItemsOrderColumn;
  }

  const byOrder = await supabase.from("order_items").select("order_id").limit(1);
  if (!byOrder.error) {
    cachedOrderItemsOrderColumn = "order_id";
    return cachedOrderItemsOrderColumn;
  }

  cachedOrderItemsOrderColumn = "pedido_id";
  return cachedOrderItemsOrderColumn;
}

async function fetchOrderItemsByOrderIds(orderIds = []) {
  if (!orderIds.length) return [];

  let orderColumn = await resolveOrderItemsOrderColumn();
  let result = await supabase
    .from("order_items")
    .select("*")
    .in(orderColumn, orderIds);

  if (result.error && orderColumn === "pedido_id" && isMissingColumnInSchemaCache(result.error, "pedido_id")) {
    cachedOrderItemsOrderColumn = "order_id";
    orderColumn = "order_id";
    result = await supabase
      .from("order_items")
      .select("*")
      .in(orderColumn, orderIds);
  }

  if (result.error) {
    throw createHttpError(500, "Erro ao carregar itens dos pedidos.", result.error.message);
  }

  return result.data || [];
}

function applyClientAdminFilters(query, { search = "", segment = "all", withOrders = false } = {}) {
  const pattern = buildAdminSearchPattern(search);
  let next = query;

  if (pattern) {
    next = next.or(`nome.ilike.${pattern},email.ilike.${pattern},telefone.ilike.${pattern},documento.ilike.${pattern}`);
  }

  if (segment === "vip") {
    next = next.eq("vip", true);
  } else if (segment === "non_vip") {
    next = next.eq("vip", false);
  }

  if (withOrders) {
    next = next.gt("order_count", 0);
  }

  return next;
}

function normalizeClientAdminRow(row) {
  return {
    ...row,
    order_count: Number(row?.order_count || 0),
    address: row?.address || "-",
  };
}

function applyOrdersAdminFilters(query, {
  start,
  end,
  status = "",
  city = "",
  search = "",
  onlyOpen = false,
  includeCity = true,
} = {}) {
  let next = query;

  if (start) next = next.gte("data_pedido", start);
  if (end) next = next.lte("data_pedido", end);

  if (status !== "" && status !== null && status !== undefined) {
    next = next.eq("status", Number(status));
  }

  if (onlyOpen) {
    next = next.lt("status", STATUS.CONCLUIDO);
  }

  if (includeCity && city) {
    next = next.eq("city", city);
  }

  const pattern = buildAdminSearchPattern(search);
  if (pattern) {
    const filters = [
      `client_name.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
      `explicit_code.ilike.${pattern}`,
    ];
    const numericOrderId = extractOrderSearchId(search);
    if (numericOrderId) {
      filters.push(`id.eq.${numericOrderId}`);
    }
    next = next.or(filters.join(","));
  }

  return next;
}

async function buildClientsAdminSummaryFallback({ matchingClients = 0 } = {}) {
  const [totalClientsResult, totalOrdersResult, totalVipsResult] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("vip", true),
  ]);

  return {
    totalClients: Number(totalClientsResult.count || 0),
    totalVips: totalVipsResult.error ? 0 : Number(totalVipsResult.count || 0),
    totalOrders: Number(totalOrdersResult.count || 0),
    matchingClients: Number(matchingClients || 0),
  };
}

async function buildClientsAdminPayload({
  search = "",
  segment = "all",
  withOrders = false,
  page = 1,
  pageSize = 10,
  sortField = "nome",
  sortDir = "asc",
} = {}) {
  const safePageSize = Math.max(1, Math.min(5000, Number(pageSize || 10)));
  const safePage = Math.max(1, Number(page || 1));
  const startIndex = (safePage - 1) * safePageSize;
  const sortColumnMap = {
    nome: "nome",
    email: "email",
    vip: "vip",
    pedidos: "order_count",
  };
  const sortColumn = sortColumnMap[sortField] || "nome";
  const ascending = sortDir !== "desc";

  try {
    const pageResult = await measureStep(
      "clients_admin.page",
      () => {
        let query = supabase
          .from("admin_client_order_counts")
          .select("id, nome, email, telefone, documento, vip, vip_observacao, order_count, address", { count: "exact" });

        query = applyClientAdminFilters(query, { search, segment, withOrders });
        query = query.order(sortColumn, { ascending }).order("id", { ascending: true }).range(startIndex, startIndex + safePageSize - 1);
        return query;
      },
      (result) => ({ rows: result.data?.length || 0, count: Number(result.count || 0) }),
    );

    if (pageResult.error) {
      if (isMissingRelationError(pageResult.error, "admin_client_order_counts")) {
        return buildClientsAdminPayloadLegacy({ search, segment, withOrders, page, pageSize, sortField, sortDir });
      }
      throw createHttpError(500, "Erro ao carregar clientes.", pageResult.error.message);
    }

    const totalItems = Number(pageResult.count || 0);
    let rows = (pageResult.data || []).map(normalizeClientAdminRow);

    let allRows = rows;
    if (safePageSize >= 5000 && totalItems > rows.length) {
      const allRowsResult = await measureStep(
        "clients_admin.all_rows",
        () => {
          let query = supabase
            .from("admin_client_order_counts")
            .select("id, nome, email, telefone, documento, vip, vip_observacao, order_count, address");

          query = applyClientAdminFilters(query, { search, segment, withOrders });
          query = query.order(sortColumn, { ascending }).order("id", { ascending: true });
          return query;
        },
        (result) => ({ rows: result.data?.length || 0 }),
      );

      if (allRowsResult.error) {
        throw createHttpError(500, "Erro ao carregar lista completa de clientes.", allRowsResult.error.message);
      }

      allRows = (allRowsResult.data || []).map(normalizeClientAdminRow);
    }

    const enriched = await enrichClientAdminRows([...rows, ...allRows]);
    const enrichedMap = new Map(enriched.map((row) => [String(row.id), row]));
    rows = rows.map((row) => enrichedMap.get(String(row.id)) || row);
    allRows = allRows.map((row) => enrichedMap.get(String(row.id)) || row);

    let summary = null;
    const summaryResult = await measureStep(
      "clients_admin.summary_rpc",
      () => supabase.rpc("rpc_admin_clients_summary", {
        search_text: search || null,
        segment_filter: segment,
        with_orders_filter: Boolean(withOrders),
      }),
      (result) => ({ rows: Array.isArray(result.data) ? result.data.length : (result.data ? 1 : 0) }),
    );

    if (summaryResult.error) {
      if (!isMissingFunctionError(summaryResult.error, "rpc_admin_clients_summary")) {
        throw createHttpError(500, "Erro ao carregar resumo de clientes.", summaryResult.error.message);
      }
      summary = await buildClientsAdminSummaryFallback({ matchingClients: totalItems });
    } else {
      const summaryRow = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
      summary = {
        totalClients: Number(summaryRow?.total_clients || 0),
        totalVips: Number(summaryRow?.total_vips || 0),
        totalOrders: Number(summaryRow?.total_orders || 0),
        matchingClients: Number(summaryRow?.matching_clients || totalItems),
      };
    }

    return {
      rows,
      allRows,
      summary,
      pageInfo: {
        page: safePage,
        pageSize: safePageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / safePageSize)),
        hasNextPage: startIndex + safePageSize < totalItems,
      },
    };
  } catch (error) {
    if (error?.status) throw error;
    throw createHttpError(500, "Erro ao carregar clientes.", error?.message || null);
  }
}

async function buildClientsAdminPayloadLegacy({
  search = "",
  segment = "all",
  withOrders = false,
  page = 1,
  pageSize = 10,
  sortField = "nome",
  sortDir = "asc",
} = {}) {
  const [{ data: clients, error: clientsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from("clients").select("*").order("nome", { ascending: true }),
    supabase.from("orders").select("*"),
  ]);

  if (clientsError) {
    throw createHttpError(500, "Erro ao carregar clientes.", clientsError.message);
  }

  if (ordersError) {
    throw createHttpError(500, "Erro ao carregar pedidos dos clientes.", ordersError.message);
  }

  const orderCountMap = {};
  for (const order of orders || []) {
    const clientId = String(getOrderClientId(order) || "").trim();
    if (!clientId) continue;
    orderCountMap[clientId] = (orderCountMap[clientId] || 0) + 1;
  }

  let rows = (clients || []).map((client) => ({
    ...client,
    order_count: orderCountMap[client.id] || 0,
    address: buildClientAddress(client),
  }));

  const normalizedSearch = normalizeSearchText(search);
  if (normalizedSearch) {
    rows = rows.filter((client) =>
      normalizeSearchText([
        client.nome,
        client.email,
        client.documento,
        client.telefone,
      ].filter(Boolean).join(" ")).includes(normalizedSearch));
  }

  if (segment === "vip") {
    rows = rows.filter((client) => Boolean(client.vip));
  } else if (segment === "non_vip") {
    rows = rows.filter((client) => !client.vip);
  }

  if (withOrders) {
    rows = rows.filter((client) => Number(client.order_count || 0) > 0);
  }

  rows.sort((left, right) => {
    const direction = sortDir === "desc" ? -1 : 1;
    if (sortField === "email") return direction * String(left.email || "").localeCompare(String(right.email || ""), "pt-BR");
    if (sortField === "vip") return direction * (Number(Boolean(left.vip)) - Number(Boolean(right.vip)));
    if (sortField === "pedidos") return direction * (Number(left.order_count || 0) - Number(right.order_count || 0));
    return direction * String(left.nome || "").localeCompare(String(right.nome || ""), "pt-BR");
  });

  const totalItems = rows.length;
  const safePageSize = Math.max(1, Math.min(100, Number(pageSize || 10)));
  const safePage = Math.max(1, Number(page || 1));
  const startIndex = (safePage - 1) * safePageSize;
  const paginatedRows = rows.slice(startIndex, startIndex + safePageSize);

  return {
    rows: paginatedRows,
    allRows: rows,
    summary: {
      totalClients: (clients || []).length,
      totalVips: (clients || []).filter((client) => Boolean(client.vip)).length,
      totalOrders: Object.values(orderCountMap).reduce((acc, value) => acc + Number(value || 0), 0),
      matchingClients: totalItems,
    },
    pageInfo: {
      page: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / safePageSize)),
      hasNextPage: startIndex + safePageSize < totalItems,
    },
  };
}

async function buildOrdersAdminPayloadLegacy({
  start,
  end,
  status = "",
  city = "",
  search = "",
  onlyOpen = false,
  page = 1,
  pageSize = 10,
} = {}) {
  let ordersQuery = supabase
    .from("orders")
    .select("*")
    .order("data_pedido", { ascending: false })
    .order("id", { ascending: false });

  if (start) ordersQuery = ordersQuery.gte("data_pedido", start);
  if (end) ordersQuery = ordersQuery.lte("data_pedido", end);

  const { data: orders, error: ordersError } = await ordersQuery;
  if (ordersError) {
    throw createHttpError(500, "Erro ao carregar pedidos.", ordersError.message);
  }

  const clientIds = Array.from(new Set((orders || []).map((order) => getOrderClientId(order)).filter(Boolean)));
  const orderIds = Array.from(new Set((orders || []).map((order) => Number(order.id)).filter(Boolean)));

  const [{ data: clients, error: clientsError }, items] = await Promise.all([
    clientIds.length
      ? supabase
          .from("clients")
          .select("id, nome, telefone, cidade, endereco_rua, endereco_numero, endereco_complemento, cep, estado")
          .in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    fetchOrderItemsByOrderIds(orderIds),
  ]);

  if (clientsError) {
    throw createHttpError(500, "Erro ao carregar clientes dos pedidos.", clientsError.message);
  }

  const orderItemsColumn = await resolveOrderItemsOrderColumn();
  const productIds = Array.from(new Set((items || []).map((item) => Number(item.produto_id || item.product_id)).filter(Boolean)));
  const { data: products, error: productsError } = productIds.length
    ? await supabase.from("products").select("id, nome").in("id", productIds)
    : { data: [], error: null };

  if (productsError) {
    throw createHttpError(500, "Erro ao carregar produtos dos pedidos.", productsError.message);
  }

  const clientsMap = new Map((clients || []).map((client) => [String(client.id), client]));
  const productsMap = new Map((products || []).map((product) => [Number(product.id), product.nome]));
  const itemsByOrderId = new Map();

  for (const item of items || []) {
    const key = Number(item[orderItemsColumn] || item.pedido_id || item.order_id);
    const current = itemsByOrderId.get(key) || [];
    current.push(item);
    itemsByOrderId.set(key, current);
  }

  let rows = (orders || []).map((order) => {
    const client = clientsMap.get(String(getOrderClientId(order) || ""));
    const orderItems = itemsByOrderId.get(Number(order.id)) || [];
    const productsSummary = orderItems.map((item) => ({
      productId: item.produto_id || item.product_id,
      name: productsMap.get(Number(item.produto_id || item.product_id)) || `Produto ${item.produto_id || item.product_id}`,
      quantity: Number((item.quantidade ?? item.quantity) || 0),
      label: `${productsMap.get(Number(item.produto_id || item.product_id)) || `Produto ${item.produto_id || item.product_id}`} (${formatQuantity((item.quantidade ?? item.quantity) || 0)}x)`,
    }));

    return {
      id: order.id,
      code: resolveOrderCode(order),
      clientName: client?.nome || "Cliente",
      phone: client?.telefone || "-",
      city: client?.cidade || "-",
      fullAddress: buildClientAddress(client),
      value: Number(order.valor_total || order.total || 0),
      status: Number(order.status ?? 0),
      data_pedido: order.data_pedido || order.created_at || null,
      products: productsSummary,
      productsPreview: productsSummary.map((item) => item.label).join(", "),
    };
  });

  const normalizedSearch = normalizeSearchText(search);
  if (normalizedSearch) {
    rows = rows.filter((row) =>
      normalizeSearchText([row.clientName, row.phone, row.code].filter(Boolean).join(" ")).includes(normalizedSearch));
  }

  if (status !== "" && status !== null && status !== undefined) {
    rows = rows.filter((row) => Number(row.status) === Number(status));
  }

  if (onlyOpen) {
    rows = rows.filter((row) => Number(row.status) < STATUS.CONCLUIDO);
  }

  const cities = Array.from(new Set(rows.map((row) => row.city).filter((value) => value && value !== "-"))).sort((a, b) => a.localeCompare(b, "pt-BR"));

  if (city) {
    rows = rows.filter((row) => row.city === city);
  }

  const totalItems = rows.length;
  const safePageSize = Math.max(1, Math.min(100, Number(pageSize || 10)));
  const safePage = Math.max(1, Number(page || 1));
  const startIndex = (safePage - 1) * safePageSize;
  const paginatedRows = rows.slice(startIndex, startIndex + safePageSize);

  return {
    rows: paginatedRows,
    summary: {
      totalCount: totalItems,
      openCount: rows.filter((row) => Number(row.status) < STATUS.CONCLUIDO).length,
      concludedCount: rows.filter((row) => Number(row.status) === STATUS.CONCLUIDO).length,
      totalValue: roundQty(rows.reduce((acc, row) => acc + parseNumber(row.value, 0), 0), 2),
    },
    cities,
    pageInfo: {
      page: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / safePageSize)),
      hasNextPage: startIndex + safePageSize < totalItems,
    },
  };
}

async function buildClientCampaignAudience(rawFilters = {}, messageTemplate = "") {
  const filters = normalizeClientCampaignFilters(rawFilters);
  const payload = await buildClientsAdminPayload({
    search: filters.search,
    segment: filters.segment,
    withOrders: filters.withOrders,
    page: 1,
    pageSize: 5000,
  });

  const normalizedCity = normalizeSearchText(filters.city);
  const scopedRows = (payload.allRows || []).filter((client) => {
    if (filters.city && !normalizeSearchText(client?.cidade || "").includes(normalizedCity)) return false;
    if (filters.minOrders > 0 && Number(client?.order_count || 0) < filters.minOrders) return false;

    if (filters.country !== "all") {
      const country = detectClientCountry(client);
      if (filters.country === "br" && country !== "Brasil") return false;
      if (filters.country === "us" && country !== "USA") return false;
    }

    if (filters.onlyWithPhone && !normalizePhone(client?.telefone)) return false;
    return true;
  });

  const audience = scopedRows.map((client) => {
    const normalizedPhone = normalizePhone(client?.telefone);
    const country = detectClientCountry(client);
    return {
      ...client,
      country,
      city: client?.cidade || null,
      normalizedPhone,
      hasPhone: Boolean(normalizedPhone),
      renderedMessage: renderClientCampaignMessage(messageTemplate, client),
    };
  });

  const validRecipients = audience.filter((client) => client.hasPhone);
  const invalidRecipients = audience.filter((client) => !client.hasPhone);
  const cityBreakdownMap = new Map();
  for (const row of audience) {
    const cityLabel = String(row.city || "Sem cidade").trim() || "Sem cidade";
    cityBreakdownMap.set(cityLabel, (cityBreakdownMap.get(cityLabel) || 0) + 1);
  }

  const topCities = [...cityBreakdownMap.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([city, count]) => ({ city, count }));

  const stats = {
    targetCount: audience.length,
    audienceCount: validRecipients.length,
    excludedWithoutPhone: invalidRecipients.length,
    vipCount: audience.filter((client) => Boolean(client.vip)).length,
    nonVipCount: audience.filter((client) => !client.vip).length,
    withOrdersCount: audience.filter((client) => Number(client.order_count || 0) > 0).length,
    withoutOrdersCount: audience.filter((client) => Number(client.order_count || 0) <= 0).length,
    brCount: audience.filter((client) => client.country === "Brasil").length,
    usCount: audience.filter((client) => client.country === "USA").length,
    otherCount: audience.filter((client) => !["Brasil", "USA"].includes(client.country)).length,
    topCities,
  };

  return {
    filters,
    stats,
    audience,
    validRecipients,
    invalidRecipients,
    previewText: validRecipients[0]?.renderedMessage || renderClientCampaignMessage(messageTemplate, { nome: "cliente" }),
    sampleRecipients: validRecipients.slice(0, 5).map((client) => ({
      id: client.id,
      nome: client.nome,
      phone: client.normalizedPhone,
      city: client.city,
      country: client.country,
      orderCount: Number(client.order_count || 0),
      previewText: client.renderedMessage,
    })),
  };
}

async function loadClientCampaignById(campaignId) {
  const { data, error } = await supabase
    .from("client_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error, "client_campaigns")) {
      throw createHttpError(500, "Tabela client_campaigns nao encontrada.", error.message);
    }
    throw createHttpError(500, "Erro ao carregar campanha.", error.message);
  }

  if (!data) {
    throw createHttpError(404, "Campanha nao encontrada.");
  }

  return data;
}

async function listClientCampaignRecipients(campaignId, { status = null, limit = 20 } = {}) {
  let query = supabase
    .from("client_campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("local_status", status);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error, "client_campaign_recipients")) return [];
    throw createHttpError(500, "Erro ao carregar destinatarios da campanha.", error.message);
  }

  return data || [];
}

function normalizeCampaignStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["queued", "scheduled", "sending", "completed", "completed_with_failures", "failed", "draft"].includes(normalized)) {
    return normalized;
  }
  return "draft";
}

async function updateClientCampaignProgress(campaignId, {
  sentCount = 0,
  failedCount = 0,
  skippedCount = 0,
  validCount = 0,
  targetCount = null,
  status = "queued",
  metadata = {},
} = {}) {
  const current = await loadClientCampaignById(campaignId);
  const nextMetadata = {
    ...(current.metadata || {}),
    ...metadata,
  };

  const { data, error } = await supabase
    .from("client_campaigns")
    .update({
      target_count: targetCount ?? current.target_count ?? 0,
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      valid_count: validCount,
      status,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw createHttpError(500, "Erro ao atualizar progresso da campanha.", error.message);
  }

  return data || current;
}

async function executeClientCampaign(campaignId, recipientsOverride = null) {
  clearScheduledClientCampaign(campaignId);
  const campaign = await loadClientCampaignById(campaignId);
  const metadata = campaign.metadata || {};
  const schedule = normalizeClientCampaignSchedule(metadata.schedule || {});
  const media = normalizeClientCampaignMedia(metadata.media || {});

  if (schedule.windowStart && schedule.windowEnd && !isClientCampaignWithinWindow(new Date(), schedule)) {
    const nextRunAt = getNextClientCampaignWindowDate(schedule, new Date()).toISOString();
    await updateClientCampaignProgress(campaignId, {
      sentCount: Number(campaign.sent_count || 0),
      failedCount: Number(campaign.failed_count || 0),
      skippedCount: Number(campaign.skipped_count || 0),
      validCount: Number(campaign.valid_count || 0),
      targetCount: Number(campaign.target_count || 0),
      status: "scheduled",
      metadata: {
        schedule: {
          ...schedule,
          nextRunAt,
        },
        progress: {
          ...(metadata.progress || {}),
          state: "waiting_window",
          updatedAt: new Date().toISOString(),
        },
      },
    });
    scheduleClientCampaign(campaignId, nextRunAt);
    return;
  }

  const filters = normalizeClientCampaignFilters(metadata.filters || {
    segment: campaign.segment,
    search: campaign.search_term,
    withOrders: campaign.with_orders,
  });
  const messageTemplate = String(campaign.message_template || "").trim();
  const audiencePayload = recipientsOverride
    ? {
        filters,
        stats: {
          targetCount: recipientsOverride.length,
          audienceCount: recipientsOverride.length,
          excludedWithoutPhone: 0,
        },
        validRecipients: recipientsOverride,
      }
    : await buildClientCampaignAudience(filters, messageTemplate);

  const validRecipients = audiencePayload.validRecipients || [];
  const targetCount = recipientsOverride ? recipientsOverride.length : Number(audiencePayload.stats?.targetCount || 0);
  const skippedCount = recipientsOverride ? 0 : Number(audiencePayload.stats?.excludedWithoutPhone || 0);
  const startedAt = new Date().toISOString();

  await updateClientCampaignProgress(campaignId, {
    sentCount: 0,
    failedCount: 0,
    skippedCount,
    validCount: validRecipients.length,
    targetCount,
    status: "sending",
    metadata: {
      filters,
      schedule: {
        ...schedule,
        nextRunAt: null,
      },
      progress: {
        state: "sending",
        processedCount: 0,
        totalCount: targetCount,
        startedAt,
        updatedAt: startedAt,
      },
      channel: "whatsapp",
      media,
      retryOfCampaignId: metadata.retryOfCampaignId || null,
    },
  });

  let sentCount = 0;
  let failedCount = 0;
  let processedCount = 0;

  for (const recipient of validRecipients) {
    const sendResult = media.kind === "image"
      ? await sendWhatsAppImageViaZApi({
        phone: recipient.phone || recipient.normalizedPhone,
        imageBase64: media.imageBase64,
        caption: recipient.renderedMessage,
      })
      : await sendWhatsAppViaZApi({
        phone: recipient.phone || recipient.normalizedPhone,
        message: recipient.renderedMessage,
      });

    processedCount += 1;
    if (sendResult?.ok) sentCount += 1;
    else failedCount += 1;

    await persistWhatsAppAttempt({
      orderId: null,
      target: "client_campaign",
      eventType: "client_campaign_broadcast",
      destinationPhone: recipient.phone || recipient.normalizedPhone,
      messageText: recipient.renderedMessage,
      payload: {
        campaignId,
        clientId: recipient.id,
        segment: filters.segment,
        country: recipient.country || null,
        mediaType: media.kind,
      },
      sendResult,
    });

    await insertClientCampaignRecipientAudit({
      campaignId,
      clientId: recipient.id,
      clientName: recipient.nome,
      destinationPhone: recipient.phone || recipient.normalizedPhone,
      renderedMessage: recipient.renderedMessage,
      localStatus: sendResult?.ok ? "queued" : "failed",
      errorDetail: sendResult?.detail || sendResult?.reason || null,
      providerResponse: { ...(sendResult || {}), mediaType: media.kind },
      messageId: sendResult?.messageId || null,
      zaapId: sendResult?.zaapId || null,
    });

    await updateClientCampaignProgress(campaignId, {
      sentCount,
      failedCount,
      skippedCount,
      validCount: validRecipients.length,
      targetCount,
      status: "sending",
      metadata: {
        progress: {
          state: "sending",
          processedCount,
          totalCount: targetCount,
          startedAt,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  await updateClientCampaignProgress(campaignId, {
    sentCount,
    failedCount,
    skippedCount,
    validCount: validRecipients.length,
    targetCount,
    status: failedCount > 0 ? "completed_with_failures" : "completed",
    metadata: {
      progress: {
        state: failedCount > 0 ? "completed_with_failures" : "completed",
        processedCount,
        totalCount: targetCount,
        startedAt,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

function scheduleClientCampaign(campaignId, scheduledAt) {
  const targetDate = new Date(scheduledAt);
  if (Number.isNaN(targetDate.getTime())) {
    return;
  }

  clearScheduledClientCampaign(campaignId);
  const delay = Math.max(0, targetDate.getTime() - Date.now());
  const timer = setTimeout(() => {
    executeClientCampaign(campaignId).catch((error) => {
      console.error(`Falha ao executar campanha ${campaignId}`, error?.message || error);
    }).finally(() => {
      scheduledClientCampaignTimers.delete(String(campaignId));
    });
  }, delay);

  scheduledClientCampaignTimers.set(String(campaignId), timer);
}

async function restoreScheduledClientCampaigns() {
  const { data, error } = await supabase
    .from("client_campaigns")
    .select("id, status, metadata")
    .in("status", ["scheduled", "queued"]);

  if (error) {
    if (!isMissingRelationError(error, "client_campaigns")) {
      console.error("Falha ao restaurar campanhas agendadas", error.message);
    }
    return;
  }

  for (const campaign of data || []) {
    const schedule = normalizeClientCampaignSchedule(campaign.metadata?.schedule || {});
    const nextRunAt = schedule.scheduledAt || campaign.metadata?.schedule?.nextRunAt || new Date().toISOString();
    scheduleClientCampaign(campaign.id, nextRunAt);
  }
}

async function buildOrdersAdminPayload({
  start,
  end,
  status = "",
  city = "",
  search = "",
  onlyOpen = false,
  page = 1,
  pageSize = 10,
} = {}) {
  const safePageSize = Math.max(1, Math.min(100, Number(pageSize || 10)));
  const safePage = Math.max(1, Number(page || 1));
  const startIndex = (safePage - 1) * safePageSize;

  try {
    const pageResult = await measureStep(
      "orders_admin.page",
      () => {
        let query = supabase
          .from("admin_orders_enriched")
          .select("id, data_pedido, status, value, explicit_code, client_name, phone, city, full_address", { count: "exact" });

        query = applyOrdersAdminFilters(query, { start, end, status, city, search, onlyOpen });
        query = query.order("data_pedido", { ascending: false }).order("id", { ascending: false }).range(startIndex, startIndex + safePageSize - 1);
        return query;
      },
      (result) => ({ rows: result.data?.length || 0, count: Number(result.count || 0) }),
    );

    if (pageResult.error) {
      if (isMissingRelationError(pageResult.error, "admin_orders_enriched") || shouldFallbackOrdersOptimizedPath(pageResult.error)) {
        return buildOrdersAdminPayloadLegacy({ start, end, status, city, search, onlyOpen, page, pageSize });
      }
      throw createHttpError(500, "Erro ao carregar pedidos.", pageResult.error.message);
    }

    const totalCount = Number(pageResult.count || 0);
    const pageRows = pageResult.data || [];
    const orderIds = pageRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
    const items = await measureStep(
      "orders_admin.items",
      () => fetchOrderItemsByOrderIds(orderIds),
      (result) => ({ rows: result.length || 0 }),
    );

    const productIds = Array.from(new Set(
      items
        .map((item) => Number(item.produto_id || item.product_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ));

    const productsResult = productIds.length
      ? await measureStep(
        "orders_admin.products",
        () => supabase.from("products").select("id, nome").in("id", productIds),
        (result) => ({ rows: result.data?.length || 0 }),
      )
      : { data: [], error: null };

    if (productsResult.error) {
      throw createHttpError(500, "Erro ao carregar produtos dos pedidos.", productsResult.error.message);
    }

    const orderItemsColumn = await resolveOrderItemsOrderColumn();
    const productsMap = new Map((productsResult.data || []).map((product) => [Number(product.id), product.nome]));
    const itemsByOrderId = new Map();
    for (const item of items || []) {
      const key = Number(item[orderItemsColumn] || item.pedido_id || item.order_id);
      const current = itemsByOrderId.get(key) || [];
      current.push(item);
      itemsByOrderId.set(key, current);
    }

    const rows = pageRows.map((row) => {
      const orderItems = itemsByOrderId.get(Number(row.id)) || [];
      const products = orderItems.map((item) => {
        const productId = Number(item.produto_id || item.product_id || 0);
        const quantity = item.quantidade ?? item.quantity ?? 0;
        const name = productsMap.get(productId) || `Produto ${productId || "?"}`;
        return {
          productId,
          name,
          quantity: Number(quantity || 0),
          label: `${name} (${formatQuantity(quantity)}x)`,
        };
      });

      return {
        id: row.id,
        code: resolveOrderCode({ id: row.id, code: row.explicit_code }),
        clientName: row.client_name || "Cliente",
        phone: row.phone || "-",
        city: row.city || "-",
        fullAddress: row.full_address || "-",
        value: Number(row.value || 0),
        status: Number(row.status || 0),
        data_pedido: row.data_pedido || null,
        products,
        productsPreview: products.map((item) => item.label).join(", "),
      };
    });

    const [openCountResult, concludedCountResult, totalValueResult, citiesResult] = await Promise.all([
      measureStep("orders_admin.summary_open", () => {
        let query = supabase.from("admin_orders_enriched").select("id", { count: "exact", head: true });
        query = applyOrdersAdminFilters(query, { start, end, status, city, search, onlyOpen });
        query = query.lt("status", STATUS.CONCLUIDO);
        return query;
      }, (result) => ({ count: Number(result.count || 0) })),
      measureStep("orders_admin.summary_concluded", () => {
        let query = supabase.from("admin_orders_enriched").select("id", { count: "exact", head: true });
        query = applyOrdersAdminFilters(query, { start, end, status, city, search, onlyOpen });
        query = query.eq("status", STATUS.CONCLUIDO);
        return query;
      }, (result) => ({ count: Number(result.count || 0) })),
      measureStep("orders_admin.summary_total_value", () => {
        let query = supabase.from("admin_orders_enriched").select("value");
        query = applyOrdersAdminFilters(query, { start, end, status, city, search, onlyOpen });
        return query;
      }, (result) => ({ rows: result.data?.length || 0 })),
      measureStep("orders_admin.cities", () => {
        let query = supabase.from("admin_orders_enriched").select("city");
        query = applyOrdersAdminFilters(query, { start, end, status, city, search, onlyOpen, includeCity: false });
        return query;
      }, (result) => ({ rows: result.data?.length || 0 })),
    ]);

    if (openCountResult.error || concludedCountResult.error || totalValueResult.error || citiesResult.error) {
      const fallbackError = openCountResult.error || concludedCountResult.error || totalValueResult.error || citiesResult.error;
      if (shouldFallbackOrdersOptimizedPath(fallbackError)) {
        return buildOrdersAdminPayloadLegacy({ start, end, status, city, search, onlyOpen, page, pageSize });
      }
      throw createHttpError(
        500,
        "Erro ao montar resumo de pedidos.",
        openCountResult.error?.message || concludedCountResult.error?.message || totalValueResult.error?.message || citiesResult.error?.message,
      );
    }

    const totalValue = roundQty((totalValueResult.data || []).reduce((acc, row) => acc + parseNumber(row.value, 0), 0), 2);
    const cities = Array.from(new Set(
      (citiesResult.data || [])
        .map((row) => String(row.city || "").trim())
        .filter((value) => value && value !== "-"),
    )).sort((a, b) => a.localeCompare(b, "pt-BR"));

    return {
      rows,
      summary: {
        totalCount,
        openCount: Number(openCountResult.count || 0),
        concludedCount: Number(concludedCountResult.count || 0),
        totalValue,
      },
      cities,
      pageInfo: {
        page: safePage,
        pageSize: safePageSize,
        totalItems: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / safePageSize)),
        hasNextPage: startIndex + safePageSize < totalCount,
      },
    };
  } catch (error) {
    if (shouldFallbackOrdersOptimizedPath(error)) {
      return buildOrdersAdminPayloadLegacy({ start, end, status, city, search, onlyOpen, page, pageSize });
    }
    if (error?.status) throw error;
    throw createHttpError(500, "Erro ao carregar pedidos.", error?.message || null);
  }
}

async function buildFinanceOverviewPayloadLegacy(query) {
  const range = resolveRangeFromQuery(query);
  const [{ data: expenses, error: expensesError }, { data: payments, error: paymentsError }] = await Promise.all([
    supabase
      .from("expenses")
      .select("category, cost_type, amount")
      .gte("competency_date", range.startDate)
      .lte("competency_date", range.endDate),
    supabase
      .from("employee_payments")
      .select("employee_id, amount")
      .gte("paid_at", range.start)
      .lte("paid_at", range.end),
  ]);

  if (expensesError) {
    throw createHttpError(500, "Erro ao carregar despesas para o consolidado.", expensesError.message);
  }

  if (paymentsError) {
    throw createHttpError(500, "Erro ao carregar pagamentos da equipe.", paymentsError.message);
  }

  const employeeIds = Array.from(new Set((payments || []).map((payment) => Number(payment.employee_id)).filter(Boolean)));
  const { data: employees, error: employeesError } = employeeIds.length
    ? await supabase.from("employees").select("id, name").in("id", employeeIds)
    : { data: [], error: null };

  if (employeesError) {
    throw createHttpError(500, "Erro ao carregar equipe para o consolidado.", employeesError.message);
  }

  const employeeMap = new Map((employees || []).map((employee) => [Number(employee.id), employee.name]));
  const expensesByCategory = {};
  const expensesByType = {};
  const payrollByEmployee = {};

  for (const expense of expenses || []) {
    const key = expense.category || "outras";
    expensesByCategory[key] = roundQty((expensesByCategory[key] || 0) + parseNumber(expense.amount, 0), 2);
    const typeKey = String(expense.cost_type || "variable");
    expensesByType[typeKey] = roundQty((expensesByType[typeKey] || 0) + parseNumber(expense.amount, 0), 2);
  }

  for (const payment of payments || []) {
    const key = employeeMap.get(Number(payment.employee_id)) || `Funcionario ${payment.employee_id}`;
    payrollByEmployee[key] = roundQty((payrollByEmployee[key] || 0) + parseNumber(payment.amount, 0), 2);
  }

  const expensesTotal = roundQty((expenses || []).reduce((acc, item) => acc + parseNumber(item.amount, 0), 0), 2);
  const payrollTotal = roundQty((payments || []).reduce((acc, item) => acc + parseNumber(item.amount, 0), 0), 2);

  return {
    ok: true,
    range,
    expensesTotal,
      payrollTotal,
      totalOutflow: roundQty(expensesTotal + payrollTotal, 2),
      expensesByCategory: Object.entries(expensesByCategory).map(([category, total]) => ({ category, total })),
      expensesByType: Object.entries(expensesByType).map(([cost_type, total]) => ({ cost_type, total })),
      payrollByEmployee: Object.entries(payrollByEmployee).map(([employee_name, total]) => ({ employee_name, total })),
    };
}

async function buildFinanceOverviewPayload(query) {
  const range = resolveRangeFromQuery(query);

  const rpcResult = await measureStep(
    "finance_overview.rpc",
    () => supabase.rpc("rpc_admin_finance_overview", {
      start_date: range.start,
      end_date: range.end,
    }),
    (result) => ({ hasData: Boolean(result.data) }),
  );

  if (rpcResult.error) {
    if (!isMissingFunctionError(rpcResult.error, "rpc_admin_finance_overview")) {
      throw createHttpError(500, "Erro ao carregar consolidado financeiro.", rpcResult.error.message);
    }
    return buildFinanceOverviewPayloadLegacy(query);
  }

  const payload = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
  if (!payload || typeof payload !== "object") {
    return buildFinanceOverviewPayloadLegacy(query);
  }

    return {
      ok: true,
      range,
      expensesTotal: Number(payload.expensesTotal || 0),
      payrollTotal: Number(payload.payrollTotal || 0),
      totalOutflow: Number(payload.totalOutflow || 0),
      expensesByCategory: Array.isArray(payload.expensesByCategory) ? payload.expensesByCategory : [],
      expensesByType: Array.isArray(payload.expensesByType) ? payload.expensesByType : [],
      payrollByEmployee: Array.isArray(payload.payrollByEmployee) ? payload.payrollByEmployee : [],
    };
}

async function callDocumentOcr({ fileBase64, fileName, mimeType, ocrHint, entityType = "expense" }) {
  if (ocrHint && String(ocrHint).trim()) return String(ocrHint).trim();

  const endpoint = process.env.PAPERLESS_OCR_ENDPOINT;
  const token = process.env.PAPERLESS_API_TOKEN;
  if (!endpoint || !fileBase64) return "";

  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      entity_type: entityType,
      file_name: fileName || "documento",
      file_base64: fileBase64,
      mime_type: mimeType || null,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createHttpError(502, "Falha ao processar OCR do documento.", text || `HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  return String(payload?.ocr_text || payload?.text || payload?.content || "");
}

function detectExpenseCostType(text = "") {
  const normalized = normalizeSearchText(text);
  if (!normalized) return "variable";
  if (/(aluguel|rent|internet|energia|power|agua|water|salary|payroll|salario|contabilidade|accounting|insurance|seguro)/.test(normalized)) {
    return "fixed";
  }
  return "variable";
}

function detectExpenseCategory(text = "") {
  const normalized = normalizeSearchText(text);
  if (/(carne|beef|frango|chicken|porco|pork|black angus)/.test(normalized)) return "carne";
  if (/(limpeza|cleaning|detergent|sanitizer)/.test(normalized)) return "limpeza";
  if (/(aluguel|rent)/.test(normalized)) return "aluguel";
  return "outras";
}

function extractExpenseDate(text = "") {
  const raw = String(text || "");
  const isoMatch = raw.match(/\b(20\d{2})[-\/](\d{2})[-\/](\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const brMatch = raw.match(/\b(\d{2})[\/.-](\d{2})[\/.-](20\d{2})\b/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;

  return null;
}

function extractExpenseAmount(text = "") {
  const matches = Array.from(String(text || "").matchAll(/(?:\$|usd|r\$)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2}))/gi));
  if (!matches.length) return null;
  const lastMatch = matches[matches.length - 1]?.[1];
  const parsed = parseLooseNumber(lastMatch, NaN);
  return Number.isFinite(parsed) ? roundQty(parsed, 2) : null;
}

function buildExpenseOcrSuggestion(ocrText = "") {
  const firstMeaningfulLine = String(ocrText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !/invoice|nota fiscal|receipt|comprovante/i.test(line));

  return {
    description: firstMeaningfulLine || "Despesa importada por OCR",
    amount: extractExpenseAmount(ocrText),
    competencyDate: extractExpenseDate(ocrText),
    category: detectExpenseCategory(ocrText),
    costType: detectExpenseCostType(ocrText),
    notes: String(ocrText || "").trim() || null,
  };
}

async function callPaperlessOcr({ invoiceRecord, ocrHint }) {
  if (ocrHint && String(ocrHint).trim()) return String(ocrHint).trim();

  const endpoint = process.env.PAPERLESS_OCR_ENDPOINT;
  const token = process.env.PAPERLESS_API_TOKEN;
  if (!endpoint) return String(invoiceRecord?.ocr_text || "");

  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      invoice_id: invoiceRecord.id,
      file_url: invoiceRecord.file_url,
      file_path: invoiceRecord.file_path,
      file_bucket: invoiceRecord.file_bucket,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createHttpError(502, "Falha ao processar OCR no Paperless.", text || `HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  return String(payload?.ocr_text || payload?.text || payload?.content || "");
}

function extractFirstJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i) || raw.match(/```\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;

  try {
    return JSON.parse(candidate);
  } catch {
    // noop
  }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = candidate.slice(start, end + 1);
    try {
      return JSON.parse(sliced);
    } catch {
      return null;
    }
  }

  return null;
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function extractDeclaredItemsCountFromText(text = "") {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!normalized) return null;

  const patterns = [
    /quantity\s*total\s*[:#-]?\s*(\d{1,4})\b/,
    /total\s*quantity\s*[:#-]?\s*(\d{1,4})\b/,
    /total\s*items?\s*[:#-]?\s*(\d{1,4})\b/,
    /itens?\s*totais?\s*[:#-]?\s*(\d{1,4})\b/,
    /total\s*de\s*itens?\s*[:#-]?\s*(\d{1,4})\b/,
    /qtd(?:ade)?\s*total\s*[:#-]?\s*(\d{1,4})\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const parsed = parsePositiveInteger(match[1]);
      if (parsed) return parsed;
    }
  }

  return null;
}

function buildFallbackInvoiceJson(ocrText = "") {
  const lines = String(ocrText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    supplier: null,
    invoice_number: null,
    invoice_date: null,
    declared_items_count: extractDeclaredItemsCountFromText(ocrText),
    items: lines.slice(0, 80).map((line) => ({
      product_service: line,
      quantity: null,
      price: null,
      total: null,
      unit: "LB",
      description: line,
      unit_cost: null,
      product_id: null,
    })),
  };
}

async function loadInvoiceBinaryForGemini(invoiceRecord) {
  if (!invoiceRecord) return null;

  const bucket = String(invoiceRecord.file_bucket || "").trim();
  const path = String(invoiceRecord.file_path || "").trim();
  const fileUrl = String(invoiceRecord.file_url || "").trim();
  const mimeType = inferMimeTypeFromPath(path || fileUrl);

  if (bucket && path) {
    const downloadResult = await supabase.storage.from(bucket).download(path);
    if (!downloadResult.error && downloadResult.data) {
      const arrayBuffer = await downloadResult.data.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      if (base64) {
        return { base64, mimeType };
      }
    }
  }

  if (fileUrl) {
    const response = await fetch(fileUrl);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const remoteMime = response.headers.get("content-type") || mimeType;
      if (base64) {
        return { base64, mimeType: remoteMime };
      }
    }
  }

  return null;
}

async function callGeminiExtraction({ ocrText, locale = "pt", invoiceRecord = null }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-1.5-pro";
  if (!apiKey) return buildFallbackInvoiceJson(ocrText);

  const ocr = String(ocrText || "").trim();
  const invoiceFile = await loadInvoiceBinaryForGemini(invoiceRecord);
  if (!ocr && !invoiceFile) return buildFallbackInvoiceJson(ocrText);

  const prompt =
    locale === "en"
      ? [
          "Extract invoice data from the provided OCR text and/or invoice image.",
          "Return ONLY valid JSON, without markdown and without comments.",
          "Expected JSON schema and table standard:",
          '{"supplier":null,"invoice_number":null,"invoice_date":null,"declared_items_count":null,"items":[{"product_service":"","quantity":null,"price":null,"total":null,"unit":"LB","product_id":null,"expiry_date":null}]}',
          "Rules:",
          "- Keep values as null when uncertain.",
          "- Preserve decimal numbers for quantity, price and total.",
          "- Unit must be one of: LB, KG, UN.",
          "- Follow the invoice columns in this order: Product/Service, Quantity, Price, Total.",
          "- Do not skip item rows. If the invoice shows a total line count, keep the same number of items whenever possible.",
          "- Some item descriptions can wrap into the next line; merge wrapped lines into the same item when needed.",
          "- If the invoice has an explicit item count (e.g. Quantity Total / Total Items), fill declared_items_count.",
          "- product_service must keep only the product/service description from the line.",
        ].join("\n")
      : [
          "Extraia os dados da nota fiscal a partir do OCR e/ou da imagem enviada.",
          "Retorne APENAS JSON valido, sem markdown e sem comentarios.",
          "Formato esperado e padrao de tabela:",
          '{"supplier":null,"invoice_number":null,"invoice_date":null,"declared_items_count":null,"items":[{"product_service":"","quantity":null,"price":null,"total":null,"unit":"LB","product_id":null,"expiry_date":null}]}',
          "Regras:",
          "- Se houver duvida, mantenha null.",
          "- Mantenha casas decimais em quantity, price e total.",
          "- unit deve ser somente: LB, KG ou UN.",
          "- Siga as colunas da nota nesta ordem: Product/Service, Quantity, Price, Total.",
          "- Nao pule linhas de itens. Se a nota mostrar quantidade total de itens, mantenha o mesmo total sempre que possivel.",
          "- Algumas descricoes podem quebrar em mais de uma linha; una as linhas quebradas no mesmo item quando necessario.",
          "- Se a nota tiver contagem explicita de itens (ex.: Quantity Total / Total de itens), preencha declared_items_count.",
          "- product_service deve conter somente a descricao do produto/servico da linha.",
        ].join("\n");

  const requestParts = [{ text: prompt }];
  if (ocr) {
    requestParts.push({ text: `OCR:\n${ocr}` });
  }
  if (invoiceFile?.base64) {
    requestParts.push({
      inlineData: {
        mimeType: invoiceFile.mimeType || "image/jpeg",
        data: invoiceFile.base64,
      },
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: requestParts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createHttpError(502, "Falha ao extrair JSON no Gemini.", text || `HTTP ${response.status}`);
  }

  const payload = await response.json();
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const rawText = parts.map((part) => part?.text || "").join("\n");
  const parsed = extractFirstJsonObject(rawText);

  if (!parsed || typeof parsed !== "object") return buildFallbackInvoiceJson(ocrText);

  const declaredItemsCount =
    parsePositiveInteger(
      parsed.declared_items_count
      ?? parsed.items_total
      ?? parsed.total_items
      ?? parsed.quantity_total
      ?? parsed.qtd_total,
    )
    ?? extractDeclaredItemsCountFromText(ocr);

  return {
    supplier: parsed.supplier ?? null,
    invoice_number: parsed.invoice_number ?? null,
    invoice_date: parsed.invoice_date ?? null,
    declared_items_count: declaredItemsCount,
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
          product_service: item?.product_service ?? item?.productService ?? item?.description ?? item?.descricao ?? "",
          description: item?.description ?? item?.descricao ?? item?.product_service ?? item?.productService ?? "",
          quantity: item?.quantity ?? item?.qty ?? null,
          unit: normalizeStockUnit(item?.unit || "LB", "LB"),
          price: item?.price ?? item?.unit_cost ?? item?.valor_unitario ?? null,
          unit_cost: item?.unit_cost ?? item?.valor_unitario ?? item?.price ?? null,
          total: item?.total ?? item?.valor_total ?? null,
          product_id: item?.product_id ?? item?.productId ?? null,
          expiry_date: item?.expiry_date ?? null,
        }))
      : [],
  };
}

async function resolveProductIdsForInvoiceItems(items) {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, nome, nome_en")
    .order("id", { ascending: true });

  if (error) {
    throw createHttpError(500, "Erro ao buscar produtos para mapear itens da nota.", error.message);
  }

  const normalizedProducts = (products || []).map((product) => ({
    id: Number(product.id),
    names: [product.nome, product.nome_en]
      .filter(Boolean)
      .map((name) => normalizeSearchText(name))
      .filter(Boolean),
  }));
  const existingProductIds = new Set(normalizedProducts.map((product) => Number(product.id)));

  return (items || []).map((item) => {
    const existingId = Number(item.product_id || item.productId || 0);
    if (existingId > 0 && existingProductIds.has(existingId)) return { ...item, product_id: existingId };

    const rawDescription = normalizeSearchText(
      item.description || item.descricao || item.product_service || item.productService || "",
    );
    if (!rawDescription) return { ...item, product_id: null };

    const cleanedDescription = rawDescription
      .replace(/^#?\d+\s*-\s*/g, "")
      .replace(/^\d+\s+\d+\s*-\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const candidates = Array.from(new Set([cleanedDescription, rawDescription].filter(Boolean)));

    let bestMatch = null;
    let bestScore = 0;
    for (const product of normalizedProducts) {
      for (const alias of product.names) {
        for (const candidate of candidates) {
          const score = similarityScore(candidate, alias);
          if (score > bestScore) {
            bestMatch = product.id;
            bestScore = score;
          }
        }
      }
    }

    return { ...item, product_id: bestScore >= 0.45 ? bestMatch : null };
  });
}

async function callGeminiText({ prompt, temperature = 0.2, maxOutputTokens = 1200 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-1.5-pro";
  if (!apiKey) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens,
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createHttpError(502, "Falha ao consultar o Gemini.", text || `HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const rawText = parts.map((part) => part?.text || "").join("\n").trim();
  return rawText || null;
}

async function upsertClientFromOrderPayload(payload) {
  const clientName = String(payload?.clientName || payload?.nome || "").trim();
  const locale = normalizeLocale(payload?.locale || "pt");
  const normalizedPhone = normalizePhone(payload?.clientPhone || payload?.telefone || "");
  const normalizedEmail = String(payload?.clientEmail || payload?.email || "").trim().toLowerCase() || null;
  const authUserId = String(payload?.authUserId || "").trim() || null;
  const inferredCountry = inferPhoneCountry(payload?.clientPhone || payload?.telefone || "");

  if (!clientName) {
    throw createHttpError(400, "Nome do cliente obrigatorio.");
  }

  if (!normalizedPhone) {
    throw createHttpError(400, "Telefone do cliente obrigatorio.");
  }

  let client = null;

  if (authUserId) {
    const result = await supabase
      .from("clients")
      .select("*")
      .eq("auth_user_id", authUserId)
      .order("id", { ascending: false })
      .limit(1);
    if (result.error) throw createHttpError(500, "Erro ao buscar cliente por auth_user_id.", result.error.message);
    client = result.data?.[0] || null;
  }

  if (!client && normalizedEmail) {
    const result = await supabase
      .from("clients")
      .select("*")
      .eq("email", normalizedEmail)
      .order("id", { ascending: false })
      .limit(1);
    if (result.error) throw createHttpError(500, "Erro ao buscar cliente por email.", result.error.message);
    client = result.data?.[0] || null;
  }

  if (!client) {
    const result = await supabase
      .from("clients")
      .select("*")
      .in("telefone", [normalizedPhone, `+${normalizedPhone}`])
      .order("id", { ascending: false })
      .limit(1);
    if (result.error) throw createHttpError(500, "Erro ao buscar cliente por telefone.", result.error.message);
    client = result.data?.[0] || null;
  }

  const clientPayload = {
    nome: clientName,
    telefone: normalizedPhone,
    email: normalizedEmail,
    endereco_numero: payload?.enderecoNumero || null,
    endereco_rua: payload?.enderecoRua || null,
    endereco_complemento: payload?.enderecoApt || null,
    cidade: payload?.enderecoCidade || null,
    estado: payload?.enderecoEstado || null,
    cep: payload?.enderecoZip || null,
    pais: payload?.pais || inferredCountry || (locale === "en" ? "USA" : "Brasil"),
    tenant_id: Number(payload?.tenantId || 1),
    preferred_locale: locale,
    last_user_agent: payload?.lastUserAgent || null,
    ...(authUserId ? { auth_user_id: authUserId } : {}),
  };

  if (client?.id) {
    const { data, error } = await supabase.from("clients").update(clientPayload).eq("id", client.id).select("*").single();
    if (error) throw createHttpError(500, "Erro ao atualizar cliente.", error.message);
    return data;
  }

  const { data, error } = await supabase.from("clients").insert([clientPayload]).select("*").single();
  if (error) throw createHttpError(500, "Erro ao criar cliente.", error.message);
  return data;
}

function isMissingColumnInSchemaCache(error, columnName) {
  const message = String(error?.message || "");
  return message.includes(`Could not find the '${columnName}' column`);
}

async function insertOrderWithSchemaFallback(orderPayload) {
  let payload = { ...orderPayload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from("orders").insert([payload]).select("*").single();
    if (!error && data) return data;

    if (!error) {
      throw createHttpError(500, "Erro ao criar pedido.");
    }

    const optionalColumns = [
      "source",
      "payment_method",
      "change_for",
      "delivery_mode",
      "delivery_date",
      "delivery_time",
      "notes",
      "email_cliente",
    ];

    const missingColumn = optionalColumns.find((column) => isMissingColumnInSchemaCache(error, column));
    if (!missingColumn) {
      throw createHttpError(500, "Erro ao criar pedido.", error.message);
    }

    delete payload[missingColumn];
  }

  throw createHttpError(500, "Erro ao criar pedido.", "Nao foi possivel compatibilizar colunas opcionais de orders.");
}

async function buildOperationalReportLegacy(rangeQuery = {}) {
  const range = resolveRangeFromQuery(rangeQuery);

  const [
    { data: orders, error: ordersError },
    { data: storeSales, error: storeSalesError },
    { data: expenses, error: expensesError },
    { data: employees, error: employeesError },
    { data: employeePayments, error: employeePaymentsError },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, data_pedido, status, valor_total, payment_method, source")
      .gte("data_pedido", range.start)
      .lte("data_pedido", range.end)
      .order("data_pedido", { ascending: true }),
    supabase
      .from("store_sales")
      .select("*")
      .gte("sale_datetime", range.start)
      .lte("sale_datetime", range.end)
      .order("sale_datetime", { ascending: true }),
    supabase
      .from("expenses")
      .select("*")
      .gte("competency_date", range.startDate)
      .lte("competency_date", range.endDate)
      .order("competency_date", { ascending: true }),
    supabase.from("employees").select("*").order("name", { ascending: true }),
    supabase
      .from("employee_payments")
      .select("*")
      .gte("paid_at", range.start)
      .lte("paid_at", range.end)
      .order("paid_at", { ascending: true }),
  ]);

  if (ordersError || storeSalesError || expensesError || employeesError || employeePaymentsError) {
    throw createHttpError(
      500,
      "Erro ao montar relatorios operacionais.",
      ordersError?.message || storeSalesError?.message || expensesError?.message || employeesError?.message || employeePaymentsError?.message,
    );
  }

  const stockAlerts = await getLowStockAlerts();
  const employeeMap = new Map((employees || []).map((employee) => [Number(employee.id), employee]));
  const dateMap = new Map();
  const paymentMap = new Map();
  const orderStatusMap = new Map();
  const expenseCategoryMap = new Map();
  const payrollMap = new Map();

  let deliveryTotal = 0;
  let deliveryCount = 0;
  let storeTotal = 0;

  for (const order of orders || []) {
    const amount = parseNumber(order.valor_total, 0);
    const dateKey = toDayKey(order.data_pedido || new Date().toISOString());
    const bucket = dateMap.get(dateKey) || { date: dateKey, delivery: 0, store: 0, total: 0 };
    const statusKey = Number(order.status ?? 0);

    if (statusKey === STATUS.CONCLUIDO) {
      bucket.delivery += amount;
      bucket.total += amount;
      dateMap.set(dateKey, bucket);
      deliveryTotal += amount;
      deliveryCount += 1;
    } else if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, bucket);
    }

    const paymentKey = String(order.payment_method || "nao_informado");
    if (statusKey === STATUS.CONCLUIDO) {
      paymentMap.set(paymentKey, roundQty((paymentMap.get(paymentKey) || 0) + amount, 2));
    }

    orderStatusMap.set(statusKey, (orderStatusMap.get(statusKey) || 0) + 1);
  }

  for (const sale of storeSales || []) {
    const amount = parseNumber(sale.total_amount, 0);
    const dateKey = toDayKey(sale.sale_datetime || new Date().toISOString());
    const bucket = dateMap.get(dateKey) || { date: dateKey, delivery: 0, store: 0, total: 0 };
    bucket.store += amount;
    bucket.total += amount;
    dateMap.set(dateKey, bucket);
    storeTotal += amount;

    const paymentKey = String(sale.payment_method || "nao_informado");
    paymentMap.set(paymentKey, roundQty((paymentMap.get(paymentKey) || 0) + amount, 2));
  }

  for (const expense of expenses || []) {
    const key = String(expense.category || "outras");
    expenseCategoryMap.set(key, roundQty((expenseCategoryMap.get(key) || 0) + parseNumber(expense.amount, 0), 2));
  }

  for (const payment of employeePayments || []) {
    const employee = employeeMap.get(Number(payment.employee_id));
    const key = employee?.name || `Funcionario ${payment.employee_id}`;
    payrollMap.set(key, roundQty((payrollMap.get(key) || 0) + parseNumber(payment.amount, 0), 2));
  }

  const expenseTotal = roundQty((expenses || []).reduce((acc, item) => acc + parseNumber(item.amount, 0), 0), 2);
  const payrollTotal = roundQty((employeePayments || []).reduce((acc, item) => acc + parseNumber(item.amount, 0), 0), 2);

  return {
    range,
    summary: {
      delivery_sales_total: roundQty(deliveryTotal, 2),
      delivery_sales_count: deliveryCount,
      store_sales_total: roundQty(storeTotal, 2),
      total_sales: roundQty(deliveryTotal + storeTotal, 2),
      expenses_total: expenseTotal,
      payroll_total: payrollTotal,
      orders_count: (orders || []).length,
      store_sales_count: (storeSales || []).length,
      low_stock_products: stockAlerts.current.length,
      active_employees: (employees || []).filter((employee) => employee.active !== false).length,
    },
    timeline: Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    sales_by_payment: Array.from(paymentMap.entries()).map(([payment_method, total]) => ({ payment_method, total })),
    orders_by_status: Array.from(orderStatusMap.entries()).map(([status, count]) => ({ status, count })),
    expenses_by_category: Array.from(expenseCategoryMap.entries()).map(([category, total]) => ({ category, total })),
    payroll_by_employee: Array.from(payrollMap.entries()).map(([employee_name, total]) => ({ employee_name, total })),
    stock_alerts: stockAlerts.current,
    recent_expenses: (expenses || []).slice(-10).reverse(),
    recent_store_sales: (storeSales || []).slice(-10).reverse(),
    recent_employee_payments: (employeePayments || []).slice(-10).reverse().map((payment) => ({
      ...payment,
      employee_name: employeeMap.get(Number(payment.employee_id))?.name || null,
    })),
  };
}

async function buildOperationalReport(rangeQuery = {}) {
  const range = resolveRangeFromQuery(rangeQuery);

  const rpcResult = await measureStep(
    "operational_report.rpc",
    () => supabase.rpc("rpc_admin_operational_summary", {
      start_date: range.start,
      end_date: range.end,
    }),
    (result) => ({ hasData: Boolean(result.data) }),
  );

  if (rpcResult.error) {
    if (!isMissingFunctionError(rpcResult.error, "rpc_admin_operational_summary")) {
      throw createHttpError(500, "Erro ao montar relatorios operacionais.", rpcResult.error.message);
    }
    return buildOperationalReportLegacy(rangeQuery);
  }

  const payload = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
  if (!payload || typeof payload !== "object") {
    return buildOperationalReportLegacy(rangeQuery);
  }

  const stockAlerts = await measureStep(
    "operational_report.stock_alerts",
    () => getLowStockAlerts(),
    (result) => ({ current: result?.current?.length || 0 }),
  );

  return {
    range,
    summary: {
      delivery_sales_total: Number(payload.summary?.delivery_sales_total || 0),
      delivery_sales_count: Number(payload.summary?.delivery_sales_count || 0),
      store_sales_total: Number(payload.summary?.store_sales_total || 0),
      total_sales: Number(payload.summary?.total_sales || 0),
      expenses_total: Number(payload.summary?.expenses_total || 0),
      payroll_total: Number(payload.summary?.payroll_total || 0),
      orders_count: Number(payload.summary?.orders_count || 0),
      store_sales_count: Number(payload.summary?.store_sales_count || 0),
      low_stock_products: stockAlerts.current.length,
      active_employees: Number(payload.summary?.active_employees || 0),
    },
    timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
    sales_by_payment: Array.isArray(payload.sales_by_payment) ? payload.sales_by_payment : [],
    orders_by_status: Array.isArray(payload.orders_by_status) ? payload.orders_by_status : [],
    expenses_by_category: Array.isArray(payload.expenses_by_category) ? payload.expenses_by_category : [],
    payroll_by_employee: Array.isArray(payload.payroll_by_employee) ? payload.payroll_by_employee : [],
    stock_alerts: stockAlerts.current,
    recent_expenses: Array.isArray(payload.recent_expenses) ? payload.recent_expenses : [],
    recent_store_sales: Array.isArray(payload.recent_store_sales) ? payload.recent_store_sales : [],
    recent_employee_payments: Array.isArray(payload.recent_employee_payments) ? payload.recent_employee_payments : [],
  };
}

const assistantService = createAssistantService({
  supabase,
  normalizeSearchText,
  buildOperationalReport,
  callGeminiText,
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/storefront/branding", async (_req, res) => {
  try {
    const branding = await loadStoreBranding(Number.parseInt(String(process.env.DEFAULT_TENANT_ID || "1"), 10) || 1);
    return res.json({ ok: true, branding });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao carregar branding da loja.",
      detail: error?.detail || null,
    });
  }
});

app.patch("/api/admin/storefront/branding", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const branding = await saveStoreBranding(actor.tenantId, req.body || {});
    return res.json({ ok: true, branding });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao salvar branding da loja.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/admin/zapi-message-templates", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const templates = await loadZapiMessageTemplates(actor.tenantId);
    return res.json({
      ok: true,
      tenantId: actor.tenantId,
      placeholders: ZAPI_TEMPLATE_PLACEHOLDERS,
      defaults: DEFAULT_ZAPI_MESSAGE_TEMPLATES,
      templates,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao carregar configuracao de mensagens da Z-API.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/admin/zapi-instance-phone", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const discovery = await discoverStorePhoneFromZApi();

    return res.json({
      ok: Boolean(discovery.ok),
      phone: discovery.phone || null,
      source: discovery.source || null,
      sourcePath: discovery.sourcePath || null,
      confidence: discovery.confidence || null,
      reason: discovery.reason || null,
      diagnostics: Array.isArray(discovery.diagnostics) ? discovery.diagnostics : [],
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao validar numero da instancia Z-API.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/admin/zapi-connection", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const snapshot = await fetchZApiConnectionStatus();

    return res.json({
      ok: Boolean(snapshot.ok),
      configured: Boolean(snapshot.configured),
      connected: Boolean(snapshot.connected),
      connectedKnown: Boolean(snapshot.connectedKnown),
      status: snapshot.status || null,
      reason: snapshot.reason || null,
      phone: snapshot.phone || null,
      phoneSource: snapshot.phoneSource || null,
      phoneSourcePath: snapshot.phoneSourcePath || null,
      phoneConfidence: snapshot.phoneConfidence || null,
      diagnostics: Array.isArray(snapshot.diagnostics) ? snapshot.diagnostics : [],
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao carregar conexao da Z-API.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/admin/zapi-qr-code", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const qr = await fetchZApiQrCode();

    return res.json({
      ok: Boolean(qr.ok),
      configured: Boolean(qr.configured),
      qrCodeDataUrl: qr.qrCodeDataUrl || null,
      mimeType: qr.mimeType || null,
      reason: qr.reason || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao carregar QR code da Z-API.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/admin/zapi-disconnect", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const result = await disconnectZApiInstance();

    return res.status(result.ok ? 200 : 400).json({
      ok: Boolean(result.ok),
      configured: Boolean(result.configured),
      reason: result.reason || null,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao desconectar instancia da Z-API.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/admin/vemo-qr-code", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const metadataOnly = String(req.query?.metadata || "").trim() === "1";
    const [base64, paymentLink] = await Promise.all([
      metadataOnly ? Promise.resolve(null) : loadVemoQrCode(actor.tenantId),
      loadVemoPaymentLink(actor.tenantId),
    ]);
    const hasQrCode = metadataOnly ? await hasSettingValue(actor.tenantId, VEMO_QR_SETTING_KEYS) : Boolean(base64);
    return res.json({ ok: true, hasQrCode, base64: base64 || null, paymentLink: paymentLink || null });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Erro ao carregar QR code Vemo." });
  }
});

app.patch("/api/admin/vemo-qr-code", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const hasBase64 = Object.prototype.hasOwnProperty.call(req.body || {}, "base64");
    const hasPaymentLink = Object.prototype.hasOwnProperty.call(req.body || {}, "paymentLink");

    if (!hasBase64 && !hasPaymentLink) {
      return res.status(400).json({ error: "Informe ao menos base64 ou paymentLink para atualizar o Vemo." });
    }

    if (hasBase64) {
      const base64 = String(req.body?.base64 || "").trim();
      await saveVemoQrCode(actor.tenantId, base64);
    }

    if (hasPaymentLink) {
      const paymentLink = String(req.body?.paymentLink || "").trim();
      await saveVemoPaymentLink(actor.tenantId, paymentLink);
    }

    const [base64, paymentLink] = await Promise.all([
      loadVemoQrCode(actor.tenantId),
      loadVemoPaymentLink(actor.tenantId),
    ]);
    return res.json({ ok: true, hasQrCode: Boolean(base64), base64: base64 || null, paymentLink: paymentLink || null });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Erro ao salvar QR code Vemo." });
  }
});

app.delete("/api/admin/vemo-qr-code", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    await Promise.all([
      saveVemoQrCode(actor.tenantId, ""),
      saveVemoPaymentLink(actor.tenantId, ""),
    ]);
    return res.json({ ok: true, hasQrCode: false, base64: null, paymentLink: null });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Erro ao remover QR code Vemo." });
  }
});

app.get("/api/admin/zelle-qr-code", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const metadataOnly = String(req.query?.metadata || "").trim() === "1";
    const [base64, paymentLink] = await Promise.all([
      metadataOnly ? Promise.resolve(null) : loadZelleQrCode(actor.tenantId),
      loadZellePaymentLink(actor.tenantId),
    ]);
    const hasQrCode = metadataOnly ? await hasSettingValue(actor.tenantId, ZELLE_QR_SETTING_KEYS) : Boolean(base64);
    return res.json({ ok: true, hasQrCode, base64: base64 || null, paymentLink: paymentLink || null });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Erro ao carregar QR code Zelle." });
  }
});

app.patch("/api/admin/zelle-qr-code", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const hasBase64 = Object.prototype.hasOwnProperty.call(req.body || {}, "base64");
    const hasPaymentLink = Object.prototype.hasOwnProperty.call(req.body || {}, "paymentLink");

    if (!hasBase64 && !hasPaymentLink) {
      return res.status(400).json({ error: "Informe ao menos base64 ou paymentLink para atualizar o Zelle." });
    }

    if (hasBase64) {
      await saveZelleQrCode(actor.tenantId, String(req.body?.base64 || "").trim());
    }

    if (hasPaymentLink) {
      await saveZellePaymentLink(actor.tenantId, String(req.body?.paymentLink || "").trim());
    }

    const [base64, paymentLink] = await Promise.all([
      loadZelleQrCode(actor.tenantId),
      loadZellePaymentLink(actor.tenantId),
    ]);
    return res.json({ ok: true, hasQrCode: Boolean(base64), base64: base64 || null, paymentLink: paymentLink || null });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Erro ao salvar QR code Zelle." });
  }
});

app.delete("/api/admin/zelle-qr-code", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    await Promise.all([
      saveZelleQrCode(actor.tenantId, ""),
      saveZellePaymentLink(actor.tenantId, ""),
    ]);
    return res.json({ ok: true, hasQrCode: false, base64: null, paymentLink: null });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Erro ao remover QR code Zelle." });
  }
});

app.get("/api/admin/veo-qr-code", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const [base64, paymentLink] = await Promise.all([
      loadVemoQrCode(actor.tenantId),
      loadVemoPaymentLink(actor.tenantId),
    ]);
    return res.json({ ok: true, hasQrCode: Boolean(base64), base64: base64 || null, paymentLink: paymentLink || null });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Erro ao carregar QR code Vemo." });
  }
});

app.patch("/api/admin/veo-qr-code", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const hasBase64 = Object.prototype.hasOwnProperty.call(req.body || {}, "base64");
    const hasPaymentLink = Object.prototype.hasOwnProperty.call(req.body || {}, "paymentLink");

    if (!hasBase64 && !hasPaymentLink) {
      return res.status(400).json({ error: "Informe ao menos base64 ou paymentLink para atualizar o Vemo." });
    }

    if (hasBase64) await saveVemoQrCode(actor.tenantId, String(req.body?.base64 || "").trim());
    if (hasPaymentLink) await saveVemoPaymentLink(actor.tenantId, String(req.body?.paymentLink || "").trim());

    const [base64, paymentLink] = await Promise.all([
      loadVemoQrCode(actor.tenantId),
      loadVemoPaymentLink(actor.tenantId),
    ]);
    return res.json({ ok: true, hasQrCode: Boolean(base64), base64: base64 || null, paymentLink: paymentLink || null });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Erro ao salvar QR code Vemo." });
  }
});

app.delete("/api/admin/veo-qr-code", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    await Promise.all([
      saveVemoQrCode(actor.tenantId, ""),
      saveVemoPaymentLink(actor.tenantId, ""),
    ]);
    return res.json({ ok: true, hasQrCode: false, base64: null, paymentLink: null });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Erro ao remover QR code Vemo." });
  }
});

app.get("/api/admin/zapi-groups", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const [groupsResult, config] = await Promise.all([
      listZApiGroups(),
      loadZApiGroupConfig(actor.tenantId),
    ]);
    return res.json({
      ok: Boolean(groupsResult.ok),
      configured: Boolean(groupsResult.configured),
      groups: groupsResult.groups || [],
      reason: groupsResult.reason || null,
      config,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao carregar grupos da Z-API.",
      detail: error?.detail || null,
    });
  }
});

app.patch("/api/admin/zapi-groups", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const config = await saveZApiGroupConfig(actor.tenantId, req.body || {});
    return res.json({ ok: true, config });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao salvar grupo da Z-API.",
      detail: error?.detail || null,
    });
  }
});

app.patch("/api/admin/zapi-message-templates", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const templates = {
      confirmed: {
        pt: normalizeTemplateText(req.body?.templates?.confirmed?.pt, DEFAULT_ZAPI_MESSAGE_TEMPLATES.confirmed.pt),
        en: normalizeTemplateText(req.body?.templates?.confirmed?.en, DEFAULT_ZAPI_MESSAGE_TEMPLATES.confirmed.en),
      },
      out_for_delivery: {
        pt: normalizeTemplateText(req.body?.templates?.out_for_delivery?.pt, DEFAULT_ZAPI_MESSAGE_TEMPLATES.out_for_delivery.pt),
        en: normalizeTemplateText(req.body?.templates?.out_for_delivery?.en, DEFAULT_ZAPI_MESSAGE_TEMPLATES.out_for_delivery.en),
      },
    };

    await saveZapiMessageTemplates(actor.tenantId, templates);

    return res.json({
      ok: true,
      tenantId: actor.tenantId,
      placeholders: ZAPI_TEMPLATE_PLACEHOLDERS,
      defaults: DEFAULT_ZAPI_MESSAGE_TEMPLATES,
      templates,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao salvar configuracao de mensagens da Z-API.",
      detail: error?.detail || null,
    });
  }
});

const PRODUCT_CATEGORY_PRESETS = [
  { categoria: "Cortes bovinos", categoria_en: "Beef Cuts" },
  { categoria: "Cortes suinos", categoria_en: "Pork Cuts" },
  { categoria: "Cortes de aves", categoria_en: "Poultry Cuts" },
];

function normalizeProductCategoryPair(categoria, categoriaEn) {
  const raw = String(`${categoria || ""} ${categoriaEn || ""}`)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/(ave|aves|frango|chicken|hen|turkey|poultry)/.test(raw)) {
    return PRODUCT_CATEGORY_PRESETS[2];
  }

  if (/(suin|porco|pork|pig|bacon|pernil|lombo|costelinha)/.test(raw)) {
    return PRODUCT_CATEGORY_PRESETS[1];
  }

  return PRODUCT_CATEGORY_PRESETS[0];
}

app.post("/api/admin/products", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const nome = String(req.body?.nome || "").trim();
    const preco = parseLooseNumber(req.body?.preco, NaN);

    if (!nome) {
      return res.status(400).json({ error: "Nome do produto e obrigatorio." });
    }

    if (!Number.isFinite(preco) || preco < 0) {
      return res.status(400).json({ error: "Preco invalido." });
    }

    const categoryPair = normalizeProductCategoryPair(req.body?.categoria, req.body?.categoria_en);

    let fotoUrl = null;
    if (req.body?.imageBase64) {
      const uploadedImage = await uploadAdminProductImage({
        productName: nome,
        imageBase64: req.body.imageBase64,
        imageFileName: req.body.imageFileName,
      });
      fotoUrl = uploadedImage.fileUrl || null;
    }

    const payload = {
      nome,
      nome_en: String(req.body?.nome_en || "").trim() || null,
      descricao: String(req.body?.descricao || "").trim() || null,
      descricao_en: String(req.body?.descricao_en || "").trim() || null,
      categoria: categoryPair.categoria,
      categoria_en: categoryPair.categoria_en,
      preco: roundQty(preco, 2),
      unidade: String(req.body?.unidade || "LB").trim().toUpperCase() || "LB",
      foto_url: fotoUrl,
    };

    let { data, error } = await supabase
      .from("products")
      .insert([payload])
      .select("id, nome, descricao, nome_en, descricao_en, categoria, categoria_en, preco, unidade, foto_url")
      .single();

    if (error && String(error.message || "").toLowerCase().includes("tenant_id")) {
      const tenantId = Number.isFinite(Number(actor.tenantId)) && Number(actor.tenantId) > 0
        ? Number(actor.tenantId)
        : Number.parseInt(String(process.env.DEFAULT_TENANT_ID || "1"), 10) || 1;

      const retry = await supabase
        .from("products")
        .insert([{ ...payload, tenant_id: tenantId }])
        .select("id, nome, descricao, nome_en, descricao_en, categoria, categoria_en, preco, unidade, foto_url")
        .single();

      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      return res.status(500).json({
        error: "Erro ao cadastrar produto.",
        detail: error?.message || null,
      });
    }

    return res.json({ ok: true, product: data });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao cadastrar produto.",
      detail: error?.detail || null,
    });
  }
});

app.patch("/api/admin/products/:id", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: "Produto invalido." });
    }

    const { data: existingProduct, error: existingError } = await supabase
      .from("products")
      .select("id, foto_url")
      .eq("id", productId)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({
        error: "Erro ao carregar produto atual.",
        detail: existingError.message,
      });
    }

    if (!existingProduct) {
      return res.status(404).json({ error: "Produto nao encontrado." });
    }

    const nome = String(req.body?.nome || "").trim();
    const preco = parseLooseNumber(req.body?.preco, NaN);

    if (!nome) {
      return res.status(400).json({ error: "Nome do produto e obrigatorio." });
    }

    if (!Number.isFinite(preco) || preco < 0) {
      return res.status(400).json({ error: "Preco invalido." });
    }

    const categoryPair = normalizeProductCategoryPair(req.body?.categoria, req.body?.categoria_en);

    let fotoUrl = String(existingProduct.foto_url || "").trim() || null;
    const previousPhotoUrl = fotoUrl;

    if (req.body?.imageBase64) {
      const uploadedImage = await uploadAdminProductImage({
        productName: nome,
        imageBase64: req.body.imageBase64,
        imageFileName: req.body.imageFileName,
      });
      fotoUrl = uploadedImage.fileUrl || null;
    }

    const { data, error } = await supabase
      .from("products")
      .update({
        nome,
        nome_en: String(req.body?.nome_en || "").trim() || null,
        descricao: String(req.body?.descricao || "").trim() || null,
        descricao_en: String(req.body?.descricao_en || "").trim() || null,
        categoria: categoryPair.categoria,
        categoria_en: categoryPair.categoria_en,
        preco: roundQty(preco, 2),
        unidade: String(req.body?.unidade || "LB").trim().toUpperCase() || "LB",
        foto_url: fotoUrl,
      })
      .eq("id", productId)
      .select("id, nome, descricao, nome_en, descricao_en, categoria, categoria_en, preco, unidade, foto_url")
      .single();

    if (error || !data) {
      return res.status(500).json({
        error: "Erro ao atualizar produto.",
        detail: error?.message || null,
      });
    }

    if (req.body?.imageBase64 && previousPhotoUrl && previousPhotoUrl !== fotoUrl) {
      void removeStorageObjectByPublicUrl("produtos", previousPhotoUrl);
    }

    return res.json({ ok: true, product: data });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao atualizar produto.",
      detail: error?.detail || null,
    });
  }
});

app.use("/api/stock", createStockRouter({
  supabase,
  requireAssistantAdmin,
  sanitizeInvoiceProductName,
  normalizeStockUnit,
  normalizeSearchText,
  similarityScore,
  parseNumber,
  roundQty,
  syncLowStockAlerts,
  convertQuantity,
  getStockBalanceRows,
  getLowStockAlerts,
  sanitizeFileName,
  parseBase64Input,
  maxBase64Bytes: MAX_B64_BYTES,
  callPaperlessOcr,
  callGeminiExtraction,
  normalizeLocale,
  buildFallbackInvoiceJson,
  resolveProductIdsForInvoiceItems,
  parseLooseNumber,
  ensureInvoiceStockMovements,
}));

app.use("/api/orders", createOrdersRouter({
  supabase,
  requireAssistantAdmin,
  createHttpError,
  parseNumber,
  roundQty,
  normalizeStockUnit,
  upsertClientFromOrderPayload,
  normalizeLocale,
  parseLooseNumber,
  status: STATUS,
  insertOrderWithSchemaFallback,
  resolveOrderCode,
  resolveDeliveryAddress,
  sendStoreOrderNotification,
  logPerf,
  buildOrdersAdminPayload,
  fetchOrderItems,
  resolveMessageLocale,
  sendStatusNotification,
  persistWhatsAppAttempt,
  normalizePhone,
  applyOrderStockExit,
  applyOrderStockReversal,
  normalizePaymentMethod,
  formatPaymentMethodLabel,
  loadStoreBranding,
  sendOrderConfirmedGroupNotification,
}));

app.use("/api/delivery-routes", createDeliveryRoutesRouter({
  supabase,
  requireAssistantAdmin,
  createHttpError,
  resolveOrderCode,
  resolveDeliveryAddress,
  fetchOrderItems,
  status: STATUS,
}));

app.use("/api/zapi", createZapiRouter({
  supabase,
  extractWebhookMessageMeta,
  normalizeLocalMessageStatus,
  updateWhatsAppMessagesByIds,
  updateWhatsAppMessageStatus,
}));

app.get("/api/store-sales", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const range = resolveRangeFromQuery(req.query);
    const { data, error } = await supabase
      .from("store_sales")
      .select("*")
      .gte("sale_datetime", range.start)
      .lte("sale_datetime", range.end)
      .order("sale_datetime", { ascending: false });

    if (error) {
      if (isMissingRelationError(error, "store_sales")) {
        return res.status(500).json({
          error: "Tabela store_sales ausente.",
          detail: "Execute o SQL banco de dados/fase8_vendas_presenciais_itemizadas.sql",
        });
      }
      return res.status(500).json({ error: "Erro ao carregar vendas presenciais.", detail: error.message });
    }

    const saleIds = (data || []).map((row) => Number(row.id)).filter(Boolean);
    const { data: itemsData, error: itemsError } = saleIds.length
      ? await supabase
          .from("store_sale_items")
          .select("id, store_sale_id, product_id, quantity, unit, unit_price, total_price")
          .in("store_sale_id", saleIds)
      : { data: [], error: null };

    if (itemsError && !isMissingRelationError(itemsError, "store_sale_items")) {
      return res.status(500).json({ error: "Erro ao carregar itens das vendas presenciais.", detail: itemsError.message });
    }

    const productIds = Array.from(new Set((itemsData || []).map((item) => Number(item.product_id)).filter(Boolean)));
    const { data: productsData } = productIds.length
      ? await supabase.from("products").select("id, nome").in("id", productIds)
      : { data: [] };
    const productsMap = new Map((productsData || []).map((product) => [Number(product.id), product.nome]));

    const sales = (data || []).map((sale) => ({
      ...sale,
      items: (itemsData || [])
        .filter((item) => Number(item.store_sale_id) === Number(sale.id))
        .map((item) => ({
          ...item,
          product_name: productsMap.get(Number(item.product_id)) || `Produto ${item.product_id}`,
        })),
    }));

    const total = roundQty((data || []).reduce((acc, row) => acc + parseNumber(row.total_amount, 0), 0), 2);
    return res.json({ ok: true, sales, summary: { count: (data || []).length, total } });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao carregar vendas presenciais." });
  }
});

app.get("/api/store-sales/summary", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const range = resolveRangeFromQuery(req.query);
    const { data, error } = await supabase
      .from("store_sales")
      .select("payment_method, total_amount, sale_datetime")
      .gte("sale_datetime", range.start)
      .lte("sale_datetime", range.end)
      .order("sale_datetime", { ascending: true });

    if (error) {
      if (isMissingRelationError(error, "store_sales")) {
        return res.status(500).json({
          error: "Tabela store_sales ausente.",
          detail: "Execute o SQL banco de dados/fase8_vendas_presenciais_itemizadas.sql",
        });
      }
      return res.status(500).json({ error: "Erro ao consolidar vendas presenciais.", detail: error.message });
    }

    const byPayment = {};
    for (const row of data || []) {
      const key = row.payment_method || "nao_informado";
      byPayment[key] = roundQty((byPayment[key] || 0) + parseNumber(row.total_amount, 0), 2);
    }

    return res.json({
      ok: true,
      range,
      total: roundQty((data || []).reduce((acc, row) => acc + parseNumber(row.total_amount, 0), 0), 2),
      by_payment: Object.entries(byPayment).map(([payment_method, total]) => ({ payment_method, total })),
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao consolidar vendas presenciais." });
  }
});

app.post("/api/store-sales", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!rawItems.length) {
      return res.status(400).json({ error: "Informe ao menos um produto na venda presencial." });
    }

    const items = rawItems.map((item, index) => {
      const productId = Number(item?.productId || item?.product_id);
      const quantity = parseLooseNumber(item?.quantity, NaN);
      const unitPrice = parseLooseNumber(item?.unitPrice || item?.unit_price || item?.price, NaN);
      const unit = normalizeStockUnit(item?.unit || "UN", "UN");

      if (!productId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw createHttpError(400, `Item ${index + 1} invalido na venda presencial.`);
      }

      return {
        product_id: productId,
        quantity: roundQty(quantity, 3),
        unit,
        unit_price: roundQty(unitPrice, 2),
        total_price: roundQty(quantity * unitPrice, 2),
      };
    });

    await buildStoreSaleStockPlan(items);

    const totalAmount = roundQty(items.reduce((acc, item) => acc + parseNumber(item.total_price, 0), 0), 2);

    const payload = {
      origin: "store",
      sale_datetime: normalizeDateInput(req.body?.saleDatetime || new Date().toISOString(), new Date().toISOString()),
      total_amount: totalAmount,
      payment_method: normalizePaymentMethod(req.body?.paymentMethod) || "nao_informado",
      notes: req.body?.notes || null,
      created_by: req.body?.createdBy || actor.name || null,
    };

    const { data, error } = await supabase.from("store_sales").insert([payload]).select("*").single();
    if (error) {
      if (isMissingRelationError(error, "store_sales")) {
        return res.status(500).json({
          error: "Tabela store_sales ausente.",
          detail: "Execute o SQL banco de dados/fase8_vendas_presenciais_itemizadas.sql",
        });
      }
      return res.status(500).json({ error: "Erro ao registrar venda presencial.", detail: error.message });
    }

    const itemRows = items.map((item) => ({
      store_sale_id: data.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      total_price: item.total_price,
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from("store_sale_items")
      .insert(itemRows)
      .select("*");

    if (itemsError) {
      await supabase.from("store_sales").delete().eq("id", data.id);
      if (isMissingRelationError(itemsError, "store_sale_items")) {
        return res.status(500).json({
          error: "Tabela store_sale_items ausente.",
          detail: "Execute o SQL banco de dados/fase8_vendas_presenciais_itemizadas.sql",
        });
      }
      return res.status(500).json({ error: "Erro ao registrar itens da venda presencial.", detail: itemsError.message });
    }

    try {
      await applyStoreSaleStockExit(data.id, insertedItems || []);
    } catch (stockError) {
      await supabase.from("store_sale_items").delete().eq("store_sale_id", data.id);
      await supabase.from("store_sales").delete().eq("id", data.id);
      throw stockError;
    }

    return res.status(201).json({ ok: true, sale: { ...data, items: insertedItems || [] } });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao registrar venda presencial.",
      detail: error?.detail || null,
    });
  }
});

app.patch("/api/store-sales/:id", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const saleId = Number(req.params.id);
    if (!saleId) {
      return res.status(400).json({ error: "ID de venda invalido." });
    }

    const current = await loadSaleWithItems(saleId);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!rawItems.length) {
      return res.status(400).json({ error: "Informe ao menos um produto na venda presencial." });
    }

    const items = rawItems.map((item, index) => {
      const productId = Number(item?.productId || item?.product_id);
      const quantity = parseLooseNumber(item?.quantity, NaN);
      const unitPrice = parseLooseNumber(item?.unitPrice || item?.unit_price || item?.price, NaN);
      const unit = normalizeStockUnit(item?.unit || "UN", "UN");
      if (!productId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw createHttpError(400, `Item ${index + 1} invalido na venda presencial.`);
      }
      return {
        product_id: productId,
        quantity: roundQty(quantity, 3),
        unit,
        unit_price: roundQty(unitPrice, 2),
        total_price: roundQty(quantity * unitPrice, 2),
      };
    });

    await revertStoreSaleStockExit(saleId, "store_sale_updated");
    await buildStoreSaleStockPlan(items);

    const payload = {
      sale_datetime: normalizeDateInput(req.body?.saleDatetime || current.sale.sale_datetime, current.sale.sale_datetime),
      total_amount: roundQty(items.reduce((acc, item) => acc + parseNumber(item.total_price, 0), 0), 2),
      payment_method: normalizePaymentMethod(req.body?.paymentMethod || current.sale.payment_method) || "nao_informado",
      notes: req.body?.notes ?? current.sale.notes ?? null,
      created_by: req.body?.createdBy || current.sale.created_by || actor.name || null,
    };

    const { data: updatedSale, error: saleError } = await supabase
      .from("store_sales")
      .update(payload)
      .eq("id", saleId)
      .select("*")
      .single();

    if (saleError || !updatedSale) {
      throw createHttpError(500, "Erro ao atualizar venda presencial.", saleError?.message || null);
    }

    const { error: deleteItemsError } = await supabase.from("store_sale_items").delete().eq("store_sale_id", saleId);
    if (deleteItemsError) {
      throw createHttpError(500, "Erro ao substituir itens da venda presencial.", deleteItemsError.message);
    }

    const itemRows = items.map((item) => ({
      store_sale_id: saleId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      total_price: item.total_price,
    }));

    const { data: insertedItems, error: insertItemsError } = await supabase.from("store_sale_items").insert(itemRows).select("*");
    if (insertItemsError) {
      throw createHttpError(500, "Erro ao recriar itens da venda presencial.", insertItemsError.message);
    }

    await applyStoreSaleStockExit(saleId, insertedItems || [], "store_sale_updated");

    const updated = { ...updatedSale, items: insertedItems || [] };
    return res.json({ ok: true, sale: updated });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao atualizar venda presencial.",
      detail: error?.detail || null,
    });
  }
});

app.delete("/api/store-sales/:id", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const saleId = Number(req.params.id);
    if (!saleId) {
      return res.status(400).json({ error: "ID de venda invalido." });
    }

    const current = await loadSaleWithItems(saleId);
    await revertStoreSaleStockExit(saleId, "store_sale_deleted");
    await supabase.from("store_sale_items").delete().eq("store_sale_id", saleId);
    const { error } = await supabase.from("store_sales").delete().eq("id", saleId);
    if (error) {
      throw createHttpError(500, "Erro ao excluir venda presencial.", error.message);
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao excluir venda presencial.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/expenses", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const range = resolveRangeFromQuery(req.query);
    let query = supabase
      .from("expenses")
      .select("*")
      .gte("competency_date", range.startDate)
      .lte("competency_date", range.endDate)
      .order("competency_date", { ascending: false });

    const category = String(req.query?.category || "").trim();
    if (category) query = query.eq("category", category);
    const costType = String(req.query?.costType || req.query?.cost_type || "").trim();
    if (costType) query = query.eq("cost_type", costType);

    const search = String(req.query?.search || "").trim();
    if (search) query = query.ilike("description", `%${search}%`);

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: "Erro ao carregar despesas.", detail: error.message });
    }

    const total = roundQty((data || []).reduce((acc, item) => acc + parseNumber(item.amount, 0), 0), 2);
    return res.json({ ok: true, expenses: data || [], summary: { count: (data || []).length, total } });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao carregar despesas." });
  }
});

app.get("/api/expenses/summary", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const range = resolveRangeFromQuery(req.query);
    const { data, error } = await supabase
      .from("expenses")
      .select("category, cost_type, amount")
      .gte("competency_date", range.startDate)
      .lte("competency_date", range.endDate);

    if (error) {
      return res.status(500).json({ error: "Erro ao consolidar despesas.", detail: error.message });
    }

    const byCategory = {};
    const byType = {};
    for (const item of data || []) {
      const key = item.category || "outras";
      byCategory[key] = roundQty((byCategory[key] || 0) + parseNumber(item.amount, 0), 2);
      const typeKey = item.cost_type || "variable";
      byType[typeKey] = roundQty((byType[typeKey] || 0) + parseNumber(item.amount, 0), 2);
    }

    return res.json({
      ok: true,
      range,
      total: roundQty((data || []).reduce((acc, item) => acc + parseNumber(item.amount, 0), 0), 2),
      by_category: Object.entries(byCategory).map(([category, total]) => ({ category, total })),
      by_type: Object.entries(byType).map(([cost_type, total]) => ({ cost_type, total })),
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao consolidar despesas." });
  }
});

app.post("/api/expenses/ocr-preview", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const attachmentBase64 = String(req.body?.attachmentBase64 || "").trim();
    if (!attachmentBase64) {
      return res.status(400).json({ error: "attachmentBase64 obrigatorio." });
    }

    const ocrText = await callDocumentOcr({
      fileBase64: attachmentBase64,
      fileName: req.body?.attachmentName || "despesa",
      mimeType: req.body?.attachmentMimeType || null,
      ocrHint: req.body?.ocrText || null,
      entityType: "expense",
    });
    const suggestion = buildExpenseOcrSuggestion(ocrText);
    return res.json({ ok: true, ocrText, suggestion });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao processar OCR da despesa.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/expenses", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const amount = parseLooseNumber(req.body?.amount, NaN);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: "amount invalido." });
    }

    let attachment = { bucket: null, filePath: null, fileUrl: null };
    if (req.body?.attachmentBase64) {
      attachment = await uploadBase64FileToStorage({
        bucket: process.env.SUPABASE_FINANCE_BUCKET || process.env.SUPABASE_INVOICE_BUCKET || "invoice-imports",
        fileName: req.body?.attachmentName || "despesa.jpg",
        fileBase64: req.body.attachmentBase64,
        folderPrefix: "finance",
        defaultFileName: "despesa.jpg",
        contentType: req.body?.attachmentMimeType || null,
      });
    }

    const payload = {
      description: String(req.body?.description || "").trim(),
      category: String(req.body?.category || "outras").trim() || "outras",
      cost_type: String(req.body?.costType || req.body?.cost_type || "variable").trim() || "variable",
      amount: roundQty(amount, 2),
      competency_date: String(req.body?.competencyDate || "").slice(0, 10),
      posted_at: normalizeDateInput(req.body?.postedAt || new Date().toISOString(), new Date().toISOString()),
      notes: req.body?.notes || null,
      ocr_text: req.body?.ocrText || null,
      ocr_payload: req.body?.ocrPayload || null,
      attachment_bucket: attachment.bucket,
      attachment_path: attachment.filePath,
      attachment_url: attachment.fileUrl,
      created_by: req.body?.createdBy || actor.name || null,
    };

    if (!payload.description || !payload.competency_date) {
      return res.status(400).json({ error: "description e competencyDate sao obrigatorios." });
    }

    const { data, error } = await supabase.from("expenses").insert([payload]).select("*").single();
    if (error) {
      return res.status(500).json({ error: "Erro ao registrar despesa.", detail: error.message });
    }

    return res.status(201).json({ ok: true, expense: data });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao registrar despesa.",
      detail: error?.detail || null,
    });
  }
});

app.patch("/api/expenses/:id", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const expenseId = Number(req.params.id);
    const { data: current, error: currentError } = await supabase.from("expenses").select("*").eq("id", expenseId).single();
    if (currentError || !current) {
      throw createHttpError(404, "Despesa nao encontrada.", currentError?.message || null);
    }

    const payload = {
      description: String(req.body?.description || current.description || "").trim(),
      category: String(req.body?.category || current.category || "outras").trim() || "outras",
      cost_type: String(req.body?.costType || req.body?.cost_type || current.cost_type || "variable").trim() || "variable",
      amount: roundQty(parseLooseNumber(req.body?.amount ?? current.amount, current.amount), 2),
      competency_date: String(req.body?.competencyDate || current.competency_date || "").slice(0, 10),
      posted_at: normalizeDateInput(req.body?.postedAt || current.posted_at, current.posted_at),
      notes: req.body?.notes ?? current.notes ?? null,
      ocr_text: req.body?.ocrText ?? current.ocr_text ?? null,
      ocr_payload: req.body?.ocrPayload ?? current.ocr_payload ?? null,
      created_by: req.body?.createdBy || current.created_by || actor.name || null,
    };

    if (req.body?.attachmentBase64) {
      const attachment = await uploadBase64FileToStorage({
        bucket: process.env.SUPABASE_FINANCE_BUCKET || process.env.SUPABASE_INVOICE_BUCKET || "invoice-imports",
        fileName: req.body?.attachmentName || "despesa.jpg",
        fileBase64: req.body.attachmentBase64,
        folderPrefix: "finance",
        defaultFileName: "despesa.jpg",
        contentType: req.body?.attachmentMimeType || null,
      });
      payload.attachment_bucket = attachment.bucket;
      payload.attachment_path = attachment.filePath;
      payload.attachment_url = attachment.fileUrl;
    } else if (req.body?.removeAttachment === true) {
      payload.attachment_bucket = null;
      payload.attachment_path = null;
      payload.attachment_url = null;
    }

    const { data: updated, error } = await supabase.from("expenses").update(payload).eq("id", expenseId).select("*").single();
    if (error || !updated) {
      throw createHttpError(500, "Erro ao atualizar despesa.", error?.message || null);
    }

    return res.json({ ok: true, expense: updated });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao atualizar despesa.",
      detail: error?.detail || null,
    });
  }
});

app.delete("/api/expenses/:id", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const expenseId = Number(req.params.id);
    const { data: current, error: currentError } = await supabase.from("expenses").select("*").eq("id", expenseId).single();
    if (currentError || !current) {
      throw createHttpError(404, "Despesa nao encontrada.", currentError?.message || null);
    }

    const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
    if (error) {
      throw createHttpError(500, "Erro ao excluir despesa.", error.message);
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao excluir despesa.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/employees/dashboard", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const monthRange = resolveCurrentMonthRange();
    const [{ data: employees, error: employeesError }, { data: payments, error: paymentsError }] = await Promise.all([
      supabase.from("employees").select("*").order("name", { ascending: true }),
      supabase
        .from("employee_payments")
        .select("id, employee_id, amount, paid_at, attachment_url")
        .gte("paid_at", monthRange.start)
        .lte("paid_at", monthRange.end),
    ]);

    if (employeesError || paymentsError) {
      return res.status(500).json({
        error: "Erro ao carregar painel de funcionarios.",
        detail: employeesError?.message || paymentsError?.message || null,
      });
    }

    const paymentMap = new Map();
    let paymentsTotal = 0;
    let paymentsCount = 0;

    for (const payment of payments || []) {
      const employeeId = Number(payment.employee_id);
      const amount = roundQty(parseNumber(payment.amount, 0), 2);
      const current = paymentMap.get(employeeId) || {
        month_total: 0,
        month_count: 0,
        last_payment_at: null,
      };
      current.month_total = roundQty(current.month_total + amount, 2);
      current.month_count += 1;
      if (!current.last_payment_at || new Date(payment.paid_at).getTime() > new Date(current.last_payment_at).getTime()) {
        current.last_payment_at = payment.paid_at;
      }
      paymentMap.set(employeeId, current);
      paymentsTotal = roundQty(paymentsTotal + amount, 2);
      paymentsCount += 1;
    }

    const cards = (employees || [])
      .map((employee) => {
        const stats = paymentMap.get(Number(employee.id)) || {
          month_total: 0,
          month_count: 0,
          last_payment_at: null,
        };
        return {
          employee_id: Number(employee.id),
          employee_name: employee.name || `Funcionario ${employee.id}`,
          active: employee.active !== false,
          role_title: employee.role_title || null,
          contact: employee.phone || employee.email || null,
          phone: employee.phone || null,
          email: employee.email || null,
          month_total: roundQty(stats.month_total, 2),
          month_count: Number(stats.month_count || 0),
          last_payment_at: stats.last_payment_at || null,
        };
      })
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.month_total !== b.month_total) return b.month_total - a.month_total;
        return String(a.employee_name).localeCompare(String(b.employee_name));
      });

    const activeEmployees = cards.filter((employee) => employee.active).length;
    const topEmployees = cards
      .filter((employee) => employee.month_total > 0)
      .slice()
      .sort((a, b) => b.month_total - a.month_total)
      .slice(0, 5)
      .map((employee) => ({
        employee_id: employee.employee_id,
        employee_name: employee.employee_name,
        month_total: employee.month_total,
      }));

    return res.json({
      ok: true,
      monthRange,
      summary: {
        team_count: cards.length,
        active_count: activeEmployees,
        payments_total: roundQty(paymentsTotal, 2),
        payments_count: paymentsCount,
        avg_per_active_employee: activeEmployees ? roundQty(paymentsTotal / activeEmployees, 2) : 0,
      },
      top_employees: topEmployees,
      employees: cards,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao carregar painel de funcionarios." });
  }
});

app.get("/api/employees", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    let query = supabase.from("employees").select("*").order("name", { ascending: true });
    if (String(req.query?.active || "").trim() === "true") query = query.eq("active", true);
    if (String(req.query?.active || "").trim() === "false") query = query.eq("active", false);
    const search = String(req.query?.search || "").trim();
    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: "Erro ao carregar funcionarios.", detail: error.message });
    }

    return res.json({ ok: true, employees: data || [] });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao carregar funcionarios." });
  }
});

app.post("/api/employees", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const payload = {
      name: String(req.body?.name || "").trim(),
      phone: req.body?.phone || null,
      email: req.body?.email || null,
      role_title: req.body?.roleTitle || null,
      active: req.body?.active !== false,
      notes: req.body?.notes || null,
      updated_at: new Date().toISOString(),
    };

    if (!payload.name) {
      return res.status(400).json({ error: "name obrigatorio." });
    }

    const { data, error } = await supabase.from("employees").insert([payload]).select("*").single();
    if (error) {
      return res.status(500).json({ error: "Erro ao cadastrar funcionario.", detail: error.message });
    }

    return res.status(201).json({ ok: true, employee: data });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao cadastrar funcionario." });
  }
});

app.patch("/api/employees/:id", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) payload.name = String(req.body.name || "").trim();
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "phone")) payload.phone = req.body.phone || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "email")) payload.email = req.body.email || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "roleTitle")) payload.role_title = req.body.roleTitle || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "active")) payload.active = Boolean(req.body.active);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "notes")) payload.notes = req.body.notes || null;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from("employees").update(payload).eq("id", req.params.id).select("*").single();
    if (error) {
      return res.status(500).json({ error: "Erro ao atualizar funcionario.", detail: error.message });
    }

    return res.json({ ok: true, employee: data });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao atualizar funcionario." });
  }
});

app.get("/api/employee-payments", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const range = resolveRangeFromQuery(req.query);
    let query = supabase
      .from("employee_payments")
      .select("*")
      .gte("paid_at", range.start)
      .lte("paid_at", range.end)
      .order("paid_at", { ascending: false });

    if (req.query?.employeeId) query = query.eq("employee_id", req.query.employeeId);
    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: "Erro ao carregar pagamentos.", detail: error.message });
    }

    const employeeIds = Array.from(new Set((data || []).map((item) => Number(item.employee_id)).filter(Boolean)));
    const { data: employees } = employeeIds.length
      ? await supabase.from("employees").select("id, name").in("id", employeeIds)
      : { data: [] };
    const employeeMap = new Map((employees || []).map((employee) => [Number(employee.id), employee.name]));

    return res.json({
      ok: true,
      payments: (data || []).map((payment) => ({
        ...payment,
        employee_name: employeeMap.get(Number(payment.employee_id)) || null,
      })),
      summary: {
        count: (data || []).length,
        total: roundQty((data || []).reduce((acc, payment) => acc + parseNumber(payment.amount, 0), 0), 2),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao carregar pagamentos." });
  }
});

app.get("/api/employee-payments/summary", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const range = resolveRangeFromQuery(req.query);
    const { data, error } = await supabase
      .from("employee_payments")
      .select("employee_id, amount")
      .gte("paid_at", range.start)
      .lte("paid_at", range.end);

    if (error) {
      return res.status(500).json({ error: "Erro ao consolidar pagamentos.", detail: error.message });
    }

    const employeeIds = Array.from(new Set((data || []).map((item) => Number(item.employee_id)).filter(Boolean)));
    const { data: employees } = employeeIds.length
      ? await supabase.from("employees").select("id, name").in("id", employeeIds)
      : { data: [] };
    const employeeMap = new Map((employees || []).map((employee) => [Number(employee.id), employee.name]));
    const totals = {};
    for (const payment of data || []) {
      const key = employeeMap.get(Number(payment.employee_id)) || `Funcionario ${payment.employee_id}`;
      totals[key] = roundQty((totals[key] || 0) + parseNumber(payment.amount, 0), 2);
    }

    return res.json({
      ok: true,
      range,
      total: roundQty((data || []).reduce((acc, payment) => acc + parseNumber(payment.amount, 0), 0), 2),
      by_employee: Object.entries(totals).map(([employee_name, total]) => ({ employee_name, total })),
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao consolidar pagamentos." });
  }
});

app.post("/api/employee-payments", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const amount = parseLooseNumber(req.body?.amount, NaN);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: "amount invalido." });
    }

    if (!req.body?.employeeId || !req.body?.weekReference) {
      return res.status(400).json({ error: "employeeId e weekReference sao obrigatorios." });
    }

    let attachment = { bucket: null, filePath: null, fileUrl: null };
    if (req.body?.attachmentBase64) {
      attachment = await uploadBase64FileToStorage({
        bucket: process.env.SUPABASE_PAYROLL_BUCKET || process.env.SUPABASE_INVOICE_BUCKET || "invoice-imports",
        fileName: req.body?.attachmentName || "pagamento.jpg",
        fileBase64: req.body.attachmentBase64,
        folderPrefix: "payroll",
        defaultFileName: "pagamento.jpg",
        contentType: req.body?.attachmentMimeType || null,
      });
    }

    const payload = {
      employee_id: Number(req.body.employeeId),
      week_reference: String(req.body.weekReference).slice(0, 10),
      amount: roundQty(amount, 2),
      paid_at: normalizeDateInput(req.body?.paidAt || new Date().toISOString(), new Date().toISOString()),
      notes: req.body?.notes || null,
      attachment_bucket: attachment.bucket,
      attachment_path: attachment.filePath,
      attachment_url: attachment.fileUrl,
      created_by: req.body?.createdBy || actor.name || null,
    };

    const { data, error } = await supabase.from("employee_payments").insert([payload]).select("*").single();
    if (error) {
      return res.status(500).json({ error: "Erro ao registrar pagamento.", detail: error.message });
    }

    return res.status(201).json({ ok: true, payment: data });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao registrar pagamento.",
      detail: error?.detail || null,
    });
  }
});

app.patch("/api/employee-payments/:id", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const paymentId = Number(req.params.id);
    const { data: current, error: currentError } = await supabase.from("employee_payments").select("*").eq("id", paymentId).single();
    if (currentError || !current) {
      throw createHttpError(404, "Pagamento nao encontrado.", currentError?.message || null);
    }

    const payload = {
      employee_id: Number(req.body?.employeeId || current.employee_id),
      week_reference: String(req.body?.weekReference || current.week_reference || "").slice(0, 10),
      amount: roundQty(parseLooseNumber(req.body?.amount ?? current.amount, current.amount), 2),
      paid_at: normalizeDateInput(req.body?.paidAt || current.paid_at, current.paid_at),
      notes: req.body?.notes ?? current.notes ?? null,
      created_by: req.body?.createdBy || current.created_by || actor.name || null,
    };

    if (req.body?.attachmentBase64) {
      const attachment = await uploadBase64FileToStorage({
        bucket: process.env.SUPABASE_PAYROLL_BUCKET || process.env.SUPABASE_INVOICE_BUCKET || "invoice-imports",
        fileName: req.body?.attachmentName || "pagamento.jpg",
        fileBase64: req.body.attachmentBase64,
        folderPrefix: "payroll",
        defaultFileName: "pagamento.jpg",
        contentType: req.body?.attachmentMimeType || null,
      });
      payload.attachment_bucket = attachment.bucket;
      payload.attachment_path = attachment.filePath;
      payload.attachment_url = attachment.fileUrl;
    } else if (req.body?.removeAttachment === true) {
      payload.attachment_bucket = null;
      payload.attachment_path = null;
      payload.attachment_url = null;
    }

    const { data: updated, error } = await supabase.from("employee_payments").update(payload).eq("id", paymentId).select("*").single();
    if (error || !updated) {
      throw createHttpError(500, "Erro ao atualizar pagamento.", error?.message || null);
    }

    return res.json({ ok: true, payment: updated });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao atualizar pagamento.",
      detail: error?.detail || null,
    });
  }
});

app.delete("/api/employee-payments/:id", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const paymentId = Number(req.params.id);
    const { data: current, error: currentError } = await supabase.from("employee_payments").select("*").eq("id", paymentId).single();
    if (currentError || !current) {
      throw createHttpError(404, "Pagamento nao encontrado.", currentError?.message || null);
    }

    const { error } = await supabase.from("employee_payments").delete().eq("id", paymentId);
    if (error) {
      throw createHttpError(500, "Erro ao excluir pagamento.", error.message);
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao excluir pagamento.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/admin/attachments/:entityType/:id", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const entityType = String(req.params.entityType || "").trim();
    const entityId = Number(req.params.id);
    if (!entityId) {
      return res.status(400).json({ error: "ID invalido para gerar link do anexo." });
    }

    const source = await resolveAttachmentSource(entityType, entityId);
    if (!source.bucket || !source.path) {
      return res.status(404).json({ error: "Nenhum anexo encontrado para este registro." });
    }

    const signedUrl = await createSignedStorageUrl(source.bucket, source.path);
    return res.json({ ok: true, signedUrl, bucket: source.bucket, path: source.path });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro ao gerar link seguro do anexo.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/clients/admin", async (req, res) => {
  const startedAt = Date.now();
  try {
    await requireAssistantAdmin(req);
    const payload = await buildClientsAdminPayload({
      search: String(req.query?.search || "").trim(),
      segment: normalizeClientSegment(req.query?.segment),
      withOrders: String(req.query?.withOrders || "").trim().toLowerCase() === "true",
      page: Number(req.query?.page || 1),
      pageSize: Number(req.query?.pageSize || 10),
      sortField: String(req.query?.sortField || "nome").trim(),
      sortDir: normalizeSortDirection(req.query?.sortDir),
    });

    logPerf("route.clients_admin", startedAt, {
      page: payload?.pageInfo?.page || 1,
      totalItems: payload?.pageInfo?.totalItems || 0,
    });
    return res.json({ ok: true, ...payload });
  } catch (error) {
    logPerf("route.clients_admin", startedAt, { error: error?.message || "unknown" });
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao carregar clientes administrativos.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/client-campaigns/preview", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const media = normalizeClientCampaignMedia(req.body || {});
    await requireAssistantAdmin(req);
    if (!message) {
      return res.status(400).json({ error: "message obrigatoria." });
    }

    const audience = await buildClientCampaignAudience(req.body, message);

    return res.json({
      ok: true,
      filters: audience.filters,
      audienceCount: audience.stats.audienceCount,
      targetCount: audience.stats.targetCount,
      excludedWithoutPhone: audience.stats.excludedWithoutPhone,
      breakdown: {
        vipCount: audience.stats.vipCount,
        nonVipCount: audience.stats.nonVipCount,
        withOrdersCount: audience.stats.withOrdersCount,
        withoutOrdersCount: audience.stats.withoutOrdersCount,
        brCount: audience.stats.brCount,
        usCount: audience.stats.usCount,
        otherCount: audience.stats.otherCount,
        topCities: audience.stats.topCities,
      },
      sampleRecipients: audience.sampleRecipients,
      previewText: audience.previewText,
      mediaType: media.kind,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao gerar previa da campanha.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/client-campaigns/test", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const media = normalizeClientCampaignMedia(req.body || {});
    const actor = await requireAssistantAdmin(req);
    const testPhone = normalizePhone(req.body?.testPhone || req.body?.phone || "");
    if (!message) {
      return res.status(400).json({ error: "message obrigatoria." });
    }
    if (!testPhone) {
      return res.status(400).json({ error: "testPhone obrigatorio." });
    }

    const sendResult = media.kind === "image"
      ? await sendWhatsAppImageViaZApi({
        phone: testPhone,
        imageBase64: media.imageBase64,
        caption: message,
      })
      : await sendWhatsAppViaZApi({
        phone: testPhone,
        message,
      });

    await persistWhatsAppAttempt({
      orderId: null,
      target: "client_campaign_test",
      eventType: "client_campaign_test",
      destinationPhone: testPhone,
      messageText: message,
      payload: {
        actor: actor?.id || null,
        mediaType: media.kind,
      },
      sendResult,
    });

    if (!sendResult?.ok) {
      return res.status(400).json({
        ok: false,
        reason: sendResult?.reason || "test-send-failed",
        detail: sendResult?.detail || null,
      });
    }

    return res.json({
      ok: true,
      phone: testPhone,
      messageId: sendResult.messageId || null,
      zaapId: sendResult.zaapId || null,
      mediaType: media.kind,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao enviar teste da campanha.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/client-campaigns/send", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const message = String(req.body?.message || "").trim();
    const media = normalizeClientCampaignMedia(req.body || {});
    if (!message) {
      return res.status(400).json({ error: "message obrigatoria." });
    }

    const filters = normalizeClientCampaignFilters(req.body);
    const schedule = normalizeClientCampaignSchedule(req.body?.schedule || {});
    const audience = await buildClientCampaignAudience(filters, message);

    const nextRunAt = schedule.mode === "schedule" && schedule.scheduledAt
      ? schedule.scheduledAt
      : (!isClientCampaignWithinWindow(new Date(), schedule) ? getNextClientCampaignWindowDate(schedule, new Date()).toISOString() : null);
    const campaign = await createClientCampaignAudit({
      segment: filters.segment,
      searchTerm: filters.search,
      withOrders: filters.withOrders,
      messageTemplate: message,
      targetCount: audience.stats.targetCount,
      validCount: audience.stats.audienceCount,
      skippedCount: audience.stats.excludedWithoutPhone,
      status: nextRunAt ? "scheduled" : "queued",
      createdBy: req.body?.createdBy || actor?.name || actor?.id || null,
      metadata: {
        channel: "whatsapp",
        filters,
        schedule: {
          ...schedule,
          nextRunAt,
        },
        progress: {
          state: nextRunAt ? "scheduled" : "queued",
          processedCount: 0,
          totalCount: audience.stats.targetCount,
          updatedAt: new Date().toISOString(),
        },
        media,
        audience: {
          ...audience.stats,
        },
      },
    });

    if (!campaign?.id) {
      throw createHttpError(500, "A tabela client_campaigns precisa existir para usar o novo fluxo de campanhas.");
    }

    scheduleClientCampaign(campaign.id, nextRunAt || new Date().toISOString());

    return res.json({
      ok: true,
      campaignId: campaign.id,
      status: nextRunAt ? "scheduled" : "queued",
      targetCount: audience.stats.targetCount,
      validCount: audience.stats.audienceCount,
      skippedCount: audience.stats.excludedWithoutPhone,
      scheduledAt: nextRunAt,
      mediaType: media.kind,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao enviar campanha.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/client-campaigns/:id", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const campaignId = Number(req.params.id);
    if (!campaignId) {
      return res.status(400).json({ error: "ID da campanha invalido." });
    }

    const campaign = await loadClientCampaignById(campaignId);
    const recentRecipients = await listClientCampaignRecipients(campaignId, { limit: 8 });
    const failedRecipients = await listClientCampaignRecipients(campaignId, { status: "failed", limit: 8 });
    const totalCount = Number(campaign.target_count || 0);
    const processedCount = Number(campaign.sent_count || 0) + Number(campaign.failed_count || 0);
    const progressPercent = totalCount > 0 ? Math.min(100, Math.round((processedCount / totalCount) * 100)) : 0;

    return res.json({
      ok: true,
      campaign: {
        ...campaign,
        status: normalizeCampaignStatusLabel(campaign.status),
        progressPercent,
        processedCount,
        canRetryFailed: Number(campaign.failed_count || 0) > 0,
      },
      recentRecipients,
      failedRecipients,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao carregar status da campanha.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/client-campaigns/:id/retry-failed", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const campaignId = Number(req.params.id);
    if (!campaignId) {
      return res.status(400).json({ error: "ID da campanha invalido." });
    }

    const originalCampaign = await loadClientCampaignById(campaignId);
    const failedRecipients = await supabase
      .from("client_campaign_recipients")
      .select("client_id, client_name, destination_phone, rendered_message")
      .eq("campaign_id", campaignId)
      .eq("local_status", "failed");

    if (failedRecipients.error) {
      throw createHttpError(500, "Erro ao carregar falhas da campanha.", failedRecipients.error.message);
    }

    const recipients = (failedRecipients.data || []).map((row) => ({
      id: row.client_id,
      nome: row.client_name,
      phone: normalizePhone(row.destination_phone),
      renderedMessage: String(row.rendered_message || "").trim(),
      country: inferPhoneCountry(row.destination_phone),
    })).filter((row) => row.phone && row.renderedMessage);

    if (!recipients.length) {
      return res.status(400).json({ error: "Nao existem destinatarios com falha para reenviar." });
    }

    const retryCampaign = await createClientCampaignAudit({
      segment: originalCampaign.segment,
      searchTerm: originalCampaign.search_term,
      withOrders: originalCampaign.with_orders,
      messageTemplate: originalCampaign.message_template,
      targetCount: recipients.length,
      validCount: recipients.length,
      skippedCount: 0,
      status: "queued",
      createdBy: req.body?.createdBy || actor?.name || actor?.id || null,
      metadata: {
        channel: "whatsapp",
        retryOfCampaignId: campaignId,
        filters: originalCampaign.metadata?.filters || {},
        schedule: {
          mode: "now",
          scheduledAt: null,
          windowStart: null,
          windowEnd: null,
          nextRunAt: null,
        },
        progress: {
          state: "queued",
          processedCount: 0,
          totalCount: recipients.length,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    if (!retryCampaign?.id) {
      throw createHttpError(500, "Nao foi possivel criar a campanha de reenvio.");
    }

    const recipientSnapshot = recipients.map((recipient) => ({
      ...recipient,
      normalizedPhone: recipient.phone,
    }));

    setTimeout(() => {
      executeClientCampaign(retryCampaign.id, recipientSnapshot).catch((error) => {
        console.error(`Falha ao reenviar campanha ${retryCampaign.id}`, error?.message || error);
      });
    }, 0);

    return res.json({
      ok: true,
      campaignId: retryCampaign.id,
      retryCount: recipients.length,
      status: "queued",
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao reenviar falhas da campanha.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/finance/overview", async (req, res) => {
  const startedAt = Date.now();
  try {
    await requireAssistantAdmin(req);
    const payload = await buildFinanceOverviewPayload(req.query);
    logPerf("route.finance_overview", startedAt, {
      expensesTotal: payload?.expensesTotal || 0,
      payrollTotal: payload?.payrollTotal || 0,
    });
    return res.json(payload);
  } catch (error) {
    logPerf("route.finance_overview", startedAt, { error: error?.message || "unknown" });
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao carregar consolidado financeiro.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/reports/operational", async (req, res) => {
  const startedAt = Date.now();
  try {
    await requireAssistantAdmin(req);
    const report = await buildOperationalReport(req.query);
    logPerf("route.operational_report", startedAt, {
      timeline: report?.timeline?.length || 0,
      totalSales: report?.summary?.total_sales || 0,
    });
    return res.json({ ok: true, report });
  } catch (error) {
    logPerf("route.operational_report", startedAt, { error: error?.message || "unknown" });
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao montar relatorios.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/reports/operational.csv", async (req, res) => {
  try {
    await requireAssistantAdmin(req);
    const report = await buildOperationalReport(req.query);
    const rows = [
      buildCsvRow(["tipo", "chave", "valor"]),
      buildCsvRow(["summary", "delivery_sales_total", report.summary.delivery_sales_total]),
      buildCsvRow(["summary", "delivery_sales_count", report.summary.delivery_sales_count || 0]),
      buildCsvRow(["summary", "store_sales_total", report.summary.store_sales_total]),
      buildCsvRow(["summary", "store_sales_count", report.summary.store_sales_count]),
      buildCsvRow(["summary", "total_sales", report.summary.total_sales]),
      buildCsvRow(["summary", "expenses_total", report.summary.expenses_total]),
      buildCsvRow(["summary", "payroll_total", report.summary.payroll_total]),
      ...report.sales_by_payment.map((row) => buildCsvRow(["payment", row.payment_method, row.total])),
      ...report.orders_by_status.map((row) => buildCsvRow(["order_status", row.status, row.count])),
      ...report.expenses_by_category.map((row) => buildCsvRow(["expense_category", row.category, row.total])),
      ...report.payroll_by_employee.map((row) => buildCsvRow(["payroll", row.employee_name, row.total])),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-operacional-${report.range.startDate}-${report.range.endDate}.csv"`);
    return res.send(rows.join("\n"));
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao exportar relatorio.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/assistant/query", async (req, res) => {
  try {
    const actor = await requireAssistantAdmin(req);
    const question = String(req.body?.question || "").trim();
    if (!question) {
      return res.status(400).json({ error: "question obrigatoria." });
    }
    const payload = await assistantService.answerQuestion({
      question,
      conversationId: req.body?.conversationId || null,
      confirmation: req.body?.confirmation || null,
      actor,
    });
    return res.json(payload);
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno no assistente.",
      detail: error?.detail || null,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);
  void restoreScheduledClientCampaigns();
});
