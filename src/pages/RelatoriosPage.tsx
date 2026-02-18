import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const giroData = [
  { nome: 'Picanha', giro: 8 },
  { nome: 'Costela', giro: 12 },
  { nome: 'Fraldinha', giro: 5 },
  { nome: 'Contra-filé', giro: 7 },
  { nome: 'Alcatra', giro: 9 },
  { nome: 'Maminha', giro: 6 },
  { nome: 'Filé Mignon', giro: 4 },
  { nome: 'Cupim', giro: 3 },
];

const faturamentoData = [
  { periodo: 'Seg', valor: 4200 },
  { periodo: 'Ter', valor: 5800 },
  { periodo: 'Qua', valor: 3900 },
  { periodo: 'Qui', valor: 6200 },
  { periodo: 'Sex', valor: 7500 },
  { periodo: 'Sáb', valor: 9100 },
  { periodo: 'Dom', valor: 2800 },
];

const vendidosData = [
  { nome: 'Picanha', valor: 35 },
  { nome: 'Contra-filé', valor: 25 },
  { nome: 'Alcatra', valor: 20 },
  { nome: 'Costela', valor: 12 },
  { nome: 'Outros', valor: 8 },
];

const COLORS = ['hsl(43,72%,52%)', 'hsl(37,75%,34%)', 'hsl(45,97%,77%)', 'hsl(0,0%,60%)', 'hsl(0,0%,80%)'];

const perdaData = [
  { mes: 'Set', perda: 1200 },
  { mes: 'Out', perda: 980 },
  { mes: 'Nov', perda: 1450 },
  { mes: 'Dez', perda: 800 },
  { mes: 'Jan', perda: 650 },
  { mes: 'Fev', perda: 420 },
];

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Análises operacionais e financeiras</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Giro de Estoque */}
        <div className="rounded-xl border border-border bg-card p-5 card-elevated">
          <h3 className="text-sm font-semibold text-foreground mb-4">Giro de Estoque (kg/dia)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={giroData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(40,15%,90%)" />
              <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="giro" fill="hsl(43,72%,52%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Faturamento */}
        <div className="rounded-xl border border-border bg-card p-5 card-elevated">
          <h3 className="text-sm font-semibold text-foreground mb-4">Faturamento Semanal (R$)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={faturamentoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(40,15%,90%)" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR')}`} />
              <Bar dataKey="valor" fill="hsl(37,75%,34%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Mais vendidos */}
        <div className="rounded-xl border border-border bg-card p-5 card-elevated">
          <h3 className="text-sm font-semibold text-foreground mb-4">Produtos Mais Vendidos (%)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={vendidosData} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={90} label={({ nome, valor }) => `${nome} ${valor}%`}>
                {vendidosData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Perda Estimada */}
        <div className="rounded-xl border border-border bg-card p-5 card-elevated">
          <h3 className="text-sm font-semibold text-foreground mb-4">Perda Estimada (R$/mês)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={perdaData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(40,15%,90%)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR')}`} />
              <Line type="monotone" dataKey="perda" stroke="hsl(0,84%,60%)" strokeWidth={2} dot={{ fill: 'hsl(0,84%,60%)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
