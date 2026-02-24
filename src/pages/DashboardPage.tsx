import DashboardBackground3D from '@/components/dashboard/DashboardBackground3D';
import DashboardKpiCard from '@/components/dashboard/DashboardKpiCard';
import ExecutiveAlertsList from '@/components/dashboard/ExecutiveAlertsList';
import ExecutiveHeroChart from '@/components/dashboard/ExecutiveHeroChart';
import RecentOrdersTable from '@/components/dashboard/RecentOrdersTable';
import { Button } from '@/components/ui/button';
import { dashboardStats, mockAlertas } from '@/data/mockData';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AlertTriangle, Bell, DollarSign, Package, ShoppingCart, Clock3, PackageCheck, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OrderList, Order } from '@/components/dashboard/OrderList';

const chartData = [
  { dia: 'Seg', faturamento: 4210, pedidos: 18 },
  { dia: 'Ter', faturamento: 4670, pedidos: 20 },
  { dia: 'Qua', faturamento: 5090, pedidos: 24 },
  { dia: 'Qui', faturamento: 5580, pedidos: 27 },
  { dia: 'Sex', faturamento: 5215, pedidos: 22 },
  { dia: 'Sáb', faturamento: 6005, pedidos: 29 },
  { dia: 'Dom', faturamento: 5650, pedidos: 25 },
];

const secondaryCards = [
  { label: 'Total em Estoque', value: `${dashboardStats.totalEstoque} kg`, icon: Package },
  { label: 'Lotes em Risco', value: `${dashboardStats.lotesRisco}`, icon: AlertTriangle },
  { label: 'Pedidos do Dia', value: `${dashboardStats.pedidosDia}`, icon: ShoppingCart },
  { label: 'Alertas Ativos', value: `${dashboardStats.alertasAtivos}`, icon: Bell },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [pedidosRecentes, setPedidosRecentes] = useState<Order[]>([]);
  const [pedidosPendentes, setPedidosPendentes] = useState(0);
  const alertasCriticos = mockAlertas.filter((alerta) => alerta.nivel === 'critico').length;

  useEffect(() => {
    async function fetchPedidos() {
      const { data: pedidosData, error } = await supabase
        .from('orders')
        .select('id, cliente_id, data_pedido, status, valor_total')
        .order('data_pedido', { ascending: false })
        .limit(5);
      if (error) return;
      // Buscar todos os clientes referenciados
      const clienteIds = (pedidosData || []).map((pedido: any) => pedido.cliente_id);
      const { data: clientesData } = await supabase
        .from('clients')
        .select('id, nome, telefone, cidade')
        .in('id', clienteIds);
      const pedidos = (pedidosData || []).map((pedido: any) => {
        const cliente = (clientesData || []).find((c: any) => c.id === pedido.cliente_id);
        return {
          id: pedido.id,
          code: `IMP${pedido.id}`,
          clientName: cliente?.nome || 'Cliente',
          city: cliente?.cidade || '-',
          phone: cliente?.telefone || '-',
          value: pedido.valor_total,
          status: typeof pedido.status === 'number' ? pedido.status : 0,
        };
      });
      setPedidosRecentes(pedidos);
      setPedidosPendentes((pedidosData || []).filter((p: any) => p.status === 0).length);
    }
    fetchPedidos();
  }, []);

  return (
    <div className="relative space-y-8 pb-2">
      <DashboardBackground3D />

      {/* NOVO: Lista de pedidos no topo */}
      <section className="relative z-20">
        <h2 className="text-lg font-bold text-yellow-400 mb-2">Pedidos Recentes</h2>
        <OrderList orders={pedidosRecentes} />
      </section>

      <div className="relative z-10 space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Dashboard Executivo</h1>
        <p className="text-sm text-muted-foreground">Painel estratégico com visão premium da operação diária.</p>
      </div>

      <section className="relative z-10 grid gap-3 lg:grid-cols-12">
        <div className="rounded-xl border border-border bg-card p-4 card-elevated lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Ações Rápidas da Operação</h2>
            <span className="text-xs text-muted-foreground">Uso frequente</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button onClick={() => navigate('/admin/pedidos/novo')} className="justify-start gold-gradient-bg text-accent-foreground">
              <Plus className="mr-2 h-4 w-4" /> Novo Pedido
            </Button>
            <Button onClick={() => navigate('/admin/lotes/novo')} variant="outline" className="justify-start">
              <Package className="mr-2 h-4 w-4" /> Cadastrar Lote
            </Button>
            <Button onClick={() => navigate('/admin/alertas')} variant="outline" className="justify-start">
              <AlertTriangle className="mr-2 h-4 w-4" /> Ver Alertas
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 card-elevated lg:col-span-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Resumo do Turno</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
              <span className="inline-flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" /> Pedidos pendentes</span>
              <strong className="text-foreground">{pedidosPendentes}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
              <span className="inline-flex items-center gap-2 text-muted-foreground"><AlertTriangle className="h-4 w-4" /> Alertas críticos</span>
              <strong className="text-foreground">{alertasCriticos}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
              <span className="inline-flex items-center gap-2 text-muted-foreground"><PackageCheck className="h-4 w-4" /> Estoque em dia</span>
              <strong className="text-foreground">{dashboardStats.totalEstoque} kg</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10">
        <ExecutiveHeroChart data={chartData} />
      </div>

      <section className="relative z-10 grid gap-4 lg:grid-cols-8">
        <DashboardKpiCard
          label="Faturamento do Dia"
          value={`R$ ${dashboardStats.faturamentoDia.toLocaleString('pt-BR')}`}
          icon={DollarSign}
          featured
        />
        {secondaryCards.map((card) => (
          <DashboardKpiCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
        ))}
      </section>

      <section className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Alertas Prioritários</h2>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {mockAlertas.length} ativos
          </span>
        </div>
        <ExecutiveAlertsList alerts={mockAlertas.slice(0, 4)} />
      </section>

      <section className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Últimos Pedidos</h2>
          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Atualizado em tempo real</span>
        </div>
        <RecentOrdersTable orders={pedidosRecentes.map(p => ({
          id: p.id,
          numero: p.code,
          cliente: p.clientName,
          data: '', // Adapte se quiser mostrar a data real
          produtos: [], // Adapte se quiser mostrar produtos
          valorTotal: p.value,
          status: p.status === 5 ? 'concluido' : p.status === 0 ? 'pendente' : 'cancelado',
        }))} />
      </section>
    </div>
  );
}
