import { useEffect, useState, useMemo } from 'react';
import React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Download, Search, Filter, Star, Edit2, Phone, Mail, MapPin, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Card } from '@/components/ui/card';

// ...existing code...
export default function ClientesAdminPage() {
  // Error Boundary para diagnóstico
  class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
    constructor(props: any) {
      super(props);
      this.state = { hasError: false };
    }
    static getDerivedStateFromError(error: any) {
      return { hasError: true };
    }
    componentDidCatch(error: any, errorInfo: any) {
      // Log para diagnóstico
      console.error('ErrorBoundary:', error, errorInfo);
    }
    render() {
      if (this.state.hasError) {
        return <div className="p-8 text-center text-red-600">Ocorreu um erro nesta página.<br/>Verifique o console para detalhes.</div>;
      }
      return this.props.children;
    }
  }

  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroVIP, setFiltroVIP] = useState(false);
  const [modalVIP, setModalVIP] = useState({ open: false, clienteId: null, status: false });
  const [vipObservacao, setVipObservacao] = useState('');
  const [modalPerfil, setModalPerfil] = useState({ open: false, cliente: null });
  const [pedidosPorCliente, setPedidosPorCliente] = useState<{[id: string]: number}>({});

  // Buscar clientes e pedidos
  useEffect(() => {
    async function fetchClientes() {
      setLoading(true);
      const { data, error } = await supabase.from('clients').select('*');
      setClientes(data || []);
      setLoading(false);
    }
    fetchClientes();
  }, []);

  useEffect(() => {
    async function fetchPedidos() {
      const { data } = await supabase.from('orders').select('client_id');
      const counts: {[id: string]: number} = {};
      (data || []).forEach((pedido: any) => {
        counts[pedido.client_id] = (counts[pedido.client_id] || 0) + 1;
      });
      setPedidosPorCliente(counts);
    }
    fetchPedidos();
  }, []);

  // Filtragem
  const clientesFiltrados = useMemo(() => {
    let filtrados = clientes;
    if (busca) {
      const b = busca.toLowerCase();
      filtrados = filtrados.filter(c =>
        c.nome?.toLowerCase().includes(b) ||
        c.email?.toLowerCase().includes(b) ||
        c.documento?.toLowerCase().includes(b)
      );
    }
    if (filtroVIP) {
      filtrados = filtrados.filter(c => c.vip);
    }
    return filtrados;
  }, [clientes, busca, filtroVIP]);

  // Exportar CSV
  function exportarCSV() {
    const header = ['Nome', 'Email', 'Telefone', 'VIP', 'Pedidos'];
    const rows = clientesFiltrados.map(c => [
      c.nome,
      c.email,
      c.telefone,
      c.vip ? 'Sim' : 'Não',
      pedidosPorCliente[c.id] || 0
    ]);
    const csv = [header, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <ErrorBoundary>
      <div className="w-full py-6 px-2 sm:px-4 md:px-8">
      {/* Dashboard cards */}
      <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-3">
        <Card className="flex items-center gap-4">
          <Star className="h-8 w-8 text-yellow-500" />
          <div>
            <div className="text-lg font-bold text-foreground">VIPs</div>
            <div className="text-2xl font-extrabold text-yellow-600">{clientes.filter(c => c.vip).length}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <Phone className="h-8 w-8 text-primary" />
          <div>
            <div className="text-lg font-bold text-foreground">Clientes</div>
            <div className="text-2xl font-extrabold text-primary">{clientes.length}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <Mail className="h-8 w-8 text-muted-foreground" />
          <div>
            <div className="text-lg font-bold text-foreground">Pedidos</div>
            <div className="text-2xl font-extrabold text-muted-foreground">{Object.values(pedidosPorCliente).reduce((a, b) => a + b, 0)}</div>
          </div>
        </Card>
      </div>

      {/* Filtros e busca */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Clientes cadastrados</h1>
          <p className="text-sm text-muted-foreground">Gestão premium dos clientes do sistema</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Buscar por nome, email ou documento..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-64 bg-background border-border focus:ring-primary"
            prefix={<Search className="h-4 w-4 text-muted-foreground" />}
          />
          <Button variant="outline" onClick={exportarCSV} className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
          <Button variant={filtroVIP ? 'default' : 'outline'} onClick={() => setFiltroVIP(!filtroVIP)}>
            VIPs {filtroVIP ? '✓' : ''}
          </Button>
        </div>
      </div>

      {/* Tabela de clientes */}
      <div className="overflow-x-auto rounded-lg border border-border bg-background w-full">
        <table className="w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-bold text-foreground">Nome</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-foreground">Email</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-foreground">Telefone</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-foreground">Endereço</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-foreground">VIP</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-foreground">Pedidos</th>
              <th className="px-4 py-2 text-left text-xs font-bold text-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : clientesFiltrados.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</td></tr>
            ) : (
              clientesFiltrados.map((c) => (
                <tr key={c.id} className="hover:bg-muted transition">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{c.nome?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-bold text-foreground">{c.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs">{c.email}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs">{c.telefone}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs">{`${c.endereco_rua || ''}, ${c.endereco_numero || ''}${c.endereco_complemento ? ' - ' + c.endereco_complemento : ''}, ${c.cidade || ''} - ${c.estado || ''}`.replace(/^, |, $| - $/, '')}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {c.vip && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-300 text-yellow-900 font-bold text-xs">⭐ VIP</span>}
                    {c.vip_observacao && <div className="mt-1 text-xs text-muted-foreground">{c.vip_observacao}</div>}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-primary">{pedidosPorCliente[c.id] || 0}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" onClick={() => setModalPerfil({ open: true, cliente: c })}>
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                      <Button size="sm" variant={c.vip ? 'outline' : 'default'} onClick={() => {
                        setVipObservacao(c.vip_observacao || '');
                        setModalVIP({ open: true, clienteId: c.id, status: c.vip });
                      }}>
                        {c.vip ? <><Star className="h-4 w-4 text-yellow-500 mr-1" /> Remover VIP</> : <><Star className="h-4 w-4 text-muted-foreground mr-1" /> Marcar VIP</>}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de observação VIP */}
      <Modal open={modalVIP.open} onClose={() => setModalVIP({ open: false })} title={modalVIP.status ? 'Remover VIP' : 'Marcar VIP'}>
        <div className="space-y-4">
          <label className="text-sm font-semibold text-foreground">Observação para status VIP:</label>
          <textarea
            className="w-full h-24 rounded border border-border bg-muted px-3 py-2 text-sm"
            value={vipObservacao}
            onChange={e => setVipObservacao(e.target.value)}
            placeholder="Justifique o status VIP..."
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModalVIP({ open: false })}>Cancelar</Button>
            <Button variant="default" onClick={async () => {
              if (!modalVIP.clienteId) return;
              await supabase.from('clients').update({ vip: !modalVIP.status, vip_observacao: vipObservacao }).eq('id', modalVIP.clienteId);
              setClientes((prev) => prev.map((cli) => cli.id === modalVIP.clienteId ? { ...cli, vip: !modalVIP.status, vip_observacao: vipObservacao } : cli));
              setModalVIP({ open: false });
            }}>{modalVIP.status ? 'Remover VIP' : 'Marcar VIP'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal de perfil do cliente */}
      <Modal open={modalPerfil.open} onClose={() => setModalPerfil({ open: false })} title={modalPerfil.cliente?.nome || 'Perfil do Cliente'}>
        {modalPerfil.cliente && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback>{modalPerfil.cliente.nome?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-bold text-lg text-foreground">{modalPerfil.cliente.nome}</div>
                <div className="text-xs text-muted-foreground">{modalPerfil.cliente.email}</div>
                {modalPerfil.cliente.vip && <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-300 text-yellow-900 font-bold text-xs">⭐ VIP</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" /> {modalPerfil.cliente.telefone}
              <Mail className="h-4 w-4 ml-2" /> {modalPerfil.cliente.email}
              <MapPin className="h-4 w-4 ml-2" /> {`${modalPerfil.cliente.endereco_rua || ''}, ${modalPerfil.cliente.endereco_numero || ''}${modalPerfil.cliente.endereco_complemento ? ' - ' + modalPerfil.cliente.endereco_complemento : ''}, ${modalPerfil.cliente.cidade || ''} - ${modalPerfil.cliente.estado || ''}`.replace(/^, |, $| - $/, '')}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Pedidos: <span className="font-bold text-primary">{pedidosPorCliente[modalPerfil.cliente.id] || 0}</span></span>
            </div>
            {modalPerfil.cliente.vip_observacao && (
              <div className="mt-1 text-xs text-muted-foreground">{modalPerfil.cliente.vip_observacao}</div>
            )}
            {/* Futuro: histórico, ações rápidas, WhatsApp, editar */}
          </div>
        )}
      </Modal>
      </div>
    </ErrorBoundary>
  );
}
