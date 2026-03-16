import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { createAssistantService } from "./assistant.js";

const app = express();
app.use(express.json({ limit: "20mb" }));

const allowedOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (!allowedOrigins.length || allowedOrigins.includes("*")) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS bloqueado para origin: ${origin}`));
    },
  }),
);

const PORT = Number(process.env.PORT || 3001);
const KG_TO_LB = 2.2046226218;
const MAX_B64_BYTES = Number(process.env.MAX_INVOICE_UPLOAD_BYTES || 15 * 1024 * 1024);

const STATUS = {
  RECEBIDO: 0,
  CONFIRMADO: 1,
  PREPARO: 2,
  PRONTO: 3,
  ENTREGA: 4,
  CONCLUIDO: 5,
};

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
    .select("id, nome, email, tipo, auth_user_id")
    .eq("auth_user_id", authData.user.id)
    .order("id", { ascending: false })
    .limit(1);

  if (!byAuthUser.error && byAuthUser.data?.[0]) {
    profile = byAuthUser.data[0];
  }

  if (!profile && email) {
    const byEmail = await supabase
      .from("users")
      .select("id, nome, email, tipo")
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

function normalizePhone(rawPhone) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;
  const countryCode = process.env.DEFAULT_COUNTRY_CODE || "55";
  return `${countryCode}${digits}`;
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

function buildMessage({ type, name, code, orderItems, orderTotal, locale, deliveryAddress }) {
  const isEn = locale === "en";
  const safeName = String(name || "").trim() || (isEn ? "customer" : "cliente");
  const itemsLines = (orderItems || []).map((item) => `- ${item.nome}: ${formatQuantity(item.quantidade)}`);
  const totalLabel = formatMoney(orderTotal);
  const addressSuffix = deliveryAddress ? ` (${deliveryAddress})` : "";
  const lines = [];

  if (type === "confirmed") {
    if (isEn) {
      lines.push(`Order update: Hi ${safeName}, your order ${code} was confirmed successfully!`);
      lines.push("");
      lines.push("We have already started preparing your items.");
      lines.push("Products sold by weight (KG/LB) may have a small price variation after weighing and packaging.");
    } else {
      lines.push(`Atualizacao do pedido: Ola ${safeName}, seu pedido ${code} foi confirmado com sucesso!`);
      lines.push("");
      lines.push("Ja comecamos a preparacao dos itens.");
      lines.push("Produtos vendidos por peso (KG/LB) podem ter pequena variacao de valor apos pesagem e embalagem.");
    }
  } else if (type === "review_request") {
    if (isEn) {
      lines.push(`Hi ${safeName}, your order ${code} was completed successfully.`);
      lines.push("");
      lines.push("Could you reply to this message with a quick review of your experience?");
      lines.push("Your feedback helps us improve the service.");
    } else {
      lines.push(`Ola ${safeName}, seu pedido ${code} foi concluido com sucesso.`);
      lines.push("");
      lines.push("Voce pode responder esta mensagem com uma avaliacao rapida da sua experiencia?");
      lines.push("Seu feedback ajuda a melhorar nosso atendimento.");
    }
  } else if (isEn) {
    lines.push(`Delivery update: Hi ${safeName}, your order ${code} is out for delivery!`);
    lines.push("");
    lines.push(`It will arrive at your address shortly${addressSuffix}.`);
    lines.push("");
    lines.push("Thank you for your preference.");
  } else {
    lines.push(`Atualizacao de entrega: Ola ${safeName}, seu pedido ${code} saiu para entrega!`);
    lines.push("");
    lines.push(`Em breve ele chegara ao endereco informado${addressSuffix}.`);
    lines.push("");
    lines.push("Obrigado pela preferencia.");
  }

  if (itemsLines.length > 0) {
    lines.push("");
    lines.push(isEn ? "Order items:" : "Itens do pedido:");
    lines.push(...itemsLines);
  }

  if (totalLabel) {
    lines.push("");
    lines.push(`${isEn ? "Estimated total" : "Total estimado"}: ${totalLabel}`);
  }

  return lines.join("\n");
}

function formatPaymentMethodLabel(paymentMethod, locale = "pt") {
  const isEn = locale === "en";
  switch (String(paymentMethod || "").toLowerCase()) {
    case "pix":
      return "Pix";
    case "cartao":
      return isEn ? "Card" : "Cartao";
    case "dinheiro":
      return isEn ? "Cash" : "Dinheiro";
    default:
      return paymentMethod ? String(paymentMethod) : (isEn ? "Not informed" : "Nao informado");
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

  const phoneExistsEndpoint = `${baseUrl}/instances/${instanceId}/token/${instanceToken}/phone-exists/${encodeURIComponent(phone)}`;
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

  const resolvedPhone = String(phoneExistsResult.data?.phone || phone || "").replace(/\D/g, "");
  if (!resolvedPhone) {
    return { ok: false, reason: "phone-not-on-whatsapp" };
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

async function sendStatusNotification({ previousStatus, newStatus, clientName, clientPhone, orderCode, orderItems, orderTotal, locale, deliveryAddress }) {
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

  const message = buildMessage({ type, name: clientName || "cliente", code: orderCode, orderItems, orderTotal, locale, deliveryAddress });

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

  return {
    sent: false,
    queued: true,
    deliveryStatus: "pending",
    messageId: sendResult.messageId || null,
    zaapId: sendResult.zaapId || null,
    eventType,
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

    const { error: updateBatchError } = await supabase
      .from("batches")
      .update({ quantidade_disponivel: nextQty })
      .eq("id", step.batchId);

    if (updateBatchError) throw createHttpError(500, "Erro ao atualizar saldo do lote.", updateBatchError.message);

    const { error: movementError } = await supabase
      .from("stock_movements")
      .insert([
        {
          tipo: "exit",
          produto_id: step.productId,
          batch_id: step.batchId,
          qty: step.consumeInStockUnit,
          unit: step.productUnit,
          source_type: "order",
          source_id: sourceId,
          metadata: { reason: "order_concluded" },
        },
      ]);

    if (movementError) {
      const duplicated = String(movementError.message || "").toLowerCase().includes("duplicate") ||
        String(movementError.code || "") === "23505";
      if (!duplicated) throw createHttpError(500, "Erro ao registrar movimentacao de saida.", movementError.message);
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
    if (movement.batch_id) {
      const { data: batch, error: batchError } = await supabase
        .from("batches")
        .select("id, quantidade_disponivel")
        .eq("id", movement.batch_id)
        .single();

      if (!batchError && batch) {
        const nextQty = roundQty(parseNumber(batch.quantidade_disponivel, 0) + parseNumber(movement.qty, 0), 3);
        const { error: batchUpdateError } = await supabase
          .from("batches")
          .update({ quantidade_disponivel: nextQty })
          .eq("id", movement.batch_id);

        if (batchUpdateError) throw createHttpError(500, "Erro ao atualizar lote no estorno de estoque.", batchUpdateError.message);
      }
    }

    const { error: reversalError } = await supabase
      .from("stock_movements")
      .insert([
        {
          tipo: "reversal",
          produto_id: movement.produto_id,
          batch_id: movement.batch_id,
          qty: movement.qty,
          unit: normalizeStockUnit(movement.unit, "LB"),
          source_type: "order",
          source_id: sourceId,
          metadata: { reversed_from_movement_id: movement.id, reason },
        },
      ]);

    if (reversalError) {
      const duplicated = String(reversalError.message || "").toLowerCase().includes("duplicate") ||
        String(reversalError.code || "") === "23505";
      if (!duplicated) throw createHttpError(500, "Erro ao registrar movimentacao de estorno.", reversalError.message);
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

      const { error: updateBatchError } = await supabase
        .from("batches")
        .update({ quantidade_disponivel: nextQty })
        .eq("id", step.batchId);

      if (updateBatchError) throw createHttpError(500, "Erro ao atualizar saldo do lote da venda presencial.", updateBatchError.message);

      appliedSteps.push(step);

      const { error: movementError } = await supabase
        .from("stock_movements")
        .insert([
          {
            tipo: "exit",
            produto_id: step.productId,
            batch_id: step.batchId,
            qty: step.consumeInStockUnit,
            unit: step.productUnit,
            source_type: "manual",
            source_id: sourceId,
            metadata: { reason, origin: "store_sale" },
          },
        ]);

      if (movementError) {
        throw createHttpError(500, "Erro ao registrar movimentacao de estoque da venda presencial.", movementError.message);
      }

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

function isMissingRelationError(error, relationName) {
  const message = String(error?.message || "");
  return message.includes(`Could not find the table 'public.${relationName}'`) ||
    message.includes(`relation \"${relationName}\" does not exist`);
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

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await fetch(endpoint, { method: "GET", headers });
      const result = await readApiResponse(response);
      if (!response.ok || result.data?.error) continue;

      const phoneCandidate = extractMessageIdentifier(result.data, [
        "phone",
        "number",
        "connectedPhone",
        "connectedNumber",
        "device.phone",
        "device.number",
        "me.phone",
        "me.number",
        "instance.phone",
        "instance.number",
        "data.phone",
        "data.number",
        "connected.phone",
      ]);

      const normalized = normalizePhone(phoneCandidate);
      if (normalized) {
        return { ok: true, phone: normalized, source: endpoint };
      }
    } catch {
      // tenta proximo endpoint
    }
  }

  return { ok: false, reason: "store-phone-discovery-failed" };
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

