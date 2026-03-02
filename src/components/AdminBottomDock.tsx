import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Layers, ShoppingCart, Users, Package } from 'lucide-react';

const dockItems = [
  { label: 'Inicio', path: '/admin', icon: LayoutDashboard },
  { label: 'Pedidos', path: '/admin/pedidos', icon: ShoppingCart },
  { label: 'Clientes', path: '/admin/clientes', icon: Users },
  { label: 'Produtos', path: '/admin/produtos', icon: Package },
  { label: 'Lotes', path: '/admin/lotes/novo', icon: Layers },
];

export default function AdminBottomDock() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 w-[min(94vw,780px)] -translate-x-1/2 rounded-2xl border border-border/70 bg-background/90 p-2 shadow-2xl backdrop-blur">
      <div className="grid grid-cols-5 gap-1">
        {dockItems.map((item) => {
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-semibold transition ${
                active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
              aria-label={item.label}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
