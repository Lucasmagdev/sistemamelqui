import DashboardBackground3D from '@/components/dashboard/DashboardBackground3D';
import DashboardKpiCard from '@/components/dashboard/DashboardKpiCard';
import ExecutiveAlertsList from '@/components/dashboard/ExecutiveAlertsList';
import ExecutiveHeroChart from '@/components/dashboard/ExecutiveHeroChart';
import RecentOrdersTable from '@/components/dashboard/RecentOrdersTable';
import { dashboardStats, mockAlertas, mockPedidos } from '@/data/mockData';
import { AlertTriangle, Bell, DollarSign, Package, ShoppingCart } from 'lucide-react';

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
  return (
    <div className="relative space-y-8 pb-2">
      <DashboardBackground3D />

      <div className="relative z-10 space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Dashboard Executivo</h1>
        <p className="text-sm text-muted-foreground">Painel estratégico com visão premium da operação diária.</p>
      </div>

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
        <RecentOrdersTable orders={mockPedidos.slice(0, 5)} />
      </section>
    </div>
  );
}
