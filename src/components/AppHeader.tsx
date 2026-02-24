import { useTenant } from '@/contexts/TenantContext';
import { User, Bell, LogOut, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const pageTitleByPath: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/estoque': 'Estoque',
  '/admin/lotes/novo': 'Cadastro de Lote',
  '/admin/pedidos': 'Pedidos',
  '/admin/pedidos/novo': 'Novo Pedido',
  '/admin/alertas': 'Alertas',
  '/admin/relatorios': 'Relatórios',
  '/admin/configuracoes': 'Configurações',
};

export default function AppHeader() {
  const { config } = useTenant();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Busca nome do usuário logado
  const userNome = window.localStorage.getItem('imperial-flow-nome') || 'Usuário';
    const userRole = window.localStorage.getItem('imperial-flow-role') || 'cliente';

  const currentPageTitle = pageTitleByPath[location.pathname] ?? 'Painel Administrativo';

  const handleLogout = () => {
    logout();
    window.localStorage.removeItem('imperial-flow-nome');
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur">
      <div className="flex flex-col">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{config.nomeEmpresa}</p>
        <h2 className="text-base font-semibold text-foreground">{currentPageTitle}</h2>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="hidden gap-2 lg:inline-flex"
          onClick={() => navigate('/admin/pedidos/novo')}
        >
          <Plus className="h-4 w-4" />
          Novo Pedido
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden gap-2 xl:inline-flex"
          onClick={() => navigate('/admin/lotes/novo')}
        >
          <Plus className="h-4 w-4" />
          Novo Lote
        </Button>
        <Button variant="ghost" size="icon" className="relative" onClick={() => navigate('/admin/alertas')}>
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
            4
          </span>
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Abrir perfil" className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 cursor-pointer hover:bg-accent transition focus:outline-none focus:ring-2 focus:ring-primary">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary">
                <User className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-xs font-medium text-foreground">{userNome}</span>
                <br />
                <span className="text-[10px] text-muted-foreground">{userRole === 'admin' ? 'Admin' : 'Usuário'}</span>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                <User className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{userNome}</p>
                <p className="text-xs text-muted-foreground">{userRole === 'admin' ? 'Admin' : 'Usuário'}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2 w-full">
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {/* O botão de sair agora está apenas dentro do popover de perfil */}
      </div>
    </header>
  );
}
