import { NavLink } from '@/components/NavLink';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import type { TranslationKey } from '@/i18n/messages';
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingCart,
  BarChart3,
  Users,
  Wallet,
  Store,
  Bot,
  UserRoundCog,
} from 'lucide-react';

type NavItem = {
  titleKey: TranslationKey;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { titleKey: 'nav.dashboard', url: '/admin', icon: LayoutDashboard },
  { titleKey: 'nav.batches', url: '/admin/estoque', icon: Layers },
  { titleKey: 'nav.orders', url: '/admin/pedidos', icon: ShoppingCart },
  { titleKey: 'nav.customers', url: '/admin/clientes', icon: Users },
  { titleKey: 'nav.products', url: '/admin/produtos', icon: Package },
  { titleKey: 'nav.sales', url: '/admin/vendas', icon: Store },
  { titleKey: 'nav.finance', url: '/admin/financeiro', icon: Wallet },
  { titleKey: 'nav.employees', url: '/admin/funcionarios', icon: UserRoundCog },
  { titleKey: 'nav.reports', url: '/admin/relatorios', icon: BarChart3 },
  { titleKey: 'nav.assistant', url: '/admin/assistente', icon: Bot },
];

export default function AppSidebar() {
  const { config } = useTenant();
  const { t } = useI18n();

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-6">
        <img
          src={config.logoUrl}
          alt={config.nomeEmpresa}
          className="h-[108px] w-[108px] rounded-lg border border-sidebar-border object-cover"
        />
        <div className="flex flex-col">
          <span className="text-sm font-bold leading-tight text-sidebar-accent-foreground">
            {config.nomeEmpresa}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
            {t('common.erpPremium')}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === '/admin'}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeClassName="bg-sidebar-accent text-sidebar-primary"
          >
            <item.icon className="h-4 w-4" />
            <span>{t(item.titleKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40">v1.0.0 MVP</p>
      </div>
    </aside>
  );
}
