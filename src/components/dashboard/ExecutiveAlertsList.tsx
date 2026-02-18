import { Button } from '@/components/ui/button';
import { type Alerta } from '@/data/mockData';
import { AlertTriangle, BellRing, CheckCircle2 } from 'lucide-react';

interface ExecutiveAlertsListProps {
  alerts: Alerta[];
}

const getLevelStyle = (nivel: Alerta['nivel']) => {
  if (nivel === 'critico') {
    return {
      border: 'border-status-critical/40',
      bar: 'bg-status-critical',
      icon: AlertTriangle,
      iconColor: 'text-status-critical',
      tag: 'Crítico',
    };
  }

  if (nivel === 'atencao') {
    return {
      border: 'border-status-warning/40',
      bar: 'bg-status-warning',
      icon: BellRing,
      iconColor: 'text-status-warning',
      tag: 'Atenção',
    };
  }

  return {
    border: 'border-status-ok/40',
    bar: 'bg-status-ok',
    icon: CheckCircle2,
    iconColor: 'text-status-ok',
    tag: 'Normal',
  };
};

const getCategory = (motivo: string) => {
  if (motivo.toLowerCase().includes('validade')) return 'Validade';
  if (motivo.toLowerCase().includes('estoque')) return 'Estoque';
  if (motivo.toLowerCase().includes('giro')) return 'Giro';
  return 'Operação';
};

export default function ExecutiveAlertsList({ alerts }: ExecutiveAlertsListProps) {
  return (
    <section className="space-y-3">
      {alerts.map((alerta) => {
        const level = getLevelStyle(alerta.nivel);
        const Icon = level.icon;

        return (
          <article
            key={alerta.id}
            className={`premium-glass group relative overflow-hidden rounded-2xl border ${level.border} p-4 transition-all duration-300`}
          >
            <span className={`absolute left-0 top-0 h-full w-1.5 ${level.bar}`} />

            <div className="flex flex-col gap-4 pl-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card/80">
                  <Icon className={`h-4 w-4 ${level.iconColor}`} />
                </div>

                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{alerta.produto}</span>
                    <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {alerta.lote}
                    </span>
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                      {getCategory(alerta.motivo)}
                    </span>
                    <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-foreground/80">
                      {level.tag}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90">{alerta.motivo}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{alerta.sugestao}</p>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
              >
                Resolver agora
              </Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
