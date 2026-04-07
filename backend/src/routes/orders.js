import { Router } from "express";

const OPTIONAL_CANCEL_COLUMNS = ["canceled_at", "canceled_by", "cancel_reason"];

function isMissingColumnError(error, column) {
  const message = String(error?.message || "");
  return message.includes(`Could not find the '${column}' column`) ||
    message.includes(`column "${column}" does not exist`) ||
    message.includes(`schema cache`) && message.includes(column);
}

function normalizeReviewCode(value) {
  return String(value || "").trim().toUpperCase();
}

async function updateOrderWithFallback(supabase, orderId, patch) {
  let payload = { ...(patch || {}) };

  while (Object.keys(payload).length > 0) {
    const { data, error } = await supabase
      .from("orders")
      .update(payload)
      .eq("id", orderId)
      .select("*")
      .single();

    if (!error) return { data, error: null };

    const missingColumn = OPTIONAL_CANCEL_COLUMNS.find((column) => Object.prototype.hasOwnProperty.call(payload, column) && isMissingColumnError(error, column));
    if (!missingColumn) return { data: null, error };
    delete payload[missingColumn];
  }

  return supabase.from("orders").update({}).eq("id", orderId).select("*").single();
}

export function createOrdersRouter(deps) {
  const {
    supabase,
    requireAssistantAdmin,
    createHttpError,
    parseNumber,
    roundQty,
    normalizeStockUnit,
    upsertClientFromOrderPayload,
    normalizeLocale,
    parseLooseNumber,
    status,
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
  } = deps;

  const router = Router();
  const requireAdmin = async (req, _res, next) => {
    try {
      req.adminActor = await requireAssistantAdmin(req);
      next();
    } catch (error) {
      next(error);
    }
  };

  const loadOrder = async (orderId) => {
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      throw createHttpError(404, "Pedido nao encontrado.", error?.message || null);
    }

    return order;
  };

  const loadOrderClientCandidates = async (order) => {
    const clientCandidates = [];
    const candidateIds = new Set();
    let clientError = null;
    const clientId = order.cliente_id || order.client_id || null;
    const orderEmail = order.email_cliente || order.email || null;

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

    return { clientCandidates, clientError };
  };

  const loadOrderDetail = async (orderId) => {
    const order = await loadOrder(orderId);
    const { clientCandidates } = await loadOrderClientCandidates(order);
    const client = clientCandidates[0] || null;

    let itemsResult = await supabase.from("order_items").select("*").eq("pedido_id", orderId).order("id", { ascending: true });
    if (itemsResult.error && isMissingColumnError(itemsResult.error, "pedido_id")) {
      itemsResult = await supabase.from("order_items").select("*").eq("order_id", orderId).order("id", { ascending: true });
    }

    if (itemsResult.error) {
      throw createHttpError(500, "Erro ao carregar itens do pedido.", itemsResult.error.message);
    }

    const items = itemsResult.data || [];
    const productIds = Array.from(new Set(items.map((item) => Number(item.produto_id || item.product_id)).filter(Boolean)));
    const productsResult = productIds.length
      ? await supabase.from("products").select("id, nome, nome_en, foto_url").in("id", productIds)
      : { data: [], error: null };

    if (productsResult.error) {
      throw createHttpError(500, "Erro ao carregar produtos do pedido.", productsResult.error.message);
    }

    const productMap = new Map((productsResult.data || []).map((product) => [Number(product.id), product]));
    const normalizedItems = items.map((item) => {
      const productId = Number(item.produto_id || item.product_id || 0);
      const product = productMap.get(productId);
      const quantity = Number(item.quantidade ?? item.quantity ?? 0);
      const unitPrice = Number(item.preco_unitario ?? item.unit_price ?? 0);
      return {
        id: item.id,
        productId,
        name: product?.nome || product?.nome_en || `Produto ${productId}`,
        quantity,
        unit: item.unidade || item.unit || "LB",
        unitPrice,
        totalPrice: roundQty(quantity * unitPrice, 2),
        cutType: item.tipo_corte || null,
        notes: item.observacoes || null,
        imageUrl: product?.foto_url || null,
      };
    });

    const branding = await loadStoreBranding(Number(order.tenant_id || 1));
    return {
      branding,
      order,
      client,
      orderCode: resolveOrderCode(order),
      paymentMethodLabel: formatPaymentMethodLabel(order.payment_method, normalizeLocale(order.locale || "pt")),
      deliveryAddress: client ? resolveDeliveryAddress(client) : null,
      items: normalizedItems,
    };
  };

  const loadPublicDigitalOrder = async (orderId, providedCode) => {
    const order = await loadOrder(orderId);
    const resolvedCode = normalizeReviewCode(resolveOrderCode(order));
    const requestedCode = normalizeReviewCode(providedCode);

    if (!requestedCode || requestedCode !== resolvedCode) {
      throw createHttpError(404, "Pedido nao encontrado para nota digital.");
    }

    let itemsResult = await supabase
      .from("order_items")
      .select("*")
      .eq("pedido_id", orderId)
      .order("id", { ascending: true });

    if (itemsResult.error && isMissingColumnError(itemsResult.error, "pedido_id")) {
      itemsResult = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("id", { ascending: true });
    }

    if (itemsResult.error) {
      throw createHttpError(500, "Erro ao carregar itens do pedido.", itemsResult.error.message);
    }

    const { clientCandidates } = await loadOrderClientCandidates(order);
    const client = clientCandidates[0] || null;
    const branding = await loadStoreBranding(Number(order.tenant_id || 1));

    const items = (itemsResult.data || []).map((item) => {
      const quantity = Number(item.quantidade ?? item.quantity ?? 0);
      const unitPrice = Number(item.preco_unitario ?? item.unit_price ?? 0);
      return {
        id: item.id,
        name: item.nome || item.name || `Item ${item.id}`,
        quantity,
        unit: item.unidade || item.unit || "LB",
        unitPrice,
        totalPrice: roundQty(quantity * unitPrice, 2),
        cutType: item.tipo_corte || null,
        notes: item.observacoes || null,
      };
    });

    return {
      order,
      client,
      items,
      branding,
      orderCode: resolvedCode,
    };
  };

  const transitionOrderStatus = async ({ order, newStatus, actorName, cancelReason = null }) => {
    const orderId = order.id;
    const previousStatus = Number(order.status ?? 0);
    let stock = { applied: false, reason: "not_required", changedProducts: [] };

    if (previousStatus !== status.CONCLUIDO && newStatus === status.CONCLUIDO) {
      stock = await applyOrderStockExit(orderId);
    }

    const needsReversal =
      previousStatus === status.CONCLUIDO &&
      (newStatus < status.CONCLUIDO || newStatus === status.CANCELADO);

    if (needsReversal) {
      stock = await applyOrderStockReversal(orderId, `status_${previousStatus}_to_${newStatus}`);
    }

    const patch = {
      status: newStatus,
      canceled_at: newStatus === status.CANCELADO ? new Date().toISOString() : null,
      canceled_by: newStatus === status.CANCELADO ? actorName || null : null,
      cancel_reason: newStatus === status.CANCELADO ? cancelReason || null : null,
    };

    const { data: updatedOrder, error: updateError } = await updateOrderWithFallback(supabase, orderId, patch);

    if (updateError || !updatedOrder) {
      if (previousStatus !== status.CONCLUIDO && newStatus === status.CONCLUIDO && stock.applied) {
        try {
          await applyOrderStockReversal(orderId, "cleanup_after_order_status_update_failure");
        } catch {
          // noop
        }
      }
      throw createHttpError(500, "Erro ao atualizar status do pedido.", updateError?.message || null);
    }

    return { previousStatus, updatedOrder, stock };
  };

  router.get("/admin", requireAdmin, async (req, res) => {
    const startedAt = Date.now();
    try {
      const startRaw = String(req.query?.start || req.query?.date_from || "").trim();
      const endRaw = String(req.query?.end || req.query?.date_to || "").trim();
      const range = {
        start: startRaw ? new Date(`${startRaw}T00:00:00.000Z`).toISOString() : null,
        end: endRaw ? new Date(`${endRaw}T23:59:59.999Z`).toISOString() : null,
        startDate: startRaw || null,
        endDate: endRaw || null,
      };
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

      logPerf("route.orders_admin", startedAt, {
        page: payload?.pageInfo?.page || 1,
        totalItems: payload?.pageInfo?.totalItems || 0,
      });
      return res.json({ ok: true, range, ...payload });
    } catch (error) {
      logPerf("route.orders_admin", startedAt, { error: error?.message || "unknown" });
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro interno ao carregar pedidos administrativos.",
        detail: error?.detail || null,
      });
    }
  });

  router.post("/", async (req, res) => {
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
        status: status.RECEBIDO,
        valor_total: total,
        tenant_id: Number(req.body?.tenantId || 1),
        locale: normalizeLocale(req.body?.locale || client.preferred_locale || "pt"),
        source: "delivery",
        payment_method: normalizePaymentMethod(req.body?.paymentMethod || req.body?.pagamento || null),
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

  router.get("/:id/detail", requireAdmin, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      if (!orderId) return res.status(400).json({ error: "ID do pedido invalido." });
      const detail = await loadOrderDetail(orderId);
      return res.json({ ok: true, detail });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao carregar detalhe do pedido.",
        detail: error?.detail || null,
      });
    }
  });

  router.get("/public/digital-note/:id", async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      if (!orderId) {
        return res.status(400).json({ error: "Pedido invalido para nota digital." });
      }

      const detail = await loadPublicDigitalOrder(orderId, req.query?.code);
      const total = (detail.items || []).reduce((acc, item) => acc + Number(item.totalPrice || 0), 0);

      return res.json({
        ok: true,
        note: {
          orderId: detail.order.id,
          orderCode: detail.orderCode,
          placedAt: detail.order.data_pedido || null,
          status: detail.order.status ?? 0,
          paymentMethodLabel: formatPaymentMethodLabel(detail.order.payment_method, normalizeLocale(detail.order.locale || "pt")),
          deliveryAddress: detail.client ? resolveDeliveryAddress(detail.client) : null,
          client: detail.client
            ? {
                nome: detail.client.nome || null,
                telefone: detail.client.telefone || null,
                email: detail.client.email || null,
                cidade: detail.client.cidade || null,
              }
            : null,
          branding: {
            nomeEmpresa: detail.branding?.nomeEmpresa || null,
            logoUrl: detail.branding?.logoUrl || null,
            cnpj: detail.branding?.cnpj || null,
            inscricaoEstadual: detail.branding?.inscricaoEstadual || null,
            endereco: detail.branding?.endereco || null,
            publicStoreUrl: detail.branding?.publicStoreUrl || null,
          },
          items: detail.items || [],
          total,
        },
      });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao carregar nota digital do pedido.",
        detail: error?.detail || null,
      });
    }
  });

  router.get("/:id/messages", requireAdmin, async (req, res) => {
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

  router.post("/:id/cancel", requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await loadOrder(orderId);
      const actorName = req.adminActor?.name || "admin";
      const cancelReason = String(req.body?.reason || "").trim() || null;
      const { previousStatus, updatedOrder, stock } = await transitionOrderStatus({
        order,
        newStatus: status.CANCELADO,
        actorName,
        cancelReason,
      });

      return res.json({
        ok: true,
        previousStatus,
        newStatus: status.CANCELADO,
        stock,
        order: updatedOrder,
      });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro ao cancelar pedido.",
        detail: error?.detail || null,
      });
    }
  });

  router.post("/:id/status", requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const newStatus = Number(req.body?.newStatus);

      if (!Number.isInteger(newStatus) || newStatus < 0 || newStatus > status.CANCELADO) {
        return res.status(400).json({ error: `newStatus invalido. Use inteiro entre 0 e ${status.CANCELADO}.` });
      }

      const order = await loadOrder(orderId);
      const actorName = req.adminActor?.name || "admin";
      const { previousStatus, updatedOrder, stock } = await transitionOrderStatus({
        order,
        newStatus,
        actorName,
      });

      const orderCode = resolveOrderCode(updatedOrder);
      const orderTotal = updatedOrder.valor_total ?? updatedOrder.total ?? null;
      const expectedEventType =
        previousStatus === status.RECEBIDO && newStatus === status.CONFIRMADO
          ? "order_confirmed_client"
          : previousStatus === status.PRONTO && newStatus === status.ENTREGA
            ? "order_dispatched_client"
            : previousStatus !== status.CONCLUIDO && newStatus === status.CONCLUIDO
              ? "order_review_client"
              : null;

      const { clientCandidates, clientError } = await loadOrderClientCandidates(updatedOrder);
      let notification = { sent: false, queued: false, reason: "missing-client" };
      let groupNotification = { sent: false, queued: false, reason: "not_required" };

      if (clientCandidates.length > 0 && !clientError) {
        for (const client of clientCandidates) {
          const locale = resolveMessageLocale(updatedOrder, client);
          const orderItems = await fetchOrderItems(orderId, locale);
          const deliveryAddress = resolveDeliveryAddress(client);
          const normalizedPhone = normalizePhone(client.telefone);

          notification = await sendStatusNotification({
            previousStatus,
            newStatus,
            tenantId: updatedOrder.tenant_id || client.tenant_id || 1,
            clientName: client.nome,
            clientPhone: client.telefone,
            orderCode,
            orderItems,
            orderTotal,
            locale,
            deliveryAddress,
            paymentMethod: updatedOrder.payment_method || null,
          });

          if (expectedEventType && notification?.reason !== "no-notification-transition") {
            await persistWhatsAppAttempt({
              orderId,
              target: "client",
              eventType: notification?.eventType || expectedEventType,
              destinationPhone: normalizedPhone,
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

          if (notification?.qr?.attempted) {
            await persistWhatsAppAttempt({
              orderId,
              target: "client",
              eventType: "order_confirmed_client_vemo_qr",
              destinationPhone: notification.qr.destinationPhone || normalizedPhone,
              messageText: notification.qr.caption || null,
              payload: {
                previousStatus,
                newStatus,
                locale,
                clientId: client.id,
                orderCode,
                paymentMethod: updatedOrder.payment_method || null,
                paymentLink: notification.qr.paymentLink || null,
                mediaType: "image",
              },
              sendResult: notification.qr.queued
                ? {
                  ok: true,
                  messageId: notification.qr.messageId,
                  zaapId: notification.qr.zaapId,
                  detail: notification.qr.detail || "pending",
                }
                : {
                  ok: false,
                  reason: notification.qr.reason || "send-failed",
                  detail: notification.qr.detail || null,
                  messageId: notification.qr.messageId || null,
                  zaapId: notification.qr.zaapId || null,
                },
            });
          }

          if (previousStatus === status.RECEBIDO && newStatus === status.CONFIRMADO) {
            groupNotification = await sendOrderConfirmedGroupNotification({
              tenantId: updatedOrder.tenant_id || client.tenant_id || 1,
              orderCode,
              clientName: client.nome,
              city: client.cidade || null,
              paymentMethod: updatedOrder.payment_method || null,
              orderTotal,
              orderItems,
            });

            await persistWhatsAppAttempt({
              orderId,
              target: "group",
              eventType: "order_confirmed_group",
              destinationPhone: groupNotification.groupId || null,
              messageText: groupNotification.messageText || null,
              payload: {
                orderCode,
                groupName: groupNotification.groupName || null,
              },
              sendResult: groupNotification.queued
                ? {
                  ok: true,
                  messageId: groupNotification.messageId,
                  zaapId: groupNotification.zaapId,
                  detail: "pending",
                }
                : {
                  ok: false,
                  reason: groupNotification.reason || "group-send-failed",
                  detail: groupNotification.detail || null,
                },
            });
          }

          if (notification?.queued || notification?.sent) {
            return res.json({ ok: true, previousStatus, newStatus, locale, stock, notification, groupNotification, order: updatedOrder });
          }

          if (!["missing-phone", "phone-not-on-whatsapp"].includes(notification?.reason || "")) {
            return res.json({ ok: true, previousStatus, newStatus, locale, stock, notification, groupNotification, order: updatedOrder });
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
        locale: normalizeLocale(updatedOrder.locale || "pt"),
        stock,
        notification,
        groupNotification,
        order: updatedOrder,
      });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: error?.message || "Erro interno ao atualizar status do pedido.",
        detail: error?.detail || String(error?.message || error),
      });
    }
  });

  return router;
}
