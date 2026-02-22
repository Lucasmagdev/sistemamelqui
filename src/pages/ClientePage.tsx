import {
  Beef,
  BadgeCheck,
  CircleUserRound,
  Clock3,
  ChevronDown,
  Grid2x2,
  List,
  LayoutGrid,
  ListFilter,
  MapPin,
  Menu,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  Star,
  Trash2,
  Truck,
} from 'lucide-react';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const menuCategorias = [
  'Todos os cortes',
  'Ofertas da semana',
  'Kit churrasco',
  'Linha premium',
  'Assinatura',
  'Contato',
];



const precoFormatado = (valor: number | null | undefined) => {
  if (typeof valor !== 'number' || isNaN(valor)) return '$0.00';
  return `$${valor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
};

type ModoVisualizacao = 'grid' | 'compact' | 'list';
type Ordenacao = 'menor-maior' | 'maior-menor';
type TipoCorte = 'Peça inteira' | 'Bife' | 'Cubos' | 'Moído';
type EntregaModo = 'entrega' | 'retirada';
type Pagamento = 'pix' | 'cartao' | 'dinheiro';

interface ItemCarrinho {
  id: string;
  produtoId: string;
  nome: string;
  imagem: string;
  precoKg: number;
  kg: number;
  tipoCorte: TipoCorte;
  observacoes?: string;
}

const categoriaPorIndex = (index: number) => {
  const mapa = ['Ofertas da semana', 'Kit churrasco', 'Linha premium', 'Assinatura'];
  return mapa[index % mapa.length];
};

export default function ClientePage() {
  const { config } = useTenant();
  const navigate = useNavigate();
  const [categoriaAtiva, setCategoriaAtiva] = useState('Todos os cortes');
  const [busca, setBusca] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);
  const [mostrarApenasOfertas, setMostrarApenasOfertas] = useState(false);
  const [showCount, setShowCount] = useState(12);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('menor-maior');
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacao>('grid');
  const [itensCarrinho, setItensCarrinho] = useState<ItemCarrinho[]>([]);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [checkoutAberto, setCheckoutAberto] = useState(false);
  const [etapaCheckout, setEtapaCheckout] = useState(1);
  const [pedidoFinalizado, setPedidoFinalizado] = useState<{ numero: string; total: number } | null>(null);
  const [produtoParaCompra, setProdutoParaCompra] = useState<{
    id: string;
    nome: string;
    imagem: string;
    preco: number;
  } | null>(null);
  const [compraLb, setCompraLb] = useState('1');
  const [compraTipoCorte, setCompraTipoCorte] = useState<TipoCorte>('Peça inteira');
  const [compraObservacoes, setCompraObservacoes] = useState('');

  // Cadastro de cliente
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  // Endereço
  const [enderecoNumero, setEnderecoNumero] = useState('');
  const [enderecoRua, setEnderecoRua] = useState('');
  const [enderecoApt, setEnderecoApt] = useState('');
  const [enderecoCidade, setEnderecoCidade] = useState('');
  const [enderecoEstado, setEnderecoEstado] = useState('');
  const [enderecoZip, setEnderecoZip] = useState('');
  const [modoEntrega, setModoEntrega] = useState<EntregaModo>('entrega');
  const [dataEntrega, setDataEntrega] = useState('');
  const [horarioEntrega, setHorarioEntrega] = useState('');
  const [pagamento, setPagamento] = useState<Pagamento>('pix');
  const [trocoPara, setTrocoPara] = useState('');

  const [produtosCatalogo, setProdutosCatalogo] = useState<any[]>([]);
  useEffect(() => {
    async function fetchProdutos() {
      let query = supabase.from('products').select('*');
      // Só aplica filtro se usuário estiver logado (admin ou cliente)
      const userRole = window.localStorage.getItem('imperial-flow-role');
      let tenantId = config.tenantId;
      if (userRole && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { data, error } = await query;
      if (error) {
        toast.error('Erro ao carregar produtos');
        return;
      }
      // Adiciona campos extras para manter compatibilidade visual
      const produtos = (data || []).map((produto: any) => ({
        id: produto.id,
        nome: produto.nome,
        imagem: produto.foto_url && produto.foto_url !== 'NULL' && produto.foto_url !== '' ? produto.foto_url : '/mock/meats/meat-1.svg',
        preco: produto.preco,
        precoAnterior: produto.precoAnterior || null,
        destaque: produto.destaque || false,
        selo: produto.selo || '',
        categoria: produto.categoria || '',
      }));
      setProdutosCatalogo(produtos);
    }
    fetchProdutos();
  }, [config]);

  const produtosFiltrados = useMemo(() => {
    let resultado = [...produtosCatalogo];

    if (categoriaAtiva !== 'Todos os cortes' && categoriaAtiva !== 'Contato') {
      resultado = resultado.filter((produto) => produto.categoria === categoriaAtiva);
    }

    if (mostrarApenasOfertas) {
      resultado = resultado.filter((produto) => produto.selo === 'OFERTA');
    }

    if (busca.trim()) {
      const termo = busca.toLowerCase();
      resultado = resultado.filter((produto) => produto.nome.toLowerCase().includes(termo));
    }

    resultado.sort((a, b) =>
      ordenacao === 'menor-maior' ? a.preco - b.preco : b.preco - a.preco,
    );

    return resultado.slice(0, showCount);
  }, [busca, categoriaAtiva, mostrarApenasOfertas, ordenacao, produtosCatalogo, showCount]);

  const resumoCarrinho = useMemo(() => {
    const totalItens = itensCarrinho.length;
    const totalLb = itensCarrinho.reduce((acc, item) => acc + item.kg, 0); // kg vira lb
    const totalValor = itensCarrinho.reduce((acc, item) => acc + item.kg * item.precoKg, 0);
    return { totalItens, totalLb, totalValor };
  }, [itensCarrinho]);

  const adicionarAoCarrinho = (
    produtoId: string,
    nome: string,
    precoKg: number,
    imagem: string,
    kg: number,
    tipoCorte: TipoCorte,
    observacoes?: string,
  ) => {

    if (!kg || kg < 0.3) {
      toast.error('Informe ao menos 0.3 LB para adicionar');
      return;
    }

    const novoItem: ItemCarrinho = {
      id: `${produtoId}-${Date.now()}`,
      produtoId,
      nome,
      imagem,
      precoKg,
      kg,
      tipoCorte,
      observacoes,
    };

    setItensCarrinho((estadoAtual) => [...estadoAtual, novoItem]);
    toast.success(`${nome} (${kg.toFixed(1)} LB - ${tipoCorte}) adicionado`);
  };

  const abrirCompra = (produto: { id: string; nome: string; imagem: string; preco: number }) => {
    setProdutoParaCompra(produto);
    setCompraLb('1');
    setCompraTipoCorte('Peça inteira');
    setCompraObservacoes('');
  };

  const confirmarCompra = () => {
    if (!produtoParaCompra) return;
    const kg = Number(compraLb);
    adicionarAoCarrinho(
      produtoParaCompra.id,
      produtoParaCompra.nome,
      produtoParaCompra.preco,
      produtoParaCompra.imagem,
      kg,
      compraTipoCorte,
      compraObservacoes,
    );
    setProdutoParaCompra(null);
  };

  const selecionarCategoria = (categoria: string) => {
    if (categoria === 'Contato') {
      toast.info('Canal de contato em breve');
      return;
    }
    setCategoriaAtiva(categoria);
  };

  const alterarKgItem = (itemId: string, incremento: number) => {
    setItensCarrinho((estadoAtual) =>
      estadoAtual.map((item) =>
        item.id === itemId
          ? { ...item, kg: Math.max(0.3, Number((item.kg + incremento).toFixed(1))) }
          : item,
      ),
    );
  };

  const removerItem = (itemId: string) => {
    setItensCarrinho((estadoAtual) => estadoAtual.filter((item) => item.id !== itemId));
  };

  const validarEtapaAtual = () => {
    if (etapaCheckout === 1) {
      if (!clienteNome.trim() || !clienteTelefone.trim()) {
        toast.error('Preencha nome e telefone para continuar');
        return false;
      }
    }

    if (etapaCheckout === 2) {
      // Validação dos dados de pagamento
      if (pagamento === 'dinheiro' && !trocoPara.trim()) {
        toast.error('Informe o valor para troco');
        return false;
      }
    }

    return true;
  };

  const avancarEtapa = () => {
    if (!validarEtapaAtual()) return;
    setEtapaCheckout((etapaAtual) => {
      if (etapaAtual === 1) return 2;
      return Math.min(3, etapaAtual + 1);
    });
  };

  // Salvar cliente no banco antes de finalizar pedido
  const finalizarPedido = async () => {
    // Salva cliente se não existir (pode ser aprimorado para evitar duplicidade)
    const clientePayload = {
      nome: clienteNome,
      telefone: clienteTelefone,
      email: clienteEmail,
      endereco_numero: enderecoNumero,
      endereco_rua: enderecoRua,
      endereco_complemento: enderecoApt,
      cidade: enderecoCidade,
      estado: enderecoEstado,
      cep: enderecoZip,
      pais: 'USA',
      tenant_id: 1,
    };
    try {
      const { error } = await supabase.from('clients').insert([clientePayload]);
      if (error) {
        toast.error('Erro ao salvar cliente: ' + error.message);
        return;
      }
    } catch (err) {
      toast.error('Erro inesperado ao salvar cliente.');
      return;
    }
    // Finaliza pedido mock (mantém lógica anterior)
    const numero = `PED-${Math.floor(Math.random() * 9000 + 1000)}`;
    setPedidoFinalizado({ numero, total: resumoCarrinho.totalValor });
    setItensCarrinho([]);
    setCheckoutAberto(false);
    setCarrinhoAberto(false);
    setEtapaCheckout(1);
    toast.success(`Pedido ${numero} enviado com sucesso!`);
  };

  return (
    <div className="min-h-screen bg-background p-0 md:p-2 xl:p-3">
      <div className="w-full overflow-hidden border-y border-border bg-card md:rounded-2xl md:border">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/15 px-4 py-2.5 text-xs text-primary md:px-6 md:text-sm">
          <p className="font-medium">Loja online do açougue • Catálogo e carrinho em modo mock</p>
          <div className="hidden items-center gap-4 md:flex">
            <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Entrega no mesmo dia</span>
            <span className="inline-flex items-center gap-1"><Beef className="h-3.5 w-3.5" /> Cortes selecionados</span>
          </div>
        </div>

        <header className="border-b border-border bg-card/95">
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 md:px-6 md:py-4">
            <div className="flex items-center gap-3 text-primary">
              <img
                src={config.logoUrl}
                alt={config.nomeEmpresa}
                className="h-12 w-12 rounded-md border border-border object-cover md:h-14 md:w-14"
              />
              <span className="text-lg font-semibold text-foreground md:text-xl">{config.nomeEmpresa}</span>
            </div>

            <div className="order-3 w-full md:order-none md:mx-6 md:flex-1">
              <div className="flex h-12 items-center rounded-full border border-border bg-background px-4 md:h-14 md:px-5">
                <Search className="mr-2 h-5 w-5 text-muted-foreground" />
                <input
                  className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder="Busca por produtos"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {window.localStorage.getItem('imperial-flow-nome') ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-background">
                    <CircleUserRound className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-foreground text-sm md:text-base">
                      {window.localStorage.getItem('imperial-flow-nome')}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="h-11 gap-2 px-4 text-sm md:h-12 md:text-base"
                    onClick={() => {
                      window.localStorage.removeItem('imperial-flow-nome');
                      window.location.reload();
                    }}
                  >
                    Sair
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="outline" className="h-11 gap-2 px-4 text-sm md:h-12 md:text-base">
                    <Link to="/login">
                      <CircleUserRound className="h-5 w-5" />
                      Login
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-11 gap-2 px-4 text-sm md:h-12 md:text-base">
                    <Link to="/cadastro">
                      <Plus className="h-5 w-5" />
                      Cadastrar-se
                    </Link>
                  </Button>
                </>
              )}
              <button
                type="button"
                onClick={() => setCarrinhoAberto((estadoAtual) => !estadoAtual)}
                className="relative rounded-full border border-border bg-background p-2.5 text-primary md:p-3"
                aria-label="Carrinho mock"
              >
                <ShoppingCart className="h-6 w-6" />
                <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {resumoCarrinho.totalItens}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMenuAberto((estadoAtual) => !estadoAtual)}
                className="rounded-lg border border-border bg-background p-2.5 text-foreground md:p-3"
                aria-label="Menu mock"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>

          {menuAberto ? (
            <div className="border-t border-border bg-background px-4 py-3 md:px-6">
              <div className="flex flex-wrap gap-2">
                {menuCategorias.map((categoria) => (
                  <button
                    key={`menu-${categoria}`}
                    type="button"
                    onClick={() => {
                      selecionarCategoria(categoria);
                      setMenuAberto(false);
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40"
                  >
                    {categoria}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="border-t border-border px-3 py-2 md:px-6">
            <div className="flex flex-wrap gap-1.5">
              {menuCategorias.map((categoria) => (
                <button
                  key={categoria}
                  type="button"
                  onClick={() => selecionarCategoria(categoria)}
                  className={`rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide md:text-sm ${
                    categoria === categoriaAtiva
                      ? 'gold-gradient-bg text-accent-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {categoria}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="space-y-5 px-4 py-4 md:px-6 md:py-5">
          <section className="rounded-xl border border-border bg-background p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Vitrine da Semana</p>
                <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">Cortes especiais para seu churrasco</h1>
                <p className="mt-1 text-sm text-muted-foreground">Navegação funcional em mock local, pronta para plugar API depois.</p>
              </div>
              <Button type="button" onClick={() => setCarrinhoAberto(true)} className="gold-gradient-bg text-accent-foreground font-semibold">
                Ver Carrinho ({precoFormatado(resumoCarrinho.totalValor)})
              </Button>
            </div>
          </section>

          {produtoParaCompra ? (
            <section className="rounded-xl border border-primary/35 bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Comprar: {produtoParaCompra.nome}</p>
                <Button size="sm" variant="outline" onClick={() => setProdutoParaCompra(null)}>Cancelar</Button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div>
                  <label className="text-xs text-muted-foreground">Quantidade (LB)</label>
                  <input
                    type="number"
                    min="0.3"
                    step="0.1"
                    value={compraLb}
                    onChange={(e) => setCompraLb(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Tipo de corte</label>
                  <select
                    value={compraTipoCorte}
                    onChange={(e) => setCompraTipoCorte(e.target.value as TipoCorte)}
                    className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                  >
                    {(['Peça inteira', 'Bife', 'Cubos', 'Moído'] as TipoCorte[]).map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">Observações (opcional)</label>
                  <input
                    value={compraObservacoes}
                    onChange={(e) => setCompraObservacoes(e.target.value)}
                    placeholder="Ex: bife médio, sem gordura"
                    className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Subtotal: <span className="font-semibold text-primary">{precoFormatado((Number(compraLb) || 0) * produtoParaCompra.preco)}</span>
                </p>
                <Button type="button" className="gold-gradient-bg text-accent-foreground" onClick={confirmarCompra}>
                  Adicionar ao Carrinho
                </Button>
              </div>
            </section>
          ) : null}

          {pedidoFinalizado ? (
            <section className="rounded-xl border border-primary/30 bg-primary/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  <BadgeCheck className="h-4 w-4" /> Pedido confirmado: {pedidoFinalizado.numero}
                </p>
                <p className="text-sm font-semibold text-foreground">Total: {precoFormatado(pedidoFinalizado.total)}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Você pode acompanhar o pedido no botão “Acompanhar Pedido”.</p>
            </section>
          ) : null}

          {carrinhoAberto ? (
            <section className="rounded-xl border border-primary/35 bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Carrinho ({resumoCarrinho.totalItens} itens • {resumoCarrinho.totalLb.toFixed(1)}kg)</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCarrinhoAberto(false)}>Fechar</Button>
                  <Button
                    size="sm"
                    className="gold-gradient-bg text-accent-foreground"
                    onClick={() => {
                      if (!itensCarrinho.length) {
                        toast.error('Adicione itens ao carrinho para continuar');
                        return;
                      }
                      setCheckoutAberto(true);
                    }}
                  >
                    Finalizar Pedido
                  </Button>
                </div>
              </div>

              {itensCarrinho.length ? (
                <div className="mt-3 space-y-2">
                  {itensCarrinho.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.nome}</p>
                          <p className="text-xs text-muted-foreground">{item.tipoCorte} • {precoFormatado(item.precoKg)}/LB</p>
                          {item.observacoes ? <p className="text-xs text-muted-foreground">Obs: {item.observacoes}</p> : null}
                        </div>
                        <button type="button" onClick={() => removerItem(item.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => alterarKgItem(item.id, -0.1)} className="rounded border border-border p-1">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-20 text-center text-sm text-foreground">{item.kg.toFixed(1)} LB</span>
                          <button type="button" onClick={() => alterarKgItem(item.id, 0.1)} className="rounded border border-border p-1">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-sm font-semibold text-primary">{precoFormatado(item.kg * item.precoKg)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Seu carrinho está vazio.</p>
              )}

              <p className="mt-3 text-sm text-muted-foreground">Total: <span className="font-semibold text-primary">{precoFormatado(resumoCarrinho.totalValor)}</span></p>
            </section>
          ) : null}

          {checkoutAberto ? (
            <section className="rounded-xl border border-primary/35 bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Checkout • Etapa {etapaCheckout} de 3</p>
                <Button size="sm" variant="outline" onClick={() => setCheckoutAberto(false)}>Fechar</Button>
              </div>

              <div className="mt-3 space-y-4">
                {etapaCheckout === 1 ? (
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold text-foreground mb-2">Identificação</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Nome completo</label>
                        <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" required />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Telefone <span className="text-muted-foreground">(EUA: +1 XXX-XXX-XXXX)</span></label>
                        <input value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" placeholder="+1 555-555-5555" required />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs text-muted-foreground">E-mail</label>
                        <input value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" type="email" required />
                      </div>
                    </div>
                    <h2 className="text-lg font-bold text-foreground mt-6 mb-2">Endereço de entrega</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Street Number + Street Name</label>
                        <div className="flex gap-2">
                          <input value={enderecoNumero} onChange={(e) => setEnderecoNumero(e.target.value)} className="mt-1 h-10 w-24 rounded-md border border-border bg-card px-3 text-sm" placeholder="350" required />
                          <input value={enderecoRua} onChange={(e) => setEnderecoRua(e.target.value)} className="mt-1 h-10 flex-1 rounded-md border border-border bg-card px-3 text-sm" placeholder="5th Ave" required />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Apt / Suite / Unit <span className="text-muted-foreground">(opcional)</span></label>
                        <input value={enderecoApt} onChange={(e) => setEnderecoApt(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" placeholder="Apt 12, Suite 8..." />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">City</label>
                        <input value={enderecoCidade} onChange={(e) => setEnderecoCidade(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" required />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">State (2 letras)</label>
                        <input value={enderecoEstado} onChange={(e) => setEnderecoEstado(e.target.value.toUpperCase().slice(0,2))} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm uppercase" maxLength={2} required />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs text-muted-foreground">ZIP Code</label>
                        <input value={enderecoZip} onChange={(e) => setEnderecoZip(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" placeholder="10118" required />
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Etapa 2 removida completamente */}

                {etapaCheckout === 2 ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['pix', 'Pix'],
                        ['cartao', 'Cartão'],
                        ['dinheiro', 'Dinheiro'],
                      ] as Array<[Pagamento, string]>).map(([valor, label]) => (
                        <button
                          key={valor}
                          type="button"
                          onClick={() => setPagamento(valor)}
                          className={cn('rounded-md px-3 py-2 text-sm', pagamento === valor ? 'gold-gradient-bg text-accent-foreground' : 'border border-border')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {pagamento === 'dinheiro' ? (
                      <div>
                        <label className="text-xs text-muted-foreground">Troco para quanto?</label>
                        <input value={trocoPara} onChange={(e) => setTrocoPara(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" placeholder="Ex: 200,00" />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {etapaCheckout === 3 ? (
                  <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
                    <h2 className="text-lg font-bold text-foreground mb-2">Confirme seu pedido</h2>
                    <p><strong>Cliente:</strong> {clienteNome} • {clienteTelefone}</p>
                    <p><strong>Entrega:</strong> {modoEntrega === 'entrega'
                      ? `Entrega em ${enderecoRua}, ${enderecoNumero}${enderecoApt ? ' - ' + enderecoApt : ''}, ${enderecoCidade}, ${enderecoEstado}, ${enderecoZip}`
                      : 'Retirada na loja'}</p>
                    <p><strong>Agendamento:</strong> {dataEntrega || '-'} às {horarioEntrega || '-'}</p>
                    <p><strong>Pagamento:</strong> {pagamento === 'pix' ? 'Pix' : pagamento === 'cartao' ? 'Cartão' : `Dinheiro (troco para ${trocoPara})`}</p>
                    <p><strong>Total:</strong> <span className="text-primary font-semibold">{precoFormatado(resumoCarrinho.totalValor)}</span></p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setEtapaCheckout((v) => Math.max(1, v - 1))} disabled={etapaCheckout === 1}>
                  Voltar
                </Button>

                {etapaCheckout < 3 ? (
                  <Button type="button" onClick={avancarEtapa} className="gold-gradient-bg text-accent-foreground">
                    Continuar
                  </Button>
                ) : (
                  <Button type="button" onClick={finalizarPedido} className="gold-gradient-bg text-accent-foreground">
                    Confirmar Pedido
                  </Button>
                )}
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 md:px-4">
            <button
              type="button"
              onClick={() => setMostrarApenasOfertas((estadoAtual) => !estadoAtual)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1 text-sm',
                mostrarApenasOfertas ? 'bg-primary/15 text-primary' : 'text-foreground',
              )}
            >
              <ListFilter className="h-4 w-4 text-primary" />
              {mostrarApenasOfertas ? 'Somente ofertas' : 'Filtros'}
            </button>
            <div className="text-sm text-muted-foreground">
              Show:{' '}
              {[9, 12, 18, 24].map((valor) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setShowCount(valor)}
                  className={cn('mx-1', showCount === valor ? 'font-semibold text-foreground' : 'hover:text-foreground')}
                >
                  {valor}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <button type="button" onClick={() => setModoVisualizacao('grid')} className={cn(modoVisualizacao === 'grid' ? 'text-primary' : 'hover:text-foreground')}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setModoVisualizacao('compact')} className={cn(modoVisualizacao === 'compact' ? 'text-primary' : 'hover:text-foreground')}>
                <Grid2x2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setModoVisualizacao('list')} className={cn(modoVisualizacao === 'list' ? 'text-primary' : 'hover:text-foreground')}>
                <List className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOrdenacao((ordemAtual) => (ordemAtual === 'menor-maior' ? 'maior-menor' : 'menor-maior'))}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Ordenar por preço: <span className="text-foreground">{ordenacao === 'menor-maior' ? 'menor para maior' : 'maior para menor'}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className={cn(
            modoVisualizacao === 'list'
              ? 'grid grid-cols-1 gap-3'
              : modoVisualizacao === 'compact'
                ? 'grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
          )}>
            {produtosFiltrados.map((produto) => (
              <article key={produto.id} className="overflow-hidden rounded-xl border border-border bg-card card-elevated">
                <div className={cn(
                  'relative bg-[linear-gradient(160deg,hsl(var(--muted))_0%,hsl(var(--background))_65%,hsl(var(--muted))_100%)]',
                  modoVisualizacao === 'compact' ? 'h-36' : 'h-52',
                )}>
                  <img
                    src={produto.imagem}
                    alt={produto.nome}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = '/mock/meats/meat-1.svg';
                    }}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--background)/0.56),transparent_45%)]" />
                  <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
                    {produto.selo}
                  </span>
                </div>
                <div className="space-y-3 p-4">
                  <h3 className="line-clamp-2 text-lg font-semibold text-foreground">{produto.nome}</h3>
                  {produto.destaque ? (
                    <div className="flex items-center gap-1 text-primary">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star key={idx} className="h-3.5 w-3.5 fill-current" />
                      ))}
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs text-muted-foreground line-through">de {precoFormatado(produto.precoAnterior)}</p>
                    <p className="text-3xl font-bold text-primary">{precoFormatado(produto.preco)}</p>
                    <p className="text-xs text-muted-foreground">preço por LB</p>
                  </div>

                  <Button
                    type="button"
                    onClick={() => abrirCompra({ id: produto.id, nome: produto.nome, imagem: produto.imagem, preco: produto.preco })}
                    className="w-full gold-gradient-bg text-accent-foreground"
                  >
                    Comprar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </main>

        <footer className="border-t border-border bg-muted/70 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setCarrinhoAberto(true)} className="rounded-lg gold-gradient-bg px-4 py-2.5 text-sm font-bold text-accent-foreground">
              VER CARRINHO ({precoFormatado(resumoCarrinho.totalValor)})
            </button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <button type="button" onClick={() => toast.info(pedidoFinalizado ? `Pedido ${pedidoFinalizado.numero} em preparação` : 'Você ainda não finalizou nenhum pedido')}>Acompanhar Pedido</button>
              <button type="button" onClick={() => navigate('/login')} className="text-primary">Fazer Login</button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}