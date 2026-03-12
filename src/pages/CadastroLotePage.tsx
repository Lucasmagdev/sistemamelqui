import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BackendRequestError, backendRequest } from "@/lib/backendClient";

type ProductOption = {
  product_id: number;
  product_name: string;
  stock_unit: "LB" | "KG" | "UN";
};

type InvoiceItem = {
  description: string;
  product_id: string;
  product_query: string;
  quantity: string;
  unit: "LB" | "KG" | "UN";
  unit_cost: string;
  total: string;
};

type InvoiceItemValidation = {
  row: number;
  reasons: Array<"missing_product" | "invalid_quantity" | "invalid_unit">;
  message: string;
};

type ProductDedupSuggestion = {
  product_id: number;
  product_name: string;
  score: number;
};

type RowConflictState = {
  suggested_name: string;
  matches: ProductDedupSuggestion[];
  message: string;
};

const parseDecimalOrNull = (value: string): number | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let normalized = raw.replace(/[^\d,.-]/g, "");
  if (!normalized) return null;

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeUnit = (value: string): "LB" | "KG" | "UN" => {
  const raw = String(value || "").toUpperCase();
  if (raw === "KG") return "KG";
  if (raw === "UN") return "UN";
  return "LB";
};

const parsePositiveInteger = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeSearchText = (value: string): string =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const similarityScore = (query: string, target: string): number => {
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
};

const emptyItem = (): InvoiceItem => ({
  description: "",
  product_id: "",
  product_query: "",
  quantity: "",
  unit: "LB",
  unit_cost: "",
  total: "",
});

const isUnitPairConvertible = (fromUnit: "LB" | "KG" | "UN", toUnit: "LB" | "KG" | "UN") => {
  if (fromUnit === toUnit) return true;
  if ((fromUnit === "KG" && toUnit === "LB") || (fromUnit === "LB" && toUnit === "KG")) return true;
  return false;
};

const resolveInvoiceUnitForProduct = (
  currentUnit: "LB" | "KG" | "UN",
  productUnit?: "LB" | "KG" | "UN",
): "LB" | "KG" | "UN" => {
  if (!productUnit) return currentUnit;
  if (isUnitPairConvertible(currentUnit, productUnit)) return currentUnit;
  return productUnit;
};

