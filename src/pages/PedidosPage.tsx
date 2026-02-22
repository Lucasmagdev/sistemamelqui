// ...existing code...
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OrderList, Order } from '@/components/dashboard/OrderList';

export default function PedidosPage() {
    const [filterCity, setFilterCity] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterState, setFilterState] = useState('');
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
      const { data: pedidosData, error } = await supabase
        .from('orders')
        .select('id, cliente_id, data_pedido, status, valor_total');
      if (error) return;
      // Buscar todos os clientes referenciados
      const clienteIds = (pedidosData || []).map((pedido: any) => pedido.cliente_id);
      const { data: clientesData } = await supabase
        .from('clients')
        .select('id, nome, telefone, cidade, endereco_rua, endereco_numero, endereco_complemento, cep, estado')
        .in('id', clienteIds);
      // Buscar itens dos pedidos
      const pedidoIds = (pedidosData || []).map((pedido: any) => pedido.id);
      const { data: itensData } = await supabase
        .from('order_items')
        .select('pedido_id, produto_id, quantidade')
        .in('pedido_id', pedidoIds);
      // Buscar nomes dos produtos
      const produtoIds = (itensData || []).map((item: any) => item.produto_id);
      const { data: produtosData } = await supabase
        .from('products')
        .select('id, nome')
        .in('id', produtoIds);
      const pedidos = (pedidosData || []).map((pedido: any) => {
        const cliente = (clientesData || []).find((c: any) => c.id === pedido.cliente_id);
        const itensPedido = (itensData || []).filter((item: any) => item.pedido_id === pedido.id);
        const produtosPedido = itensPedido.map((item: any) => {
          const produto = (produtosData || []).find((p: any) => p.id === item.produto_id);
          return produto ? `${produto.nome} (${item.quantidade}x)` : '';
        }).filter(Boolean);
        return {
          id: pedido.id,
          code: `IMP${pedido.id}`,
          clientName: cliente?.nome || 'Cliente',
          city: cliente?.cidade || '-',
          phone: cliente?.telefone || '-',
          address: cliente ? `Cidade: ${cliente.cidade || '-'}, Estado: ${cliente.estado || '-'}, Rua: ${cliente.endereco_rua || '-'}, Nº: ${cliente.endereco_numero || '-'}, Complemento: ${cliente.endereco_complemento || '-'}, CEP: ${cliente.cep || '-'}` : '-',
          produtos: produtosPedido.join(', '),
          value: pedido.valor_total,
          status:
            pedido.status === 'concluido' ? 5 :
            pedido.status === 'pendente' ? 0 :
            0,
          data_pedido: pedido.data_pedido,
        };
      });
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

      {/* Filtros avançados em linha */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Buscar por nome, email ou documento"
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          className="border border-sidebar-border rounded px-3 py-2 bg-sidebar-foreground text-sidebar-primary placeholder-gold-dark focus:ring-gold focus-border-gold"
        />
        <input
          type="text"
          placeholder="Filtrar por cidade, estado"
          value={filterCity}
          onChange={e => setFilterCity(e.target.value)}
          className="border border-sidebar-border rounded px-3 py-2 bg-sidebar-foreground text-sidebar-primary placeholder-gold-dark focus:ring-gold focus-border-gold"
        />
        <input
          type="text"
          placeholder="Filtrar por estado"
          value={filterState}
          onChange={e => setFilterState(e.target.value)}
          className="border border-sidebar-border rounded px-3 py-2 bg-sidebar-foreground text-sidebar-primary placeholder-gold-dark focus:ring-gold focus-border-gold"
        />
        <button className="border border-sidebar-border rounded px-3 py-2 bg-gold text-black font-bold hover:bg-gold-dark transition">Exportar CSV</button>
      </div>
      {/* Tabela de pedidos (mantida) */}
      <div className="rounded-xl border border-border bg-card card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm rounded-xl overflow-hidden shadow-lg">
            <thead className="bg-gold text-black">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Nº Pedido</th>
                <th className="px-4 py-3 text-left font-bold">Cliente</th>
                <th className="px-4 py-3 text-left font-bold">Cidade</th>
                <th className="px-4 py-3 text-left font-bold">Estado</th>
                <th className="px-4 py-3 text-left font-bold">Rua</th>
                <th className="px-4 py-3 text-left font-bold">Número</th>
                <th className="px-4 py-3 text-left font-bold">Complemento</th>
                <th className="px-4 py-3 text-left font-bold">CEP</th>
                <th className="px-4 py-3 text-left font-bold">Produtos</th>
                <th className="px-4 py-3 text-left font-bold">Data</th>
                <th className="px-4 py-3 text-right font-bold">Valor Total</th>
                <th className="px-4 py-3 text-center font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="bg-card text-white">
              {pedidosParaCards.filter(p =>
                (filterCity === '' || p.city.toLowerCase().includes(filterCity.toLowerCase())) &&
                (filterState === '' || (p.address && p.address.toLowerCase().includes(filterState.toLowerCase()))) &&
                (filterSearch === '' || p.clientName.toLowerCase().includes(filterSearch.toLowerCase()) || (p.phone && p.phone.includes(filterSearch)))
              ).map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-gold/10 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gold">{p.code}</td>
                  <td className="px-4 py-3 font-semibold">{p.clientName}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.city}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.address?.split('Estado: ')[1]?.split(',')[0] || '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.address?.split('Rua: ')[1]?.split(',')[0] || '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.address?.split('Nº: ')[1]?.split(',')[0] || '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.address?.split('Complemento: ')[1]?.split(',')[0] || '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.address?.split('CEP: ')[1] || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {p.produtos ? p.produtos.split(', ').map((prod, idx) => (
                      <span key={idx} className="inline-block bg-gold/20 text-gold-dark rounded px-2 py-1 mr-1 mb-1 font-semibold text-xs">{prod}</span>
                    )) : <span className="text-muted">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {p.data_pedido
                      ? new Date(p.data_pedido).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric'
                        })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-lg text-gold">R$ {p.value?.toLocaleString('pt-BR') || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusClass(p.status)}`}>{statusLabel(p.status)}</span>
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
