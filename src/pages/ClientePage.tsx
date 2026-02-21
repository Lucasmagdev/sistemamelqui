import {
  Beef,
  CircleUserRound,
  Crown,
  Grid2x2,
  List,
  LayoutGrid,
  ListFilter,
  Menu,
  Search,
  ShoppingCart,
  Star,
  Truck,
} from 'lucide-react';
import { mockProdutos } from '@/data/mockData';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const menuCategorias = [
  'Todos os cortes',
  'Ofertas da semana',
  'Kit churrasco',
  'Linha premium',
  'Assinatura',
  'Contato',
];

const precoFormatado = (valor: number) => `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export default function ClientePage() {
  const { config } = useTenant();
  const produtosCatalogo = mockProdutos.map((produto, index) => ({
    id: produto.id,
    nome: `${produto.nome} ${index % 2 === 0 ? 'Premium' : 'Seleção do Açougue'}`,
    preco: produto.custoMedio * 2.2,
    precoAnterior: produto.custoMedio * 2.7,
    destaque: index === 2 || index === 5,
    selo: index % 3 === 0 ? 'OFERTA' : index % 3 === 1 ? 'MAIS VENDIDO' : 'NOVO',
  }));

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-background p-3 md:p-6">
      <div className="mx-auto w-full max-w-[1400px] overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/15 px-4 py-2 text-xs text-primary md:px-6">
          <p className="font-medium">Loja online do açougue • Catálogo e carrinho em modo mock</p>
          <div className="hidden items-center gap-4 md:flex">
            <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Entrega no mesmo dia</span>
            <span className="inline-flex items-center gap-1"><Beef className="h-3.5 w-3.5" /> Cortes selecionados</span>
          </div>
        </div>

        <header className="border-b border-border bg-card/95">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
            <div className="flex items-center gap-2 text-primary">
              <Crown className="h-5 w-5" />
              <span className="text-base font-semibold text-foreground">{config.nomeEmpresa}</span>
            </div>

            <div className="order-3 w-full md:order-none md:mx-6 md:flex-1">
              <div className="flex h-11 items-center rounded-full border border-border bg-background px-4">
                <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder="Busca por produtos"
                  disabled
                />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/login">
                  <CircleUserRound className="h-4 w-4" />
                  Login
                </Link>
              </Button>
              <button
                type="button"
                disabled
                className="relative rounded-full border border-border bg-background p-2 text-primary"
                aria-label="Carrinho mock"
              >
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  14
                </span>
              </button>
              <button type="button" disabled className="rounded-lg border border-border bg-background p-2 text-foreground" aria-label="Menu mock">
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="border-t border-border px-3 py-2 md:px-6">
            <div className="flex flex-wrap gap-1.5">
              {menuCategorias.map((categoria, index) => (
                <button
                  key={categoria}
                  type="button"
                  disabled
                  className={`rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide md:text-sm ${
                    index === 0
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
                <p className="mt-1 text-sm text-muted-foreground">A seleção abaixo é apenas visual para apresentação do catálogo.</p>
              </div>
              <Button type="button" disabled className="gold-gradient-bg text-accent-foreground font-semibold">
                Ver Carrinho (R$ 345,00)
              </Button>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 md:px-4">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <ListFilter className="h-4 w-4 text-primary" />
              Filtros
            </div>
            <div className="text-sm text-muted-foreground">Show: <span className="text-foreground">9</span> / 12 / 18 / 24</div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <LayoutGrid className="h-4 w-4 text-primary" />
              <Grid2x2 className="h-4 w-4" />
              <List className="h-4 w-4" />
            </div>
            <div className="text-sm text-muted-foreground">Ordenar por preço: <span className="text-foreground">menor para maior</span></div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {produtosCatalogo.map((produto) => (
              <article key={produto.id} className="overflow-hidden rounded-xl border border-border bg-card card-elevated">
                <div className="relative h-52 bg-[linear-gradient(160deg,hsl(var(--muted))_0%,hsl(var(--background))_65%,hsl(var(--muted))_100%)]">
                  <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
                    {produto.selo}
                  </span>
                  <div className="absolute inset-x-0 bottom-3 flex justify-center">
                    <span className="rounded-md border border-primary/40 bg-background/75 px-2 py-1 text-xs text-primary">Imagem do produto</span>
                  </div>
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
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" disabled variant="outline" className="flex-1">Detalhes</Button>
                    <Button type="button" disabled className="flex-1 gold-gradient-bg text-accent-foreground">Adicionar</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </main>

        <footer className="border-t border-border bg-muted/70 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" disabled className="rounded-lg gold-gradient-bg px-4 py-2.5 text-sm font-bold text-accent-foreground">
              VER CARRINHO (R$ 345,00)
            </button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <button type="button" disabled>Acompanhar Pedido</button>
              <button type="button" disabled className="text-primary">Fazer Login</button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}