function normalizeSortDirection(value) {
  return String(value || "").trim().toLowerCase() === "desc" ? "desc" : "asc";
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

  const [{ data: clients, error: clientsError }, { data: items, error: itemsError }] = await Promise.all([
    clientIds.length
      ? supabase
          .from("clients")
          .select("id, nome, telefone, cidade, endereco_rua, endereco_numero, endereco_complemento, cep, estado")
          .in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from("order_items")
          .select("pedido_id, produto_id, quantidade")
          .in("pedido_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (clientsError) {
    throw createHttpError(500, "Erro ao carregar clientes dos pedidos.", clientsError.message);
  }

  if (itemsError) {
    throw createHttpError(500, "Erro ao carregar itens dos pedidos.", itemsError.message);
  }

  const productIds = Array.from(new Set((items || []).map((item) => Number(item.produto_id)).filter(Boolean)));
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
    const key = Number(item.pedido_id);
    const current = itemsByOrderId.get(key) || [];
    current.push(item);
    itemsByOrderId.set(key, current);
  }

  let rows = (orders || []).map((order) => {
    const client = clientsMap.get(String(getOrderClientId(order) || ""));
    const orderItems = itemsByOrderId.get(Number(order.id)) || [];
    const productsSummary = orderItems.map((item) => ({
      productId: item.produto_id,
      name: productsMap.get(Number(item.produto_id)) || `Produto ${item.produto_id}`,
      quantity: Number(item.quantidade || 0),
      label: `${productsMap.get(Number(item.produto_id)) || `Produto ${item.produto_id}`} (${formatQuantity(item.quantidade)}x)`,
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

async function buildFinanceOverviewPayload(query) {
  const range = resolveRangeFromQuery(query);
  const [{ data: expenses, error: expensesError }, { data: payments, error: paymentsError }] = await Promise.all([
    supabase
      .from("expenses")
      .select("category, amount")
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
  const payrollByEmployee = {};

  for (const expense of expenses || []) {
    const key = expense.category || "outras";
    expensesByCategory[key] = roundQty((expensesByCategory[key] || 0) + parseNumber(expense.amount, 0), 2);
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
    payrollByEmployee: Object.entries(payrollByEmployee).map(([employee_name, total]) => ({ employee_name, total })),
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
  const normalizedPhone = normalizePhone(payload?.clientPhone || payload?.telefone || "");
  const normalizedEmail = String(payload?.clientEmail || payload?.email || "").trim().toLowerCase() || null;
  const authUserId = String(payload?.authUserId || "").trim() || null;
  const locale = normalizeLocale(payload?.locale || "pt");

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
      .eq("telefone", normalizedPhone)
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
    pais: payload?.pais || "USA",
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

async function buildOperationalReport(rangeQuery = {}) {
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

const assistantService = createAssistantService({
  supabase,
  normalizeSearchText,
  buildOperationalReport,
  callGeminiText,
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/stock/products/create-from-invoice", async (req, res) => {
  try {
    const rawName = String(req.body?.name || req.body?.description || "").trim();
    const cleanedName = sanitizeInvoiceProductName(rawName);
    if (!cleanedName) {
      return res.status(400).json({ error: "Nome do produto invalido para criacao." });
    }

    const stockUnit = normalizeStockUnit(req.body?.stock_unit || req.body?.unit || "LB", "LB");
    const category = String(req.body?.category || "Nao categorizado").trim() || "Nao categorizado";
    const forceCreate = Boolean(req.body?.force_create);
    const requestedTenantId = Number.parseInt(String(req.body?.tenant_id || ""), 10);
    const safeRequestedTenantId = Number.isFinite(requestedTenantId) && requestedTenantId > 0
      ? requestedTenantId
      : null;

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, nome, nome_en")
      .order("id", { ascending: true });

    if (productsError) {
      return res.status(500).json({ error: "Erro ao verificar duplicidade de produto.", detail: productsError.message });
    }

    const candidate = normalizeSearchText(cleanedName);
    const suggestions = (products || [])
      .map((product) => {
        const aliases = [product.nome, product.nome_en]
          .filter(Boolean)
          .map((item) => normalizeSearchText(item));

        let best = 0;
        for (const alias of aliases) {
          best = Math.max(best, similarityScore(candidate, alias));
        }

        return {
          product_id: Number(product.id),
          product_name: product.nome,
          score: Number(best.toFixed(3)),
        };
      })
      .filter((item) => item.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const topSuggestion = suggestions[0] || null;
    if (topSuggestion && topSuggestion.score >= 0.6 && !forceCreate) {
      return res.status(409).json({
        error: "Produto parecido encontrado. Revise antes de criar para evitar duplicacao.",
        require_force: true,
        suggested_name: cleanedName,
        suggested_matches: suggestions,
      });
    }

    const baseInsertPayload = {
      nome: cleanedName,
      categoria: category,
      unidade: stockUnit,
      stock_unit: stockUnit,
      stock_enabled: true,
      stock_min: 0,
      preco: 0,
    };

    let { data: created, error: createError } = await supabase
      .from("products")
      .insert([baseInsertPayload])
      .select("id, nome, categoria, unidade, stock_unit, stock_enabled, stock_min, tenant_id")
      .single();

    // Compatibilidade com bases em que products.tenant_id eh obrigatorio.
    if (createError && String(createError.message || "").toLowerCase().includes("tenant_id")) {
      let tenantIdToUse = safeRequestedTenantId;

      if (!tenantIdToUse) {
        const { data: tenantSample } = await supabase
          .from("products")
          .select("tenant_id")
          .not("tenant_id", "is", null)
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();

        const sampleTenantId = Number.parseInt(String(tenantSample?.tenant_id || ""), 10);
        if (Number.isFinite(sampleTenantId) && sampleTenantId > 0) {
          tenantIdToUse = sampleTenantId;
        }
      }

      if (!tenantIdToUse) {
        const envTenantId = Number.parseInt(String(process.env.DEFAULT_TENANT_ID || "1"), 10);
        if (Number.isFinite(envTenantId) && envTenantId > 0) {
          tenantIdToUse = envTenantId;
        }
      }

      if (tenantIdToUse) {
        const retry = await supabase
          .from("products")
          .insert([{ ...baseInsertPayload, tenant_id: tenantIdToUse }])
          .select("id, nome, categoria, unidade, stock_unit, stock_enabled, stock_min, tenant_id")
          .single();

        created = retry.data;
        createError = retry.error;
      }
    }

    if (createError || !created) {
      return res.status(500).json({
        error: "Erro ao criar novo produto a partir da nota.",
        detail: createError?.message || null,
      });
    }

    return res.json({
      ok: true,
      product: created,
      suggested_matches: suggestions,
      dedup_checked: true,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao criar produto da nota.",
      detail: error?.detail || null,
    });
  }
});

app.patch("/api/stock/products/:id/settings", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: "product_id invalido." });
    }

    const payload = {};
    if (Object.prototype.hasOwnProperty.call(req.body, "stock_enabled")) {
      payload.stock_enabled = Boolean(req.body.stock_enabled);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "stock_min")) {
      const stockMin = parseNumber(req.body.stock_min, NaN);
      if (!Number.isFinite(stockMin) || stockMin < 0) {
        return res.status(400).json({ error: "stock_min invalido. Informe numero >= 0." });
      }
      payload.stock_min = roundQty(stockMin, 3);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "stock_unit")) {
      payload.stock_unit = normalizeStockUnit(req.body.stock_unit, "LB");
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: "Nenhum campo de configuracao informado." });
    }

    const { data, error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", productId)
      .select("id, nome, stock_enabled, stock_min, stock_unit")
      .single();

    if (error || !data) {
      return res.status(500).json({ error: "Erro ao atualizar configuracao do produto.", detail: error?.message || null });
    }

    await syncLowStockAlerts([productId]);
    return res.json({ ok: true, product: data });
  } catch (error) {
    return res.status(500).json({
      error: "Erro interno ao atualizar configuracao de estoque.",
      detail: String(error?.message || error),
    });
  }
});

app.post("/api/stock/entries/manual", async (req, res) => {
  try {
    const productId = Number(req.body?.product_id);
    const qtyRaw = parseNumber(req.body?.qty, NaN);
    const inputUnit = normalizeStockUnit(req.body?.unit || "LB", "LB");

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: "product_id invalido." });
    }

    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) {
      return res.status(400).json({ error: "qty invalido. Informe numero > 0." });
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, nome, unidade, stock_unit, stock_enabled")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return res.status(404).json({ error: "Produto nao encontrado.", detail: productError?.message || null });
    }

    const stockUnit = normalizeStockUnit(product.stock_unit || product.unidade || "LB", "LB");
    const qtyInStockUnit = roundQty(convertQuantity(qtyRaw, inputUnit, stockUnit), 3);

    const costTotal = parseNumber(req.body?.custo_total, NaN);
    const unitCost = parseNumber(req.body?.custo_unitario, NaN);
    const safeCostTotal = Number.isFinite(costTotal) ? roundQty(costTotal, 2) : null;
    const safeUnitCost = Number.isFinite(unitCost)
      ? roundQty(unitCost, 4)
      : (safeCostTotal != null ? roundQty(safeCostTotal / qtyRaw, 4) : null);

    const { data: newBatch, error: batchError } = await supabase
      .from("batches")
      .insert([
        {
          produto_id: productId,
          quantidade: qtyInStockUnit,
          quantidade_disponivel: qtyInStockUnit,
          unidade: stockUnit,
          origem: req.body?.origem || null,
          custo_total: safeCostTotal,
          custo_unitario: safeUnitCost,
          observacoes: req.body?.observacoes || null,
          data_validade: req.body?.data_validade || null,
          data_entrada: req.body?.data_entrada || new Date().toISOString(),
        },
      ])
      .select("id, produto_id, quantidade, quantidade_disponivel, unidade, data_validade, data_entrada")
      .single();

    if (batchError || !newBatch) {
      return res.status(500).json({ error: "Erro ao cadastrar lote manual.", detail: batchError?.message || null });
    }

    const { data: movement, error: movementError } = await supabase
      .from("stock_movements")
      .insert([
        {
          tipo: "entry",
          produto_id: productId,
          batch_id: newBatch.id,
          qty: qtyInStockUnit,
          unit: stockUnit,
          source_type: "manual",
          source_id: String(newBatch.id),
          metadata: {
            origem: req.body?.origem || null,
            notes: req.body?.observacoes || null,
            input_qty: qtyRaw,
            input_unit: inputUnit,
          },
        },
      ])
      .select("id, created_at")
      .single();

    if (movementError) {
      return res.status(500).json({ error: "Erro ao registrar movimentacao manual.", detail: movementError.message });
    }

    if (!product.stock_enabled) {
      await supabase
        .from("products")
        .update({ stock_enabled: true, stock_unit: stockUnit })
        .eq("id", productId);
    }

    await syncLowStockAlerts([productId]);

    const { data: balanceRow } = await supabase
      .from("stock_balances")
      .select("saldo_qty, last_movement_at")
      .eq("produto_id", productId)
      .maybeSingle();

    return res.json({ ok: true, batch: newBatch, movement, balance: balanceRow || null });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao cadastrar entrada manual.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/stock/balance", async (_req, res) => {
  try {
    const { rows, summary } = await getStockBalanceRows();
    return res.json({ ok: true, rows, summary, generated_at: new Date().toISOString() });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao carregar saldo de estoque.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/stock/alerts", async (_req, res) => {
  try {
    const alerts = await getLowStockAlerts();
    return res.json({ ok: true, alerts, generated_at: new Date().toISOString() });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao carregar alertas de estoque.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/stock/invoices/upload", async (req, res) => {
  try {
    const fileName = sanitizeFileName(req.body?.fileName || "nota-fiscal.jpg");
    const base64Parsed = parseBase64Input(req.body?.fileBase64);
    const mimeType = req.body?.mimeType || base64Parsed.mimeType || "image/jpeg";

    const buffer = Buffer.from(base64Parsed.base64, "base64");
    if (!buffer.length) return res.status(400).json({ error: "Arquivo base64 invalido." });
    if (buffer.length > MAX_B64_BYTES) {
      return res.status(400).json({ error: `Arquivo excede limite de ${MAX_B64_BYTES} bytes para upload de nota fiscal.` });
    }

    const bucket = process.env.SUPABASE_INVOICE_BUCKET || "invoice-imports";
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;
    const filePath = `stock-invoices/${yyyy}/${mm}/${uniqueName}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

    if (uploadError) {
      return res.status(500).json({
        error: "Erro ao subir arquivo da nota fiscal no Storage.",
        detail: uploadError.message,
      });
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const fileUrl = publicUrlData?.publicUrl || null;

    const { data: invoice, error: insertError } = await supabase
      .from("invoice_imports")
      .insert([{ status: "uploaded", file_bucket: bucket, file_path: filePath, file_url: fileUrl, created_by: req.body?.createdBy || null }])
      .select("*")
      .single();

    if (insertError || !invoice) {
      return res.status(500).json({
        error: "Erro ao criar registro de importacao da nota.",
        detail: insertError?.message || null,
      });
    }

    return res.json({ ok: true, invoice });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno no upload da nota fiscal.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/stock/invoices/:id/process", async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ error: "invoice_id invalido." });
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoice_imports")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({ error: "Importacao da nota nao encontrada.", detail: invoiceError?.message || null });
    }

    let ocrText = "";
    try {
      ocrText = await callPaperlessOcr({ invoiceRecord: invoice, ocrHint: req.body?.ocr_text });
    } catch (ocrError) {
      await supabase
        .from("invoice_imports")
        .update({ status: "failed", error: ocrError?.message || "Falha no OCR" })
        .eq("id", invoiceId);

      throw ocrError;
    }

    let aiJson;
    try {
      aiJson = await callGeminiExtraction({
        ocrText,
        locale: normalizeLocale(req.body?.locale || "pt"),
        invoiceRecord: invoice,
      });
    } catch (geminiError) {
      aiJson = buildFallbackInvoiceJson(ocrText);
      const geminiDetail = [geminiError?.message, geminiError?.detail].filter(Boolean).join(" | ");

      await supabase
        .from("invoice_imports")
        .update({
          status: "review_required",
          ocr_text: ocrText || null,
          ai_json: aiJson,
          error: geminiDetail || "Falha na extracao IA",
          processed_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      return res.status(202).json({
        ok: true,
        warning: "Processamento da nota nao conseguiu extrair dados automaticamente. Revisao manual obrigatoria.",
        detail: geminiError?.detail || geminiError?.message || null,
        ai_json: aiJson,
      });
    }

    const hasItems = Array.isArray(aiJson?.items) && aiJson.items.length > 0;

    const { error: updateError } = await supabase
      .from("invoice_imports")
      .update({
        status: hasItems ? "processed" : "review_required",
        ocr_text: ocrText || null,
        ai_json: aiJson,
        error: null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (updateError) {
      return res.status(500).json({ error: "Erro ao salvar resultado de processamento da nota.", detail: updateError.message });
    }

    return res.json({ ok: true, ai_json: aiJson, status: hasItems ? "processed" : "review_required" });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao processar nota fiscal.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/stock/invoices/:id/apply", async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ error: "invoice_id invalido." });
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoice_imports")
      .select("id, status, ai_json, review_json")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({ error: "Importacao da nota nao encontrada.", detail: invoiceError?.message || null });
    }

    const basePayload = req.body?.review_json || req.body || invoice.review_json || invoice.ai_json || {};
    const resolvedItems = await resolveProductIdsForInvoiceItems(basePayload.items || []);

    const normalizedPayload = {
      supplier: basePayload.supplier || null,
      invoice_number: basePayload.invoice_number || null,
      invoice_date: basePayload.invoice_date || null,
      items: resolvedItems.map((item) => ({
        product_id: item.product_id || null,
        description: item.description || item.descricao || item.product_service || item.productService || "",
        quantity: parseLooseNumber(item.quantity ?? item.qty, NaN),
        unit: normalizeStockUnit(item.unit || "LB", "LB"),
        unit_cost: parseLooseNumber(item.unit_cost ?? item.valor_unitario ?? item.price, NaN),
        total: parseLooseNumber(item.total ?? item.valor_total, NaN),
        expiry_date: item.expiry_date || null,
      })),
    };

    const invalidItems = normalizedPayload.items
      .map((item, index) => {
        const missingProduct = !item.product_id;
        const invalidQuantity = !Number.isFinite(item.quantity) || item.quantity <= 0;
        return {
          ...item,
          index,
          reason: [
            missingProduct ? "missing_product" : null,
            invalidQuantity ? "invalid_quantity" : null,
          ].filter(Boolean),
        };
      })
      .filter((item) => item.reason.length > 0);

    if (invalidItems.length > 0) {
      return res.status(400).json({
        error: "Revisao obrigatoria: existem itens sem produto mapeado ou quantidade invalida.",
        invalid_items: invalidItems,
      });
    }

    const { data: applied, error: applyError } = await supabase.rpc("apply_invoice_import", {
      p_invoice_id: invoiceId,
      p_payload: normalizedPayload,
    });

    if (applyError) {
      const applyMessage = String(applyError.message || "").toLowerCase();
      const alreadyApplied = applyMessage.includes("ja aplicado") || applyMessage.includes("ja possui entradas aplicadas");
      if (!alreadyApplied) {
        return res.status(500).json({ error: "Erro ao aplicar nota fiscal no estoque.", detail: applyError.message });
      }
    }

    const reconciliation = await ensureInvoiceStockMovements(invoiceId);
    const changedProducts = Array.from(new Set([
      ...normalizedPayload.items.map((item) => Number(item.product_id)).filter(Boolean),
      ...reconciliation.changed_products,
    ]));

    if (changedProducts.length > 0) {
      const { error: enableError } = await supabase
        .from("products")
        .update({ stock_enabled: true })
        .in("id", changedProducts);

      if (enableError) {
        return res.status(500).json({
          error: "Nota aplicada, mas falhou ao ativar controle de estoque dos produtos.",
          detail: enableError.message,
        });
      }
    }

    await syncLowStockAlerts(changedProducts);

    return res.json({
      ok: true,
      result: applied || { ok: true, idempotent: true },
      changed_products: changedProducts,
      reconciliation,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao aplicar nota fiscal.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const itemsInput = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!itemsInput.length) {
      return res.status(400).json({ error: "Informe ao menos um item no pedido." });
    }

    const normalizedItems = itemsInput.map((item, index) => {
      const productId = Number(item?.produtoId || item?.productId || item?.produto_id || item?.product_id);
      const quantity = parseNumber(item?.kg ?? item?.quantidade ?? item?.quantity, NaN);
      const unitPrice = parseNumber(item?.precoKg ?? item?.preco_unitario ?? item?.price ?? item?.preco, NaN);

      if (!productId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw createHttpError(400, `Item ${index + 1} invalido no pedido.`);
      }

      return {
        produto_id: productId,
        quantidade: roundQty(quantity, 3),
        preco_unitario: roundQty(unitPrice, 2),
        unidade: normalizeStockUnit(item?.unidade || item?.unit || "LB", "LB"),
        tipo_corte: item?.tipoCorte || item?.tipo_corte || null,
        observacoes: item?.observacoes || null,
        nome: item?.nome || `Produto ${productId}`,
      };
    });

    const client = await upsertClientFromOrderPayload(req.body);
    const total = roundQty(
      normalizedItems.reduce((acc, item) => acc + parseNumber(item.quantidade, 0) * parseNumber(item.preco_unitario, 0), 0),
      2,
    );

    const orderPayload = {
      cliente_id: client.id,
      email_cliente: client.email || null,
      data_pedido: new Date().toISOString(),
      status: STATUS.RECEBIDO,
      valor_total: total,
      tenant_id: Number(req.body?.tenantId || 1),
      locale: normalizeLocale(req.body?.locale || client.preferred_locale || "pt"),
      source: "delivery",
      payment_method: req.body?.paymentMethod || req.body?.pagamento || null,
      change_for: parseLooseNumber(req.body?.changeFor || req.body?.trocoPara, null),
      delivery_mode: String(req.body?.deliveryMode || req.body?.modoEntrega || "entrega").toLowerCase() === "retirada" ? "retirada" : "entrega",
      delivery_date: req.body?.deliveryDate || req.body?.dataEntrega || null,
      delivery_time: req.body?.deliveryTime || req.body?.horarioEntrega || null,
      notes: req.body?.notes || req.body?.observacoesGerais || null,
    };

    const order = await insertOrderWithSchemaFallback(orderPayload);

    const itemPayload = normalizedItems.map((item) => ({
      pedido_id: order.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      unidade: item.unidade,
      tipo_corte: item.tipo_corte,
      observacoes: item.observacoes,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(itemPayload);
    if (itemsError) {
      await supabase.from("orders").delete().eq("id", order.id);
      return res.status(500).json({ error: "Erro ao salvar itens do pedido.", detail: itemsError.message });
    }

    const orderCode = resolveOrderCode(order);
    const deliveryAddress = resolveDeliveryAddress(client);
    const notification = await sendStoreOrderNotification({
      orderId: order.id,
      orderCode,
      clientName: client.nome,
      clientPhone: client.telefone,
      deliveryAddress,
      paymentMethod: order.payment_method,
      deliveryMode: order.delivery_mode,
      deliveryDate: order.delivery_date,
      deliveryTime: order.delivery_time,
      notes: order.notes,
      orderItems: normalizedItems,
      orderTotal: total,
    });

    return res.status(201).json({
      ok: true,
      order: {
        id: order.id,
        code: orderCode,
        total,
        status: order.status,
      },
      notification,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao criar pedido.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/orders/:id/messages", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("order_id", req.params.id)
      .order("created_at", { ascending: true });

    if (error) {
      return res.status(500).json({ error: "Erro ao carregar mensagens do pedido.", detail: error.message });
    }

    return res.json({ ok: true, messages: data || [] });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao carregar mensagens do pedido." });
  }
});

app.post("/api/zapi/webhook", async (req, res) => {
  const payload = req.body || {};
  const meta = extractWebhookMessageMeta(payload);
  const allMessageIds = Array.from(new Set([meta.messageId, ...(meta.messageIds || [])].filter(Boolean)));

  let matchedOrderId = null;
  if (allMessageIds.length || meta.zaapId) {
    const matcher = allMessageIds.length
      ? supabase.from("whatsapp_messages").select("order_id").in("message_id", allMessageIds).limit(1)
      : supabase.from("whatsapp_messages").select("order_id").eq("zaap_id", meta.zaapId).limit(1);
    const { data } = await matcher;
    matchedOrderId = data?.[0]?.order_id || null;
  }

  const webhookInsert = await supabase
    .from("whatsapp_webhook_events")
    .insert([{
      order_id: matchedOrderId,
      event_type: meta.eventType || null,
      message_id: allMessageIds[0] || null,
      zaap_id: meta.zaapId,
      payload,
      processed_at: new Date().toISOString(),
    }])
    .select("*")
    .maybeSingle();

  const localStatus = normalizeLocalMessageStatus(meta.eventType);
  if (allMessageIds.length) {
    await updateWhatsAppMessagesByIds({
      messageIds: allMessageIds,
      localStatus,
      providerResponse: payload,
      errorDetail: localStatus === "failed" ? JSON.stringify(payload) : null,
    });
  } else if (meta.zaapId) {
    await updateWhatsAppMessageStatus({
      messageId: null,
      zaapId: meta.zaapId,
      localStatus,
      providerResponse: payload,
      errorDetail: localStatus === "failed" ? JSON.stringify(payload) : null,
    });
  }

  return res.json({
    ok: true,
    matched_order_id: matchedOrderId,
    event_id: webhookInsert.data?.id || null,
    local_status: localStatus,
    message_ids: allMessageIds,
  });
});

app.get("/api/store-sales", async (req, res) => {
  try {
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
      payment_method: String(req.body?.paymentMethod || "").trim() || "nao_informado",
      notes: req.body?.notes || null,
      created_by: req.body?.createdBy || null,
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

app.get("/api/expenses", async (req, res) => {
  try {
    const range = resolveRangeFromQuery(req.query);
    let query = supabase
      .from("expenses")
      .select("*")
      .gte("competency_date", range.startDate)
      .lte("competency_date", range.endDate)
      .order("competency_date", { ascending: false });

    const category = String(req.query?.category || "").trim();
    if (category) query = query.eq("category", category);

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
    const range = resolveRangeFromQuery(req.query);
    const { data, error } = await supabase
      .from("expenses")
      .select("category, amount")
      .gte("competency_date", range.startDate)
      .lte("competency_date", range.endDate);

    if (error) {
      return res.status(500).json({ error: "Erro ao consolidar despesas.", detail: error.message });
    }

    const byCategory = {};
    for (const item of data || []) {
      const key = item.category || "outras";
      byCategory[key] = roundQty((byCategory[key] || 0) + parseNumber(item.amount, 0), 2);
    }

    return res.json({
      ok: true,
      range,
      total: roundQty((data || []).reduce((acc, item) => acc + parseNumber(item.amount, 0), 0), 2),
      by_category: Object.entries(byCategory).map(([category, total]) => ({ category, total })),
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno ao consolidar despesas." });
  }
});

app.post("/api/expenses", async (req, res) => {
  try {
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
      amount: roundQty(amount, 2),
      competency_date: String(req.body?.competencyDate || "").slice(0, 10),
      posted_at: normalizeDateInput(req.body?.postedAt || new Date().toISOString(), new Date().toISOString()),
      notes: req.body?.notes || null,
      attachment_bucket: attachment.bucket,
      attachment_path: attachment.filePath,
      attachment_url: attachment.fileUrl,
      created_by: req.body?.createdBy || null,
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

app.get("/api/employees", async (req, res) => {
  try {
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
      created_by: req.body?.createdBy || null,
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

app.get("/api/orders/admin", async (req, res) => {
  try {
    const range = resolveRangeFromQuery(req.query);
    const payload = await buildOrdersAdminPayload({
      start: range.start,
      end: range.end,
      status: String(req.query?.status || "").trim(),
      city: String(req.query?.city || "").trim(),
      search: String(req.query?.search || "").trim(),
      onlyOpen: String(req.query?.onlyOpen || "").trim().toLowerCase() === "true",
      page: Number(req.query?.page || 1),
      pageSize: Number(req.query?.pageSize || 10),
    });

    return res.json({ ok: true, range, ...payload });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao carregar pedidos administrativos.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/clients/admin", async (req, res) => {
  try {
    const payload = await buildClientsAdminPayload({
      search: String(req.query?.search || "").trim(),
      segment: normalizeClientSegment(req.query?.segment),
      withOrders: String(req.query?.withOrders || "").trim().toLowerCase() === "true",
      page: Number(req.query?.page || 1),
      pageSize: Number(req.query?.pageSize || 10),
      sortField: String(req.query?.sortField || "nome").trim(),
      sortDir: normalizeSortDirection(req.query?.sortDir),
    });

    return res.json({ ok: true, ...payload });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao carregar clientes administrativos.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/client-campaigns/preview", async (req, res) => {
  try {
    const segment = normalizeClientSegment(req.body?.segment);
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "message obrigatoria." });
    }

    const payload = await buildClientsAdminPayload({
      search: String(req.body?.search || "").trim(),
      segment,
      withOrders: Boolean(req.body?.withOrders),
      page: 1,
      pageSize: 5000,
    });

    const validRecipients = payload.allRows
      .map((client) => ({
        id: client.id,
        nome: client.nome,
        vip: Boolean(client.vip),
        order_count: Number(client.order_count || 0),
        phone: normalizePhone(client.telefone),
        previewText: renderClientCampaignMessage(message, client),
      }))
      .filter((client) => client.phone);

    const excludedWithoutPhone = payload.allRows.filter((client) => !normalizePhone(client.telefone)).length;

    return res.json({
      ok: true,
      audienceCount: validRecipients.length,
      excludedWithoutPhone,
      sampleRecipients: validRecipients.slice(0, 3),
      previewText: validRecipients[0]?.previewText || renderClientCampaignMessage(message, { nome: "cliente" }),
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao gerar previa da campanha.",
      detail: error?.detail || null,
    });
  }
});

app.post("/api/client-campaigns/send", async (req, res) => {
  try {
    const segment = normalizeClientSegment(req.body?.segment);
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "message obrigatoria." });
    }

    const payload = await buildClientsAdminPayload({
      search: String(req.body?.search || "").trim(),
      segment,
      withOrders: Boolean(req.body?.withOrders),
      page: 1,
      pageSize: 5000,
    });

    const audience = payload.allRows.map((client) => ({
      id: client.id,
      nome: client.nome,
      telefone: client.telefone,
      phone: normalizePhone(client.telefone),
      renderedMessage: renderClientCampaignMessage(message, client),
    }));

    const validRecipients = audience.filter((client) => client.phone);
    const skippedCount = audience.length - validRecipients.length;
    const fallbackCampaignId = `campaign-${Date.now()}`;
    const campaign = await createClientCampaignAudit({
      segment,
      searchTerm: String(req.body?.search || "").trim(),
      withOrders: Boolean(req.body?.withOrders),
      messageTemplate: message,
      targetCount: audience.length,
      validCount: validRecipients.length,
      skippedCount,
      status: "sending",
      createdBy: req.body?.createdBy || null,
      metadata: { channel: "whatsapp" },
    });
    const campaignId = campaign?.id || fallbackCampaignId;

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of validRecipients) {
      const sendResult = await sendWhatsAppViaZApi({
        phone: recipient.phone,
        message: recipient.renderedMessage,
      });

      if (sendResult?.ok) sentCount += 1;
      else failedCount += 1;

      await persistWhatsAppAttempt({
        orderId: null,
        target: "client_campaign",
        eventType: "client_campaign_broadcast",
        destinationPhone: recipient.phone,
        messageText: recipient.renderedMessage,
        payload: {
          campaignId,
          clientId: recipient.id,
          segment,
        },
        sendResult,
      });

      await insertClientCampaignRecipientAudit({
        campaignId: campaign?.id || null,
        clientId: recipient.id,
        clientName: recipient.nome,
        destinationPhone: recipient.phone,
        renderedMessage: recipient.renderedMessage,
        localStatus: sendResult?.ok ? "queued" : "failed",
        errorDetail: sendResult?.detail || sendResult?.reason || null,
        providerResponse: sendResult || {},
        messageId: sendResult?.messageId || null,
        zaapId: sendResult?.zaapId || null,
      });
    }

    await updateClientCampaignAudit(campaign?.id || null, {
      sentCount,
      failedCount,
      skippedCount,
      validCount: validRecipients.length,
      status: failedCount > 0 ? "completed_with_failures" : "completed",
      metadata: { channel: "whatsapp" },
    });

    return res.json({
      ok: true,
      campaignId,
      targetCount: audience.length,
      sentCount,
      skippedCount,
      failedCount,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao enviar campanha.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/finance/overview", async (req, res) => {
  try {
    const payload = await buildFinanceOverviewPayload(req.query);
    return res.json(payload);
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao carregar consolidado financeiro.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/reports/operational", async (req, res) => {
  try {
    const report = await buildOperationalReport(req.query);
    return res.json({ ok: true, report });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao montar relatorios.",
      detail: error?.detail || null,
    });
  }
});

app.get("/api/reports/operational.csv", async (req, res) => {
  try {
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

app.post("/api/orders/:id/status", async (req, res) => {
  try {
    const orderId = req.params.id;
    const newStatus = Number(req.body?.newStatus);

    if (!Number.isInteger(newStatus) || newStatus < 0 || newStatus > 5) {
      return res.status(400).json({ error: "newStatus invalido. Use inteiro entre 0 e 5." });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Pedido nao encontrado.", detail: orderError?.message || null });
    }

    const previousStatus = Number(order.status ?? 0);

    let stock = { applied: false, reason: "not_required", changedProducts: [] };

    if (previousStatus !== STATUS.CONCLUIDO && newStatus === STATUS.CONCLUIDO) {
      stock = await applyOrderStockExit(orderId);
    }

    if (previousStatus === STATUS.CONCLUIDO && newStatus < STATUS.CONCLUIDO) {
      stock = await applyOrderStockReversal(orderId, `status_${previousStatus}_to_${newStatus}`);
    }

    const { error: updateError } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);

    if (updateError) {
      if (previousStatus !== STATUS.CONCLUIDO && newStatus === STATUS.CONCLUIDO && stock.applied) {
        try {
          await applyOrderStockReversal(orderId, "cleanup_after_order_status_update_failure");
        } catch {
          // noop
        }
      }
      return res.status(500).json({ error: `Erro ao atualizar status: ${updateError.message}` });
    }

    const clientId = order.cliente_id || order.client_id || null;
    const orderEmail = order.email_cliente || order.email || null;
    const orderCode = resolveOrderCode(order);
    const orderTotal = order.valor_total ?? order.total ?? null;
    const expectedEventType =
      previousStatus === STATUS.RECEBIDO && newStatus === STATUS.CONFIRMADO
        ? "order_confirmed_client"
        : previousStatus === STATUS.PRONTO && newStatus === STATUS.ENTREGA
          ? "order_dispatched_client"
          : previousStatus !== STATUS.CONCLUIDO && newStatus === STATUS.CONCLUIDO
            ? "order_review_client"
            : null;

    const clientCandidates = [];
    const candidateIds = new Set();
    let clientError = null;

    if (clientId) {
      const clientByIdResult = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
      if (clientByIdResult.data) {
        clientCandidates.push(clientByIdResult.data);
        candidateIds.add(String(clientByIdResult.data.id));
      }
      clientError = clientByIdResult.error;
    }

    if (orderEmail) {
      const clientByEmailResult = await supabase
        .from("clients")
        .select("*")
        .eq("email", orderEmail)
        .order("id", { ascending: false });

      if (!clientError) clientError = clientByEmailResult.error;

      for (const candidate of clientByEmailResult.data || []) {
        const candidateKey = String(candidate.id);
        if (candidateIds.has(candidateKey)) continue;
        clientCandidates.push(candidate);
        candidateIds.add(candidateKey);
      }
    }

    let notification = { sent: false, queued: false, reason: "missing-client" };

    if (clientCandidates.length > 0 && !clientError) {
      for (const client of clientCandidates) {
        const locale = resolveMessageLocale(order, client);
        const orderItems = await fetchOrderItems(orderId, locale);
        const deliveryAddress = resolveDeliveryAddress(client);

        notification = await sendStatusNotification({
          previousStatus,
          newStatus,
          clientName: client.nome,
          clientPhone: client.telefone,
          orderCode,
          orderItems,
          orderTotal,
          locale,
          deliveryAddress,
        });

        if (expectedEventType && notification?.reason !== "no-notification-transition") {
          await persistWhatsAppAttempt({
            orderId,
            target: "client",
            eventType: notification?.eventType || expectedEventType,
            destinationPhone: normalizePhone(client.telefone),
            messageText: notification?.messageText || null,
            payload: {
              previousStatus,
              newStatus,
              locale,
              clientId: client.id,
              orderCode,
            },
            sendResult: notification?.queued
              ? {
                  ok: true,
                  messageId: notification.messageId,
                  zaapId: notification.zaapId,
                  detail: notification.deliveryStatus || "pending",
                }
              : {
                  ok: false,
                  reason: notification?.reason || "send-failed",
                  detail: notification?.detail || null,
                  messageId: notification?.messageId || null,
                  zaapId: notification?.zaapId || null,
                },
          });
        }

        if (notification?.queued || notification?.sent) {
          return res.json({ ok: true, previousStatus, newStatus, locale, stock, notification });
        }

        if (!["missing-phone", "phone-not-on-whatsapp"].includes(notification?.reason || "")) {
          return res.json({ ok: true, previousStatus, newStatus, locale, stock, notification });
        }
      }
    }

    if (expectedEventType && clientCandidates.length === 0) {
      await persistWhatsAppAttempt({
        orderId,
        target: "client",
        eventType: expectedEventType,
        destinationPhone: null,
        messageText: null,
        payload: {
          previousStatus,
          newStatus,
          orderCode,
        },
        sendResult: { ok: false, reason: "missing-client", detail: clientError?.message || null },
      });
    }

    return res.json({
      ok: true,
      previousStatus,
      newStatus,
      locale: normalizeLocale(order.locale || "pt"),
      stock,
      notification,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Erro interno ao atualizar status do pedido.",
      detail: error?.detail || String(error?.message || error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);
});
