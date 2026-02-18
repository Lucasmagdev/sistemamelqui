import { mockAlertas } from '@/data/mockData';
import { AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AlertasPage() {
  const iconMap = {
    critico: AlertTriangle,
    atencao: AlertCircle,
    normal: CheckCircle2,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sistema Alerta Vermelho</h1>
        <p className="text-sm text-muted-foreground">Prevenção de perdas e ações sugeridas</p>
      </div>

      <div className="space-y-4">
        {mockAlertas.map((a) => {
          const Icon = iconMap[a.nivel];
          const cls = a.nivel === 'critico' ? 'status-critical' : a.nivel === 'atencao' ? 'status-warning' : 'status-ok';
          return (
            <div key={a.id} className={`rounded-xl border-2 p-5 card-elevated ${cls}`}>
              <div className="flex items-start gap-4">
                <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{a.produto} <span className="font-normal text-xs ml-2">({a.lote})</span></h3>
                    <span className="text-xs font-medium">{a.diasRestantes === 0 ? 'HOJE' : `${a.diasRestantes} dias`}</span>
                  </div>
                  <p className="text-sm">{a.motivo}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span>Giro médio: {a.giroMedio} kg/dia</span>
                    <span className="font-semibold rounded-md bg-background/50 px-2 py-1">💡 {a.sugestao}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
