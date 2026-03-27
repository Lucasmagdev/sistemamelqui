import { Router } from "express";

export function createOrdersRouter(deps) {
  const {
    supabase,
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
  } = deps;

  const router = Router();

  router.get("/admin", async (req, res) => {
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

  router.get("/:id/messages", async (req, res) => {
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

  router.post("/:id/status", async (req, res) => {
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

      if (previousStatus !== status.CONCLUIDO && newStatus === status.CONCLUIDO) {
        stock = await applyOrderStockExit(orderId);
      }

      if (previousStatus === status.CONCLUIDO && newStatus < status.CONCLUIDO) {
        stock = await applyOrderStockReversal(orderId, `status_${previousStatus}_to_${newStatus}`);
      }

      const { error: updateError } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);

      if (updateError) {
        if (previousStatus !== status.CONCLUIDO && newStatus === status.CONCLUIDO && stock.applied) {
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
        previousStatus === status.RECEBIDO && newStatus === status.CONFIRMADO
          ? "order_confirmed_client"
          : previousStatus === status.PRONTO && newStatus === status.ENTREGA
            ? "order_dispatched_client"
            : previousStatus !== status.CONCLUIDO && newStatus === status.CONCLUIDO
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
            tenantId: order.tenant_id || client.tenant_id || 1,
            clientName: client.nome,
            clientPhone: client.telefone,
            orderCode,
            orderItems,
            orderTotal,
            locale,
            deliveryAddress,
            paymentMethod: order.payment_method || null,
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

  return router;
}
