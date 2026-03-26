import { randomBytes } from "crypto";
import { Router } from "express";

const ACTIVE_BATCH_STATUSES = new Set(["draft", "published"]);
const DELIVERY_ROUTE_RELATION = "delivery_route_orders";
const DELIVERY_EVENT_RELATION = "delivery_route_events";

const formatQuantity = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(3).replace(/\.?0+$/, "");
};

const normalizeText = (value, fallback = "") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const escapeAdminSearchTerm = (value) =>
  String(value || "")
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildAdminSearchPattern = (value) => {
  const sanitized = escapeAdminSearchTerm(value);
  return sanitized ? `%${sanitized}%` : "";
};

const extractOrderSearchId = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  const stripped = raw.startsWith("IMP") ? raw.slice(3) : raw;
  const parsed = Number.parseInt(stripped.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const isMissingRelationError = (error, relation) => {
  const message = String(error?.message || "");
  return message.includes(`relation "${relation}" does not exist`) || message.includes(`Could not find the table '${relation}'`);
};

const isMissingColumnInSchemaCache = (error, column) => {
  const message = String(error?.message || "");
  return message.includes(`column ${column} does not exist`) || message.includes(`Could not find the '${column}' column`);
};

function applyOrdersAdminFilters(query, {
  start,
  end,
  status = "",
  city = "",
  search = "",
  onlyOpen = false,
  concludedStatus = 5,
} = {}) {
  let next = query;

  if (start) next = next.gte("data_pedido", start);
  if (end) next = next.lte("data_pedido", end);
  if (status !== "" && status !== null && status !== undefined) next = next.eq("status", Number(status));
  if (onlyOpen) next = next.lt("status", concludedStatus);
  if (city) next = next.eq("city", city);

  const pattern = buildAdminSearchPattern(search);
  if (pattern) {
    const filters = [
      `client_name.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
      `explicit_code.ilike.${pattern}`,
    ];
    const numericOrderId = extractOrderSearchId(search);
    if (numericOrderId) filters.push(`id.eq.${numericOrderId}`);
    next = next.or(filters.join(","));
  }

  return next;
}

export function createDeliveryRoutesRouter(deps) {
  const {
    supabase,
    createHttpError,
    resolveOrderCode,
    resolveDeliveryAddress,
    fetchOrderItems,
    status,
  } = deps;

  const router = Router();
  let cachedOrderItemsOrderColumn = null;

  const ensureRouteTables = (error) => {
    if (
      isMissingRelationError(error, "delivery_route_batches")
      || isMissingRelationError(error, DELIVERY_ROUTE_RELATION)
      || isMissingRelationError(error, DELIVERY_EVENT_RELATION)
    ) {
      throw createHttpError(
        500,
        "Estrutura de rotas de entrega ausente.",
        "Execute o SQL banco de dados/fase11_rotas_entrega.sql antes de usar este recurso.",
      );
    }
  };

  const resolveOrderItemsOrderColumn = async () => {
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
  };

  const fetchOrderItemsByOrderIds = async (orderIds = []) => {
    if (!orderIds.length) return [];

    let orderColumn = await resolveOrderItemsOrderColumn();
    let result = await supabase.from("order_items").select("*").in(orderColumn, orderIds);

    if (result.error && orderColumn === "pedido_id" && isMissingColumnInSchemaCache(result.error, "pedido_id")) {
      cachedOrderItemsOrderColumn = "order_id";
      orderColumn = "order_id";
      result = await supabase.from("order_items").select("*").in(orderColumn, orderIds);
    }

    if (result.error) {
      throw createHttpError(500, "Erro ao carregar itens dos pedidos da rota.", result.error.message);
    }

    return result.data || [];
  };

  const buildRouteToken = () => randomBytes(18).toString("hex");

  const buildPublicLink = (req, token) => {
    const frontendBase = process.env.FRONTEND_URL || req.get("origin") || "http://localhost:8080";
    return `${frontendBase.replace(/\/$/, "")}/rota/${token}`;
  };

  const loadRouteBatchByToken = async (token) => {
    const result = await supabase
      .from("delivery_route_batches")
      .select("*")
      .eq("public_token", token)
      .single();

    if (result.error) {
      ensureRouteTables(result.error);
      if (result.error.code === "PGRST116") throw createHttpError(404, "Rota nao encontrada.");
      throw createHttpError(500, "Erro ao carregar rota pelo link.", result.error.message);
    }

    return result.data;
  };

  const loadRouteRows = async (batchId) => {
    const result = await supabase
      .from(DELIVERY_ROUTE_RELATION)
      .select("*")
      .eq("batch_id", batchId)
      .order("route_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (result.error) {
      ensureRouteTables(result.error);
      throw createHttpError(500, "Erro ao carregar pedidos da rota.", result.error.message);
    }

    return result.data || [];
  };

  const loadRouteEvents = async (batchId) => {
    const result = await supabase
      .from(DELIVERY_EVENT_RELATION)
      .select("*")
      .eq("batch_id", batchId)
      .order("event_at", { ascending: false })
      .limit(200);

    if (result.error) {
      ensureRouteTables(result.error);
      throw createHttpError(500, "Erro ao carregar auditoria da rota.", result.error.message);
    }

    return result.data || [];
  };

  const insertRouteEvent = async (payload) => {
    const result = await supabase.from(DELIVERY_EVENT_RELATION).insert([payload]).select("*").single();
    if (result.error) {
      ensureRouteTables(result.error);
      throw createHttpError(500, "Erro ao salvar evento da rota.", result.error.message);
    }
    return result.data;
  };

  const buildOrderDetailsMap = async (routeRows) => {
    const orderIds = Array.from(new Set(routeRows.map((row) => Number(row.order_id)).filter((id) => Number.isFinite(id) && id > 0)));
    if (!orderIds.length) return new Map();

    const ordersResult = await supabase
      .from("orders")
      .select("id, cliente_id, client_id, valor_total, status, data_pedido")
      .in("id", orderIds);

    if (ordersResult.error) {
      throw createHttpError(500, "Erro ao carregar detalhes dos pedidos da rota.", ordersResult.error.message);
    }

    const itemRows = await fetchOrderItemsByOrderIds(orderIds);
    const itemOrderColumn = await resolveOrderItemsOrderColumn();
    const productIds = Array.from(new Set(
      itemRows.map((item) => Number(item.produto_id || item.product_id)).filter((id) => Number.isFinite(id) && id > 0),
    ));

    const productsResult = productIds.length
      ? await supabase.from("products").select("id, nome").in("id", productIds)
      : { data: [], error: null };

    if (productsResult.error) {
      throw createHttpError(500, "Erro ao carregar produtos da rota.", productsResult.error.message);
    }

    const ordersMap = new Map((ordersResult.data || []).map((row) => [Number(row.id), row]));
    const productMap = new Map((productsResult.data || []).map((row) => [Number(row.id), row.nome || `Produto ${row.id}`]));
    const orderItemsMap = new Map();

    for (const item of itemRows) {
      const orderId = Number(item[itemOrderColumn] || item.pedido_id || item.order_id);
      const current = orderItemsMap.get(orderId) || [];
      current.push({
        nome: productMap.get(Number(item.produto_id || item.product_id)) || "Produto",
        quantidade: Number(item.quantidade ?? item.quantity ?? 0),
      });
      orderItemsMap.set(orderId, current);
    }

    const clientIds = Array.from(new Set(
      (ordersResult.data || [])
        .map((row) => Number(row.cliente_id || row.client_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ));

    const clientsResult = clientIds.length
      ? await supabase
          .from("clients")
          .select("id, nome, telefone, endereco_rua, endereco_numero, endereco_apt, endereco_cidade, endereco_estado, endereco_zip")
          .in("id", clientIds)
      : { data: [], error: null };

    if (clientsResult.error) {
      throw createHttpError(500, "Erro ao carregar clientes da rota.", clientsResult.error.message);
    }

    const clientsMap = new Map((clientsResult.data || []).map((row) => [Number(row.id), row]));
    const responseMap = new Map();

    for (const routeRow of routeRows) {
      const order = ordersMap.get(Number(routeRow.order_id));
      const clientId = Number(order?.cliente_id || order?.client_id || 0);
      const client = clientsMap.get(clientId) || null;
      const orderItems = orderItemsMap.get(Number(routeRow.order_id)) || [];
      responseMap.set(Number(routeRow.order_id), {
        code: resolveOrderCode({ id: routeRow.order_id }),
        clientName: client?.nome || routeRow.client_name_snapshot || "Cliente",
        phone: client?.telefone || routeRow.phone_snapshot || "-",
        fullAddress: routeRow.full_address_snapshot || (client ? resolveDeliveryAddress(client) : "-"),
        city: routeRow.city_snapshot || client?.endereco_cidade || "-",
        value: Number(order?.valor_total || 0),
        orderStatus: Number(order?.status || 0),
        dataPedido: order?.data_pedido || null,
        items: orderItems,
        productsPreview: orderItems.map((item) => `${item.nome} (${formatQuantity(item.quantidade)}x)`).join(", "),
      });
    }

    return responseMap;
  };

  const serializeRouteBatch = async (req, batch, routeRows) => {
    const orderDetailsMap = await buildOrderDetailsMap(routeRows);
    const driverMap = new Map();

    for (const row of routeRows) {
      const driverName = normalizeText(row.assigned_driver_name);
      const detail = orderDetailsMap.get(Number(row.order_id)) || {};
      const payload = {
        id: row.id,
        batchId: row.batch_id,
        orderId: Number(row.order_id),
        code: detail.code || resolveOrderCode({ id: row.order_id }),
        clientName: detail.clientName || "Cliente",
        phone: detail.phone || row.phone_snapshot || "-",
        city: detail.city || row.city_snapshot || "-",
        fullAddress: detail.fullAddress || row.full_address_snapshot || "-",
        productsPreview: detail.productsPreview || "",
        items: detail.items || [],
        value: Number(detail.value || 0),
        orderStatus: Number(detail.orderStatus || 0),
        routeOrder: Number(row.route_order || 0),
        assignedDriverName: driverName || null,
        assignedAt: row.assigned_at || null,
        regionLabel: row.region_label || null,
        deliveryState: row.delivery_state || "pending",
        deliveredAt: row.delivered_at || null,
        deliveredLatitude: row.delivered_latitude ?? null,
        deliveredLongitude: row.delivered_longitude ?? null,
        failureReason: row.failure_reason || null,
        dataPedido: detail.dataPedido || null,
      };

      if (!driverName) continue;
      const current = driverMap.get(driverName) || [];
      current.push(payload);
      driverMap.set(driverName, current);
    }

    const drivers = Array.from(driverMap.entries())
      .map(([driverName, orders]) => ({
        driverName,
        orderCount: orders.length,
        deliveredCount: orders.filter((row) => row.deliveryState === "delivered").length,
        failedCount: orders.filter((row) => row.deliveryState === "failed").length,
        orders: orders.sort((a, b) => a.routeOrder - b.routeOrder),
      }))
      .sort((a, b) => a.driverName.localeCompare(b.driverName, "pt-BR"));

    return {
      id: batch.id,
      label: batch.label,
      routeDate: batch.route_date,
      status: batch.status,
      notes: batch.notes || null,
      publicToken: batch.public_token,
      publicLink: buildPublicLink(req, batch.public_token),
      publishedAt: batch.published_at || null,
      createdAt: batch.created_at || null,
      orderCount: routeRows.length,
      assignedCount: routeRows.filter((row) => normalizeText(row.assigned_driver_name)).length,
      deliveredCount: routeRows.filter((row) => row.delivery_state === "delivered").length,
      failedCount: routeRows.filter((row) => row.delivery_state === "failed").length,
      unassignedCount: routeRows.filter((row) => !normalizeText(row.assigned_driver_name)).length,
      drivers,
      orders: routeRows.map((row) => ({
        id: row.id,
        batchId: row.batch_id,
        orderId: Number(row.order_id),
        ...(orderDetailsMap.get(Number(row.order_id)) || {}),
        routeOrder: Number(row.route_order || 0),
        assignedDriverName: normalizeText(row.assigned_driver_name) || null,
        assignedAt: row.assigned_at || null,
        regionLabel: row.region_label || null,
        deliveryState: row.delivery_state || "pending",
        deliveredAt: row.delivered_at || null,
        deliveredLatitude: row.delivered_latitude ?? null,
        deliveredLongitude: row.delivered_longitude ?? null,
        failureReason: row.failure_reason || null,
      })),
    };
  };

  const loadLatestBatch = async () => {
    const result = await supabase
      .from("delivery_route_batches")
      .select("*")
      .in("status", Array.from(ACTIVE_BATCH_STATUSES))
      .order("route_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) {
      ensureRouteTables(result.error);
      throw createHttpError(500, "Erro ao carregar rota ativa.", result.error.message);
    }

    return result.data || null;
  };

  router.get("/admin/current", async (req, res) => {
    try {
      const batch = await loadLatestBatch();
      if (!batch) {
        return res.json({ ok: true, batch: null, audit: [] });
      }

      const routeRows = await loadRouteRows(batch.id);
      const audit = await loadRouteEvents(batch.id);
      const payload = await serializeRouteBatch(req, batch, routeRows);
      return res.json({ ok: true, batch: payload, audit });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao carregar rota ativa.",
        detail: error?.detail || null,
      });
    }
  });

  router.post("/admin/batches", async (req, res) => {
    try {
      const routeDate = normalizeText(req.body?.routeDate, new Date().toISOString().slice(0, 10));
      const label = normalizeText(req.body?.label, `Rota ${routeDate}`);
      const notes = normalizeText(req.body?.notes, null);
      const filters = {
        start: normalizeText(req.body?.start, ""),
        end: normalizeText(req.body?.end, ""),
        status: normalizeText(req.body?.status, ""),
        city: normalizeText(req.body?.city, ""),
        search: normalizeText(req.body?.search, ""),
        onlyOpen: true,
      };

      const existingResult = await supabase
        .from("delivery_route_batches")
        .select("*")
        .eq("route_date", routeDate)
        .in("status", Array.from(ACTIVE_BATCH_STATUSES))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingResult.error) {
        ensureRouteTables(existingResult.error);
        throw createHttpError(500, "Erro ao verificar rota existente.", existingResult.error.message);
      }

      if (existingResult.data) {
        return res.status(409).json({
          error: "Ja existe uma rota ativa para esta data.",
          detail: "Arquive ou conclua a rota atual antes de publicar outra.",
          batchId: existingResult.data.id,
          publicToken: existingResult.data.public_token,
        });
      }

      let ordersQuery = supabase
        .from("admin_orders_enriched")
        .select("id, client_name, phone, city, full_address, status")
        .in("status", [status.PRONTO, status.ENTREGA]);

      ordersQuery = applyOrdersAdminFilters(ordersQuery, filters);
      const ordersResult = await ordersQuery.order("city", { ascending: true }).order("data_pedido", { ascending: true }).order("id", { ascending: true });

      if (ordersResult.error) {
        ensureRouteTables(ordersResult.error);
        throw createHttpError(500, "Erro ao buscar pedidos para a rota.", ordersResult.error.message);
      }

      const openOrders = (ordersResult.data || []).filter((row) => Number(row.status) < status.CONCLUIDO);
      if (!openOrders.length) {
        return res.status(400).json({
          error: "Nenhum pedido pronto ou em entrega encontrado para publicar na rota.",
        });
      }

      const token = buildRouteToken();
      const batchInsert = await supabase
        .from("delivery_route_batches")
        .insert([{
          route_date: routeDate,
          label,
          notes,
          public_token: token,
          status: "published",
          published_at: new Date().toISOString(),
          filters_snapshot: filters,
        }])
        .select("*")
        .single();

      if (batchInsert.error) {
        ensureRouteTables(batchInsert.error);
        throw createHttpError(500, "Erro ao criar lote da rota.", batchInsert.error.message);
      }

      const routeRowsPayload = openOrders.map((order, index) => ({
        batch_id: batchInsert.data.id,
        order_id: Number(order.id),
        route_order: index + 1,
        region_label: normalizeText(order.city, null),
        city_snapshot: normalizeText(order.city, "-"),
        full_address_snapshot: normalizeText(order.full_address, "-"),
        client_name_snapshot: normalizeText(order.client_name, "Cliente"),
        phone_snapshot: normalizeText(order.phone, "-"),
        delivery_state: "pending",
      }));

      const routeInsert = await supabase.from(DELIVERY_ROUTE_RELATION).insert(routeRowsPayload);
      if (routeInsert.error) {
        ensureRouteTables(routeInsert.error);
        await supabase.from("delivery_route_batches").delete().eq("id", batchInsert.data.id);
        throw createHttpError(500, "Erro ao salvar pedidos da rota.", routeInsert.error.message);
      }

      await insertRouteEvent({
        batch_id: batchInsert.data.id,
        order_id: null,
        route_order_id: null,
        event_type: "batch_published",
        driver_name: null,
        payload: {
          orderCount: routeRowsPayload.length,
          filters,
        },
        event_at: new Date().toISOString(),
      });

      const routeRows = await loadRouteRows(batchInsert.data.id);
      const payload = await serializeRouteBatch(req, batchInsert.data, routeRows);
      return res.status(201).json({ ok: true, batch: payload });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao publicar rota do dia.",
        detail: error?.detail || null,
      });
    }
  });

  router.get("/public/:token", async (req, res) => {
    try {
      const batch = await loadRouteBatchByToken(req.params.token);
      if (batch.status !== "published") {
        throw createHttpError(410, "Esta rota nao esta mais disponivel.");
      }

      const routeRows = await loadRouteRows(batch.id);
      const payload = await serializeRouteBatch(req, batch, routeRows);
      return res.json({ ok: true, batch: payload });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao carregar rota publica.",
        detail: error?.detail || null,
      });
    }
  });

  router.post("/public/:token/claim", async (req, res) => {
    try {
      const driverName = normalizeText(req.body?.driverName);
      const orderIds = Array.isArray(req.body?.orderIds)
        ? req.body.orderIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
        : [];

      if (!driverName) throw createHttpError(400, "Informe o nome do entregador.");
      if (!orderIds.length) throw createHttpError(400, "Selecione ao menos um pedido para assumir.");

      const batch = await loadRouteBatchByToken(req.params.token);
      const routeRows = await loadRouteRows(batch.id);
      const routeRowMap = new Map(routeRows.map((row) => [Number(row.order_id), row]));
      const now = new Date().toISOString();
      const conflicts = [];

      for (let index = 0; index < orderIds.length; index += 1) {
        const orderId = orderIds[index];
        const currentRow = routeRowMap.get(orderId);
        if (!currentRow) {
          conflicts.push({ orderId, reason: "not-found" });
          continue;
        }

        const existingDriver = normalizeText(currentRow.assigned_driver_name);
        if (existingDriver && existingDriver !== driverName) {
          conflicts.push({ orderId, reason: "already-assigned", assignedDriverName: existingDriver });
          continue;
        }

        const updatePayload = {
          assigned_driver_name: driverName,
          assigned_at: currentRow.assigned_at || now,
          route_order: index + 1,
          delivery_state: currentRow.delivery_state === "pending" ? "assigned" : currentRow.delivery_state,
        };

        let updateQuery = supabase
          .from(DELIVERY_ROUTE_RELATION)
          .update(updatePayload)
          .eq("id", currentRow.id);

        updateQuery = existingDriver
          ? updateQuery.eq("assigned_driver_name", driverName)
          : updateQuery.is("assigned_driver_name", null);

        const updateResult = await updateQuery.select("*").maybeSingle();
        if (updateResult.error) {
          ensureRouteTables(updateResult.error);
          throw createHttpError(500, "Erro ao assumir pedido da rota.", updateResult.error.message);
        }

        if (!updateResult.data) {
          const latestRows = await loadRouteRows(batch.id);
          const latest = latestRows.find((row) => Number(row.order_id) === orderId);
          conflicts.push({
            orderId,
            reason: "concurrency",
            assignedDriverName: normalizeText(latest?.assigned_driver_name) || null,
          });
          continue;
        }

        await insertRouteEvent({
          batch_id: batch.id,
          order_id: orderId,
          route_order_id: updateResult.data.id,
          event_type: "assigned",
          driver_name: driverName,
          payload: { routeOrder: index + 1 },
          event_at: now,
        });
      }

      const refreshedRows = await loadRouteRows(batch.id);
      const payload = await serializeRouteBatch(req, batch, refreshedRows);
      return res.json({
        ok: true,
        claimedCount: orderIds.length - conflicts.length,
        conflicts,
        batch: payload,
      });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao assumir pedidos da rota.",
        detail: error?.detail || null,
      });
    }
  });

  router.post("/public/:token/reorder", async (req, res) => {
    try {
      const driverName = normalizeText(req.body?.driverName);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!driverName) throw createHttpError(400, "Informe o nome do entregador.");
      if (!items.length) throw createHttpError(400, "Envie a lista de pedidos para reordenar.");

      const batch = await loadRouteBatchByToken(req.params.token);
      const routeRows = await loadRouteRows(batch.id);
      const driverRows = routeRows.filter((row) => normalizeText(row.assigned_driver_name) === driverName);
      const driverOrderIds = new Set(driverRows.map((row) => Number(row.order_id)));
      const now = new Date().toISOString();

      for (const item of items) {
        const orderId = Number(item?.orderId);
        const routeOrder = Number(item?.routeOrder);
        if (!driverOrderIds.has(orderId) || !Number.isFinite(routeOrder) || routeOrder <= 0) {
          throw createHttpError(400, "A reordenacao contem pedido invalido.");
        }
      }

      for (const item of items) {
        const orderId = Number(item.orderId);
        const routeOrder = Number(item.routeOrder);
        const current = driverRows.find((row) => Number(row.order_id) === orderId);
        if (!current) continue;

        const updateResult = await supabase
          .from(DELIVERY_ROUTE_RELATION)
          .update({ route_order: routeOrder })
          .eq("id", current.id)
          .eq("assigned_driver_name", driverName)
          .select("*")
          .maybeSingle();

        if (updateResult.error) {
          ensureRouteTables(updateResult.error);
          throw createHttpError(500, "Erro ao reordenar a rota.", updateResult.error.message);
        }

        if (updateResult.data) {
          await insertRouteEvent({
            batch_id: batch.id,
            order_id: orderId,
            route_order_id: current.id,
            event_type: "reordered",
            driver_name: driverName,
            payload: { routeOrder },
            event_at: now,
          });
        }
      }

      const refreshedRows = await loadRouteRows(batch.id);
      const payload = await serializeRouteBatch(req, batch, refreshedRows);
      return res.json({ ok: true, batch: payload });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao reordenar rota.",
        detail: error?.detail || null,
      });
    }
  });

  router.post("/public/:token/orders/:orderId/deliver", async (req, res) => {
    try {
      const driverName = normalizeText(req.body?.driverName);
      const orderId = Number(req.params.orderId);
      const latitude = Number(req.body?.latitude);
      const longitude = Number(req.body?.longitude);

      if (!driverName) throw createHttpError(400, "Informe o nome do entregador.");
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw createHttpError(400, "Geolocalizacao obrigatoria para concluir a entrega.");
      }

      const batch = await loadRouteBatchByToken(req.params.token);
      const routeRows = await loadRouteRows(batch.id);
      const routeRow = routeRows.find((row) => Number(row.order_id) === orderId);
      if (!routeRow) throw createHttpError(404, "Pedido nao encontrado nesta rota.");
      if (normalizeText(routeRow.assigned_driver_name) !== driverName) {
        throw createHttpError(403, "Somente o entregador responsavel pode concluir este pedido.");
      }

      const deliveredAt = new Date().toISOString();
      const updateResult = await supabase
        .from(DELIVERY_ROUTE_RELATION)
        .update({
          delivery_state: "delivered",
          delivered_at: deliveredAt,
          delivered_latitude: latitude,
          delivered_longitude: longitude,
          failure_reason: null,
        })
        .eq("id", routeRow.id)
        .eq("assigned_driver_name", driverName)
        .select("*")
        .maybeSingle();

      if (updateResult.error) {
        ensureRouteTables(updateResult.error);
        throw createHttpError(500, "Erro ao registrar entrega concluida.", updateResult.error.message);
      }

      const orderStatusUpdate = await supabase
        .from("orders")
        .update({ status: status.CONCLUIDO })
        .eq("id", orderId)
        .lt("status", status.CONCLUIDO);

      if (orderStatusUpdate.error) {
        throw createHttpError(500, "Entrega registrada, mas houve erro ao concluir o pedido.", orderStatusUpdate.error.message);
      }

      await insertRouteEvent({
        batch_id: batch.id,
        order_id: orderId,
        route_order_id: routeRow.id,
        event_type: "delivered",
        driver_name: driverName,
        latitude,
        longitude,
        payload: { deliveredAt },
        event_at: deliveredAt,
      });

      const refreshedRows = await loadRouteRows(batch.id);
      const payload = await serializeRouteBatch(req, batch, refreshedRows);
      return res.json({ ok: true, batch: payload });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao concluir entrega.",
        detail: error?.detail || null,
      });
    }
  });

  router.post("/public/:token/orders/:orderId/failure", async (req, res) => {
    try {
      const driverName = normalizeText(req.body?.driverName);
      const orderId = Number(req.params.orderId);
      const failureReason = normalizeText(req.body?.reason);
      const latitude = req.body?.latitude === undefined ? null : Number(req.body?.latitude);
      const longitude = req.body?.longitude === undefined ? null : Number(req.body?.longitude);

      if (!driverName) throw createHttpError(400, "Informe o nome do entregador.");
      if (!failureReason) throw createHttpError(400, "Informe o motivo da falha.");

      const batch = await loadRouteBatchByToken(req.params.token);
      const routeRows = await loadRouteRows(batch.id);
      const routeRow = routeRows.find((row) => Number(row.order_id) === orderId);
      if (!routeRow) throw createHttpError(404, "Pedido nao encontrado nesta rota.");
      if (normalizeText(routeRow.assigned_driver_name) !== driverName) {
        throw createHttpError(403, "Somente o entregador responsavel pode registrar falha.");
      }

      const failedAt = new Date().toISOString();
      const updateResult = await supabase
        .from(DELIVERY_ROUTE_RELATION)
        .update({
          delivery_state: "failed",
          failure_reason: failureReason,
        })
        .eq("id", routeRow.id)
        .eq("assigned_driver_name", driverName)
        .select("*")
        .maybeSingle();

      if (updateResult.error) {
        ensureRouteTables(updateResult.error);
        throw createHttpError(500, "Erro ao registrar falha da entrega.", updateResult.error.message);
      }

      await insertRouteEvent({
        batch_id: batch.id,
        order_id: orderId,
        route_order_id: routeRow.id,
        event_type: "failed",
        driver_name: driverName,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        payload: { reason: failureReason },
        event_at: failedAt,
      });

      const refreshedRows = await loadRouteRows(batch.id);
      const payload = await serializeRouteBatch(req, batch, refreshedRows);
      return res.json({ ok: true, batch: payload });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao registrar falha da entrega.",
        detail: error?.detail || null,
      });
    }
  });

  router.get("/admin/batches/:id/audit", async (req, res) => {
    try {
      const batchId = Number(req.params.id);
      if (!Number.isFinite(batchId) || batchId <= 0) throw createHttpError(400, "ID de rota invalido.");

      const batchResult = await supabase.from("delivery_route_batches").select("*").eq("id", batchId).single();
      if (batchResult.error) {
        ensureRouteTables(batchResult.error);
        throw createHttpError(404, "Rota nao encontrada.");
      }

      const routeRows = await loadRouteRows(batchId);
      const audit = await loadRouteEvents(batchId);
      const payload = await serializeRouteBatch(req, batchResult.data, routeRows);
      return res.json({ ok: true, batch: payload, audit });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao carregar auditoria da rota.",
        detail: error?.detail || null,
      });
    }
  });

  router.get("/public/:token/orders/:orderId/items", async (req, res) => {
    try {
      const batch = await loadRouteBatchByToken(req.params.token);
      const routeRows = await loadRouteRows(batch.id);
      const orderId = Number(req.params.orderId);
      const routeRow = routeRows.find((row) => Number(row.order_id) === orderId);
      if (!routeRow) throw createHttpError(404, "Pedido nao encontrado nesta rota.");

      const items = await fetchOrderItems(orderId, "pt");
      return res.json({ ok: true, items });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao carregar itens do pedido.",
        detail: error?.detail || null,
      });
    }
  });

  return router;
}
