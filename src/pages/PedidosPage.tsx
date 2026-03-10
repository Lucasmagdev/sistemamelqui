import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OrderList, Order } from '@/components/dashboard/OrderList';

type PedidoTableRow = Order & {
  fullAddress?: string;
  data_pedido?: string;
};

const PEDIDOS_PAGE_SIZE = 10;

export default function PedidosPage() {
  const [filterSearchInput, setFilterSearchInput] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [pedidosParaCards, setPedidosParaCards] = useState<PedidoTableRow[]>([]);
  const [pedidosOffset, setPedidosOffset] = useState(0);
  const [hasMorePedidos, setHasMorePedidos] = useState(true);
  const [isLoadingMorePedidos, setIsLoadingMorePedidos] = useState(false);
  const navigate = useNavigate();

  const fetchPedidos = async ({ reset = false }: { reset?: boolean } = {}) => {
    if (!reset && (!hasMorePedidos || isLoadingMorePedidos)) return;

    const start = reset ? 0 : pedidosOffset;
    if (!reset) setIsLoadingMorePedidos(true);

    const { data: pedidosData, error } = await supabase
      .from('orders')
      .select('id, cliente_id, data_pedido, status, valor_total')
      .order('data_pedido', { ascending: false })
      .order('id', { ascending: false })
      .range(start, start + PEDIDOS_PAGE_SIZE - 1);

    if (error) {
      setIsLoadingMorePedidos(false);
      return;
    }

    const pedidosBase = pedidosData || [];
    if (pedidosBase.length === 0) {
      if (reset) setPedidosParaCards([]);
      setHasMorePedidos(false);
      setIsLoadingMorePedidos(false);
      return;
    }

    const clienteIds = pedidosBase
      .map((pedido: any) => pedido.cliente_id)
      .filter(Boolean);

    const { data: clientesData } = clienteIds.length
      ? await supabase
          .from('clients')
          .select('id, nome, telefone, cidade, endereco_rua, endereco_numero, endereco_complemento, cep, estado')
          .in('id', clienteIds)
      : { data: [] as any[] };

    const pedidoIds = pedidosBase.map((pedido: any) => pedido.id);
    const { data: itensData } = pedidoIds.length
      ? await supabase
          .from('order_items')
          .select('pedido_id, produto_id, quantidade')
          .in('pedido_id', pedidoIds)
      : { data: [] as any[] };

    const produtoIds = (itensData || [])
      .map((item: any) => item.produto_id)
      .filter(Boolean);
    const { data: produtosData } = produtoIds.length
      ? await supabase
          .from('products')
          .select('id, nome')
          .in('id', produtoIds)
      : { data: [] as any[] };

    const pedidos = pedidosBase.map((pedido: any) => {
      const cliente = (clientesData || []).find((c: any) => c.id === pedido.cliente_id);
      const itensPedido = (itensData || []).filter((item: any) => item.pedido_id === pedido.id);
      const produtosPedido = itensPedido
        .map((item: any) => {
          const produto = (produtosData || []).find((p: any) => p.id === item.produto_id);
          return produto ? `${produto.nome} (${item.quantidade}x)` : '';
        })
        .filter(Boolean);

      const city = cliente?.cidade || '-';
      const fullAddress = cliente
        ? `${cliente.endereco_rua || '-'}${cliente.endereco_numero ? `, ${cliente.endereco_numero}` : ''}${cliente.endereco_complemento ? `, ${cliente.endereco_complemento}` : ''}, ${cliente.cidade || '-'}, ${cliente.estado || '-'} ${cliente.cep || '-'}`.replace(/\s+/g, ' ').trim()
        : '-';

      return {
        id: pedido.id,
        code: `IMP${pedido.id}`,
        clientName: cliente?.nome || 'Cliente',
        city,
        phone: cliente?.telefone || '-',
        address: fullAddress,
        fullAddress,
        produtos: produtosPedido.join(', '),
        value: pedido.valor_total,
        status: typeof pedido.status === 'number' ? pedido.status : 0,
        data_pedido: pedido.data_pedido,
      };
    });

    setPedidosParaCards((prev) => {
      if (reset) return pedidos;
      const existingIds = new Set(prev.map((p) => p.id));
      const uniqueNew = pedidos.filter((p) => !existingIds.has(p.id));
      return [...prev, ...uniqueNew];
    });
    setPedidosOffset(start + pedidosBase.length);
    setHasMorePedidos(pedidosBase.length === PEDIDOS_PAGE_SIZE);
    setIsLoadingMorePedidos(false);
  };

  useEffect(() => {
    fetchPedidos({ reset: true });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setFilterSearch(filterSearchInput), 250);
    return () => clearTimeout(timer);
  }, [filterSearchInput]);

  const statusLabel = (s: number) => {
    switch (s) {
      case 0:
        return 'Pedido Recebido';
      case 1:
        return 'Aceito/Confirmado';
      case 2:
        return 'Em Preparacao';
      case 3:
        return 'Finalizado/Pronto';
      case 4:
        return 'Saiu para Entrega';
      case 5:
        return 'Concluido';
      default:
        return 'Desconhecido';
    }
  };

  const statusClass = (s: number) => {
    switch (s) {
      case 5:
        return 'status-ok';
      case 0:
        return 'status-warning';
      default:
        return 'status-critical';
    }
  };

  const cidadesDisponiveis = useMemo(() => {
    const cities = Array.from(new Set(pedidosParaCards.map((p) => p.city).filter((c) => c && c !== '-')));
    return cities.sort((a, b) => a.localeCompare(b));
  }, [pedidosParaCards]);

  const pedidosFiltrados = useMemo(() => {
    const search = filterSearch.trim().toLowerCase();
    return pedidosParaCards.filter((p) => {
      const byStatus = filterState === '' || p.status === Number(filterState);
      const byCity = filterCity === '' || p.city === filterCity;
      const bySearch =
        search === '' ||
        p.clientName.toLowerCase().includes(search) ||
        (p.phone || '').toLowerCase().includes(search) ||
        (p.code || '').toLowerCase().includes(search);
      return byStatus && byCity && bySearch;
    });
  }, [pedidosParaCards, filterSearch, filterState, filterCity]);

  const exportarCSV = () => {
    const header = ['Nº Pedido', 'Cliente', 'Cidade', 'Endereco Completo', 'Produtos', 'Data', 'Valor Total', 'Status'];
    const rows = pedidosFiltrados.map((p) => [
      p.code,
      p.clientName,
      p.city || '-',
      p.fullAddress || '-',
      p.produtos || '-',
      p.data_pedido ? new Date(p.data_pedido).toLocaleDateString('pt-BR') : '-',
      p.value != null ? Number(p.value).toFixed(2) : '-',
      statusLabel(p.status),
    ]);
    const csv = [header, ...rows].map((r) => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pedidos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const limparFiltros = () => {
    setFilterSearchInput('');
    setFilterSearch('');
    setFilterState('');
    setFilterCity('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Gestao de vendas e baixa automatica</p>
        </div>
        <Button onClick={() => navigate('/admin/pedidos/novo')} className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
          <Plus className="mr-2 h-4 w-4" /> Novo Pedido
        </Button>
      </div>

      <section className="relative z-20">
        <h2 className="text-lg font-bold text-yellow-400 mb-2">Pedidos Recentes</h2>
        <OrderList orders={pedidosParaCards} moeda="USD" unidadePeso="LB" onStatusChange={() => fetchPedidos({ reset: true })} />
      </section>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Buscar por cliente, telefone ou codigo"
          value={filterSearchInput}
          onChange={(e) => setFilterSearchInput(e.target.value)}
          className="min-w-[260px] border border-sidebar-border rounded px-3 py-2 bg-sidebar-foreground text-sidebar-primary placeholder-gold-dark focus:ring-gold focus-border-gold"
        />
        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
          className="border border-sidebar-border rounded px-3 py-2 bg-sidebar-foreground text-sidebar-primary focus:ring-gold focus-border-gold"
        >
          <option value="">Status: todos</option>
          <option value="0">Pedido Recebido</option>
          <option value="1">Aceito/Confirmado</option>
          <option value="2">Em Preparacao</option>
          <option value="3">Finalizado/Pronto</option>
          <option value="4">Saiu para Entrega</option>
          <option value="5">Concluido</option>
        </select>
        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="border border-sidebar-border rounded px-3 py-2 bg-sidebar-foreground text-sidebar-primary focus:ring-gold focus-border-gold"
        >
          <option value="">Cidade: todas</option>
          {cidadesDisponiveis.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <Button variant="outline" className="border-sidebar-border bg-gold text-black font-bold hover:bg-gold-dark transition" onClick={exportarCSV}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
        <Button variant="ghost" onClick={limparFiltros}>
          Limpar filtros
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">Resultados: {pedidosFiltrados.length}</span>
      </div>

      <div className="rounded-xl border border-border bg-card card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm rounded-xl overflow-hidden shadow-lg">
            <thead className="bg-gold text-black">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Nº Pedido</th>
                <th className="px-4 py-3 text-left font-bold">Cliente</th>
                <th className="px-4 py-3 text-left font-bold">Cidade</th>
                <th className="px-4 py-3 text-left font-bold">Endereco</th>
                <th className="px-4 py-3 text-left font-bold">Produtos</th>
                <th className="px-4 py-3 text-left font-bold">Data</th>
                <th className="px-4 py-3 text-right font-bold">Valor Total</th>
                <th className="px-4 py-3 text-center font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="bg-card text-white">
              {pedidosFiltrados.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-gold/10 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gold">{p.code}</td>
                  <td className="px-4 py-3 font-semibold">{p.clientName}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.city || '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.fullAddress || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {p.produtos ? (
                      p.produtos.split(', ').map((prod, idx) => (
                        <span key={idx} className="inline-block bg-gold/20 text-gold-dark rounded px-2 py-1 mr-1 mb-1 font-semibold text-xs">
                          {prod}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {p.data_pedido
                      ? new Date(p.data_pedido).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-lg text-gold">
                    {p.value != null ? p.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusClass(p.status)}`}>
                      {statusLabel(p.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {hasMorePedidos ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="border-sidebar-border bg-gold text-black font-bold hover:bg-gold-dark transition"
            onClick={() => fetchPedidos()}
            disabled={isLoadingMorePedidos}
          >
            {isLoadingMorePedidos ? 'Carregando...' : 'Carregar mais'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
