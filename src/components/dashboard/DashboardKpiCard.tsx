import { type LucideIcon } from 'lucide-react';

interface DashboardKpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  featured?: boolean;
}

export default function DashboardKpiCard({ label, value, icon: Icon, featured = false }: DashboardKpiCardProps) {
  if (featured) {
    return (
      <article className="premium-glass gold-glow relative overflow-hidden rounded-2xl p-6 lg:col-span-4">
        <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-3xl gold-shimmer opacity-30" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{label}</p>
            <p className="mt-3 text-4xl font-extrabold leading-none text-foreground sm:text-5xl">{value}</p>
            <p className="mt-3 text-sm text-muted-foreground">Meta diária superada em 12% no comparativo com ontem.</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="premium-glass rounded-2xl p-5 lg:col-span-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="mt-4 text-2xl font-bold text-foreground">{value}</p>
    </article>
  );
}
