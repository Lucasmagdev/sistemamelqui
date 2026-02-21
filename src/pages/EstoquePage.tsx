import { mockProdutos } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function EstoquePage() {
  const navigate = useNavigate();

  const statusLabel = (s: string) =>
    s === 'normal' ? 'Normal' : s === 'atencao' ? 'Atenção' : 'Risco';

  const statusClass = (s: string) =>
    s === 'normal' ? 'status-ok' : s === 'atencao' ? 'status-warning' : 'status-critical';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estoque Inteligente</h1>
          <p className="text-sm text-muted-foreground">Controle de produtos e lotes</p>
        </div>
        <Button onClick={() => navigate('/admin/lotes/novo')} className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
          <Plus className="mr-2 h-4 w-4" /> Novo Lote
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Produto</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lote</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entrada</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Validade</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Peso (kg)</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Custo/kg</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockProdutos.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{p.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.lote}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(p.dataEntrada).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(p.dataValidade).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{p.pesoDisponivel}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">R$ {p.custoMedio.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClass(p.status)}`}>
                      {statusLabel(p.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
