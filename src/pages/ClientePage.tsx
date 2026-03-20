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
  LogOut,
  House,
  LogIn,
} from 'lucide-react';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { backendRequest } from '@/lib/backendClient';
import {
  extractPhoneDigits,
  formatPhoneForDisplay,
  isValidPhone,
  normalizePhoneInput,
} from '@/lib/phone';

type CategoryKey = 'all' | 'offers' | 'bbq' | 'premium' | 'subscription' | 'contact';
const menuCategorias: CategoryKey[] = ['all', 'offers', 'bbq', 'premium', 'subscription', 'contact'];
const categoryDbValueByKey: Record<Exclude<CategoryKey, 'all' | 'contact'>, string> = {
  offers: 'Ofertas da semana',
  bbq: 'Kit churrasco',
  premium: 'Linha premium',
  subscription: 'Assinatura',
};



const precoFormatado = (valor: number | null | undefined) => {
  if (typeof valor !== 'number' || isNaN(valor)) return '$0.00';
  return `$${valor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
};

const PHONE_DEFAULT_COUNTRY = '55';
const toNormalizedPhone = (value: string) => {
  const digits = extractPhoneDigits(value);
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) return `+${PHONE_DEFAULT_COUNTRY}${digits}`;
  return `+${digits}`;
};

type ModoVisualizacao = 'grid' | 'compact' | 'list';
type Ordenacao = 'menor-maior' | 'maior-menor';
type TipoCorte = 'piece' | 'steak' | 'cubes' | 'ground' | 'other';
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

export default function ClientePage() {
  // ...existing code...
  // FunÃ§Ã£o para repetir Ãºltimo pedido
  const repetirUltimoPedido = async () => {
    if (!perfilCliente?.id && !emailLogado) {
      toast.error(ui.repeatOrderMissingLogin);
      return;
    }

    // Busca ultimo pedido priorizando cliente_id e usa email como fallback.
    let pedidosQuery = supabase
      .from('orders')
      .select('id')
      .order('data_pedido', { ascending: false })
      .limit(1);

    if (perfilCliente?.id) {
      pedidosQuery = pedidosQuery.eq('cliente_id', perfilCliente.id);
    } else {
      pedidosQuery = pedidosQuery.eq('email_cliente', emailLogado);
    }

    const { data: pedidos } = await pedidosQuery;
    if (!pedidos || !pedidos.length) {
      toast.error(ui.noOrdersFound);
      return;
    }
    const pedidoId = pedidos[0].id;
    // Buscar itens do pedido
    const { data: itens } = await supabase
      .from('order_items')
      .select('produto_id, quantidade, preco_unitario, products(nome, nome_en, foto_url)')
      .eq('pedido_id', pedidoId);
    if (!itens || !itens.length) {
      toast.error(ui.noOrderItemsFound);
      return;
    }
    setItensCarrinho(
      itens.map((item: any) => {
        const nomeProduto = isEn
          ? (item.products?.nome_en || item.products?.nome || 'Produto')
          : (item.products?.nome || item.products?.nome_en || 'Produto');

        return {
          id: `${item.produto_id}-${Date.now()}`,
          produtoId: item.produto_id,
          nome: nomeProduto,
          imagem: item.products?.foto_url || '',
          precoKg: item.preco_unitario,
          kg: item.quantidade,
          tipoCorte: 'piece',
          observacoes: '',
        };
      }),
    );
    toast.success(ui.cartFilledWithLastOrder);
    setCarrinhoAberto(true);
  };
  const { config } = useTenant();
  const { locale } = useI18n();
  const isEn = locale === 'en';
  const tr = (pt: string, en: string) => (isEn ? en : pt);
  const ui = {
    shopTitle: isEn ? 'Butcher Shop Online' : 'Loja online do acougue',
    sameDay: isEn ? 'Same-day delivery' : 'Entrega no mesmo dia',
    selectedCuts: isEn ? 'Selected cuts' : 'Cortes selecionados',
    searchPlaceholder: isEn ? 'Search products' : 'Busca por produtos',
    cart: isEn ? 'Cart' : 'Carrinho',
    repeatOrder: isEn ? 'Repeat last order' : 'Repetir ultimo pedido',
    showcase: isEn ? 'Weekly Showcase' : 'Vitrine da Semana',
    heroTitle: isEn ? 'Special cuts for your barbecue' : 'Cortes especiais para seu churrasco',
    viewCart: isEn ? 'View Cart' : 'Ver Carrinho',
    finishOrder: isEn ? 'Finish Order' : 'Finalizar Pedido',
    emptyCart: isEn ? 'Your cart is empty.' : 'Seu carrinho esta vazio.',
    loadMore: isEn ? 'Load more products' : 'Carregar mais produtos',
    doLogin: isEn ? 'Log in' : 'Fazer Login',
    home: isEn ? 'Home' : 'Inicio',
    signUp: isEn ? 'Sign up' : 'Cadastrar-se',
    openProfile: isEn ? 'Open profile' : 'Abrir perfil',
    repeatOrderMissingLogin: isEn ? 'Log in to repeat your order' : 'Faca login para repetir pedido',
    noOrdersFound: isEn ? 'No orders found' : 'Nenhum pedido encontrado',
    noOrderItemsFound: isEn ? 'No order items found' : 'Nenhum item encontrado',
    cartFilledWithLastOrder: isEn ? 'Cart filled with your last order!' : 'Carrinho preenchido com ultimo pedido!',
    clientDataFetchError: isEn ? 'Error loading customer data' : 'Erro ao buscar dados do cliente',
    productsLoadError: isEn ? 'Error loading products' : 'Erro ao carregar produtos',
    minWeightError: isEn ? 'Enter at least 0.3 LB to add' : 'Informe ao menos 0.3 LB para adicionar',
    contactSoon: isEn ? 'Contact channel coming soon' : 'Canal de contato em breve',
    fillNamePhone: isEn ? 'Fill in name and phone to continue' : 'Preencha nome e telefone para continuar',
    invalidPhone: isEn ? 'Enter a valid phone number (10 to 15 digits)' : 'Informe um telefone valido (10 a 15 digitos)',
    fillChangeAmount: isEn ? 'Enter change amount' : 'Informe o valor para troco',
    saveProfileError: isEn ? 'Error saving profile: ' : 'Erro ao salvar perfil: ',
    saveClientError: isEn ? 'Error saving customer: ' : 'Erro ao salvar cliente: ',
    unexpectedClientError: isEn ? 'Unexpected error while saving customer.' : 'Erro inesperado ao buscar/salvar cliente.',
    saveOrderError: isEn ? 'Error saving order: ' : 'Erro ao salvar pedido: ',
    unexpectedOrderError: isEn ? 'Unexpected error while saving order.' : 'Erro inesperado ao salvar pedido.',
    saveOrderItemsError: isEn ? 'Error saving order items: ' : 'Erro ao salvar itens do pedido: ',
    unexpectedOrderItemsError: isEn ? 'Unexpected error while saving order items.' : 'Erro inesperado ao salvar itens do pedido.',
    orderSuccess: isEn ? 'Order finalized successfully!' : 'Pedido finalizado com sucesso!',
    addCartToContinue: isEn ? 'Add items to cart to continue' : 'Adicione itens ao carrinho para continuar',
    followOrder: isEn ? 'Track Order' : 'Acompanhar Pedido',
    noFinishedOrders: isEn ? 'You have not completed any order yet' : 'Voce ainda nao finalizou nenhum pedido',
    addToCart: isEn ? 'Add to Cart' : 'Adicionar ao Carrinho',
    close: isEn ? 'Close' : 'Fechar',
    cartItems: isEn ? 'items' : 'itens',
    notes: isEn ? 'Notes' : 'Obs',
    total: isEn ? 'Total' : 'Total',
    checkout: isEn ? 'Checkout' : 'Checkout',
    step: isEn ? 'Step' : 'Etapa',
    of: isEn ? 'of' : 'de',
    profileAutoFill: isEn
      ? 'The fields below were automatically filled based on your profile.'
      : 'Os campos abaixo foram preenchidos automaticamente de acordo com seu perfil.',
    identification: isEn ? 'Identification' : 'Identificacao',
    fullName: isEn ? 'Full name' : 'Nome completo',
    phone: isEn ? 'Phone' : 'Telefone',
    phoneHint: isEn ? '(US: +1 XXX-XXX-XXXX)' : '(EUA: +1 XXX-XXX-XXXX)',
    email: isEn ? 'Email' : 'E-mail',
    deliveryAddress: isEn ? 'Delivery Address' : 'Endereco de entrega',
    state2Letters: isEn ? 'State (2 letters)' : 'Estado (2 letras)',
    streetNumberName: isEn ? 'Street Number + Street Name' : 'Numero e Rua',
    aptSuiteUnit: isEn ? 'Apt / Suite / Unit' : 'Apto / Complemento',
    optional: isEn ? '(optional)' : '(opcional)',
    city: isEn ? 'City' : 'Cidade',
    zipCode: isEn ? 'ZIP Code' : 'CEP',
    card: isEn ? 'Card' : 'Cartao',
    cash: isEn ? 'Cash' : 'Dinheiro',
    changeFor: isEn ? 'Change for how much?' : 'Troco para quanto?',
    confirmOrder: isEn ? 'Confirm your order' : 'Confirme seu pedido',
    customer: isEn ? 'Customer' : 'Cliente',
    delivery: isEn ? 'Delivery' : 'Entrega',
    schedule: isEn ? 'Schedule' : 'Agendamento',
    deliveryAt: isEn ? 'Delivery at' : 'Entrega em',
    storePickup: isEn ? 'Store pickup' : 'Retirada na loja',
    payment: isEn ? 'Payment' : 'Pagamento',
    back: isEn ? 'Back' : 'Voltar',
    continue: isEn ? 'Continue' : 'Continuar',
    onlyOffers: isEn ? 'Only offers' : 'Somente ofertas',
    filters: isEn ? 'Filters' : 'Filtros',
    lowerPrice: isEn ? 'Lower price' : 'Menor preco',
    higherPrice: isEn ? 'Higher price' : 'Maior preco',
    orderByPrice: isEn ? 'Sort by price' : 'Ordenar por preco',
    lowToHigh: isEn ? 'low to high' : 'menor para maior',
    highToLow: isEn ? 'high to low' : 'maior para menor',
    pricePerLb: isEn ? 'price per LB' : 'preco por LB',
    orderConfirmed: isEn ? 'Order confirmed' : 'Pedido confirmado',
    trackOrderHint: isEn ? 'You can track the order with the "Track Order" button.' : 'Voce pode acompanhar o pedido no botao "Acompanhar Pedido".',
    buy: isEn ? 'Buy' : 'Comprar',
    cancel: isEn ? 'Cancel' : 'Cancelar',
    quantityLb: isEn ? 'Quantity (LB)' : 'Quantidade (LB)',
    cutType: isEn ? 'Cut type' : 'Tipo de corte',
    otherSpecify: isEn ? 'Other (specify)' : 'Outro (especificar)',
    describeCutType: isEn ? 'Describe cut type' : 'Descreva o tipo de corte',
    optionalNotes: isEn ? 'Notes (optional)' : 'Observacoes (opcional)',
    notesExample: isEn ? 'Ex: medium steak, no fat' : 'Ex: bife medio, sem gordura',
    subtotal: isEn ? 'Subtotal' : 'Subtotal',
    buyLabel: isEn ? 'Buy:' : 'Comprar:',
    menu: isEn ? 'Menu' : 'Menu',
  };
  const categoryLabel = (category: CategoryKey) =>
    ({
      all: tr('Todos os cortes', 'All cuts'),
      offers: tr('Ofertas da semana', 'Weekly offers'),
      bbq: tr('Kit churrasco', 'BBQ kit'),
      premium: tr('Linha premium', 'Premium line'),
      subscription: tr('Assinatura', 'Subscription'),
      contact: tr('Contato', 'Contact'),
    })[category];
  const cutTypeLabel = (type: TipoCorte) =>
    ({
      piece: tr('Peca inteira', 'Whole piece'),
      steak: tr('Bife', 'Steak'),
      cubes: tr('Cubos', 'Cubes'),
      ground: tr('Moido', 'Ground'),
      other: tr('Outro', 'Other'),
    })[type];
  const navigate = useNavigate();
  const [usuarioLogado, setUsuarioLogado] = useState(false);
  const [emailLogado, setEmailLogado] = useState('');
  const [nomeLogado, setNomeLogado] = useState('');
  const [perfilCliente, setPerfilCliente] = useState<any | null>(null);
  const [categoriaAtiva, setCategoriaAtiva] = useState<CategoryKey>('all');
  const [busca, setBusca] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);
  const [mostrarApenasOfertas, setMostrarApenasOfertas] = useState(false);
  const [showCount, setShowCount] = useState(12);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('menor-maior');
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacao>('grid');
  const [itensCarrinho, setItensCarrinho] = useState<ItemCarrinho[]>([]);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [checkoutAberto, setCheckoutAberto] = useState(false);
  // Preencher dados do usuario logado ao abrir checkout.
  useEffect(() => {
    if (!checkoutAberto) return;

    const loadCheckoutClient = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;

      const email = (user.email || '').trim().toLowerCase();

      let { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('auth_user_id', user.id)
        .limit(1);

      if ((!clients || !clients.length) && email) {
        const byEmail = await supabase
          .from('clients')
          .select('*')
          .eq('email', email)
          .limit(1);
        clients = byEmail.data;
        clientError = byEmail.error;
      }

      if (clientError) {
        toast.error(ui.clientDataFetchError);
        return;
      }

      if (clients && clients.length > 0) {
        const client = clients[0];
        setClienteNome(client.nome || '');
        setClienteTelefone(client.telefone || '');
        setClienteEmail(client.email || '');
        setEnderecoNumero(client.endereco_numero || '');
        setEnderecoRua(client.endereco_rua || '');
        setEnderecoApt(client.endereco_complemento || '');
        setEnderecoCidade(client.cidade || '');
        setEnderecoEstado(client.estado || '');
        setEnderecoZip(client.cep || '');
      }
    };

    loadCheckoutClient();
  }, [checkoutAberto]);
  const [etapaCheckout, setEtapaCheckout] = useState(1);
  const [pedidoFinalizado, setPedidoFinalizado] = useState<{ numero: string; total: number } | null>(null);
  const [produtoParaCompra, setProdutoParaCompra] = useState<{
    id: string;
    nome: string;
    imagem: string;
    preco: number;
  } | null>(null);
  const [compraLb, setCompraLb] = useState('1');
  const [compraTipoCorte, setCompraTipoCorte] = useState<TipoCorte>('piece');
  const [compraOutroTipoCorte, setCompraOutroTipoCorte] = useState('');
  const [compraObservacoes, setCompraObservacoes] = useState('');

  // Cadastro de cliente
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  // EndereÃ§o
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

  useEffect(() => {
    const carregarUsuario = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user) {
        setUsuarioLogado(false);
        setEmailLogado('');
        setNomeLogado('');
        setPerfilCliente(null);
        return;
      }

      const email = (user.email || '').trim().toLowerCase();
      setUsuarioLogado(true);
      setEmailLogado(email);

      let { data: cliente } = await supabase
        .from('clients')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (!cliente && email) {
        const byEmail = await supabase
          .from('clients')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        cliente = byEmail.data || null;
      }

      setPerfilCliente(cliente || null);
      setNomeLogado(cliente?.nome || user.user_metadata?.nome || user.email || 'Usuario');

      await supabase
        .from('clients')
        .update({ last_user_agent: navigator.userAgent, preferred_locale: locale })
        .eq('auth_user_id', user.id);
    };

    carregarUsuario();
  }, []);

  const [produtosCatalogo, setProdutosCatalogo] = useState<any[]>([]);
  useEffect(() => {
    async function fetchProdutos() {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or('tenant_id.eq.1,tenant_id.is.null');
      if (error) {
        toast.error(ui.productsLoadError);
        return;
      }
      // Adiciona campos extras para manter compatibilidade visual
      const produtos = (data || []).map((produto: any) => {
        const nomeLocalizado = isEn
          ? (produto.nome_en || produto.nome || '')
          : (produto.nome || produto.nome_en || '');
        const descricaoLocalizada = isEn
          ? (produto.descricao_en || produto.descricao || '')
          : (produto.descricao || produto.descricao_en || '');

        return {
          id: produto.id,
          nome: nomeLocalizado,
          descricao: descricaoLocalizada,
          imagem: produto.foto_url && produto.foto_url !== 'NULL' && produto.foto_url !== '' ? produto.foto_url : null,
          preco: produto.preco,
          precoAnterior: produto.precoAnterior || null,
          destaque: produto.destaque || false,
          selo: produto.selo || '',
          categoria: produto.categoria || '',
        };
      });
      setProdutosCatalogo(produtos);
    }
    fetchProdutos();
  }, [config, isEn]);

  const produtosFiltrados = useMemo(() => {
    let resultado = [...produtosCatalogo];

    if (categoriaAtiva !== 'all' && categoriaAtiva !== 'contact') {
      const dbCategory = categoryDbValueByKey[categoriaAtiva];
      resultado = resultado.filter((produto) => produto.categoria === dbCategory);
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
      toast.error(ui.minWeightError);
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
    toast.success(`${nome} (${kg.toFixed(1)} LB - ${cutTypeLabel(tipoCorte)}) ${ui.addToCart.toLowerCase()}`);
  };

  const abrirCompra = (produto: { id: string; nome: string; imagem: string; preco: number }) => {
    setProdutoParaCompra(produto);
    setCompraLb('1');
    setCompraTipoCorte('piece');
    setCompraObservacoes('');
    setTimeout(() => {
      if (window.innerWidth < 768) {
        const form = document.getElementById('form-compra-produto');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
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

  const selecionarCategoria = (categoria: CategoryKey) => {
    if (categoria === 'contact') {
      toast.info(ui.contactSoon);
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
        toast.error(ui.fillNamePhone);
        return false;
      }

      if (!isValidPhone(clienteTelefone)) {
        toast.error(ui.invalidPhone);
        return false;
      }
    }

    if (etapaCheckout === 2) {
      // ValidaÃ§Ã£o dos dados de pagamento
      if (pagamento === 'dinheiro' && !trocoPara.trim()) {
        toast.error(ui.fillChangeAmount);
        return false;
      }
    }

    return true;
  };

  const avancarEtapa = () => {
    if (!validarEtapaAtual()) return;
    // Salva alteraÃ§Ãµes de perfil no banco ao avanÃ§ar do perfil
    if (etapaCheckout === 1) {
      const email = clienteEmail.trim().toLowerCase();
      const telefone = toNormalizedPhone(clienteTelefone);
      (async () => {
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData?.user?.id || null;

        let query = supabase.from('clients').update({
          nome: clienteNome,
          telefone,
          endereco_numero: enderecoNumero,
          endereco_rua: enderecoRua,
          endereco_complemento: enderecoApt,
          cidade: enderecoCidade,
          estado: enderecoEstado,
          cep: enderecoZip,
          last_user_agent: navigator.userAgent,
          preferred_locale: locale,
          email: email || null,
        });

        if (authUserId) {
          query = query.eq('auth_user_id', authUserId);
        } else {
          query = query.eq('telefone', telefone);
        }

        const { error } = await query;
        if (error) toast.error(ui.saveProfileError + error.message);
      })();
    }
    setEtapaCheckout((etapaAtual) => {
      if (etapaAtual === 1) return 2;
      return Math.min(3, etapaAtual + 1);
    });
  };

  // Salvar cliente no banco antes de finalizar pedido
  const finalizarPedido = async () => {
    const telefoneNormalizado = toNormalizedPhone(clienteTelefone);
    const emailNormalizado = clienteEmail.trim().toLowerCase();

    if (!isValidPhone(clienteTelefone)) {
      toast.error(ui.invalidPhone);
      return;
    }

    try {
      const { data: authData } = await supabase.auth.getUser();
      const payload = await backendRequest<{
        ok: boolean;
        order: { id: number; code: string; total: number; status: number };
        notification?: { queued?: boolean; reason?: string };
      }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          authUserId: authData?.user?.id || null,
          clientName: clienteNome,
          clientPhone: telefoneNormalizado,
          clientEmail: emailNormalizado || null,
          enderecoNumero,
          enderecoRua,
          enderecoApt,
          enderecoCidade,
          enderecoEstado,
          enderecoZip,
          pais: 'USA',
          locale,
          tenantId: 1,
          lastUserAgent: navigator.userAgent,
          deliveryMode: modoEntrega,
          deliveryDate: dataEntrega || null,
          deliveryTime: horarioEntrega || null,
          paymentMethod: pagamento,
          changeFor: pagamento === 'dinheiro' ? trocoPara : null,
          items: itensCarrinho.map((item) => ({
            produtoId: item.produtoId,
            nome: item.nome,
            kg: item.kg,
            precoKg: item.precoKg,
            tipoCorte: item.tipoCorte,
            observacoes: item.observacoes || '',
            unidade: 'LB',
          })),
        }),
      });

      setPedidoFinalizado({ numero: String(payload.order.id), total: payload.order.total });
      setItensCarrinho([]);
      setCheckoutAberto(false);
      setCarrinhoAberto(false);
      setEtapaCheckout(1);
      toast.success(`Pedido ${payload.order.id} ${ui.orderSuccess}`);

      if (payload.notification?.queued) {
        toast.success('Loja notificada automaticamente no WhatsApp.');
      } else if (payload.notification?.reason) {
        toast.info(`Pedido criado, mas o WhatsApp da loja nao foi confirmado (${payload.notification.reason}).`);
      }
    } catch (err: any) {
      toast.error(err?.message || ui.unexpectedOrderError);
      return;
    }
  };

  return (
    <div className="min-h-screen bg-background p-0 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:p-2 md:pb-2 xl:p-3">
      <div className="w-full overflow-hidden border-y border-border bg-card md:rounded-2xl md:border">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/15 px-4 py-2.5 text-xs text-primary md:px-6 md:text-sm">
          <p className="font-medium">{ui.shopTitle}</p>
          <div className="hidden items-center gap-4 md:flex">
            <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> {ui.sameDay}</span>
            <span className="inline-flex items-center gap-1"><Beef className="h-3.5 w-3.5" /> {ui.selectedCuts}</span>
          </div>
        </div>

        <header className="border-b border-border bg-card/95">
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 md:px-6 md:py-4">
            <div className="flex w-full items-center justify-between text-primary md:w-auto">
              <div className="flex items-center gap-3">
                <img
                  src={config.logoUrl}
                  alt={config.nomeEmpresa}
                  className="h-12 w-12 rounded-md border border-border object-cover md:h-14 md:w-14"
                />
                <span className="text-lg font-semibold text-foreground md:text-xl">{config.nomeEmpresa}</span>
              </div>
              <div className="flex items-center gap-2 md:hidden">
                <button
                  type="button"
                  onClick={() => setCarrinhoAberto((estadoAtual) => !estadoAtual)}
                  className="relative rounded-full border border-border bg-background p-2.5 text-primary"
                  aria-label={ui.cart}
                >
                  <ShoppingCart className="h-6 w-6" />
                  <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {resumoCarrinho.totalItens}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMenuAberto((estadoAtual) => !estadoAtual)}
                  className="rounded-lg border border-border bg-background p-2.5 text-foreground"
                  aria-label={ui.menu}
                >
                  <Menu className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="order-3 w-full md:order-none md:mx-6 md:flex-1">
              <div className="flex h-12 items-center rounded-full border border-border bg-background px-4 md:h-14 md:px-5">
                <Search className="mr-2 h-5 w-5 text-muted-foreground" />
                <input
                  className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder={ui.searchPlaceholder}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>

            <div className="ml-auto flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
              {usuarioLogado ? (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" aria-label={ui.openProfile} className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary md:w-auto">
                        <CircleUserRound className="h-5 w-5 text-primary" />
                        <span className="font-semibold text-foreground text-sm md:text-base">
                          {nomeLogado}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-56 p-3">
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                          <CircleUserRound className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">{nomeLogado}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await supabase.auth.signOut();
                            setUsuarioLogado(false);
                            setEmailLogado('');
                            setNomeLogado('');
                            setPerfilCliente(null);
                            navigate('/login');
                          }}
                          className="gap-2 w-full"
                        >
                          <LogOut className="h-4 w-4" />
                          {isEn ? 'Sign out' : 'Sair'}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              ) : (
                <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:items-center">
                  <Button asChild variant="outline" className="h-11 w-full gap-2 px-4 text-sm md:h-12 md:w-auto md:text-base">
                    <Link to="/login">
                      <CircleUserRound className="h-5 w-5" />
                      {ui.doLogin}
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-11 w-full gap-2 px-4 text-sm md:h-12 md:w-auto md:text-base">
                    <Link to="/cadastro">
                      <Plus className="h-5 w-5" />
                      {ui.signUp}
                    </Link>
                  </Button>
                </div>
              )}
              <div className="hidden items-center justify-end gap-2 md:flex">
                <button
                  type="button"
                  onClick={() => setCarrinhoAberto((estadoAtual) => !estadoAtual)}
                  className="relative rounded-full border border-border bg-background p-2.5 text-primary md:p-3"
                  aria-label={ui.cart}
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
                  aria-label={ui.menu}
                >
                  <Menu className="h-6 w-6" />
                </button>
              </div>
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
                    {categoryLabel(categoria)}
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
                  {categoryLabel(categoria)}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="space-y-5 px-4 py-4 md:px-6 md:py-5">
          <section className="rounded-xl border border-border bg-background p-4 md:p-5">
            {usuarioLogado && (
              <div className="mb-4 flex justify-end">
                <Button onClick={repetirUltimoPedido} className="gold-gradient-bg text-accent-foreground font-semibold">{ui.repeatOrder}</Button>
              </div>
            )}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{ui.showcase}</p>
                <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">{ui.heroTitle}</h1>
                
              </div>
              <Button type="button" onClick={() => setCarrinhoAberto(true)} className="w-full gold-gradient-bg text-accent-foreground font-semibold md:w-auto">
                {ui.viewCart} ({precoFormatado(resumoCarrinho.totalValor)})
              </Button>
            </div>
          </section>

          {produtoParaCompra ? (
            <section id="form-compra-produto" className="rounded-xl border border-primary/35 bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{ui.buyLabel} {produtoParaCompra.nome}</p>
                <Button size="sm" variant="outline" onClick={() => setProdutoParaCompra(null)}>{ui.cancel}</Button>
              </div>

              <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
                <div className="min-w-0">
                  <label className="text-xs text-muted-foreground">{ui.quantityLb}</label>
                  <input
                    type="number"
                    min="0.3"
                    step="0.1"
                    value={compraLb}
                    onChange={(e) => setCompraLb(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                  />
                </div>

                <div className="min-w-0">
                  <label className="text-xs text-muted-foreground">{ui.cutType}</label>
                  <select
                    value={compraTipoCorte}
                    onChange={(e) => {
                      setCompraTipoCorte(e.target.value as TipoCorte);
                      if (e.target.value !== 'other') setCompraOutroTipoCorte('');
                    }}
                    className="mt-1 h-10 w-full min-w-0 rounded-md border border-border bg-card px-3 text-sm"
                  >
                    {(['piece', 'steak', 'cubes', 'ground', 'other'] as TipoCorte[]).map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo === 'other' ? ui.otherSpecify : cutTypeLabel(tipo)}</option>
                    ))}
                  </select>
                  {compraTipoCorte === 'other' && (
                    <input
                      type="text"
                      value={compraOutroTipoCorte}
                      onChange={e => setCompraOutroTipoCorte(e.target.value)}
                      placeholder={ui.describeCutType}
                      className="mt-2 h-10 w-full min-w-0 rounded-md border border-border bg-card px-3 text-sm"
                      style={{maxWidth: '100%'}}
                    />
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">{ui.optionalNotes}</label>
                  <input
                    value={compraObservacoes}
                    onChange={(e) => setCompraObservacoes(e.target.value)}
                    placeholder={ui.notesExample}
                    className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {ui.subtotal}: <span className="font-semibold text-primary">{precoFormatado((Number(compraLb) || 0) * produtoParaCompra.preco)}</span>
                </p>
                <Button type="button" className="gold-gradient-bg text-accent-foreground" onClick={confirmarCompra}>
                  {ui.addToCart}
                </Button>
              </div>
            </section>
          ) : null}

          {pedidoFinalizado ? (
            <section className="rounded-xl border border-primary/30 bg-primary/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  <BadgeCheck className="h-4 w-4" /> {ui.orderConfirmed}: {pedidoFinalizado.numero}
                </p>
                <p className="text-sm font-semibold text-foreground">{ui.total}: {precoFormatado(pedidoFinalizado.total)}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{ui.trackOrderHint}</p>
            </section>
          ) : null}

          {carrinhoAberto ? (
            <section className="rounded-xl border border-primary/35 bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{ui.cart} ({resumoCarrinho.totalItens} {ui.cartItems} • {resumoCarrinho.totalLb.toFixed(1)}kg)</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCarrinhoAberto(false)}>{ui.close}</Button>
                  <Button
                    size="sm"
                    className="gold-gradient-bg text-accent-foreground"
                    onClick={() => {
                      if (!itensCarrinho.length) {
                        toast.error(ui.addCartToContinue);
                        return;
                      }
                      setCheckoutAberto(true);
                    }}
                  >
                    {ui.finishOrder}
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
                          <p className="text-xs text-muted-foreground">{cutTypeLabel(item.tipoCorte)} • {precoFormatado(item.precoKg)}/LB</p>
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
                <p className="mt-2 text-sm text-muted-foreground">{ui.emptyCart}</p>
              )}

              <p className="mt-3 text-sm text-muted-foreground">{ui.total}: <span className="font-semibold text-primary">{precoFormatado(resumoCarrinho.totalValor)}</span></p>
            </section>
          ) : null}

          {checkoutAberto ? (
            <section className="rounded-xl border border-primary/35 bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{ui.checkout} • {ui.step} {etapaCheckout} {ui.of} 3</p>
                <Button size="sm" variant="outline" onClick={() => setCheckoutAberto(false)}>{ui.close}</Button>
              </div>

              <div className="mt-3 space-y-4">
                {etapaCheckout === 1 ? (
                  <div className="space-y-4">
                                        <div className="mb-2 flex items-center gap-2 text-xs text-primary">
                                          <BadgeCheck className="h-4 w-4" />
                                          {ui.profileAutoFill}
                                        </div>
                    <h2 className="text-lg font-bold text-foreground mb-2">{ui.identification}</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs text-muted-foreground">{ui.fullName}</label>
                        <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" required />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{ui.phone} <span className="text-muted-foreground">{ui.phoneHint}</span></label>
                        <input
                          value={clienteTelefone}
                          onChange={(e) => setClienteTelefone(normalizePhoneInput(e.target.value))}
                          onBlur={(e) => setClienteTelefone(formatPhoneForDisplay(e.target.value))}
                          className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                          placeholder="+1 555-555-5555"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                        />
                      </div>
                      {usuarioLogado ? (
                        <div className="md:col-span-2">
                          <label className="text-xs text-muted-foreground">{ui.email} <span className="text-muted-foreground">{ui.optional}</span></label>
                          <input
                            value={clienteEmail}
                            onChange={(e) => setClienteEmail(e.target.value)}
                            className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                            type="email"
                          />
                        </div>
                      ) : null}
                    </div>
                    <h2 className="text-lg font-bold text-foreground mt-6 mb-2">{ui.deliveryAddress}</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs text-muted-foreground">{ui.streetNumberName}</label>
                        <div className="flex gap-2">
                          <input value={enderecoNumero} onChange={(e) => setEnderecoNumero(e.target.value)} className="mt-1 h-10 w-24 rounded-md border border-border bg-card px-3 text-sm" placeholder="350" required />
                          <input value={enderecoRua} onChange={(e) => setEnderecoRua(e.target.value)} className="mt-1 h-10 flex-1 rounded-md border border-border bg-card px-3 text-sm" placeholder="5th Ave" required />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{ui.aptSuiteUnit} <span className="text-muted-foreground">{ui.optional}</span></label>
                        <input value={enderecoApt} onChange={(e) => setEnderecoApt(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" placeholder="Apt 12, Suite 8..." />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{ui.city}</label>
                        <input value={enderecoCidade} onChange={(e) => setEnderecoCidade(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" required />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{ui.state2Letters}</label>
                        <input value={enderecoEstado} onChange={(e) => setEnderecoEstado(e.target.value.toUpperCase().slice(0,2))} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm uppercase" maxLength={2} required />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs text-muted-foreground">{ui.zipCode}</label>
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
                        ['cartao', ui.card],
                        ['dinheiro', ui.cash],
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
                        <label className="text-xs text-muted-foreground">{ui.changeFor}</label>
                        <input value={trocoPara} onChange={(e) => setTrocoPara(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-sm" placeholder="Ex: 200,00" />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {etapaCheckout === 3 ? (
                  <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
                    <h2 className="text-lg font-bold text-foreground mb-2">{ui.confirmOrder}</h2>
                    <p><strong>{ui.customer}:</strong> {clienteNome} • {clienteTelefone}</p>
                    <p><strong>{ui.delivery}:</strong> {modoEntrega === 'entrega'
                      ? `${ui.deliveryAt} ${enderecoRua}, ${enderecoNumero}${enderecoApt ? ' - ' + enderecoApt : ''}, ${enderecoCidade}, ${enderecoEstado}, ${enderecoZip}`
                      : ui.storePickup}</p>
                    <p><strong>{ui.schedule}:</strong> {dataEntrega || '-'} {isEn ? 'at' : 'as'} {horarioEntrega || '-'}</p>
                    <p><strong>{ui.payment}:</strong> {pagamento === 'pix' ? 'Pix' : pagamento === 'cartao' ? ui.card : `${ui.cash} (${ui.changeFor} ${trocoPara})`}</p>
                    <p><strong>{ui.total}:</strong> <span className="text-primary font-semibold">{precoFormatado(resumoCarrinho.totalValor)}</span></p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setEtapaCheckout((v) => Math.max(1, v - 1))} disabled={etapaCheckout === 1}>
                  {ui.back}
                </Button>

                {etapaCheckout < 3 ? (
                  <Button type="button" onClick={avancarEtapa} className="gold-gradient-bg text-accent-foreground">
                    {ui.continue}
                  </Button>
                ) : (
                  <Button type="button" onClick={finalizarPedido} className="gold-gradient-bg text-accent-foreground">
                    {ui.confirmOrder}
                  </Button>
                )}
              </div>
            </section>
          ) : null}

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between md:px-4">
            <button
              type="button"
              onClick={() => setMostrarApenasOfertas((estadoAtual) => !estadoAtual)}
              className={cn(
                'inline-flex items-center gap-2 self-start rounded-md px-2 py-1 text-sm',
                mostrarApenasOfertas ? 'bg-primary/15 text-primary' : 'text-foreground',
              )}
            >
              <ListFilter className="h-4 w-4 text-primary" />
              {mostrarApenasOfertas ? ui.onlyOffers : ui.filters}
            </button>
            <div className="max-w-full overflow-x-auto whitespace-nowrap text-sm text-muted-foreground">
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
              className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground sm:self-auto"
            >
              <span className="sm:hidden">{ordenacao === 'menor-maior' ? ui.lowerPrice : ui.higherPrice}</span>
              <span className="hidden sm:inline">
                {ui.orderByPrice}: <span className="text-foreground">{ordenacao === 'menor-maior' ? ui.lowToHigh : ui.highToLow}</span>
              </span>
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
                  modoVisualizacao === 'compact' ? 'h-32 md:h-36' : 'h-44 md:h-52',
                )}>
                  <img
                    src={produto.imagem || ''}
                    alt={produto.nome}
                    className={produto.imagem ? "h-full w-full object-cover" : "hidden"}
                    loading="lazy"
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
                    <p className="text-2xl font-bold text-primary md:text-3xl">{precoFormatado(produto.preco)}</p>
                    <p className="text-xs text-muted-foreground">{ui.pricePerLb}</p>
                  </div>

                  <Button
                    type="button"
                    onClick={() => abrirCompra({ id: produto.id, nome: produto.nome, imagem: produto.imagem, preco: produto.preco })}
                    className="w-full gold-gradient-bg text-accent-foreground"
                  >
                    {ui.buy}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {produtosFiltrados.length < produtosCatalogo.length && (
            <div className="flex justify-center mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCount((prev) => prev + 12)}
                className="px-6 py-2 text-base font-semibold"
              >
                {ui.loadMore}
              </Button>
            </div>
          )}
        </main>

        <footer className="border-t border-border bg-muted/70 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setCarrinhoAberto(true)} className="rounded-lg gold-gradient-bg px-4 py-2.5 text-sm font-bold text-accent-foreground">
              {ui.viewCart.toUpperCase()} ({precoFormatado(resumoCarrinho.totalValor)})
            </button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <button type="button" onClick={() => toast.info(pedidoFinalizado ? `${ui.orderConfirmed}: ${pedidoFinalizado.numero}` : ui.noFinishedOrders)}>{ui.followOrder}</button>
              <button type="button" onClick={() => navigate('/login')} className="text-primary">{ui.doLogin}</button>
            </div>
          </div>
        </footer>
      </div>

      <nav className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 w-[min(92vw,520px)] -translate-x-1/2 rounded-3xl border border-border/70 bg-card/95 p-2 shadow-2xl backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-[11px] font-medium text-foreground/80 transition hover:bg-muted"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-foreground">
              <House className="h-5 w-5" />
            </span>
            {ui.home}
          </button>

          <button
            type="button"
            onClick={() => setCarrinhoAberto(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-[11px] font-semibold text-primary"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
              <ShoppingCart className="h-5 w-5" />
            </span>
            {ui.cart}
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-[11px] font-medium text-foreground/80 transition hover:bg-muted"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-foreground">
              <LogIn className="h-5 w-5" />
            </span>
            {ui.doLogin}
          </button>
        </div>
      </nav>
    </div>
  );
}




