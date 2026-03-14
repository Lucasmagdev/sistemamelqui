import { useEffect, useState } from 'react';
import { backendRequest } from '@/lib/backendClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function VendasPage() {
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sales, setSales] = useState<any[]>([]);
  const [reportSummary, setReportSummary] = useState<any | null>(null);
  const [saleDatetime, setSaleDatetime] = useState(new Date().toISOString().slice(0, 16));
  const [totalAmount, setTotalAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [notes, setNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [salesPayload, reportPayload] = await Promise.all([
        backendRequest<{ sales: any[] }>('/api/store-sales?start=' + start + '&end=' + end),
        backendRequest<{ report: any }>('/api/reports/operational?start=' + start + '&end=' + end),
      ]);
      setSales(salesPayload.sales || []);
      setReportSummary(reportPayload.report?.summary || null);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar conciliacao de vendas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [start, end]);

  const submitSale = async (event: any) => {
    event.preventDefault();
    setSaving(true);
    try {
      await backendRequest('/api/store-sales', {
        method: 'POST',
        body: JSON.stringify({
          saleDatetime: new Date(saleDatetime).toISOString(),
          totalAmount,
          paymentMethod,
          notes,
          createdBy: window.localStorage.getItem('imperial-flow-nome') || 'admin',
        }),
      });
      setTotalAmount('');
      setNotes('');
      setPaymentMethod('pix');
      setSaleDatetime(new Date().toISOString().slice(0, 16));
      toast.success('Venda presencial registrada');
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
          <p className="text-sm text-muted-foreground">Delivery do site versus vendas presenciais da loja</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-[170px]" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-[170px]" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-card p-5">
          <div className="text-sm text-muted-foreground">Delivery</div>
          <div className="mt-2 text-3xl font-bold text-primary">{money(reportSummary?.delivery_sales_total)}</div>
        </Card>
        <Card className="border-emerald-500/20 bg-card p-5">
          <div className="text-sm text-muted-foreground">Presencial</div>
          <div className="mt-2 text-3xl font-bold text-emerald-400">{money(reportSummary?.store_sales_total)}</div>
        </Card>
        <Card className="border-yellow-500/20 bg-card p-5">
          <div className="text-sm text-muted-foreground">Total consolidado</div>
          <div className="mt-2 text-3xl font-bold text-yellow-400">{money(reportSummary?.total_sales)}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
        <Card className="border-border/70 bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Lancar venda presencial</h2>
          <form className="mt-4 space-y-3" onSubmit={submitSale}>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Data e hora</label>
              <Input type="datetime-local" value={saleDatetime} onChange={(e) => setSaleDatetime(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Valor total</label>
              <Input value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" required />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Forma de pagamento</label>
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
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Observacoes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Opcional"
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Salvando...' : 'Registrar venda'}
            </Button>
          </form>
        </Card>

        <Card className="border-border/70 bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Vendas presenciais</h2>
            <span className="text-xs text-muted-foreground">{sales.length} registros</span>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-muted-foreground">Carregando...</div>
          ) : sales.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Nenhuma venda presencial no periodo.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-3">Data</th>
                    <th className="pb-3">Pagamento</th>
                    <th className="pb-3">Observacoes</th>
                    <th className="pb-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-t border-border/60">
                      <td className="py-3">{new Date(sale.sale_datetime).toLocaleString('pt-BR')}</td>
                      <td className="py-3 capitalize">{sale.payment_method || '-'}</td>
                      <td className="py-3 text-muted-foreground">{sale.notes || '-'}</td>
                      <td className="py-3 text-right font-semibold">{money(sale.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