export default function CadastroLotePage() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [manualForm, setManualForm] = useState({
    product_id: "",
    origem: "",
    qty: "",
    unit: "LB" as "LB" | "KG" | "UN",
    custo_total: "",
    custo_unitario: "",
    data_validade: "",
    observacoes: "",
  });
  const [savingManual, setSavingManual] = useState(false);

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [processingInvoice, setProcessingInvoice] = useState(false);
  const [applyingInvoice, setApplyingInvoice] = useState(false);

  const [invoiceMeta, setInvoiceMeta] = useState({
    supplier: "",
    invoice_number: "",
    invoice_date: "",
  });
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoiceValidation, setInvoiceValidation] = useState<InvoiceItemValidation[]>([]);
  const [createConflicts, setCreateConflicts] = useState<Record<number, RowConflictState>>({});
  const [creatingRow, setCreatingRow] = useState<number | null>(null);
  const [declaredItemsCountInput, setDeclaredItemsCountInput] = useState("");

  useEffect(() => {
    const loadProducts = async () => {
      setLoadingProducts(true);
      try {
        const payload = await backendRequest<{ rows: ProductOption[] }>("/api/stock/balance");
        setProducts((payload.rows || []).map((row: any) => ({
          product_id: row.product_id,
          product_name: row.product_name,
          stock_unit: normalizeUnit(row.stock_unit),
        })));
      } catch (error: any) {
        toast.error(error.message || "Erro ao carregar produtos");
      } finally {
        setLoadingProducts(false);
      }
    };

    loadProducts();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((item) => String(item.product_id) === manualForm.product_id),
    [products, manualForm.product_id],
  );

  const searchableProducts = useMemo(
    () =>
      products.map((item) => ({
        ...item,
        normalized_name: normalizeSearchText(item.product_name),
      })),
    [products],
  );

  const validationByRow = useMemo(
    () => new Map(invoiceValidation.map((item) => [item.row, item])),
    [invoiceValidation],
  );
  const extractedItemsCount = useMemo(
    () =>
      invoiceItems.filter((item) =>
        Boolean(String(item.description || item.product_query || "").trim()),
      ).length,
    [invoiceItems],
  );
  const declaredItemsCount = useMemo(
    () => parsePositiveInteger(declaredItemsCountInput),
    [declaredItemsCountInput],
  );
  const hasItemsCountMismatch =
    declaredItemsCount != null && extractedItemsCount !== declaredItemsCount;

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setManualForm((prev) => ({ ...prev, [name]: value }));
  };

  const submitManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingManual(true);

    try {
      await backendRequest("/api/stock/entries/manual", {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(manualForm.product_id),
          origem: manualForm.origem || null,
          qty: Number(manualForm.qty),
          unit: manualForm.unit,
          custo_total: manualForm.custo_total ? Number(manualForm.custo_total) : null,
          custo_unitario: manualForm.custo_unitario ? Number(manualForm.custo_unitario) : null,
          data_validade: manualForm.data_validade || null,
          observacoes: manualForm.observacoes || null,
        }),
      });

      toast.success("Entrada manual registrada com sucesso");
      setManualForm({
        product_id: "",
        origem: "",
        qty: "",
        unit: "LB",
        custo_total: "",
        custo_unitario: "",
        data_validade: "",
        observacoes: "",
      });
      navigate("/admin/estoque");
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar entrada manual");
    } finally {
      setSavingManual(false);
    }
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });

  const uploadInvoice = async () => {
    if (!invoiceFile) {
      toast.error("Selecione a foto da nota fiscal");
      return;
    }

    setInvoiceValidation([]);
    setCreateConflicts({});
    setDeclaredItemsCountInput("");
    setUploadingInvoice(true);
    try {
      const fileBase64 = await readFileAsDataUrl(invoiceFile);
      const payload = await backendRequest<{ invoice: { id: number } }>("/api/stock/invoices/upload", {
        method: "POST",
        body: JSON.stringify({
          fileName: invoiceFile.name,
          mimeType: invoiceFile.type,
          fileBase64,
        }),
      });

      setInvoiceId(payload.invoice.id);
      toast.success(`Nota enviada. ID ${payload.invoice.id}`);
    } catch (error: any) {
      toast.error(error.message || "Erro no upload da nota");
    } finally {
      setUploadingInvoice(false);
    }
  };

  const processInvoice = async () => {
    if (!invoiceId) {
      toast.error("Envie a nota antes de processar");
      return;
    }

    setInvoiceValidation([]);
    setCreateConflicts({});
    setProcessingInvoice(true);
    try {
      const payload = await backendRequest<{ ai_json: any; warning?: string; detail?: string }>(`/api/stock/invoices/${invoiceId}/process`, {
        method: "POST",
        body: JSON.stringify({ locale: "pt" }),
      });

      const ai = payload.ai_json || {};
      const items = Array.isArray(ai.items) ? ai.items : [];
      const detectedDeclaredCount = parsePositiveInteger(
        ai.declared_items_count ?? ai.total_items ?? ai.items_total ?? ai.quantity_total,
      );

      setInvoiceMeta({
        supplier: ai.supplier || "",
        invoice_number: ai.invoice_number || "",
        invoice_date: ai.invoice_date || "",
      });
      setDeclaredItemsCountInput(detectedDeclaredCount ? String(detectedDeclaredCount) : "");

      setInvoiceItems(items.map((item: any) => {
        const rawObserved = String(
          item.product_service
          || item.productService
          || item.description
          || item.descricao
          || item.product_id
          || "",
        ).trim();
        const description = rawObserved;
        const parsedId = Number.parseInt(String(item.product_id || "").replace(/[^\d]/g, ""), 10);
        const normalizedProductId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;
        const matchedProduct = normalizedProductId
          ? products.find((product) => product.product_id === normalizedProductId)
          : null;
        const productStockUnit = matchedProduct ? normalizeUnit(matchedProduct.stock_unit) : undefined;
        const aiUnit = normalizeUnit(item.unit || "LB");

        return {
          description,
          product_id: matchedProduct ? String(matchedProduct.product_id) : "",
          product_query: matchedProduct?.product_name || rawObserved,
          quantity: item.quantity != null ? String(item.quantity) : "",
          unit: resolveInvoiceUnitForProduct(aiUnit, productStockUnit),
          unit_cost: item.price != null ? String(item.price) : (item.unit_cost != null ? String(item.unit_cost) : ""),
          total: item.total != null ? String(item.total) : "",
        };
      }));

      if (!items.length) setInvoiceItems([emptyItem()]);
      if (payload.warning) {
        toast.warning(payload.detail ? `${payload.warning} ${payload.detail}` : payload.warning);
      } else {
        toast.success("Processamento concluido. Revise os itens antes de aplicar.");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao processar nota");
    } finally {
      setProcessingInvoice(false);
    }
  };

  const updateInvoiceItem = (index: number, patch: Partial<InvoiceItem>) => {
    setInvoiceValidation((prev) => prev.filter((item) => item.row !== index));
    setCreateConflicts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setInvoiceItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const findBestProductMatch = (rawQuery: string) => {
    const query = normalizeSearchText(rawQuery);
    if (!query) return null;

    let best: { product_id: number; product_name: string; score: number } | null = null;
    for (const product of searchableProducts) {
      const score = similarityScore(query, product.normalized_name);
      if (!best || score > best.score) {
        best = { product_id: product.product_id, product_name: product.product_name, score };
      }
    }

    if (!best || best.score < 0.45) return null;
    return best;
  };

  const handleInvoiceProductQueryChange = (index: number, rawQuery: string) => {
    setInvoiceValidation((prev) => prev.filter((item) => item.row !== index));
    setCreateConflicts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    const query = String(rawQuery || "");
    const normalizedQuery = normalizeSearchText(query);

    setInvoiceItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;

        if (!normalizedQuery) {
          return { ...item, product_query: "", product_id: "" };
        }

        const exact = searchableProducts.find((product) => product.normalized_name === normalizedQuery);
        if (exact) {
          const productUnit = normalizeUnit(exact.stock_unit);
          const resolvedUnit = resolveInvoiceUnitForProduct(item.unit, productUnit);
          return { ...item, product_query: query, product_id: String(exact.product_id), unit: resolvedUnit };
        }

        const best = findBestProductMatch(query);
        if (best) {
          const product = products.find((p) => p.product_id === best.product_id);
          const productUnit = product ? normalizeUnit(product.stock_unit) : undefined;
          const resolvedUnit = resolveInvoiceUnitForProduct(item.unit, productUnit);
          return { ...item, product_query: query, product_id: String(best.product_id), unit: resolvedUnit };
        }

        return { ...item, product_query: query, product_id: "" };
      }),
    );
  };

  const mapRowToExistingProduct = (index: number, product: ProductDedupSuggestion) => {
    const productOption = products.find((item) => item.product_id === product.product_id);
    const productUnit = productOption ? normalizeUnit(productOption.stock_unit) : undefined;
    const currentItem = invoiceItems[index];
    const currentUnit = currentItem ? normalizeUnit(currentItem.unit) : "LB";
    const resolvedUnit = resolveInvoiceUnitForProduct(currentUnit, productUnit);
    updateInvoiceItem(index, {
      product_id: String(product.product_id),
      product_query: product.product_name,
      unit: resolvedUnit,
    });
    setCreateConflicts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const createProductFromInvoiceRow = async (index: number, forceCreate = false) => {
    const item = invoiceItems[index];
    if (!item) return;

    const candidateName = String(item.product_query || item.description || "").trim();
    if (!candidateName) {
      toast.error("Informe um nome para criar o produto.");
      return;
    }

    setCreatingRow(index);
    try {
      const payload = await backendRequest<{
        product: { id: number; nome: string; stock_unit?: string; unidade?: string };
      }>("/api/stock/products/create-from-invoice", {
        method: "POST",
        body: JSON.stringify({
          name: candidateName,
          stock_unit: item.unit,
          category: "Nao categorizado",
          tenant_id: 1,
          force_create: forceCreate,
        }),
      });

      const created = payload.product;
      const createdOption: ProductOption = {
        product_id: Number(created.id),
        product_name: created.nome,
        stock_unit: normalizeUnit(created.stock_unit || created.unidade || item.unit),
      };

      setProducts((prev) => {
        if (prev.some((product) => product.product_id === createdOption.product_id)) return prev;
        return [...prev, createdOption].sort((a, b) => a.product_name.localeCompare(b.product_name, "pt-BR"));
      });

      updateInvoiceItem(index, {
        product_id: String(createdOption.product_id),
        product_query: createdOption.product_name,
        unit: createdOption.stock_unit,
      });

      setCreateConflicts((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });

      toast.success("Produto criado e mapeado na linha.");
    } catch (error: any) {
      if (error instanceof BackendRequestError && error.status === 409) {
        const matchesRaw = Array.isArray(error.data?.suggested_matches) ? error.data.suggested_matches : [];
        const matches: ProductDedupSuggestion[] = matchesRaw
          .map((m: any) => ({
            product_id: Number(m.product_id),
            product_name: String(m.product_name || ""),
            score: Number(m.score || 0),
          }))
          .filter((m) => Number.isFinite(m.product_id) && m.product_id > 0 && m.product_name);

        setCreateConflicts((prev) => ({
          ...prev,
          [index]: {
            suggested_name: String(error.data?.suggested_name || candidateName),
            matches,
            message: error.data?.error || "Produto parecido encontrado. Revise antes de criar.",
          },
        }));

        toast.warning("Encontramos produto parecido. Escolha um existente ou force a criação.");
      } else {
        toast.error(error.message || "Erro ao criar produto.");
      }
    } finally {
      setCreatingRow((current) => (current === index ? null : current));
    }
  };

  const removeInvoiceItem = (index: number) => {
    setInvoiceValidation((prev) =>
      prev
        .filter((item) => item.row !== index)
        .map((item) => (item.row > index ? { ...item, row: item.row - 1 } : item)),
    );
    setCreateConflicts((prev) => {
      const next: Record<number, RowConflictState> = {};
      for (const [key, value] of Object.entries(prev)) {
        const row = Number(key);
        if (row === index) continue;
        next[row > index ? row - 1 : row] = value;
      }
      return next;
    });
    setInvoiceItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const applyInvoice = async () => {
    if (!invoiceId) {
      toast.error("Nao existe nota para aplicar");
      return;
    }

    const preValidation: InvoiceItemValidation[] = invoiceItems
      .map((item, index) => {
        if (!item.product_id) return null;
        const quantity = parseDecimalOrNull(item.quantity);
        if (quantity == null || quantity <= 0) return null;

        const mappedProduct = products.find((product) => String(product.product_id) === item.product_id);
        if (!mappedProduct) return null;

        const fromUnit = normalizeUnit(item.unit);
        const toUnit = normalizeUnit(mappedProduct.stock_unit);
        if (isUnitPairConvertible(fromUnit, toUnit)) return null;

        return {
          row: index,
          reasons: ["invalid_unit"] as Array<"invalid_unit">,
          message: `Unidade invalida para o produto (${fromUnit} -> ${toUnit})`,
        };
      })
      .filter(Boolean) as InvoiceItemValidation[];

    if (preValidation.length > 0) {
      setInvoiceValidation(preValidation);
      toast.error("Corrija as unidades destacadas em vermelho antes de aplicar a nota.");
      return;
    }

    setApplyingInvoice(true);
    try {
      await backendRequest(`/api/stock/invoices/${invoiceId}/apply`, {
        method: "POST",
        body: JSON.stringify({
          review_json: {
            supplier: invoiceMeta.supplier || null,
            invoice_number: invoiceMeta.invoice_number || null,
            invoice_date: invoiceMeta.invoice_date || null,
            items: invoiceItems.map((item) => ({
              description: item.description,
              product_id: item.product_id ? Number(item.product_id) : null,
              quantity: parseDecimalOrNull(item.quantity),
              unit: normalizeUnit(item.unit),
              unit_cost: parseDecimalOrNull(item.unit_cost),
              total: parseDecimalOrNull(item.total),
            })),
          },
        }),
      });

      toast.success("Nota aplicada no estoque com sucesso");
      setInvoiceValidation([]);
      setCreateConflicts({});
      navigate("/admin/estoque");
    } catch (error: any) {
      if (error instanceof BackendRequestError) {
        const invalidItemsRaw = Array.isArray(error.data?.invalid_items) ? error.data.invalid_items : [];
        const parsedValidation: InvoiceItemValidation[] = invalidItemsRaw
          .map((invalid: any) => {
            const row = Number(invalid?.index);
            const reasonList = Array.isArray(invalid?.reason) ? invalid.reason : [];
            const reasons: Array<"missing_product" | "invalid_quantity" | "invalid_unit"> = [];
            if (reasonList.includes("missing_product")) reasons.push("missing_product");
            if (reasonList.includes("invalid_quantity")) reasons.push("invalid_quantity");
            if (reasonList.includes("invalid_unit")) reasons.push("invalid_unit");
            if (!Number.isInteger(row) || row < 0 || !reasons.length) return null;

            const message = reasons
              .map((reason) =>
                reason === "missing_product"
                  ? "Produto no estoque nao mapeado"
                  : reason === "invalid_quantity"
                    ? "Quantidade invalida"
                    : "Unidade invalida para o produto",
              )
              .join(" e ");

            return { row, reasons, message };
          })
          .filter(Boolean) as InvoiceItemValidation[];

        if (parsedValidation.length > 0) {
          setInvoiceValidation(parsedValidation);
          toast.error("Corrija os campos em vermelho antes de aplicar a nota.");
        } else {
          toast.error(error.message || "Erro ao aplicar nota no estoque");
        }
      } else {
        toast.error(error.message || "Erro ao aplicar nota no estoque");
      }
    } finally {
      setApplyingInvoice(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Entrada de Estoque</h1>
        <p className="text-sm text-muted-foreground">Manual ou por foto de nota fiscal</p>
      </div>

      <form onSubmit={submitManualEntry} className="space-y-4 rounded-xl border border-border bg-card p-6 card-elevated">
        <h2 className="text-lg font-semibold">Entrada Manual</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Produto</Label>
            <select name="product_id" value={manualForm.product_id} onChange={handleManualChange} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Selecione...</option>
              {products.map((item) => (
                <option key={item.product_id} value={item.product_id}>{item.product_name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <select name="unit" value={manualForm.unit} onChange={handleManualChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="LB">LB</option>
              <option value="KG">KG</option>
              <option value="UN">UN</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade</Label>
            <Input name="qty" type="number" step="0.001" value={manualForm.qty} onChange={handleManualChange} required />
          </div>
          <div className="space-y-1.5">
            <Label>Origem</Label>
            <Input name="origem" value={manualForm.origem} onChange={handleManualChange} placeholder="Ex: Frigorifico" />
          </div>
          <div className="space-y-1.5">
            <Label>Validade</Label>
            <Input name="data_validade" type="date" value={manualForm.data_validade} onChange={handleManualChange} />
          </div>
          <div className="space-y-1.5">
            <Label>Custo total</Label>
            <Input name="custo_total" type="number" step="0.01" value={manualForm.custo_total} onChange={handleManualChange} />
          </div>
          <div className="space-y-1.5">
            <Label>Custo unitario</Label>
            <Input name="custo_unitario" type="number" step="0.0001" value={manualForm.custo_unitario} onChange={handleManualChange} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label>Observacoes</Label>
            <Textarea name="observacoes" value={manualForm.observacoes} onChange={handleManualChange} rows={2} />
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="submit" disabled={savingManual || loadingProducts}>{savingManual ? "Salvando..." : "Salvar Entrada Manual"}</Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/estoque")}>Voltar</Button>
          {selectedProduct ? <span className="self-center text-xs text-muted-foreground">Unidade base: {selectedProduct.stock_unit}</span> : null}
        </div>
      </form>

      <div className="space-y-4 rounded-xl border border-border bg-card p-6 card-elevated">
        <h2 className="text-lg font-semibold">Nota Fiscal por Foto</h2>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Foto da nota</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} />
          </div>
          <Button type="button" onClick={uploadInvoice} disabled={uploadingInvoice || !invoiceFile}>{uploadingInvoice ? "Enviando..." : "Enviar Nota"}</Button>
          <Button type="button" variant="outline" onClick={processInvoice} disabled={processingInvoice || !invoiceId}>{processingInvoice ? "Processando..." : "Processar OCR + IA"}</Button>
          {invoiceId ? <span className="text-xs text-muted-foreground">ID nota: {invoiceId}</span> : null}
        </div>

        {invoiceId ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5"><Label>Fornecedor</Label><Input value={invoiceMeta.supplier} onChange={(e) => setInvoiceMeta((prev) => ({ ...prev, supplier: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Numero da nota</Label><Input value={invoiceMeta.invoice_number} onChange={(e) => setInvoiceMeta((prev) => ({ ...prev, invoice_number: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Data da nota</Label><Input type="date" value={invoiceMeta.invoice_date} onChange={(e) => setInvoiceMeta((prev) => ({ ...prev, invoice_date: e.target.value }))} /></div>
          </div>
        ) : null}

        {invoiceItems.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Padrao da tabela da nota: <strong>Product/Service | Quantity | Price | Total</strong>. Abaixo de cada linha, revise as informacoes do lote.
            </p>
            <div className={`rounded-lg border p-3 ${hasItemsCountMismatch ? "border-amber-500/70 bg-amber-500/10" : "border-border bg-muted/20"}`}>
              <p className="text-sm">
                Itens extraidos: <strong>{extractedItemsCount}</strong> / Total da nota: <strong>{declaredItemsCount ?? "--"}</strong>
              </p>
              <div className="mt-3 grid gap-1 md:max-w-xs">
                <Label className="text-xs text-muted-foreground">Total de itens da nota</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Ex.: 24"
                  value={declaredItemsCountInput}
                  onChange={(e) => setDeclaredItemsCountInput(e.target.value)}
                />
              </div>
              {hasItemsCountMismatch ? (
                <p className="mt-2 text-xs text-amber-200">
                  A nota indica {declaredItemsCount} itens, mas foram extraidos {extractedItemsCount}. Revise as linhas antes de aplicar.
                </p>
              ) : declaredItemsCount != null ? (
                <p className="mt-2 text-xs text-emerald-300">Contagem de itens confere com a nota.</p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Se a IA nao detectar, informe manualmente o total de itens da nota.</p>
              )}
            </div>
            {invoiceValidation.length > 0 ? (
              <div className="rounded-lg border border-red-500/70 bg-red-500/10 p-3 text-sm text-red-200">
                <p className="font-semibold">Corrija os itens destacados em vermelho:</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {invoiceValidation.map((item) => (
                    <li key={`invoice-validation-${item.row}`}>
                      Linha {item.row + 1}: {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="w-14 px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Product/Service</th>
                    <th className="px-3 py-2 text-left font-medium">Quantity</th>
                    <th className="px-3 py-2 text-left font-medium">Price</th>
                    <th className="px-3 py-2 text-left font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceItems.map((item, idx) => {
                    const rowValidation = validationByRow.get(idx);
                    const hasProductError = Boolean(rowValidation?.reasons.includes("missing_product"));
                    const hasQuantityError = Boolean(rowValidation?.reasons.includes("invalid_quantity"));
                    const hasUnitError = Boolean(rowValidation?.reasons.includes("invalid_unit"));
                    const rowConflict = createConflicts[idx];
                    const mappedProduct = item.product_id
                      ? products.find((product) => String(product.product_id) === item.product_id)
                      : null;
                    const mappedUnit = mappedProduct ? normalizeUnit(mappedProduct.stock_unit) : null;
                    const availableUnits = !mappedUnit
                      ? (["LB", "KG", "UN"] as const)
                      : mappedUnit === "UN"
                        ? (["UN"] as const)
                        : (["LB", "KG"] as const);

                    return (
                    <Fragment key={`invoice-item-${idx}`}>
                      <tr className={`border-t align-top ${rowValidation ? "border-red-500/70 bg-red-500/5" : "border-border"}`}>
                        <td className="px-3 py-2 text-sm font-semibold text-muted-foreground">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2">
                          <Input placeholder="Descricao do produto/servico" value={item.description} onChange={(e) => updateInvoiceItem(idx, { description: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <Input className={hasQuantityError ? "border-red-500 text-red-200 focus-visible:ring-red-500" : ""} type="number" step="0.001" placeholder="0.000" value={item.quantity} onChange={(e) => updateInvoiceItem(idx, { quantity: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" step="0.0001" placeholder="0.0000" value={item.unit_cost} onChange={(e) => updateInvoiceItem(idx, { unit_cost: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" step="0.01" placeholder="0.00" value={item.total} onChange={(e) => updateInvoiceItem(idx, { total: e.target.value })} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button type="button" variant="outline" onClick={() => removeInvoiceItem(idx)}>Remover</Button>
                        </td>
                      </tr>
                      <tr className={`border-t border-dashed ${rowValidation ? "border-red-500/70 bg-red-500/5" : "border-border bg-muted/20"}`}>
                        <td colSpan={6} className="px-3 py-3">
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Produto no estoque</Label>
                              <Input
                                className={hasProductError ? "border-red-500 text-red-200 focus-visible:ring-red-500" : ""}
                                placeholder="Buscar aproximado: ex. figado frango"
                                value={item.product_query}
                                list={`invoice-product-options-${idx}`}
                                onChange={(e) => handleInvoiceProductQueryChange(idx, e.target.value)}
                              />
                              <datalist id={`invoice-product-options-${idx}`}>
                                {products.map((product) => (
                                  <option key={`${idx}-opt-${product.product_id}`} value={product.product_name} />
                                ))}
                              </datalist>
                              <p className={`text-[11px] ${hasProductError ? "text-red-300" : "text-muted-foreground"}`}>
                                {item.product_id
                                  ? `Mapeado: ${products.find((product) => String(product.product_id) === item.product_id)?.product_name || `ID ${item.product_id}`}`
                                  : "Sem mapeamento automatico. Continue digitando ou escolha na lista."}
                              </p>
                              {rowValidation ? <p className="text-[11px] text-red-300">{rowValidation.message}</p> : null}
                              {!item.product_id ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 text-xs"
                                    onClick={() => createProductFromInvoiceRow(idx, false)}
                                    disabled={creatingRow === idx}
                                  >
                                    {creatingRow === idx ? "Criando..." : "Criar novo produto"}
                                  </Button>
                                </div>
                              ) : null}
                              {rowConflict ? (
                                <div className="mt-2 rounded-md border border-amber-500/70 bg-amber-500/10 p-2">
                                  <p className="text-[11px] font-semibold text-amber-300">{rowConflict.message}</p>
                                  {rowConflict.matches.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {rowConflict.matches.map((match) => (
                                        <Button
                                          key={`row-${idx}-match-${match.product_id}`}
                                          type="button"
                                          variant="outline"
                                          className="h-7 text-[11px]"
                                          onClick={() => mapRowToExistingProduct(idx, match)}
                                        >
                                          Usar {match.product_name} ({Math.round(match.score * 100)}%)
                                        </Button>
                                      ))}
                                    </div>
                                  ) : null}
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      className="h-7 text-[11px]"
                                      onClick={() => createProductFromInvoiceRow(idx, true)}
                                      disabled={creatingRow === idx}
                                    >
                                      {creatingRow === idx ? "Criando..." : "Forcar criacao mesmo assim"}
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Unidade do lote</Label>
                              <select
                                className={`h-10 w-full rounded-md border bg-background px-3 text-sm ${hasUnitError ? "border-red-500 text-red-200 focus-visible:ring-red-500" : "border-input"}`}
                                value={item.unit}
                                onChange={(e) => updateInvoiceItem(idx, { unit: normalizeUnit(e.target.value) })}
                              >
                                {availableUnits.map((unit) => (
                                  <option key={`row-${idx}-unit-${unit}`} value={unit}>
                                    {unit}
                                  </option>
                                ))}
                              </select>
                              {mappedUnit ? (
                                <p className={`text-[11px] ${hasUnitError ? "text-red-300" : "text-muted-foreground"}`}>
                                  Unidade do produto mapeado: {mappedUnit}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  )})}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setInvoiceItems((prev) => [...prev, emptyItem()])}>Adicionar item</Button>
              <Button type="button" onClick={applyInvoice} disabled={applyingInvoice}>{applyingInvoice ? "Aplicando..." : "Aplicar no Estoque"}</Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
