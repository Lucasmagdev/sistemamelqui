import { Beef, Clock3, MapPin, PackageCheck, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CartSummary } from './types';

type HomeHeroProps = {
  badgeLabel: string;
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  cartLabel: string;
  cartItemsLabel: string;
  selectedCutsLabel: string;
  curatedLabel: string;
  deliveryLabel: string;
  pickupLabel: string;
  totalLabel: string;
  summary: CartSummary;
  isLoggedIn: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  formatPrice: (value: number) => string;
};

export default function HomeHero({
  badgeLabel,
  title,
  subtitle,
  primaryCtaLabel,
  secondaryCtaLabel,
  cartLabel,
  cartItemsLabel,
  selectedCutsLabel,
  curatedLabel,
  deliveryLabel,
  pickupLabel,
  totalLabel,
  summary,
  isLoggedIn,
  onPrimaryAction,
  onSecondaryAction,
  formatPrice,
}: HomeHeroProps) {
  const hasCartItems = summary.totalItens > 0;

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-border bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.18),transparent_32%),linear-gradient(145deg,hsl(var(--background))_0%,hsl(0_0%_8%)_65%,hsl(var(--muted))_100%)] p-5 md:p-8">
      <div className="pointer-events-none absolute -right-12 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-32 rounded-full bg-secondary/15 blur-3xl" />

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:items-end">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <PackageCheck className="h-3.5 w-3.5" />
            {badgeLabel}
          </div>

          <div className="space-y-3">
            <h1 className="max-w-[14ch] text-3xl font-bold leading-none text-foreground sm:text-4xl md:text-5xl">
              {title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              {subtitle}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={onPrimaryAction}
              className="h-11 gap-2 gold-gradient-bg px-5 text-accent-foreground"
            >
              <ShoppingCart className="h-4 w-4" />
              {primaryCtaLabel}
            </Button>
            {isLoggedIn ? (
              <Button type="button" variant="outline" onClick={onSecondaryAction} className="h-11 px-5">
                {secondaryCtaLabel}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2">
              <Clock3 className="h-3.5 w-3.5 text-primary" />
              {deliveryLabel}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2">
              <Beef className="h-3.5 w-3.5 text-primary" />
              {curatedLabel}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {pickupLabel}
            </span>
          </div>
        </div>

        <div className="relative rounded-[24px] border border-border/80 bg-background/80 p-4 shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{cartLabel}</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-border bg-card/80 p-4">
              <p className="text-sm text-muted-foreground">{hasCartItems ? cartItemsLabel : selectedCutsLabel}</p>
              <p className="mt-2 text-3xl font-bold text-foreground">
                {hasCartItems ? summary.totalItens : 0}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasCartItems ? `${summary.totalLb.toFixed(1)} LB` : selectedCutsLabel}
              </p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
              <p className="text-sm text-muted-foreground">{totalLabel}</p>
              <p className="mt-2 text-2xl font-bold text-primary">{formatPrice(summary.totalValor)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasCartItems ? `${summary.totalItens} ${cartItemsLabel.toLowerCase()}` : selectedCutsLabel}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
