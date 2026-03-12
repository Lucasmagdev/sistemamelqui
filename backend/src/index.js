import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

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

async function sendWhatsAppViaZApi({ phone, message }) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const baseUrl = process.env.ZAPI_BASE_URL || "https://api.z-api.io";

  if (!instanceId || !instanceToken) {
    return { ok: false, reason: "missing-zapi-config" };
  }

  const endpoint = `${baseUrl}/instances/${instanceId}/token/${instanceToken}/send-text`;
  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone, number: phone, message, text: message }),
  });

  if (!response.ok) return { ok: false, reason: `zapi-http-${response.status}` };
  return { ok: true };
}

async function sendStatusNotification({ previousStatus, newStatus, clientName, clientPhone, orderCode, orderItems, orderTotal, locale, deliveryAddress }) {
  let type = null;
  if (previousStatus === STATUS.RECEBIDO && newStatus === STATUS.CONFIRMADO) type = "confirmed";
  if (previousStatus === STATUS.PRONTO && newStatus === STATUS.ENTREGA) type = "out_for_delivery";
  if (!type) return { sent: false, reason: "no-notification-transition" };

  const phone = normalizePhone(clientPhone);
  if (!phone) return { sent: false, reason: "missing-phone" };

  const message = buildMessage({ type, name: clientName || "cliente", code: orderCode, orderItems, orderTotal, locale, deliveryAddress });

  const sendResult = await sendWhatsAppViaZApi({ phone, message });
  if (!sendResult.ok) return { sent: false, reason: sendResult.reason };
  return { sent: true };
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

    let client = null;
    let clientError = null;

    if (clientId) {
      const clientByIdResult = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
      client = clientByIdResult.data;
      clientError = clientByIdResult.error;
    } else if (orderEmail) {
      const clientByEmailResult = await supabase.from("clients").select("*").eq("email", orderEmail).maybeSingle();
      client = clientByEmailResult.data;
      clientError = clientByEmailResult.error;
    }

    let notification = { sent: false, reason: "missing-client" };

    if (client && !clientError) {
      const orderCode = resolveOrderCode(order);
      const orderTotal = order.valor_total ?? order.total ?? null;
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

      return res.json({ ok: true, previousStatus, newStatus, locale, stock, notification });
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
