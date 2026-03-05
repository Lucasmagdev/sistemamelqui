import DashboardBackground3D from '@/components/dashboard/DashboardBackground3D';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { BarChart3, DollarSign, ShoppingCart, TrendingUp, Users } from 'lucide-react';
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
};

const STATUS_COLORS: Record<number, string> = {
  0: '#f59e0b',
  1: '#0ea5e9',
  2: '#6366f1',
  3: '#14b8a6',
  4: '#8b5cf6',
  5: '#22c55e',
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
        .select('id, cliente_id, data_pedido, status, valor_total')
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

    const revenue30 = orders.reduce((sum, order) => sum + (order.valor_total || 0), 0);
    const todayOrders = orders.filter((order) => getDateKey(order.data_pedido) === todayKey).length;
    const pendingOrders = orders.filter((order) => (order.status ?? 0) < 5).length;
    const recentOrders = orders.filter((order) => {
      if (!order.data_pedido) return false;
      return new Date(order.data_pedido) >= thirtyDaysAgo;
    });
    const ticketAvg = recentOrders.length
      ? recentOrders.reduce((sum, order) => sum + (order.valor_total || 0), 0) / recentOrders.length
      : 0;

    return {
      totalOrders: orders.length,
      totalClients: Object.keys(clientsMap).length,
      revenue30,
      todayOrders,
      pendingOrders,
      ticketAvg,
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

      <section className="relative z-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pedidos totais</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-bold">{stats.totalOrders}</span>
            <ShoppingCart className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pedidos hoje</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-3xl font-bold">{stats.todayOrders}</span>
            <BarChart3 className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Faturamento (30 dias)</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{formatCurrency(stats.revenue30)}</span>
            <DollarSign className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ticket medio (30 dias)</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{formatCurrency(stats.ticketAvg)}</span>
            <TrendingUp className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      </section>

      <section className="relative z-10 grid gap-4 xl:grid-cols-3">
        <Card className="card-elevated xl:col-span-2">
          <CardHeader>
            <CardTitle>Numero de pedidos nos ultimos 7 dias</CardTitle>
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
            <CardTitle>Pedidos por status</CardTitle>
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
            <CardTitle>Melhores clientes</CardTitle>
            <span className="text-xs text-muted-foreground">Top 5 por faturamento</span>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2">Cliente</th>
                    <th className="pb-2 text-right">Pedidos</th>
                    <th className="pb-2 text-right">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((client) => (
                    <tr key={client.id} className="border-t border-border/70">
                      <td className="py-3 font-medium">{client.nome}</td>
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
            <CardTitle>Resumo rapido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                Clientes com pedidos
              </span>
              <strong>{stats.totalClients}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-muted-foreground">Pedidos pendentes (nao concluidos)</span>
              <strong>{stats.pendingOrders}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-muted-foreground">Pedidos cadastrados hoje</span>
              <strong>{stats.todayOrders}</strong>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="relative z-10">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ultimos pedidos</CardTitle>
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
                    <tr key={order.id} className="border-t border-border/70">
                      <td className="py-3 font-mono text-xs">IMP{order.id}</td>
                      <td className="py-3">{order.cliente_id ? clientsMap[order.cliente_id] || 'Cliente' : 'Cliente'}</td>
                      <td className="py-3 text-muted-foreground">{formatDate(order.data_pedido)}</td>
                      <td className="py-3 text-right font-semibold">{formatCurrency(order.valor_total || 0)}</td>
                      <td className="py-3 text-right">{STATUS_LABELS[status] || `Status ${status}`}</td>
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
