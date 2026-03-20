import { CircleUserRound, LogOut, Menu, Plus, Search, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CategoryKey } from './types';

type HomeHeaderProps = {
  companyName: string;
  logoUrl: string;
  shopTitle: string;
  sameDayLabel: string;
  selectedCutsLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  openProfileLabel: string;
  cartLabel: string;
  menuLabel: string;
  loginLabel: string;
  signupLabel: string;
  repeatOrderLabel: string;
  signOutLabel: string;
  isLoggedIn: boolean;
  userName: string;
  cartCount: number;
  menuOpen: boolean;
  menuCategories: CategoryKey[];
  getCategoryLabel: (category: CategoryKey) => string;
  onSearchChange: (value: string) => void;
  onToggleCart: () => void;
  onToggleMenu: () => void;
  onRepeatOrder: () => void;
  onSignOut: () => void;
  onSelectMenuCategory: (category: CategoryKey) => void;
};

export default function HomeHeader({
  companyName,
  logoUrl,
  shopTitle,
  sameDayLabel,
  selectedCutsLabel,
  searchPlaceholder,
  searchValue,
  openProfileLabel,
  cartLabel,
  menuLabel,
  loginLabel,
  signupLabel,
  repeatOrderLabel,
  signOutLabel,
  isLoggedIn,
  userName,
  cartCount,
  menuOpen,
  menuCategories,
  getCategoryLabel,
  onSearchChange,
  onToggleCart,
  onToggleMenu,
  onRepeatOrder,
  onSignOut,
  onSelectMenuCategory,
}: HomeHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/15 px-4 py-2.5 text-xs text-primary md:px-6 md:text-sm">
        <p className="font-medium">{shopTitle}</p>
        <div className="hidden items-center gap-4 md:flex">
          <span className="inline-flex items-center gap-1">{sameDayLabel}</span>
          <span className="inline-flex items-center gap-1">{selectedCutsLabel}</span>
        </div>
      </div>

      <header className="border-b border-border bg-card/95">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6 md:py-4">
          <div className="flex w-full items-center justify-between md:w-auto">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={logoUrl}
                alt={companyName}
                className="h-12 w-12 rounded-xl border border-border object-cover md:h-14 md:w-14"
              />
              <div className="min-w-0">
                <span className="block truncate text-base font-semibold text-foreground md:text-xl">
                  {companyName}
                </span>
                <span className="block text-[11px] uppercase tracking-[0.18em] text-primary/80 md:hidden">
                  {shopTitle}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={onToggleCart}
                className="relative rounded-full border border-border bg-background p-2.5 text-primary"
                aria-label={cartLabel}
              >
                <ShoppingCart className="h-6 w-6" />
                <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {cartCount}
                </span>
              </button>
              <button
                type="button"
                onClick={onToggleMenu}
                className="rounded-lg border border-border bg-background p-2.5 text-foreground"
                aria-label={menuLabel}
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
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          </div>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            {isLoggedIn ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={openProfileLabel}
                    className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 transition hover:border-primary/40"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <CircleUserRound className="h-5 w-5" />
                    </span>
                    <span className="max-w-[160px] truncate text-sm font-semibold text-foreground">
                      {userName}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3">
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" size="sm" className="justify-start" onClick={onRepeatOrder}>
                      {repeatOrderLabel}
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start gap-2" onClick={onSignOut}>
                      <LogOut className="h-4 w-4" />
                      {signOutLabel}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}

            <button
              type="button"
              onClick={onToggleCart}
              className="relative rounded-full border border-border bg-background p-2.5 text-primary md:p-3"
              aria-label={cartLabel}
            >
              <ShoppingCart className="h-6 w-6" />
              <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {cartCount}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleMenu}
              className="rounded-full border border-border bg-background p-2.5 text-foreground md:p-3"
              aria-label={menuLabel}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="border-t border-border bg-background/95 px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {menuCategories.map((category) => (
                  <button
                    key={`menu-${category}`}
                    type="button"
                    onClick={() => onSelectMenuCategory(category)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40"
                  >
                    {getCategoryLabel(category)}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {isLoggedIn ? (
                  <Button type="button" variant="outline" onClick={onRepeatOrder}>
                    {repeatOrderLabel}
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="outline">
                      <Link to="/login">{loginLabel}</Link>
                    </Button>
                    <Button asChild variant="ghost" className="gap-2">
                      <Link to="/cadastro">
                        <Plus className="h-4 w-4" />
                        {signupLabel}
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}
