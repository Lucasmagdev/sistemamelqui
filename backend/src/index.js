import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  }),
);

const PORT = Number(process.env.PORT || 3001);
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

const formatQuantity = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2).replace(/\.?0+$/, "");
};

const formatMoney = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return null;
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
};

const normalizePhone = (rawPhone) => {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;
  const countryCode = process.env.DEFAULT_COUNTRY_CODE || "55";
  return `${countryCode}${digits}`;
};

const resolveOrderCode = (order) => {
  const explicitCode =
    order?.codigo_pedido ||
    order?.numero_pedido ||
    order?.codigo ||
    order?.code ||
    order?.numero ||
    null;

  if (explicitCode) {
    const code = String(explicitCode).trim();
    if (!code) return `IMP${order?.id}`;
    return code.toUpperCase().startsWith("IMP") ? code : `IMP${code}`;
  }

  return `IMP${order?.id}`;
};

const buildMessage = ({ type, name, code, orderItems, orderTotal }) => {
  const itemsLines = (orderItems || [])
    .map((item) => `- ${item.nome}: ${formatQuantity(item.quantidade)}`)
    .join("\n");
  const itemsSection = itemsLines
    ? ["", "Itens do pedido:", itemsLines].join("\n")
    : "";

  const totalLabel = formatMoney(orderTotal);
  const totalSection = totalLabel ? `\n\nTotal estimado: ${totalLabel}` : "";

  if (type === "confirmed") {
    return [
      `✅ Olá ${name}, seu pedido ${code} foi confirmado com sucesso!`,
      "",
      "🥩 Já começamos a preparação dos itens.",
      "",
      "⚖️ Produtos vendidos por peso (KG/LB) podem ter pequena variação de valor após pesagem e embalagem.",
      itemsSection,
      totalSection,
    ].join("\n");
  }

  return [
    `🚚 Olá ${name}, seu pedido ${code} saiu para entrega!`,
    "",
    "📍 Em breve ele chegará ao endereço informado.",
    "",
    "🙏 Obrigado pela preferência.",
    itemsSection,
    totalSection,
  ].join("\n");
};

async function fetchOrderItems(orderId) {
  const byPedido = await supabase
    .from("order_items")
    .select("*")
    .eq("pedido_id", orderId);

  let items = !byPedido.error ? byPedido.data || [] : [];

  if (!items.length) {
    const byOrder = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    if (!byOrder.error) {
      items = byOrder.data || [];
    }
  }

  if (!items.length) return [];

  const productIds = Array.from(
    new Set(
      items
        .map((item) => item.produto_id || item.product_id)
        .filter((id) => id !== null && id !== undefined),
    ),
  );

  let productsMap = new Map();
  if (productIds.length > 0) {
    const productsResult = await supabase
      .from("products")
      .select("id, nome")
      .in("id", productIds);
    if (!productsResult.error) {
      productsMap = new Map(
        (productsResult.data || []).map((prod) => [String(prod.id), prod.nome || "Produto"]),
      );
    }
  }

  return items.map((item) => ({
    nome: productsMap.get(String(item.produto_id || item.product_id)) || "Produto",
    quantidade: item.quantidade ?? item.quantity ?? 0,
  }));
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
    body: JSON.stringify({
      phone,
      number: phone,
      message,
      text: message,
    }),
  });

  if (!response.ok) {
    return { ok: false, reason: `zapi-http-${response.status}` };
  }
  return { ok: true };
}

async function sendStatusNotification({
  previousStatus,
  newStatus,
  clientName,
  clientPhone,
  orderCode,
  orderItems,
  orderTotal,
}) {
  let type = null;
  if (previousStatus === STATUS.RECEBIDO && newStatus === STATUS.CONFIRMADO) {
    type = "confirmed";
  }
  if (previousStatus === STATUS.PRONTO && newStatus === STATUS.ENTREGA) {
    type = "out_for_delivery";
  }
  if (!type) return { sent: false, reason: "no-notification-transition" };

  const phone = normalizePhone(clientPhone);
  if (!phone) return { sent: false, reason: "missing-phone" };

  const message = buildMessage({
    type,
    name: clientName || "cliente",
    code: orderCode,
    orderItems,
    orderTotal,
  });

  const sendResult = await sendWhatsAppViaZApi({ phone, message });
  if (!sendResult.ok) {
    return { sent: false, reason: sendResult.reason };
  }

  return { sent: true };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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
      return res.status(404).json({
        error: "Pedido nao encontrado.",
        detail: orderError?.message || null,
      });
    }

    const previousStatus = Number(order.status ?? 0);
    const clientId = order.cliente_id || order.client_id || null;
    const orderEmail = order.email_cliente || order.email || null;
    let client = null;
    let clientError = null;

    if (clientId) {
      const clientByIdResult = await supabase
        .from("clients")
        .select("id, nome, telefone, last_user_agent")
        .eq("id", clientId)
        .maybeSingle();
      client = clientByIdResult.data;
      clientError = clientByIdResult.error;
    } else if (orderEmail) {
      const clientByEmailResult = await supabase
        .from("clients")
        .select("id, nome, telefone, last_user_agent")
        .eq("email", orderEmail)
        .maybeSingle();
      client = clientByEmailResult.data;
      clientError = clientByEmailResult.error;
    } else {
      return res.status(400).json({
        error: "Pedido sem cliente vinculado.",
        detail: "Sem cliente_id/client_id e sem email_cliente no pedido.",
      });
    }

    if (clientError || !client) {
      return res.status(404).json({
        error: "Cliente do pedido nao encontrado.",
        detail: clientError?.message || null,
      });
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: newStatus })
      .eq("id", orderId);

    if (updateError) {
      return res.status(500).json({ error: `Erro ao atualizar status: ${updateError.message}` });
    }

    const orderItems = await fetchOrderItems(orderId);
    const orderCode = resolveOrderCode(order);
    const orderTotal = order.valor_total ?? order.total ?? null;

    const notification = await sendStatusNotification({
      previousStatus,
      newStatus,
      clientName: client.nome,
      clientPhone: client.telefone,
      orderCode,
      orderItems,
      orderTotal,
    });

    return res.json({
      ok: true,
      previousStatus,
      newStatus,
      notification,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Erro interno ao atualizar status do pedido.",
      detail: String(error?.message || error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);
});
