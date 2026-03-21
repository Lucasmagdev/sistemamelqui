import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, Download, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/contexts/TenantContext";
import { backendRequest } from "@/lib/backendClient";
import { useOperationalReportQuery, useStockProductsQuery, useStoreSalesHistoryQuery } from "@/hooks/useAdminQueries";

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

type Unit = "UN" | "LB" | "KG";

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const normalizeUnit = (value: string | undefined | null): Unit => {
  const raw = String(value || "").toUpperCase();
  if (raw === "KG") return "KG";
  if (raw === "UN") return "UN";
  return "LB";
};

const getAllowedSaleUnits = (stockUnit: string | undefined | null): Unit[] =>
  normalizeUnit(stockUnit) === "UN" ? ["UN"] : ["LB", "KG"];

const paymentMethodLabel = (value: string | undefined | null) => {
  switch (value) {
    case "pix":
      return "Pix";
    case "cartao":
      return "Cartao";
    case "dinheiro":
      return "Dinheiro";
    default:
      return "Nao informado";
  }
};

const quantityLabel = (value: number | string | null | undefined, unit: string | undefined | null) =>
  `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${normalizeUnit(unit)}`;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao converter logo para data URL."));
    reader.readAsDataURL(blob);
  });

const hexToRgb = (hex: string) => {
  const normalized = String(hex || "").replace("#", "").trim();
  if (normalized.length !== 6) return { r: 212, g: 175, b: 55 };
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) return { r: 212, g: 175, b: 55 };
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

type ProductOption = {
  id: number;
  name: string;
  stockUnit: Unit;
  salePrice: number;
  saldoQty: number;
  stockEnabled: boolean;
};

type SaleDraftItem = {
  productId: string;
  quantity: string;
  unitPrice: string;
  unit: Unit;
};

const createDraftItem = (): SaleDraftItem => ({
  productId: "",
  quantity: "1",
  unitPrice: "",
  unit: "UN",
});

