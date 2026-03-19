import { Router } from "express";

export function createStockRouter(deps) {
  const {
    supabase,
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
    maxBase64Bytes,
    callPaperlessOcr,
    callGeminiExtraction,
    normalizeLocale,
    buildFallbackInvoiceJson,
    resolveProductIdsForInvoiceItems,
    parseLooseNumber,
    ensureInvoiceStockMovements,
  } = deps;

  const router = Router();

  router.post("/products/create-from-invoice", async (req, res) => {
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

  router.patch("/products/:id/settings", async (req, res) => {
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

  router.post("/entries/manual", async (req, res) => {
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

  router.get("/balance", async (_req, res) => {
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

  router.get("/alerts", async (_req, res) => {
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

  router.post("/invoices/upload", async (req, res) => {
    try {
      const fileName = sanitizeFileName(req.body?.fileName || "nota-fiscal.jpg");
      const base64Parsed = parseBase64Input(req.body?.fileBase64);
      const mimeType = req.body?.mimeType || base64Parsed.mimeType || "image/jpeg";

      const buffer = Buffer.from(base64Parsed.base64, "base64");
      if (!buffer.length) return res.status(400).json({ error: "Arquivo base64 invalido." });
      if (buffer.length > maxBase64Bytes) {
        return res.status(400).json({ error: `Arquivo excede limite de ${maxBase64Bytes} bytes para upload de nota fiscal.` });
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

  router.post("/invoices/:id/process", async (req, res) => {
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

  router.post("/invoices/:id/apply", async (req, res) => {
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

  return router;
}
