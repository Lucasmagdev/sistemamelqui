import { useEffect, useMemo, useState } from 'react';
import { backendRequest } from '@/lib/backendClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Plus, Printer, Trash2 } from 'lucide-react';

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
type Unit = 'UN' | 'LB' | 'KG';

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const normalizeUnit = (value: string | undefined | null): Unit => {
  const raw = String(value || '').toUpperCase();
  if (raw === 'KG') return 'KG';
  if (raw === 'UN') return 'UN';
  return 'LB';
};

const getAllowedSaleUnits = (stockUnit: string | undefined | null): Unit[] =>
  normalizeUnit(stockUnit) === 'UN' ? ['UN'] : ['LB', 'KG'];

const paymentMethodLabel = (value: string | undefined | null) => {
  switch (value) {
    case 'pix':
      return 'Pix';
    case 'cartao':
      return 'Cartao';
    case 'dinheiro':
      return 'Dinheiro';
    default:
      return 'Nao informado';
  }
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
  productId: '',
  quantity: '1',
  unitPrice: '',
  unit: 'UN',
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
    .join('');

  return `
    <html>
      <head>
        <title>Comprovante interno ${sale.id}</title>
      </head>
      <body style="font-family:Arial,sans-serif;padding:24px;color:#111;">
        <h1 style="margin-bottom:4px;">Comprovante interno de venda presencial</h1>
        <p style="margin-top:0;color:#555;">Venda #${sale.id}</p>
        <p><strong>Data:</strong> ${new Date(sale.sale_datetime).toLocaleString('pt-BR')}</p>
        <p><strong>Pagamento:</strong> ${paymentMethodLabel(sale.payment_method)}</p>
        <p><strong>Responsavel:</strong> ${sale.created_by || '-'}</p>
        <p><strong>Observacoes:</strong> ${sale.notes || '-'}</p>
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
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sales, setSales] = useState<any[]>([]);
  const [reportSummary, setReportSummary] = useState<any | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [saleDatetime, setSaleDatetime] = useState(new Date().toISOString().slice(0, 16));
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [notes, setNotes] = useState('');
  const [draftItems, setDraftItems] = useState<SaleDraftItem[]>([createDraftItem()]);

  const productsMap = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
    [products],
  );

  const saleTotal = useMemo(
    () =>
      draftItems.reduce((acc, item) => {
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        return acc + quantity * unitPrice;
      }, 0),
    [draftItems],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [salesPayload, reportPayload, stockPayload] = await Promise.all([
        backendRequest<{ sales: any[] }>('/api/store-sales?start=' + start + '&end=' + end),
        backendRequest<{ report: any }>('/api/reports/operational?start=' + start + '&end=' + end),
        backendRequest<{ rows: any[] }>('/api/stock/balance'),
      ]);

      setSales(salesPayload.sales || []);
      setReportSummary(reportPayload.report?.summary || null);
      setProducts(
        (stockPayload.rows || []).map((row) => ({
          id: Number(row.product_id),
          name: row.product_name,
          stockUnit: normalizeUnit(row.stock_unit || 'UN'),
          salePrice: Number(row.sale_price || 0),
          saldoQty: Number(row.saldo_qty || 0),
          stockEnabled: Boolean(row.stock_enabled),
        })),
      );
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar conciliacao de vendas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [start, end]);

  const setItem = (index: number, patch: Partial<SaleDraftItem>) => {
    setDraftItems((prev) =>
      prev.map((item, currentIndex) => {
        if (currentIndex !== index) return item;
        const next = { ...item, ...patch };
        if (patch.productId !== undefined) {
          const product = productsMap.get(patch.productId);
          if (product) {
            if (!next.unitPrice) {
              next.unitPrice = String(product.salePrice || '');
            }
            const allowedUnits = getAllowedSaleUnits(product.stockUnit);
            const currentUnit = normalizeUnit(next.unit);
            next.unit = allowedUnits.includes(currentUnit) ? currentUnit : allowedUnits[0];
          }
        }
        return next;
      }),
    );
  };

  const addItem = () => {
    setDraftItems((prev) => [...prev, createDraftItem()]);
  };

  const removeItem = (index: number) => {
    setDraftItems((prev) => (prev.length === 1 ? prev : prev.filter((_, currentIndex) => currentIndex !== index)));
  };

  const printReceipt = (sale: any) => {
    const receiptWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!receiptWindow) {
      toast.error('Nao foi possivel abrir o comprovante.');
      return;
    }
    receiptWindow.document.write(buildReceiptHtml(sale));
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.print();
  };

  const submitSale = async (event: any) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = await backendRequest<{ sale: any }>('/api/store-sales', {
        method: 'POST',
        body: JSON.stringify({
          saleDatetime: new Date(saleDatetime).toISOString(),
          paymentMethod,
          notes,
          createdBy: window.localStorage.getItem('imperial-flow-nome') || 'admin',
          items: draftItems.map((item) => {
            const product = productsMap.get(item.productId);
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unit: item.unit || product?.stockUnit || 'UN',
            };
          }),
        }),
      });

      setNotes('');
      setPaymentMethod('pix');
      setSaleDatetime(new Date().toISOString().slice(0, 16));
      setDraftItems([createDraftItem()]);
      toast.success('Venda presencial registrada com baixa de estoque');
      setSales((prev) => [payload.sale, ...prev]);
      load();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao registrar venda presencial');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conciliacao de vendas</h1>
          <p className="text-sm text-muted-foreground">Delivery concluido versus vendas presenciais registradas com baixa de estoque</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-[170px]" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-[170px]" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-card p-5">
          <div className="text-sm text-muted-foreground">Delivery concluido</div>
          <div className="mt-2 text-3xl font-bold text-primary">{money(reportSummary?.delivery_sales_total)}</div>
          <div className="mt-2 text-xs text-muted-foreground">{reportSummary?.delivery_sales_count || 0} pedidos concluidos</div>
        </Card>
        <Card className="border-emerald-500/20 bg-card p-5">
          <div className="text-sm text-muted-foreground">Presencial registrado</div>
          <div className="mt-2 text-3xl font-bold text-emerald-400">{money(reportSummary?.store_sales_total)}</div>
          <div className="mt-2 text-xs text-muted-foreground">{reportSummary?.store_sales_count || 0} vendas lancadas</div>
        </Card>
        <Card className="border-yellow-500/20 bg-card p-5">
          <div className="text-sm text-muted-foreground">Total consolidado</div>
          <div className="mt-2 text-3xl font-bold text-yellow-400">{money(reportSummary?.total_sales)}</div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[560px,1fr]">
        <Card className="overflow-hidden border-border/70 bg-card p-0">
          <div className="border-b border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(234,179,8,0.12),transparent_42%),linear-gradient(180deg,rgba(23,23,23,0.96),rgba(14,14,14,0.98))] px-5 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-400/80">Venda Presencial</div>
                <h2 className="mt-2 text-2xl font-bold text-foreground">Lancamento com baixa de estoque</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Selecione os produtos vendidos, ajuste a unidade de medida, confirme o valor unitario e registre o pagamento.
                </p>
              </div>
              <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-5 py-4 text-right shadow-[0_10px_30px_rgba(234,179,8,0.08)]">
                <div className="text-[11px] uppercase tracking-[0.24em] text-yellow-200/70">Total da venda</div>
                <div className="mt-2 text-3xl font-bold text-yellow-400">{money(saleTotal)}</div>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Data e hora</label>
                <Input type="datetime-local" value={saleDatetime} onChange={(e) => setSaleDatetime(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Forma de pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
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
                        <select
                          value={item.productId}
                          onChange={(e) => setItem(index, { productId: e.target.value })}
                          className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                          required
                        >
                          <option value="">Selecione</option>
                          {products.map((productOption) => (
                            <option key={productOption.id} value={productOption.id}>
                              {productOption.name}
                            </option>
                          ))}
                        </select>
                        {product ? (
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            <span className="rounded-full border border-border/70 px-2 py-1">
                              Saldo: {product.saldoQty} {product.stockUnit}
                            </span>
                            <span className="rounded-full border border-border/70 px-2 py-1">
                              Controle: {product.stockEnabled ? 'ativo' : 'inativo'}
                            </span>
                            <span className="rounded-full border border-border/70 px-2 py-1">
                              Venda: {allowedUnits.join(' ou ')}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Quantidade</label>
                        <Input
                          value={item.quantity}
                          onChange={(e) => setItem(index, { quantity: e.target.value })}
                          className="h-11 rounded-xl"
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Unidade</label>
                        <select
                          value={item.unit}
                          onChange={(e) => setItem(index, { unit: normalizeUnit(e.target.value) })}
                          className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-80"
                          disabled={fixedUnit}
                        >
                          {allowedUnits.map((allowedUnit) => (
                            <option key={allowedUnit} value={allowedUnit}>
                              {allowedUnit}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                          {fixedUnit ? 'Unidade fixa para item unitario.' : `Base de estoque: ${product?.stockUnit || 'LB'}`}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Valor unitario</label>
                        <Input
                          value={item.unitPrice}
                          onChange={(e) => setItem(index, { unitPrice: e.target.value })}
                          className="h-11 rounded-xl"
                          required
                        />
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
              <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                Produtos unitarios vendem apenas em UN. Produtos por peso aceitam LB ou KG.
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Observacoes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[120px] w-full rounded-xl border border-input bg-background px-3 py-3 text-sm"
                placeholder="Opcional"
              />
            </div>

            <Button type="submit" className="h-12 w-full rounded-xl text-base font-semibold" disabled={saving}>
              {saving ? 'Salvando...' : 'Registrar venda com baixa de estoque'}
            </Button>
          </form>
        </Card>

        <Card className="border-border/70 bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Vendas presenciais</h2>
              <p className="text-sm text-muted-foreground">Cada venda fica registrada aqui com itens, unidade, pagamento e comprovante interno.</p>
            </div>
            <span className="text-xs text-muted-foreground">{sales.length} registros</span>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-muted-foreground">Carregando...</div>
          ) : sales.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Nenhuma venda presencial no periodo.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {sales.map((sale) => (
                <div key={sale.id} className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(24,24,24,0.88),rgba(15,15,15,0.98))] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">Venda #{sale.id}</div>
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                          Registrada
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">{new Date(sale.sale_datetime).toLocaleString('pt-BR')}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Pagamento: {paymentMethodLabel(sale.payment_method)} | Responsavel: {sale.created_by || '-'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
                        <div className="text-lg font-bold text-yellow-400">{money(sale.total_amount)}</div>
                      </div>
                      <Button type="button" variant="outline" onClick={() => printReceipt(sale)}>
                        <Printer className="mr-2 h-4 w-4" />
                        Comprovante
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
                            <td className="py-3">{item.quantity} {item.unit || 'UN'}</td>
                            <td className="py-3">{money(item.unit_price)}</td>
                            <td className="py-3 text-right font-semibold">{money(item.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 text-sm text-muted-foreground">{sale.notes || '-'}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
