import { NavLink } from '@/components/NavLink';
import { useTenant } from '@/contexts/TenantContext';
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingCart,
  AlertTriangle,
  BarChart3,
  Settings,
} from 'lucide-react';

const navItems = [
  { title: 'Dashboard', url: '/admin', icon: LayoutDashboard },
  { title: 'Estoque', url: '/admin/estoque', icon: Package },
  { title: 'Lotes', url: '/admin/lotes/novo', icon: Layers },
  { title: 'Pedidos', url: '/admin/pedidos', icon: ShoppingCart },
  { title: 'Alertas', url: '/admin/alertas', icon: AlertTriangle },
  { title: 'Relatórios', url: '/admin/relatorios', icon: BarChart3 },
  { title: 'Configurações', url: '/admin/configuracoes', icon: Settings },
];

export default function AppSidebar() {
  const { config } = useTenant();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-sidebar-border">
        <img
          src={config.logoUrl}
          alt={config.nomeEmpresa}
          className="h-[108px] w-[108px] rounded-lg object-cover border border-sidebar-border"
        />
        <div className="flex flex-col">
          <span className="text-sm font-bold text-sidebar-accent-foreground leading-tight">
            {config.nomeEmpresa}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
            ERP Premium
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === '/admin'}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeClassName="bg-sidebar-accent text-sidebar-primary"
          >
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-wider">
          v1.0.0 MVP
        </p>
      </div>
    </aside>
  );
}
