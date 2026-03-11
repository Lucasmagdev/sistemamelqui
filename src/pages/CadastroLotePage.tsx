import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { backendRequest } from "@/lib/backendClient";

type ProductOption = {
  product_id: number;
  product_name: string;
  stock_unit: "LB" | "KG" | "UN";
};

type InvoiceItem = {
  description: string;
  product_id: string;
  quantity: string;
  unit: "LB" | "KG" | "UN";
  unit_cost: string;
  total: string;
  expiry_date: string;
};

const normalizeUnit = (value: string): "LB" | "KG" | "UN" => {
  const raw = String(value || "").toUpperCase();
  if (raw === "KG") return "KG";
  if (raw === "UN") return "UN";
  return "LB";
};

const emptyItem = (): InvoiceItem => ({
  description: "",
  product_id: "",
  quantity: "",
  unit: "LB",
  unit_cost: "",
  total: "",
  expiry_date: "",
});

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

    setProcessingInvoice(true);
    try {
      const payload = await backendRequest<{ ai_json: any }>(`/api/stock/invoices/${invoiceId}/process`, {
        method: "POST",
        body: JSON.stringify({ locale: "pt" }),
      });

      const ai = payload.ai_json || {};
      const items = Array.isArray(ai.items) ? ai.items : [];

      setInvoiceMeta({
        supplier: ai.supplier || "",
        invoice_number: ai.invoice_number || "",
        invoice_date: ai.invoice_date || "",
      });

      setInvoiceItems(items.map((item: any) => ({
        description: item.description || item.descricao || "",
        product_id: item.product_id ? String(item.product_id) : "",
        quantity: item.quantity != null ? String(item.quantity) : "",
        unit: normalizeUnit(item.unit || "LB"),
        unit_cost: item.unit_cost != null ? String(item.unit_cost) : "",
        total: item.total != null ? String(item.total) : "",
        expiry_date: item.expiry_date || "",
      })));

      if (!items.length) setInvoiceItems([emptyItem()]);
      toast.success("Processamento concluido. Revise os itens antes de aplicar.");
    } catch (error: any) {
      toast.error(error.message || "Erro ao processar nota");
    } finally {
      setProcessingInvoice(false);
    }
  };

  const updateInvoiceItem = (index: number, patch: Partial<InvoiceItem>) => {
    setInvoiceItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const applyInvoice = async () => {
    if (!invoiceId) {
      toast.error("Nao existe nota para aplicar");
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
              quantity: item.quantity ? Number(item.quantity) : null,
              unit: normalizeUnit(item.unit),
              unit_cost: item.unit_cost ? Number(item.unit_cost) : null,
              total: item.total ? Number(item.total) : null,
              expiry_date: item.expiry_date || null,
            })),
          },
        }),
      });

      toast.success("Nota aplicada no estoque com sucesso");
      navigate("/admin/estoque");
    } catch (error: any) {
      toast.error(error.message || "Erro ao aplicar nota no estoque");
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
            {invoiceItems.map((item, idx) => (
              <div key={`invoice-item-${idx}`} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-12">
                <Input className="md:col-span-3" placeholder="Descricao" value={item.description} onChange={(e) => updateInvoiceItem(idx, { description: e.target.value })} />
                <select className="md:col-span-3 h-10 rounded-md border border-input bg-background px-3 text-sm" value={item.product_id} onChange={(e) => updateInvoiceItem(idx, { product_id: e.target.value })}>
                  <option value="">Mapear produto...</option>
                  {products.map((product) => (
                    <option key={`${idx}-${product.product_id}`} value={product.product_id}>{product.product_name}</option>
                  ))}
                </select>
                <Input className="md:col-span-1" type="number" step="0.001" placeholder="Qtd" value={item.quantity} onChange={(e) => updateInvoiceItem(idx, { quantity: e.target.value })} />
                <select className="md:col-span-1 h-10 rounded-md border border-input bg-background px-3 text-sm" value={item.unit} onChange={(e) => updateInvoiceItem(idx, { unit: normalizeUnit(e.target.value) })}>
                  <option value="LB">LB</option>
                  <option value="KG">KG</option>
                  <option value="UN">UN</option>
                </select>
                <Input className="md:col-span-1" type="number" step="0.0001" placeholder="Unit" value={item.unit_cost} onChange={(e) => updateInvoiceItem(idx, { unit_cost: e.target.value })} />
                <Input className="md:col-span-1" type="number" step="0.01" placeholder="Total" value={item.total} onChange={(e) => updateInvoiceItem(idx, { total: e.target.value })} />
                <Input className="md:col-span-1" type="date" value={item.expiry_date} onChange={(e) => updateInvoiceItem(idx, { expiry_date: e.target.value })} />
                <Button type="button" variant="outline" className="md:col-span-1" onClick={() => removeInvoiceItem(idx)}>Remover</Button>
              </div>
            ))}

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
