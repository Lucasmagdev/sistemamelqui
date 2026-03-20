import { ChevronDown, Grid2x2, LayoutGrid, List, ListFilter, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HomeProduct, ModoVisualizacao } from './types';

type ProductGridProps = {
  products: HomeProduct[];
  totalProducts: number;
  mode: ModoVisualizacao;
  showOnlyOffers: boolean;
  showCount: number;
  priceOrderLabel: string;
  filtersLabel: string;
  onlyOffersLabel: string;
  lowerPriceLabel: string;
  higherPriceLabel: string;
  lowToHighLabel: string;
  highToLowLabel: string;
  pricePerLbLabel: string;
  loadMoreLabel: string;
  buyLabel: string;
  isAscending: boolean;
  isMobile: boolean;
  onOpenMobileFilters: () => void;
  onToggleOffers: () => void;
  onToggleOrder: () => void;
  onChangeMode: (mode: ModoVisualizacao) => void;
  onChangeShowCount: (value: number) => void;
  onLoadMore: () => void;
  onBuy: (product: { id: string; nome: string; imagem: string | null; preco: number }) => void;
  formatPrice: (value: number | null | undefined) => string;
};

export default function ProductGrid({
  products,
  totalProducts,
  mode,
  showOnlyOffers,
  showCount,
  priceOrderLabel,
  filtersLabel,
  onlyOffersLabel,
  lowerPriceLabel,
  higherPriceLabel,
  lowToHighLabel,
  highToLowLabel,
  pricePerLbLabel,
  loadMoreLabel,
  buyLabel,
  isAscending,
  isMobile,
  onOpenMobileFilters,
  onToggleOffers,
  onToggleOrder,
  onChangeMode,
  onChangeShowCount,
  onLoadMore,
  onBuy,
  formatPrice,
}: ProductGridProps) {
  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between md:px-4">
        <button
          type="button"
          onClick={() => {
            if (isMobile) {
              onOpenMobileFilters();
              return;
            }
            onToggleOffers();
          }}
          className={cn(
            'inline-flex items-center gap-2 self-start rounded-md px-2 py-1 text-sm',
            showOnlyOffers ? 'bg-primary/15 text-primary' : 'text-foreground',
          )}
        >
          <ListFilter className="h-4 w-4 text-primary" />
          {isMobile ? filtersLabel : showOnlyOffers ? onlyOffersLabel : filtersLabel}
        </button>
        <div className="hidden max-w-full overflow-x-auto whitespace-nowrap text-sm text-muted-foreground sm:block">
          Show:{' '}
          {[9, 12, 18, 24].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onChangeShowCount(value)}
              className={cn('mx-1', showCount === value ? 'font-semibold text-foreground' : 'hover:text-foreground')}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-2 text-muted-foreground sm:flex">
          <button type="button" onClick={() => onChangeMode('grid')} className={cn(mode === 'grid' ? 'text-primary' : 'hover:text-foreground')}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onChangeMode('compact')} className={cn(mode === 'compact' ? 'text-primary' : 'hover:text-foreground')}>
            <Grid2x2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onChangeMode('list')} className={cn(mode === 'list' ? 'text-primary' : 'hover:text-foreground')}>
            <List className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleOrder}
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground sm:self-auto"
        >
          <span className="sm:hidden">{isAscending ? lowerPriceLabel : higherPriceLabel}</span>
          <span className="hidden sm:inline">
            {priceOrderLabel}: <span className="text-foreground">{isAscending ? lowToHighLabel : highToLowLabel}</span>
          </span>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div
        className={cn(
          mode === 'list'
            ? 'grid grid-cols-1 gap-3'
            : mode === 'compact'
              ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
              : 'grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        )}
      >
        {products.map((product) => (
          <article key={product.id} className="overflow-hidden rounded-xl border border-border bg-card card-elevated">
            <div
              className={cn(
                'relative bg-[linear-gradient(160deg,hsl(var(--muted))_0%,hsl(var(--background))_65%,hsl(var(--muted))_100%)]',
                mode === 'compact' ? 'h-28 md:h-36' : 'h-32 md:h-52',
              )}
            >
              <img
                src={product.imagem || ''}
                alt={product.nome}
                className={product.imagem ? 'h-full w-full object-cover' : 'hidden'}
                loading="lazy"
              />
              <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--background)/0.56),transparent_45%)]" />
              {product.selo ? (
                <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
                  {product.selo}
                </span>
              ) : null}
            </div>
            <div className="space-y-3 p-3 md:p-4">
              <div className="space-y-1">
                <h3 className="line-clamp-2 text-sm font-semibold text-foreground md:text-lg">{product.nome}</h3>
                {product.descricao ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground md:text-sm">{product.descricao}</p>
                ) : null}
              </div>
              {product.destaque ? (
                <div className="flex items-center gap-1 text-primary">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star key={idx} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
              ) : null}
              <div>
                {product.precoAnterior ? (
                  <p className="text-xs text-muted-foreground line-through">de {formatPrice(product.precoAnterior)}</p>
                ) : null}
                <p className="text-lg font-bold text-primary md:text-3xl">{formatPrice(product.preco)}</p>
                <p className="text-xs text-muted-foreground">{pricePerLbLabel}</p>
              </div>
              <Button
                type="button"
                onClick={() => onBuy({ id: product.id, nome: product.nome, imagem: product.imagem, preco: product.preco })}
                className="h-9 w-full gold-gradient-bg px-3 text-sm text-accent-foreground md:h-10 md:text-base"
              >
                {buyLabel}
              </Button>
            </div>
          </article>
        ))}
      </div>

      {products.length < totalProducts ? (
        <div className="mt-6 flex justify-center">
          <Button type="button" variant="outline" onClick={onLoadMore} className="px-6 py-2 text-base font-semibold">
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </>
  );
}
