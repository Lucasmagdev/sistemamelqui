import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OrderList, Order } from '@/components/dashboard/OrderList';

export default function PedidosPage() {
  const navigate = useNavigate();

  // Adaptar mockPedidos para OrderList
  // Novo fluxo de status:
  // 0: Pedido Recebido
  // 1: Aceito/Confirmado
  // 2: Em Preparação
  // 3: Finalizado/Pronto
  // 4: Saiu para Entrega
  // 5: Concluído
  //
  // Como o mock só tem concluido, pendente, cancelado, vamos mapear:
  // concluido -> 5 (Concluído)
  // pendente -> 0 (Pedido Recebido)
  // cancelado -> 0 (Pedido Recebido, ou pode criar lógica para status especial se desejar)
  const [pedidosParaCards, setPedidosParaCards] = useState<Order[]>([]);
  useEffect(() => {
    async function fetchPedidos() {
      const { data, error } = await supabase
        .from('orders')
        .select('id, cliente_id, data_pedido, status, valor_total, clients(nome)');
      if (error) return;
      const pedidos = (data || []).map((pedido: any) => ({
        id: pedido.id,
        code: `IMP${pedido.id}`,
        clientName: pedido.clients?.nome || 'Cliente',
        city: 'Cidade Exemplo',
        phone: '(11) 00000-0000',
        value: pedido.valor_total,
        status:
          pedido.status === 'concluido' ? 5 :
          pedido.status === 'pendente' ? 0 :
          0,
      }));
      setPedidosParaCards(pedidos);
    }
    fetchPedidos();
  }, []);

  const statusLabel = (s: string) =>
    s === 'concluido' ? 'Concluído' : s === 'pendente' ? 'Pendente' : 'Cancelado';

  const statusClass = (s: string) =>
    s === 'concluido' ? 'status-ok' : s === 'pendente' ? 'status-warning' : 'status-critical';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Gestão de vendas e baixa automática</p>
        </div>
        <Button onClick={() => navigate('/admin/pedidos/novo')} className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
          <Plus className="mr-2 h-4 w-4" /> Novo Pedido
        </Button>
      </div>

      {/* Adicionado: cards de pedidos recentes */}
      <section className="relative z-20">
        <h2 className="text-lg font-bold text-yellow-400 mb-2">Pedidos Recentes</h2>
        <OrderList orders={pedidosParaCards} moeda="USD" unidadePeso="LB" />
      </section>

      {/* Tabela de pedidos (mantida) */}
      <div className="rounded-xl border border-border bg-card card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nº Pedido</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Produtos</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor Total</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockPedidos.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{p.numero}</td>
                  <td className="px-4 py-3 text-foreground">{p.cliente}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(p.data).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.produtos.map(pr => pr.nome).join(', ')}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">R$ {p.valorTotal.toLocaleString('pt-BR')}</td>
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
