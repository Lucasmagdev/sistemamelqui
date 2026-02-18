import { useTenant } from '@/contexts/TenantContext';
import { User, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppHeader() {
  const { config } = useTenant();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{config.nomeEmpresa}</h2>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
            4
          </span>
        </Button>
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary">
            <User className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium text-foreground">Admin</p>
            <p className="text-[10px] text-muted-foreground">Gerente</p>
          </div>
        </div>
      </div>
    </header>
  );
}