const buildReceiptHtml = (sale: any) => {
  const itemsRows = (sale.items || [])
    .map(
      (item: any) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${item.product_name || item.product_id}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${item.quantity} ${item.unit}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${money(item.unit_price)}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${money(item.total_price)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <html>
      <head><title>Comprovante interno ${sale.id}</title></head>
      <body style="font-family:Arial,sans-serif;padding:24px;color:#111;">
        <h1 style="margin-bottom:4px;">Comprovante interno de venda presencial</h1>
        <p style="margin-top:0;color:#555;">Venda #${sale.id}</p>
        <p><strong>Data:</strong> ${new Date(sale.sale_datetime).toLocaleString("pt-BR")}</p>
        <p><strong>Pagamento:</strong> ${paymentMethodLabel(sale.payment_method)}</p>
        <p><strong>Responsavel:</strong> ${sale.created_by || "-"}</p>
        <p><strong>Observacoes:</strong> ${sale.notes || "-"}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #222;">Produto</th>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #222;">Quantidade</th>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #222;">Valor unitario</th>
              <th style="text-align:right;padding:8px;border-bottom:2px solid #222;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <h2 style="text-align:right;margin-top:24px;">Total: ${money(sale.total_amount)}</h2>
      </body>
    </html>
  `;
};

export default function VendasPage() {
  const { config } = useTenant();
  const queryClient = useQueryClient();
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saleDatetime, setSaleDatetime] = useState(new Date().toISOString().slice(0, 16));
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<SaleDraftItem[]>([createDraftItem()]);
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);

  const reportQuery = useOperationalReportQuery({ start, end });
  const productsQuery = useStockProductsQuery();
  const salesHistoryQuery = useStoreSalesHistoryQuery({ start, end }, historyOpen);

  const reportSummary = (reportQuery.data as any)?.report?.summary || null;
  const sales = (salesHistoryQuery.data as any)?.sales || [];
  const products = useMemo<ProductOption[]>(
    () =>
      (((productsQuery.data as any)?.rows || []) as any[])
        .map((row) => ({
          id: Number(row.product_id),
          name: row.product_name,
          stockUnit: normalizeUnit(row.stock_unit || "UN"),
          salePrice: Number(row.sale_price || 0),
          saldoQty: Number(row.saldo_qty || 0),
          stockEnabled: Boolean(row.stock_enabled),
        }))
        .sort((a, b) => {
          if (a.stockEnabled !== b.stockEnabled) return a.stockEnabled ? -1 : 1;
          return a.name.localeCompare(b.name, "pt-BR");
        }),
    [productsQuery.data],
  );

  const productsMap = useMemo(() => new Map(products.map((product) => [String(product.id), product])), [products]);
  const unavailableProducts = useMemo(() => products.filter((product) => !product.stockEnabled), [products]);
  const saleTotal = useMemo(
    () => draftItems.reduce((acc, item) => acc + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [draftItems],
  );

  const setItem = (index: number, patch: Partial<SaleDraftItem>) => {
    setDraftItems((prev) =>
      prev.map((item, currentIndex) => {
        if (currentIndex !== index) return item;
        const next = { ...item, ...patch };
        if (patch.productId !== undefined) {
          const product = productsMap.get(patch.productId);
          if (product) {
            if (!next.unitPrice) next.unitPrice = String(product.salePrice || "");
            const allowedUnits = getAllowedSaleUnits(product.stockUnit);
            const currentUnit = normalizeUnit(next.unit);
            next.unit = allowedUnits.includes(currentUnit) ? currentUnit : allowedUnits[0];
          }
        }
        return next;
      }),
    );
  };

  const addItem = () => setDraftItems((prev) => [...prev, createDraftItem()]);
  const removeItem = (index: number) => setDraftItems((prev) => (prev.length === 1 ? prev : prev.filter((_, currentIndex) => currentIndex !== index)));

  const printReceipt = (sale: any) => {
    const receiptWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!receiptWindow) {
      toast.error("Nao foi possivel abrir o comprovante.");
      return;
    }
    receiptWindow.document.write(buildReceiptHtml(sale));
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.print();
  };

  const downloadReceiptPdf = async (sale: any) => {
    let jsPDFConstructor: any;
    try {
      const module = await import("jspdf");
      jsPDFConstructor = module.jsPDF;
    } catch {
      toast.error("Nao foi possivel carregar o gerador de PDF.");
      return;
    }

    const doc = new jsPDFConstructor({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 42;
    const right = pageWidth - 42;
    const { r, g, b } = hexToRgb(config.corPrimaria);
    let y = 42;

    const loadLogoDataUrl = async () => {
      if (!config.logoUrl) return null;
      try {
        const logoUrl = config.logoUrl.startsWith("http") ? config.logoUrl : `${window.location.origin}${config.logoUrl}`;
        const response = await fetch(logoUrl);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await blobToDataUrl(blob);
      } catch {
        return null;
      }
    };

    const ensureSpace = (required = 20) => {
      if (y + required <= pageHeight - 48) return;
      doc.addPage();
      y = 42;
    };

    doc.setFillColor(16, 16, 16);
    doc.roundedRect(left, y, right - left, 118, 16, 16, "F");

    const logoDataUrl = await loadLogoDataUrl();
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", left + 18, y + 18, 88, 54, undefined, "FAST");
      } catch {
        // noop
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(21);
    doc.text(config.nomeEmpresa || "Sabor Imperial", logoDataUrl ? left + 122 : left + 20, y + 34);
    doc.setFontSize(10);
    doc.setTextColor(214, 214, 214);
    doc.text("Comprovante interno de venda presencial", logoDataUrl ? left + 122 : left + 20, y + 54);

    doc.setFillColor(r, g, b);
    doc.roundedRect(right - 138, y + 18, 120, 44, 12, 12, "F");
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL DA VENDA", right - 78, y + 35, { align: "center" });
    doc.setFontSize(16);
    doc.text(money(sale.total_amount), right - 78, y + 53, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(238, 238, 238);
    doc.setFontSize(10);
    doc.text(`Venda #${sale.id}`, left + 20, y + 84);
    doc.text(`Data: ${new Date(sale.sale_datetime).toLocaleString("pt-BR")}`, left + 20, y + 100);
    doc.text(`Pagamento: ${paymentMethodLabel(sale.payment_method)}`, left + 220, y + 84);
    doc.text(`Responsavel: ${sale.created_by || "-"}`, left + 220, y + 100);
    y += 140;

    doc.setFillColor(250, 248, 240);
    doc.roundedRect(left, y, right - left, 84, 14, 14, "F");
    doc.setTextColor(28, 28, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Resumo da venda", left + 18, y + 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Itens: ${(sale.items || []).length}`, left + 18, y + 44);
    doc.text(`Pagamento: ${paymentMethodLabel(sale.payment_method)}`, left + 18, y + 60);
    doc.text("Origem: Balcao / loja fisica", left + 240, y + 44);
    doc.text("Documento: interno", left + 240, y + 60);
    y += 102;

    if (sale.notes) {
      const noteLines = doc.splitTextToSize(`Observacoes: ${sale.notes}`, right - left - 24);
      doc.setFillColor(255, 251, 235);
      doc.roundedRect(left, y, right - left, Math.max(48, noteLines.length * 14 + 22), 12, 12, "F");
      doc.setTextColor(75, 55, 16);
      doc.setFont("helvetica", "bold");
      doc.text("Observacoes", left + 14, y + 18);
      doc.setFont("helvetica", "normal");
      doc.text(noteLines, left + 14, y + 36);
      y += Math.max(48, noteLines.length * 14 + 22) + 16;
    }

    doc.setFillColor(r, g, b);
    doc.roundedRect(left, y, right - left, 28, 8, 8, "F");
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("PRODUTO", left + 12, y + 18);
    doc.text("QTD", 300, y + 18);
    doc.text("UNITARIO", 390, y + 18);
    doc.text("TOTAL", right - 12, y + 18, { align: "right" });
    y += 42;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    for (const item of sale.items || []) {
      ensureSpace(64);
      const productLines = doc.splitTextToSize(item.product_name || String(item.product_id), 220);
      const rowHeight = Math.max(productLines.length * 14, 18) + 14;
      doc.setFillColor(248, 248, 248);
      doc.roundedRect(left, y - 12, right - left, rowHeight, 8, 8, "F");
      doc.text(productLines, left + 12, y);
      doc.text(quantityLabel(item.quantity, item.unit), 300, y);
      doc.text(money(item.unit_price), 390, y);
      doc.text(money(item.total_price), right - 12, y, { align: "right" });
      y += rowHeight + 6;
    }

    y += 8;
    ensureSpace(64);
    doc.setFillColor(16, 16, 16);
    doc.roundedRect(left, y, right - left, 54, 14, 14, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Total final", left + 16, y + 23);
    doc.setTextColor(r, g, b);
    doc.setFontSize(18);
    doc.text(money(sale.total_amount), right - 16, y + 24, { align: "right" });
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Documento interno gerado pelo painel administrativo.", left, pageHeight - 26);
    doc.save(`comprovante-venda-${sale.id}.pdf`);
  };

  const submitSaleMutation = useMutation({
    mutationFn: async () =>
      backendRequest<{ sale: any }>(editingSaleId ? `/api/store-sales/${editingSaleId}` : "/api/store-sales", {
        method: editingSaleId ? "PATCH" : "POST",
        body: JSON.stringify({
          saleDatetime: new Date(saleDatetime).toISOString(),
          paymentMethod,
          notes,
          createdBy: window.localStorage.getItem("imperial-flow-nome") || "admin",
          items: draftItems.map((item) => {
            const product = productsMap.get(item.productId);
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unit: item.unit || product?.stockUnit || "UN",
            };
          }),
        }),
      }),
    onSuccess: () => {
      setNotes("");
      setPaymentMethod("pix");
      setSaleDatetime(new Date().toISOString().slice(0, 16));
      setDraftItems([createDraftItem()]);
      setEditingSaleId(null);
      toast.success(editingSaleId ? "Venda presencial atualizada" : "Venda presencial registrada com baixa de estoque");
      queryClient.invalidateQueries({ queryKey: ["admin", "operational-report"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "store-sales-history"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stock-products"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao registrar venda presencial");
    },
  });

  const deleteSaleMutation = useMutation({
    mutationFn: (saleId: number) => backendRequest(`/api/store-sales/${saleId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Venda presencial excluida");
      queryClient.invalidateQueries({ queryKey: ["admin", "operational-report"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "store-sales-history"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stock-products"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir venda presencial");
    },
  });

  const startSaleEdit = (sale: any) => {
    setEditingSaleId(Number(sale.id));
    setSaleDatetime(sale.sale_datetime ? new Date(sale.sale_datetime).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16));
    setPaymentMethod(sale.payment_method || "pix");
    setNotes(sale.notes || "");
    setDraftItems(
      (sale.items || []).map((item: any) => ({
        productId: String(item.product_id || ""),
        quantity: String(item.quantity || ""),
        unitPrice: String(item.unit_price || ""),
        unit: normalizeUnit(item.unit || "UN"),
      })),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetSaleForm = () => {
    setEditingSaleId(null);
    setNotes("");
    setPaymentMethod("pix");
    setSaleDatetime(new Date().toISOString().slice(0, 16));
    setDraftItems([createDraftItem()]);
  };

  const submitSale = async (event: any) => {
    event.preventDefault();
    const invalidProduct = draftItems.map((item) => productsMap.get(item.productId)).find((product) => product && !product.stockEnabled);
    if (invalidProduct) {
      toast.error(`O produto ${invalidProduct.name} esta sem controle de estoque ativo.`);
      return;
    }
    submitSaleMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vendas</h1>
          <p className="text-sm text-muted-foreground">Lancamento presencial em destaque e historico sob demanda.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="w-[170px]" />
          <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="w-[170px]" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-card p-5">
          <div className="text-sm text-muted-foreground">Delivery concluido</div>
          {reportQuery.isLoading && !reportQuery.data ? <Skeleton className="mt-3 h-8 w-28" /> : <div className="mt-2 text-3xl font-bold text-primary">{money(reportSummary?.delivery_sales_total)}</div>}
          <div className="mt-2 text-xs text-muted-foreground">{reportSummary?.delivery_sales_count || 0} pedidos concluidos</div>
        </Card>
        <Card className="border-emerald-500/20 bg-card p-5">
          <div className="text-sm text-muted-foreground">Presencial registrado</div>
          {reportQuery.isLoading && !reportQuery.data ? <Skeleton className="mt-3 h-8 w-28" /> : <div className="mt-2 text-3xl font-bold text-emerald-400">{money(reportSummary?.store_sales_total)}</div>}
          <div className="mt-2 text-xs text-muted-foreground">{reportSummary?.store_sales_count || 0} vendas lancadas</div>
        </Card>
        <Card className="border-yellow-500/20 bg-card p-5">
          <div className="text-sm text-muted-foreground">Total consolidado</div>
          {reportQuery.isLoading && !reportQuery.data ? <Skeleton className="mt-3 h-8 w-28" /> : <div className="mt-2 text-3xl font-bold text-yellow-400">{money(reportSummary?.total_sales)}</div>}
          <div className="mt-2 text-xs text-muted-foreground">{reportQuery.isFetching ? "Atualizando..." : "Resumo operacional do periodo"}</div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[560px,1fr]">
        <Card className="overflow-hidden border-border/70 bg-card p-0">
          <div className="border-b border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(234,179,8,0.12),transparent_42%),linear-gradient(180deg,rgba(23,23,23,0.96),rgba(14,14,14,0.98))] px-5 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-400/80">Venda presencial</div>
                <h2 className="mt-2 text-2xl font-bold text-foreground">{editingSaleId ? `Editando venda #${editingSaleId}` : "Lancamento com baixa de estoque"}</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Selecione os produtos vendidos, ajuste unidade e registre o pagamento.</p>
              </div>
              <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-5 py-4 text-right">
                <div className="text-[11px] uppercase tracking-[0.24em] text-yellow-200/70">Total da venda</div>
                <div className="mt-2 text-3xl font-bold text-yellow-400">{money(saleTotal)}</div>
              </div>
            </div>
          </div>

          <div className="p-5">
            {unavailableProducts.length > 0 ? (
              <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />
                  <div>
                    <div className="text-sm font-semibold text-amber-100">{unavailableProducts.length} produto(s) indisponivel(is) para venda presencial com baixa</div>
                    <div className="mt-1 text-xs leading-5 text-amber-200/80">Eles aparecem bloqueados ate o controle de estoque ser ativado.</div>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Data e hora</label>
                <Input type="datetime-local" value={saleDatetime} onChange={(event) => setSaleDatetime(event.target.value)} required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Forma de pagamento</label>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="pix">Pix</option>
                  <option value="cartao">Cartao</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="nao_informado">Nao informado</option>
                </select>
              </div>
            </div>
          </div>

          <form className="space-y-4 px-5 pb-5" onSubmit={submitSale}>
            <div className="space-y-3">
              {draftItems.map((item, index) => {
                const product = productsMap.get(item.productId);
                const allowedUnits = getAllowedSaleUnits(product?.stockUnit);
                const fixedUnit = allowedUnits.length === 1;
                const itemTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);

                return (
                  <div key={`item-${index}`} className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(24,24,24,0.92),rgba(14,14,14,0.98))] p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Produto {index + 1}</div>
                        <div className="text-xs text-muted-foreground">Defina item, quantidade, unidade e valor</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</div>
                          <div className="text-sm font-semibold text-emerald-300">{money(itemTotal)}</div>
                        </div>
                        <Button type="button" variant="outline" size="icon" onClick={() => removeItem(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1.6fr,0.85fr,0.75fr,1fr]">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Produto</label>
                        <select value={item.productId} onChange={(event) => setItem(index, { productId: event.target.value })} className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" required>
                          <option value="">Selecione</option>
                          {products.map((productOption) => (
                            <option key={productOption.id} value={productOption.id} disabled={!productOption.stockEnabled}>
                              {productOption.name}{!productOption.stockEnabled ? " - sem controle de estoque" : ""}
                            </option>
                          ))}
                        </select>
                        {product ? (
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            <span className="rounded-full border border-border/70 px-2 py-1">Saldo: {product.saldoQty} {product.stockUnit}</span>
                            <span className="rounded-full border border-border/70 px-2 py-1">Controle: {product.stockEnabled ? "ativo" : "inativo"}</span>
                            <span className="rounded-full border border-border/70 px-2 py-1">Venda: {allowedUnits.join(" ou ")}</span>
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Quantidade</label>
                        <Input value={item.quantity} onChange={(event) => setItem(index, { quantity: event.target.value })} className="h-11 rounded-xl" required />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Unidade</label>
                        <select value={item.unit} onChange={(event) => setItem(index, { unit: normalizeUnit(event.target.value) })} className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={fixedUnit}>
                          {allowedUnits.map((allowedUnit) => (
                            <option key={allowedUnit} value={allowedUnit}>{allowedUnit}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Valor unitario</label>
                        <Input value={item.unitPrice} onChange={(event) => setItem(index, { unitPrice: event.target.value })} className="h-11 rounded-xl" required />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" onClick={addItem} className="h-11 rounded-xl px-5">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar produto
              </Button>
              {editingSaleId ? <Button type="button" variant="outline" onClick={resetSaleForm} className="h-11 rounded-xl px-5">Cancelar edicao</Button> : null}
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                Produtos unitarios vendem apenas em UN. Produtos por peso aceitam LB ou KG.
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Observacoes</label>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[120px] w-full rounded-xl border border-input bg-background px-3 py-3 text-sm" placeholder="Opcional" />
            </div>

            <Button type="submit" className="h-12 w-full rounded-xl text-base font-semibold" disabled={submitSaleMutation.isPending || productsQuery.isLoading}>
              {submitSaleMutation.isPending ? "Salvando..." : editingSaleId ? "Salvar alteracoes da venda" : "Registrar venda com baixa de estoque"}
            </Button>
          </form>
        </Card>

        <Card className="border-border/70 bg-card p-5">
          <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setHistoryOpen((current) => !current)}>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Ver registros do periodo</h2>
              <p className="text-sm text-muted-foreground">Historico de vendas presenciais, itens e comprovantes.</p>
            </div>
            {historyOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </button>

          {historyOpen ? (
            salesHistoryQuery.isLoading && !salesHistoryQuery.data ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`sales-history-${index}`} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            ) : sales.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Nenhuma venda presencial no periodo.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {sales.map((sale: any) => (
                  <div key={sale.id} className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(24,24,24,0.88),rgba(15,15,15,0.98))] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-foreground">Venda #{sale.id}</div>
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Registrada</span>
                        </div>
                        <div className="text-sm text-muted-foreground">{new Date(sale.sale_datetime).toLocaleString("pt-BR")}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Pagamento: {paymentMethodLabel(sale.payment_method)} | Responsavel: {sale.created_by || "-"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
                          <div className="text-lg font-bold text-yellow-400">{money(sale.total_amount)}</div>
                        </div>
                        <Button type="button" variant="outline" onClick={() => downloadReceiptPdf(sale)}>
                          <Download className="mr-2 h-4 w-4" /> PDF
                        </Button>
                        <Button type="button" variant="outline" onClick={() => printReceipt(sale)}>
                          <Printer className="mr-2 h-4 w-4" /> Imprimir
                        </Button>
                        <Button type="button" variant="outline" onClick={() => startSaleEdit(sale)}>
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Excluir a venda #${sale.id}? O estoque sera recomposto.`)) deleteSaleMutation.mutate(Number(sale.id));
                          }}
                          disabled={deleteSaleMutation.isPending}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="pb-3">Produto</th>
                            <th className="pb-3">Quantidade</th>
                            <th className="pb-3">Valor unitario</th>
                            <th className="pb-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(sale.items || []).map((item: any) => (
                            <tr key={item.id} className="border-t border-border/60">
                              <td className="py-3">{item.product_name || item.product_id}</td>
                              <td className="py-3">{item.quantity} {item.unit || "UN"}</td>
                              <td className="py-3">{money(item.unit_price)}</td>
                              <td className="py-3 text-right font-semibold">{money(item.total_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 text-sm text-muted-foreground">{sale.notes || "-"}</div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Os registros so sao carregados quando voce expandir esta area.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
