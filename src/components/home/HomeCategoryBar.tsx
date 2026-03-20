import { cn } from '@/lib/utils';
import type { CategoryKey } from './types';

type HomeCategoryBarProps = {
  categories: CategoryKey[];
  activeCategory: CategoryKey;
  getCategoryLabel: (category: CategoryKey) => string;
  onSelectCategory: (category: CategoryKey) => void;
};

export default function HomeCategoryBar({
  categories,
  activeCategory,
  getCategoryLabel,
  onSelectCategory,
}: HomeCategoryBarProps) {
  return (
    <div className="border-t border-border px-3 py-2 md:px-6">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => onSelectCategory(category)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition md:text-xs',
              category === activeCategory
                ? 'gold-gradient-bg border-transparent text-accent-foreground'
                : 'border-border bg-muted/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
          >
            {getCategoryLabel(category)}
          </button>
        ))}
      </div>
    </div>
  );
}
