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
  Crown,
} from 'lucide-react';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Estoque', url: '/estoque', icon: Package },
  { title: 'Lotes', url: '/lotes/novo', icon: Layers },
  { title: 'Pedidos', url: '/pedidos', icon: ShoppingCart },
  { title: 'Alertas', url: '/alertas', icon: AlertTriangle },
  { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
];

export default function AppSidebar() {
  const { config } = useTenant();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg gold-gradient-bg">
          <Crown className="h-5 w-5 text-sidebar-background" />
        </div>
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
            end={item.url === '/'}
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
