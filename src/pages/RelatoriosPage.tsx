import { useEffect, useState } from 'react';
import { backendBaseUrl, backendRequest } from '@/lib/backendClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

const COLORS = ['#eab308', '#22c55e', '#f97316', '#3b82f6', '#ef4444', '#a855f7'];
const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const statusLabel = (status: number) => {
  switch (status) {
    case 0:
      return 'Recebido';
    case 1:
      return 'Confirmado';
    case 2:
      return 'Preparando';
    case 3:
      return 'Pronto';
    case 4:
      return 'Entrega';
    case 5:
      return 'Concluido';
    case 6:
      return 'Cancelado';
    default:
      return `Status ${status}`;
  }
};

export default function RelatoriosPage() {
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const payload = await backendRequest<{ report: any }>('/api/reports/operational?start=' + start + '&end=' + end);
      setReport(payload.report);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar relatorios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [start, end]);

  const exportCsv = () => {
    window.open(`${backendBaseUrl}/api/reports/operational.csv?start=${start}&end=${end}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatorios operacionais</h1>
          <p className="text-sm text-muted-foreground">Consolidado de delivery concluido, presencial registrado, estoque, despesas e pagamentos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-[170px]" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-[170px]" />
          <Button variant="outline" onClick={exportCsv}>Exportar CSV</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Total conciliado</div>
          <div className="mt-2 text-3xl font-bold text-primary">{money(report?.summary?.total_sales)}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Delivery concluido + presencial registrado
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Despesas</div>
          <div className="mt-2 text-3xl font-bold text-red-400">{money(report?.summary?.expenses_total)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Pagamentos</div>
          <div className="mt-2 text-3xl font-bold text-yellow-400">{money(report?.summary?.payroll_total)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Alertas de estoque</div>
          <div className="mt-2 text-3xl font-bold text-emerald-400">{report?.summary?.low_stock_products || 0}</div>
        </Card>
      </div>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando relatorios...</Card>
      ) : !report ? null : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Vendas conciliadas por dia</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={report.timeline || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => money(value)} />
                  <Bar dataKey="delivery" name="Delivery concluido" fill="#eab308" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="store" name="Presencial registrado" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Formas de pagamento</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={(report.sales_by_payment || []).map((item: any) => ({ ...item, name: item.payment_method }))}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {(report.sales_by_payment || []).map((_: any, index: number) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => money(value)} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Pedidos por status</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={(report.orders_by_status || []).map((item: any) => ({
                    ...item,
                    status_label: statusLabel(Number(item.status)),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="status_label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Despesas por categoria</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={report.expenses_by_category || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => money(value)} />
                  <Line type="monotone" dataKey="total" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Pagamentos por funcionario</h3>
              <div className="space-y-3">
                {(report.payroll_by_employee || []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                    Nenhum pagamento registrado no periodo.
                  </div>
                ) : (
                  (report.payroll_by_employee || []).map((item: any) => (
                    <div key={item.employee_name} className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
                      <span className="text-sm text-foreground">{item.employee_name}</span>
                      <span className="text-sm font-semibold text-yellow-400">{money(item.total)}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Itens com estoque baixo</h3>
              <div className="space-y-3">
                {(report.stock_alerts || []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                    Nenhum alerta de estoque no periodo.
                  </div>
                ) : (
                  (report.stock_alerts || []).slice(0, 8).map((item: any) => (
                    <div key={item.product_id} className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{item.product_name}</div>
                        <div className="text-xs text-muted-foreground">Minimo: {item.stock_min} {item.stock_unit}</div>
                      </div>
                      <span className="text-sm font-semibold text-red-400">
                        {item.saldo_qty} {item.stock_unit}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
