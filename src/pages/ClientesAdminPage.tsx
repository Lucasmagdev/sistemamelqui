import { useEffect, useMemo, useState } from 'react';
import React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Download, Search, Star, Phone, Mail, MapPin, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Card } from '@/components/ui/card';

type SortField = 'nome' | 'email' | 'vip' | 'pedidos';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-red-600">
          Ocorreu um erro nesta pagina.
          <br />
          Verifique o console para detalhes.
        </div>
      );
    }
    return this.props.children;
  }
}

function enderecoCompleto(c: any) {
  return `${c.endereco_rua || ''}, ${c.endereco_numero || ''}${c.endereco_complemento ? ` - ${c.endereco_complemento}` : ''}, ${c.cidade || ''} - ${c.estado || ''}`
    .replace(/^, |, $| - $/, '')
    .trim();
}

export default function ClientesAdminPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pedidosPorCliente, setPedidosPorCliente] = useState<{ [id: string]: number }>({});

  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroVIP, setFiltroVIP] = useState(false);
  const [filtroComPedidos, setFiltroComPedidos] = useState(false);

  const [sortField, setSortField] = useState<SortField>('nome');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;

  const [modalVIP, setModalVIP] = useState<{ open: boolean; clienteId: string | null; status: boolean }>({
    open: false,
    clienteId: null,
    status: false,
  });
  const [vipObservacao, setVipObservacao] = useState('');
  const [vipSaving, setVipSaving] = useState(false);
  const [vipLoadingId, setVipLoadingId] = useState<string | null>(null);

  const [modalPerfil, setModalPerfil] = useState<{ open: boolean; cliente: any | null }>({ open: false, cliente: null });

  useEffect(() => {
    async function fetchClientes() {
      setLoading(true);
      const { data } = await supabase.from('clients').select('*');
      setClientes(data || []);
      setLoading(false);
    }

    async function fetchPedidos() {
      const { data } = await supabase.from('orders').select('client_id');
      const counts: { [id: string]: number } = {};
      (data || []).forEach((pedido: any) => {
        counts[pedido.client_id] = (counts[pedido.client_id] || 0) + 1;
      });
      setPedidosPorCliente(counts);
    }

    fetchClientes();
    fetchPedidos();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setBusca(buscaInput), 300);
    return () => clearTimeout(timer);
  }, [buscaInput]);

  const alternarOrdenacao = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDir('asc');
  };

  const clientesFiltrados = useMemo(() => {
    let filtrados = [...clientes];

    if (busca.trim()) {
      const b = busca.toLowerCase();
      filtrados = filtrados.filter(
        (c) =>
          c.nome?.toLowerCase().includes(b) ||
          c.email?.toLowerCase().includes(b) ||
          c.documento?.toLowerCase().includes(b)
      );
    }

    if (filtroVIP) {
      filtrados = filtrados.filter((c) => c.vip);
    }

    if (filtroComPedidos) {
      filtrados = filtrados.filter((c) => (pedidosPorCliente[c.id] || 0) > 0);
    }

    filtrados.sort((a, b) => {
      const pedidosA = pedidosPorCliente[a.id] || 0;
      const pedidosB = pedidosPorCliente[b.id] || 0;

      let compare = 0;
      if (sortField === 'nome') compare = (a.nome || '').localeCompare(b.nome || '');
      if (sortField === 'email') compare = (a.email || '').localeCompare(b.email || '');
      if (sortField === 'vip') compare = Number(Boolean(a.vip)) - Number(Boolean(b.vip));
      if (sortField === 'pedidos') compare = pedidosA - pedidosB;

      return sortDir === 'asc' ? compare : -compare;
    });

    return filtrados;
  }, [clientes, busca, filtroVIP, filtroComPedidos, sortField, sortDir, pedidosPorCliente]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [busca, filtroVIP, filtroComPedidos, sortField, sortDir]);

  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / itensPorPagina));
  const inicio = (paginaAtual - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina;
  const clientesPaginados = clientesFiltrados.slice(inicio, fim);

  function exportarCSV() {
    const header = ['Nome', 'Email', 'Telefone', 'VIP', 'Pedidos'];
    const rows = clientesFiltrados.map((c) => [c.nome, c.email, c.telefone, c.vip ? 'Sim' : 'Nao', pedidosPorCliente[c.id] || 0]);
    const csv = [header, ...rows].map((r) => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPedidos = Object.values(pedidosPorCliente).reduce((a, b) => a + b, 0);
  const totalVips = clientes.filter((c) => c.vip).length;

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />;
  };

  return (
    <ErrorBoundary>
      <div className="w-full min-w-0 max-w-full py-6 px-2 sm:px-4 md:px-6 xl:px-8 space-y-6 overflow-x-hidden">
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          <Card className="w-full min-w-0 flex items-center gap-4 border border-yellow-500/25 bg-[linear-gradient(120deg,rgba(255,205,60,0.12),rgba(20,20,20,0.9))] px-5 py-4 shadow-lg">
            <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/15 p-2.5">
              <Star className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-zinc-300">VIPs</div>
              <div className="text-3xl leading-none font-extrabold text-yellow-400">{totalVips}</div>
            </div>
          </Card>
          <Card className="w-full min-w-0 flex items-center gap-4 border border-border/70 bg-[linear-gradient(120deg,rgba(38,38,38,0.85),rgba(15,15,15,0.95))] px-5 py-4 shadow-lg">
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-2.5">
              <Phone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Clientes</div>
              <div className="text-3xl leading-none font-extrabold text-primary">{clientes.length}</div>
            </div>
          </Card>
          <Card className="w-full min-w-0 flex items-center gap-4 border border-border/70 bg-[linear-gradient(120deg,rgba(38,38,38,0.85),rgba(15,15,15,0.95))] px-5 py-4 shadow-lg">
            <div className="rounded-xl border border-zinc-500/40 bg-zinc-500/10 p-2.5">
              <Mail className="h-6 w-6 text-zinc-300" />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Pedidos</div>
              <div className="text-3xl leading-none font-extrabold text-zinc-100">{totalPedidos}</div>
            </div>
          </Card>
        </div>

        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(160deg,rgba(30,30,30,0.85),rgba(9,9,9,0.98))] p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Clientes cadastrados</h1>
            <p className="text-sm text-muted-foreground">Gestao premium dos clientes do sistema</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <Input
              placeholder="Buscar por nome, email ou documento..."
              value={buscaInput}
              onChange={(e) => setBuscaInput(e.target.value)}
              className="min-w-0 w-full sm:w-80 md:w-72 lg:w-80 bg-black/40 border-border/70 focus:ring-primary"
              prefix={<Search className="h-4 w-4 text-muted-foreground" />}
            />
            <Button variant="outline" onClick={exportarCSV} className="gap-2 border-border/70 bg-black/30 hover:bg-black/50">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button variant={filtroVIP ? 'default' : 'outline'} className={filtroVIP ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'border-border/70 bg-black/30 hover:bg-black/50'} onClick={() => setFiltroVIP((v) => !v)}>
              VIPs {filtroVIP ? 'sim' : ''}
            </Button>
            <Button variant={filtroComPedidos ? 'default' : 'outline'} className={filtroComPedidos ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border/70 bg-black/30 hover:bg-black/50'} onClick={() => setFiltroComPedidos((v) => !v)}>
              Com pedidos
            </Button>
            <Button
              variant="ghost"
              className="text-zinc-300 hover:text-white hover:bg-white/5"
              onClick={() => {
                setBuscaInput('');
                setBusca('');
                setFiltroVIP(false);
                setFiltroComPedidos(false);
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
        </div>

        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="rounded-xl border border-border/60 bg-black/40 p-4 text-sm text-muted-foreground">Carregando...</div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-black/40 p-4 text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            clientesPaginados.map((c) => (
              <div key={`mobile-${c.id}`} className="rounded-xl border border-border/60 bg-[linear-gradient(160deg,rgba(28,28,28,0.9),rgba(10,10,10,0.98))] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 ring-1 ring-border/60">
                      <AvatarFallback>{c.nome?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{c.nome}</p>
                      <p className="truncate text-xs text-zinc-400">{c.email}</p>
                    </div>
                  </div>
                  {c.vip ? (
                    <span className="inline-flex items-center rounded-md bg-yellow-300 px-2 py-1 text-[10px] font-bold text-yellow-900">VIP</span>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-black/30 p-2">
                    <p className="text-zinc-400">Telefone</p>
                    <p className="mt-0.5 font-medium text-zinc-100">{c.telefone || '-'}</p>
                  </div>
                  <div className="rounded-md bg-black/30 p-2">
                    <p className="text-zinc-400">Pedidos</p>
                    <p className="mt-0.5 font-bold text-yellow-400">{pedidosPorCliente[c.id] || 0}</p>
                  </div>
                  <div className="col-span-2 rounded-md bg-black/30 p-2">
                    <p className="text-zinc-400">Endereco</p>
                    <p className="mt-0.5 line-clamp-2 font-medium text-zinc-100">{enderecoCompleto(c)}</p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 border-border/70 bg-black/30 hover:bg-black/50" onClick={() => setModalPerfil({ open: true, cliente: c })}>
                    Ver perfil
                  </Button>
                  <Button
                    size="sm"
                    variant={c.vip ? 'outline' : 'default'}
                    className={c.vip ? 'flex-1 border-border/70 bg-black/30 hover:bg-black/50' : 'flex-1 bg-yellow-500 text-black hover:bg-yellow-400'}
                    disabled={vipLoadingId === c.id}
                    onClick={() => {
                      setVipObservacao(c.vip_observacao || '');
                      setModalVIP({ open: true, clienteId: c.id, status: c.vip });
                    }}
                  >
                    {vipLoadingId === c.id ? 'Salvando...' : c.vip ? 'Remover VIP' : 'Marcar VIP'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block max-w-full overflow-x-auto rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(20,20,20,0.94),rgba(8,8,8,0.98))] shadow-xl w-full">
          <table className="w-full divide-y divide-border">
            <thead className="bg-zinc-900/90 sticky top-0 z-10 backdrop-blur">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-zinc-100 cursor-pointer" onClick={() => alternarOrdenacao('nome')}>
                  <div className="inline-flex items-center gap-1">Nome {sortIcon('nome')}</div>
                </th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-zinc-100 cursor-pointer" onClick={() => alternarOrdenacao('email')}>
                  <div className="inline-flex items-center gap-1">Email {sortIcon('email')}</div>
                </th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-zinc-100">Telefone</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-zinc-100">Endereco</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-zinc-100 cursor-pointer" onClick={() => alternarOrdenacao('vip')}>
                  <div className="inline-flex items-center gap-1">VIP {sortIcon('vip')}</div>
                </th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-zinc-100 cursor-pointer" onClick={() => alternarOrdenacao('pedidos')}>
                  <div className="inline-flex items-center gap-1">Pedidos {sortIcon('pedidos')}</div>
                </th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-zinc-100">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td>
                </tr>
              ) : clientesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</td>
                </tr>
              ) : (
                clientesPaginados.map((c) => (
                  <tr key={c.id} className="border-t border-border/40 hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-9 w-9 ring-1 ring-border/60">
                          <AvatarFallback>{c.nome?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-foreground text-[1.03rem]">{c.nome}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-zinc-100">{c.email}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-zinc-100">{c.telefone}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-zinc-100">{enderecoCompleto(c)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {c.vip && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-yellow-300 text-yellow-900 font-bold text-xs">
                          VIP
                        </span>
                      )}
                      {c.vip_observacao && <div className="mt-1 text-xs text-zinc-400 max-w-48 truncate">{c.vip_observacao}</div>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-base font-bold text-yellow-400">{pedidosPorCliente[c.id] || 0}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex gap-2">
                        <Button size="icon" variant="ghost" className="hover:bg-white/10" onClick={() => setModalPerfil({ open: true, cliente: c })}>
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                        <Button
                          size="sm"
                          variant={c.vip ? 'outline' : 'default'}
                          className={c.vip ? 'border-border/70 bg-black/30 hover:bg-black/50' : 'bg-yellow-500 text-black hover:bg-yellow-400'}
                          disabled={vipLoadingId === c.id}
                          onClick={() => {
                            setVipObservacao(c.vip_observacao || '');
                            setModalVIP({ open: true, clienteId: c.id, status: c.vip });
                          }}
                        >
                          {vipLoadingId === c.id ? 'Salvando...' : c.vip ? 'Remover VIP' : 'Marcar VIP'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {clientesFiltrados.length === 0 ? 0 : inicio + 1} - {Math.min(fim, clientesFiltrados.length)} de {clientesFiltrados.length}
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-black/30 p-1">
            <Button variant="outline" size="sm" className="border-border/70 bg-transparent hover:bg-white/5" disabled={paginaAtual <= 1} onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}>
              Anterior
            </Button>
            <span className="text-xs text-zinc-300 px-2">Pagina {paginaAtual} de {totalPaginas}</span>
            <Button variant="outline" size="sm" className="border-border/70 bg-transparent hover:bg-white/5" disabled={paginaAtual >= totalPaginas} onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}>
              Proxima
            </Button>
          </div>
        </div>

        <Modal open={modalVIP.open} onClose={() => setModalVIP({ open: false, clienteId: null, status: false })} title={modalVIP.status ? 'Remover VIP' : 'Marcar VIP'}>
          <div className="space-y-4">
            <label className="text-sm font-semibold text-foreground">Observacao para status VIP:</label>
            <textarea
              className="w-full h-24 rounded border border-border bg-muted px-3 py-2 text-sm"
              value={vipObservacao}
              onChange={(e) => setVipObservacao(e.target.value)}
              placeholder="Justifique o status VIP..."
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" disabled={vipSaving} onClick={() => setModalVIP({ open: false, clienteId: null, status: false })}>
                Cancelar
              </Button>
              <Button
                variant="default"
                disabled={vipSaving}
                onClick={async () => {
                  if (!modalVIP.clienteId) return;

                  setVipSaving(true);
                  setVipLoadingId(modalVIP.clienteId);
                  await supabase
                    .from('clients')
                    .update({ vip: !modalVIP.status, vip_observacao: vipObservacao })
                    .eq('id', modalVIP.clienteId);

                  setClientes((prev) =>
                    prev.map((cli) =>
                      cli.id === modalVIP.clienteId
                        ? { ...cli, vip: !modalVIP.status, vip_observacao: vipObservacao }
                        : cli
                    )
                  );

                  setVipSaving(false);
                  setVipLoadingId(null);
                  setModalVIP({ open: false, clienteId: null, status: false });
                }}
              >
                {vipSaving ? 'Salvando...' : modalVIP.status ? 'Remover VIP' : 'Marcar VIP'}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal open={modalPerfil.open} onClose={() => setModalPerfil({ open: false, cliente: null })} title={modalPerfil.cliente?.nome || 'Perfil do Cliente'}>
          {modalPerfil.cliente && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {modalPerfil.cliente.nome?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-bold text-lg text-foreground">{modalPerfil.cliente.nome}</div>
                  <div className="text-xs text-muted-foreground">{modalPerfil.cliente.email}</div>
                  {modalPerfil.cliente.vip && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-300 text-yellow-900 font-bold text-xs">
                      VIP
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" /> {modalPerfil.cliente.telefone}
                <Mail className="h-4 w-4 ml-2" /> {modalPerfil.cliente.email}
                <MapPin className="h-4 w-4 ml-2" /> {enderecoCompleto(modalPerfil.cliente)}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  Pedidos: <span className="font-bold text-primary">{pedidosPorCliente[modalPerfil.cliente.id] || 0}</span>
                </span>
              </div>
              {modalPerfil.cliente.vip_observacao && (
                <div className="mt-1 text-xs text-muted-foreground">{modalPerfil.cliente.vip_observacao}</div>
              )}
            </div>
          )}
        </Modal>
      </div>
    </ErrorBoundary>
  );
}
