import { dashboardStats, mockAlertas } from '@/data/mockData';
import { Package, AlertTriangle, ShoppingCart, DollarSign, Bell } from 'lucide-react';

const cards = [
  { label: 'Total em Estoque', value: `${dashboardStats.totalEstoque} kg`, icon: Package, accent: false },
  { label: 'Lotes em Risco', value: dashboardStats.lotesRisco, icon: AlertTriangle, accent: true },
  { label: 'Pedidos do Dia', value: dashboardStats.pedidosDia, icon: ShoppingCart, accent: false },
  { label: 'Faturamento do Dia', value: `R$ ${dashboardStats.faturamentoDia.toLocaleString('pt-BR')}`, icon: DollarSign, accent: false },
  { label: 'Alertas Ativos', value: dashboardStats.alertasAtivos, icon: Bell, accent: true },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da operação</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="card-elevated rounded-xl border border-border bg-card p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {c.label}
              </span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.accent ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                <c.icon className={`h-4 w-4 ${c.accent ? 'text-destructive' : 'text-primary'}`} />
              </div>
            </div>
            <span className="text-2xl font-bold text-foreground">{c.value}</span>
          </div>
        ))}
      </div>

      {/* Recent Alerts */}
      <div className="rounded-xl border border-border bg-card p-6 card-elevated">
        <h3 className="text-sm font-semibold text-foreground mb-4">Alertas Recentes</h3>
        <div className="space-y-3">
          {mockAlertas.slice(0, 3).map((a) => (
            <div
              key={a.id}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                a.nivel === 'critico' ? 'status-critical' :
                a.nivel === 'atencao' ? 'status-warning' : 'status-ok'
              }`}
            >
              <div>
                <span className="font-medium">{a.produto}</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span>{a.motivo}</span>
              </div>
              <span className="text-xs font-medium">{a.sugestao}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
