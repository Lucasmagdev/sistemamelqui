import DashboardBackground3D from '@/components/dashboard/DashboardBackground3D';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { BarChart3, CreditCard, DollarSign, Layers, ShoppingCart, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useNavigate } from 'react-router-dom';

type OrderRow = {
  id: string;
  cliente_id: string | null;
  data_pedido: string | null;
  status: number | null;
  valor_total: number | null;
  payment_method: string | null;
};

type ClientRow = {
  id: string;
  nome: string | null;
};

const STATUS_LABELS: Record<number, string> = {
  0: 'Recebido',
  1: 'Confirmado',
  2: 'Em preparo',
  3: 'Pronto',
  4: 'Em entrega',
  5: 'Concluido',
  6: 'Cancelado',
};

const STATUS_COLORS: Record<number, string> = {
  0: '#f59e0b',
  1: '#0ea5e9',
  2: '#6366f1',
  3: '#14b8a6',
  4: '#8b5cf6',
  5: '#22c55e',
  6: '#f43f5e',
};

const STATUS_BADGE: Record<number, string> = {
  0: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  1: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  2: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  3: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
  4: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  5: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  6: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (isoDate?: string | null) => {
  if (!isoDate) return '-';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('pt-BR');
};

const getDateKey = (isoDate?: string | null) => {
  if (!isoDate) return '';
  return isoDate.slice(0, 10);
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, cliente_id, data_pedido, status, valor_total, payment_method')
        .order('data_pedido', { ascending: false });

      if (orderError) {
        setLoading(false);
        return;
      }

      const rows = (orderData || []) as OrderRow[];
      setOrders(rows);

      const clientIds = Array.from(
        new Set(rows.map((order) => order.cliente_id).filter((id): id is string => Boolean(id))),
      );

      if (clientIds.length === 0) {
        setClientsMap({});
        setLoading(false);
        return;
      }

      const { data: clientsData } = await supabase.from('clients').select('id, nome').in('id', clientIds);
      const map: Record<string, string> = {};
      ((clientsData || []) as ClientRow[]).forEach((client) => {
        map[client.id] = client.nome || 'Cliente';
      });
      setClientsMap(map);
      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  const stats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOrders = orders.filter((order) => {
      if (!order.data_pedido) return false;
      return new Date(order.data_pedido) >= thirtyDaysAgo;
    });
    const recentConcludedOrders = recentOrders.filter((order) => (order.status ?? 0) === 5);

    const revenue30 = recentConcludedOrders.reduce((sum, order) => sum + (order.valor_total || 0), 0);
    const todayOrders = orders.filter((order) => getDateKey(order.data_pedido) === todayKey).length;
    const pendingOrders = orders.filter((order) => (order.status ?? 0) < 5).length;
    const ticketAvg = recentConcludedOrders.length
      ? recentConcludedOrders.reduce((sum, order) => sum + (order.valor_total || 0), 0) / recentConcludedOrders.length
      : 0;

    const squareOrders = recentConcludedOrders.filter((o) => o.payment_method === 'square');
    const squareRevenue30 = squareOrders.reduce((sum, o) => sum + (o.valor_total || 0), 0);

    return {
      totalOrders: orders.length,
      totalClients: Object.keys(clientsMap).length,
      revenue30,
      todayOrders,
      pendingOrders,
      ticketAvg,
      squareRevenue30,
      squareOrders30: squareOrders.length,
    };
  }, [orders, clientsMap]);

  const ordersByDay = useMemo(() => {
    const base = new Date();
    const days = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(base);
      d.setDate(base.getDate() - (6 - idx));
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      return { key, label, pedidos: 0 };
    });

    const indexByDate = new Map(days.map((d, idx) => [d.key, idx]));
    orders.forEach((order) => {
      const key = getDateKey(order.data_pedido);
      const idx = indexByDate.get(key);
      if (idx !== undefined) {
        days[idx].pedidos += 1;
      }
    });

    return days.map((d) => ({ dia: d.label, pedidos: d.pedidos }));
  }, [orders]);

  const statusData = useMemo(() => {
    const counts = new Map<number, number>();
    orders.forEach((order) => {
      const status = typeof order.status === 'number' ? order.status : 0;
      counts.set(status, (counts.get(status) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([status, total]) => ({
        status,
        label: STATUS_LABELS[status] || `Status ${status}`,
        total,
        color: STATUS_COLORS[status] || '#94a3b8',
      }));
  }, [orders]);

  const topClients = useMemo(() => {
    const map = new Map<string, { pedidos: number; valor: number }>();
    orders.forEach((order) => {
      if ((order.status ?? 0) !== 5) return;
      if (!order.cliente_id) return;
      const current = map.get(order.cliente_id) || { pedidos: 0, valor: 0 };
      map.set(order.cliente_id, {
        pedidos: current.pedidos + 1,
        valor: current.valor + (order.valor_total || 0),
      });
    });

    return Array.from(map.entries())
      .map(([clientId, data]) => ({
        id: clientId,
        nome: clientsMap[clientId] || 'Cliente',
        pedidos: data.pedidos,
        valor: data.valor,
      }))
      .sort((a, b) => {
        if (b.valor === a.valor) return b.pedidos - a.pedidos;
        return b.valor - a.valor;
      })
      .slice(0, 5);
  }, [orders, clientsMap]);

  const recentOrders = useMemo(() => orders.slice(0, 6), [orders]);

  const kpiCards = [
    {
      label: 'Pedidos totais',
      value: String(stats.totalOrders),
      context: 'total acumulado',
      icon: ShoppingCart,
      iconClassName: 'bg-violet-500/15 text-violet-400',
    },
    {
      label: 'Pedidos hoje',
      value: String(stats.todayOrders),
      context: 'hoje',
      icon: BarChart3,
      iconClassName: 'bg-sky-500/15 text-sky-400',
    },
    {
      label: 'Faturamento 30 dias',
      value: formatCurrency(stats.revenue30),
      context: 'ultimos 30 dias',
      icon: DollarSign,
      iconClassName: 'bg-emerald-500/15 text-emerald-400',
    },
    {
      label: 'Ticket medio',
      value: formatCurrency(stats.ticketAvg),
      context: 'ultimos 30 dias',
      icon: TrendingUp,
      iconClassName: 'bg-amber-500/15 text-amber-400',
    },
    {
      label: 'Square (cartão online)',
      value: formatCurrency(stats.squareRevenue30),
      context: `${stats.squareOrders30} pedidos nos ultimos 30 dias`,
      icon: CreditCard,
      iconClassName: 'bg-blue-500/15 text-blue-400',
    },
  ];

  return (
    <div className="relative space-y-6 pb-2">
      <DashboardBackground3D />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visao geral para acompanhar pedidos, clientes e faturamento.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/admin/pedidos/novo')} className="gold-gradient-bg text-accent-foreground">
            Novo pedido
          </Button>
          <Button variant="outline" onClick={() => navigate('/admin/pedidos')}>
            Ver pedidos
          </Button>
        </div>
      </div>

      <section className="relative z-10 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="card-elevated">
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    {loading ? (
                      <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
                    ) : (
                      <p className="text-3xl font-extrabold text-foreground">{item.value}</p>
                    )}
                  </div>
                  <div className={`rounded-xl p-3 ${item.iconClassName}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                {loading ? (
                  <div className="h-3 w-16 animate-pulse rounded-md bg-muted" />
                ) : (
                  <p className="text-xs text-muted-foreground">{item.context}</p>
                )}
              </div>
            </Card>
          );
        })}
      </section>

      <section className="relative z-10 grid gap-4 xl:grid-cols-3">
        <Card className="card-elevated xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Pedidos - ultimos 7 dias</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ordersByDay}>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey="dia" />
                <YAxis allowDecimals={false} />
                <Tooltip
                  formatter={(value: number) => [`${value}`, 'Pedidos']}
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--card))',
                  }}
                />
                <Bar dataKey="pedidos" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Distribuicao por status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="total" nameKey="label" innerRadius={52} outerRadius={88}>
                    {statusData.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value}`, 'Pedidos']} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-1 text-sm">
              {statusData.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                  <strong>{item.total}</strong>
                </div>
              ))}
              {statusData.length === 0 && <span className="text-muted-foreground">Sem pedidos cadastrados.</span>}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="relative z-10 grid gap-4 xl:grid-cols-5">
        <Card className="card-elevated xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Top clientes</CardTitle>
            <span className="text-xs text-muted-foreground">Top 5 por faturamento</span>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 w-8">#</th>
                    <th className="pb-2">Cliente</th>
                    <th className="pb-2 text-right">Pedidos</th>
                    <th className="pb-2 text-right">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((client, index) => (
                    <tr key={client.id} className="border-t border-border/70 hover:bg-muted/30 transition-colors">
                      <td className="py-3 text-xs font-bold text-muted-foreground w-8">#{index + 1}</td>
                      <td className="py-3 font-medium">
                        <span className="inline-flex items-center">
                          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                            {client.nome.slice(0, 2).toUpperCase()}
                          </span>
                          {client.nome}
                        </span>
                      </td>
                      <td className="py-3 text-right">{client.pedidos}</td>
                      <td className="py-3 text-right font-semibold">{formatCurrency(client.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {topClients.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nenhum cliente com pedidos ainda.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Acesso rapido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="h-11 w-full justify-start gap-3 text-sm" onClick={() => navigate('/admin/pedidos')}>
              <ShoppingCart className="h-4 w-4" />
              Ver todos os pedidos
            </Button>
            <Button variant="outline" className="h-11 w-full justify-start gap-3 text-sm" onClick={() => navigate('/admin/estoque')}>
              <Layers className="h-4 w-4" />
              Gerenciar estoque
            </Button>
            <Button variant="outline" className="h-11 w-full justify-start gap-3 text-sm" onClick={() => navigate('/admin/relatorios')}>
              <BarChart3 className="h-4 w-4" />
              Ver relatorios
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="relative z-10">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Pedidos recentes</CardTitle>
            <span className="text-xs text-muted-foreground">Atualizado pelo banco</span>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-2">Pedido</th>
                  <th className="pb-2">Cliente</th>
                  <th className="pb-2">Data</th>
                  <th className="pb-2 text-right">Valor</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const status = typeof order.status === 'number' ? order.status : 0;
                  return (
                    <tr key={order.id} className="border-t border-border/70 hover:bg-muted/30 transition-colors cursor-pointer">
                      <td className="py-3 font-mono text-xs text-muted-foreground">IMP{order.id}</td>
                      <td className="py-3">{order.cliente_id ? clientsMap[order.cliente_id] || 'Cliente' : 'Cliente'}</td>
                      <td className="py-3 text-muted-foreground">{formatDate(order.data_pedido)}</td>
                      <td className="py-3 text-right font-semibold">{formatCurrency(order.valor_total || 0)}</td>
                      <td className="py-3 text-right">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[status] || 'bg-muted text-muted-foreground border-border'}`}>
                          {STATUS_LABELS[status] || `Status ${status}`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {recentOrders.length === 0 && <p className="py-3 text-sm text-muted-foreground">Sem pedidos para exibir.</p>}
            {loading && <p className="pt-3 text-xs text-muted-foreground">Carregando dados...</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
