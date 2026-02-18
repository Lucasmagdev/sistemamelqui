import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface ExecutiveHeroChartProps {
  data: Array<{ dia: string; faturamento: number; pedidos: number }>;
}

export default function ExecutiveHeroChart({ data }: ExecutiveHeroChartProps) {
  return (
    <section className="premium-glass gold-glow relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="absolute -right-24 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-secondary/20 blur-3xl" />

      <div className="relative z-10 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Visão Executiva de Faturamento</h2>
          <p className="mt-1 text-sm text-muted-foreground">Últimos 7 dias com tendência de crescimento sustentado.</p>
        </div>
        <div className="rounded-xl border border-primary/30 bg-card/60 px-4 py-2 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.14em] text-primary">Acumulado semanal</p>
          <p className="text-lg font-bold text-foreground">R$ 36.420</p>
        </div>
      </div>

      <div className="relative z-10 h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="faturamentoGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.75} />
                <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="4 4" />
            <XAxis dataKey="dia" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Faturamento']}
              contentStyle={{
                background: 'hsl(var(--card) / 0.96)',
                border: '1px solid hsl(var(--border) / 0.8)',
                borderRadius: '0.75rem',
                color: 'hsl(var(--foreground))',
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
            />
            <Area
              type="monotone"
              dataKey="faturamento"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              fill="url(#faturamentoGradient)"
              activeDot={{ r: 6, stroke: 'hsl(var(--accent))', strokeWidth: 2, fill: 'hsl(var(--card))' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
