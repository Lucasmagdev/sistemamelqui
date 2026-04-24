import { useState, useMemo } from 'react';
import {
  Beef, ChevronRight, ChevronLeft, Users, User, Baby,
  CheckSquare, Square, Calculator, X, ShoppingCart, Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const LB_HOMEM = 0.75;
const LB_MULHER = 0.5;
const LB_CRIANCA = 0.35;

// Exact product IDs for the churrasco calculator appetizers
const PETISCO_IDS = new Set([
  115, // Pão de Queijo
  116, // Bife de Peito de Frango Recheado com Presunto e Muçarela
  117, // Espetinho de Medalhão
  19,  // Espetinho de Frango com Bacon (já existia)
  118, // Espetinho de Queijo
  119, // Espetinho de Queijo com Goiabada
  120, // Espetinho de Queijo com Goiabada e Bacon
]);

interface Corte {
  id: string;
  nome: string;
  descricao: string;
  lbPorPessoa: number;
}

const CORTES: Corte[] = [
  { id: 'black_angus', nome: 'Black Angus', descricao: 'Maciez e marmoreio superiores', lbPorPessoa: 0.5 },
  { id: 'prime_rib', nome: 'Prime Rib', descricao: 'Corte nobre com osso, suculento', lbPorPessoa: 0.6 },
  { id: 'picanha', nome: 'Picanha', descricao: 'Clássico do churrasco brasileiro', lbPorPessoa: 0.45 },
  { id: 'costela', nome: 'Costela', descricao: 'Lenta e irresistível', lbPorPessoa: 0.7 },
  { id: 'fraldinha', nome: 'Fraldinha', descricao: 'Saborosa e versátil', lbPorPessoa: 0.4 },
  { id: 'maminha', nome: 'Maminha', descricao: 'Tenra e fácil de cortar', lbPorPessoa: 0.4 },
  { id: 'alcatra', nome: 'Alcatra', descricao: 'Equilíbrio entre sabor e custo', lbPorPessoa: 0.45 },
  { id: 'ancho', nome: 'Ancho / Ribeye', descricao: 'Alto marmoreio, sabor intenso', lbPorPessoa: 0.5 },
];

export interface ProdutoCatalogo {
  id: string;
  nome: string;
  imagem: string;
  preco: number;
  categoria: string;
  categoria_en: string;
}

interface Props {
  onClose: () => void;
  produtos: ProdutoCatalogo[];
  onAdicionarAoCarrinho: (
    produtoId: string,
    nome: string,
    precoKg: number,
    imagem: string,
    kg: number,
    tipoCorte: 'piece',
    observacoes?: string,
  ) => void;
}

function Counter({ label, icon: Icon, value, onChange }: {
  label: string;
  icon: React.ElementType;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-3">
      <div className="flex items-center gap-2 text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:border-primary/50 transition"
        >−</button>
        <span className="w-8 text-center text-xl font-bold text-primary">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:border-primary/50 transition"
        >+</button>
      </div>
    </div>
  );
}

export function CalculadoraChurrasco({ onClose, produtos, onAdicionarAoCarrinho }: Props) {
  const [etapa, setEtapa] = useState(1);
  const [homens, setHomens] = useState(5);
  const [mulheres, setMulheres] = useState(3);
  const [criancas, setCriancas] = useState(2);
  const [petiscosSelecionados, setPetiscosSelecionados] = useState<Set<string>>(new Set());
  const [cortesSelecionados, setCortesSelecionados] = useState<Set<string>>(new Set());

  const totalPessoas = homens + mulheres + criancas;

  // Filter products by exact IDs for the churrasco calculator
  const petiscos = useMemo(
    () => produtos.filter((p) => PETISCO_IDS.has(Number(p.id))),
    [produtos],
  );

  const togglePetisco = (id: string) => {
    setPetiscosSelecionados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleCorte = (id: string) => {
    setCortesSelecionados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const calcularResultados = () => {
    const cortesSel = CORTES.filter((c) => cortesSelecionados.has(c.id));
    if (!cortesSel.length) return [];
    const n = cortesSel.length;
    return cortesSel.map((c) => ({
      id: c.id,
      nome: c.nome,
      lb: +(
        homens * (LB_HOMEM / n + c.lbPorPessoa * 0.3) +
        mulheres * (LB_MULHER / n + c.lbPorPessoa * 0.2) +
        criancas * (LB_CRIANCA / n + c.lbPorPessoa * 0.15)
      ).toFixed(2),
    }));
  };

  const resultados = etapa === 4 ? calcularResultados() : [];
  const totalLb = resultados.reduce((acc, r) => acc + r.lb, 0);

  const petiscosSelecionadosList = useMemo(
    () => petiscos.filter((p) => petiscosSelecionados.has(p.id)),
    [petiscos, petiscosSelecionados],
  );

  const adicionarTudoAoCarrinho = () => {
    let count = 0;

    // Add petiscos — 0.5 LB per person as default
    for (const p of petiscosSelecionadosList) {
      const lb = Math.max(0.3, +(totalPessoas * 0.15).toFixed(1));
      onAdicionarAoCarrinho(p.id, p.nome, p.preco, p.imagem, lb, 'piece');
      count++;
    }

    // Add cortes with calculated LB — find matching product by name
    for (const r of resultados) {
      const lb = Math.max(0.3, r.lb);
      // Try to find product in catalog matching the cut name
      const nomeLower = r.nome.toLowerCase();
      const match = produtos.find((p) =>
        p.nome.toLowerCase().includes(nomeLower) ||
        nomeLower.split(' ').some((word) => word.length > 3 && p.nome.toLowerCase().includes(word)),
      );

      if (match) {
        onAdicionarAoCarrinho(match.id, match.nome, match.preco, match.imagem, lb, 'piece', `Calculadora de Churrasco — ${r.lb} LB`);
        count++;
      }
    }

    if (count > 0) {
      toast.success(`${count} item${count !== 1 ? 's' : ''} adicionado${count !== 1 ? 's' : ''} ao carrinho!`);
    } else {
      toast.info('Nenhum produto do catálogo corresponde aos cortes selecionados. Adicione manualmente.');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg rounded-2xl border border-primary/30 bg-card shadow-2xl max-h-[90vh] flex flex-col"
        style={{ boxShadow: 'var(--card-shadow)' }}
      >
        {/* gold top bar */}
        <div className="absolute left-0 top-0 h-[2px] w-full rounded-t-2xl" style={{ background: 'var(--gold-gradient)' }} />

        {/* header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground">Calculadora de Churrasco</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* steps indicator */}
        <div className="flex items-center gap-1 px-5 pb-4 flex-shrink-0">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition-all duration-300',
                s <= etapa ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>

        <div className="px-5 pb-2 overflow-y-auto flex-1 min-h-0">
          {/* ETAPA 1 — convidados */}
          {etapa === 1 && (
            <div className="space-y-5">
              <p className="text-sm font-semibold text-foreground">Etapa 1 — Quantos vão participar?</p>
              <div className="grid grid-cols-3 gap-3">
                <Counter label="Homens" icon={Users} value={homens} onChange={setHomens} />
                <Counter label="Mulheres" icon={User} value={mulheres} onChange={setMulheres} />
                <Counter label="Crianças" icon={Baby} value={criancas} onChange={setCriancas} />
              </div>
              <div className="rounded-lg bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{totalPessoas} pessoa{totalPessoas !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}

          {/* ETAPA 2 — petiscos do sistema */}
          {etapa === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">Etapa 2 — Escolha as entradinhas e petiscos</p>
              {petiscos.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                  Nenhuma entradinha encontrada no catálogo.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {petiscos.map((p) => {
                    const sel = petiscosSelecionados.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePetisco(p.id)}
                        className={cn(
                          'relative flex flex-col items-center gap-1.5 rounded-xl border p-2 transition',
                          sel ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:border-primary/40',
                        )}
                      >
                        <img
                          src={p.imagem}
                          alt={p.nome}
                          className="h-16 w-full rounded-lg object-cover"
                        />
                        <span className="text-center text-[11px] font-medium leading-tight text-foreground line-clamp-2">{p.nome}</span>
                        <div className="absolute right-1.5 top-1.5">
                          {sel
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : <Square className="h-4 w-4 text-muted-foreground/60" />
                          }
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{petiscosSelecionados.size} selecionado{petiscosSelecionados.size !== 1 ? 's' : ''}</p>
            </div>
          )}

          {/* ETAPA 3 — cortes */}
          {etapa === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">Etapa 3 — Selecione os cortes</p>
              <div className="grid grid-cols-2 gap-2">
                {CORTES.map((c) => {
                  const sel = cortesSelecionados.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCorte(c.id)}
                      className={cn(
                        'flex items-start gap-2 rounded-xl border p-3 text-left transition',
                        sel ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:border-primary/40',
                      )}
                    >
                      <div className="mt-0.5">
                        {sel
                          ? <CheckSquare className="h-4 w-4 text-primary" />
                          : <Square className="h-4 w-4 text-muted-foreground/60" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{c.nome}</p>
                        <p className="text-[11px] text-muted-foreground">{c.descricao}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {cortesSelecionados.size === 0 && (
                <p className="text-xs text-destructive">Selecione ao menos 1 corte.</p>
              )}
            </div>
          )}

          {/* ETAPA 4 — resultado */}
          {etapa === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <p className="text-sm font-semibold text-foreground">Resultado — Quantidade estimada</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-muted/30 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Para{' '}
                  <span className="text-foreground font-medium">{homens} homem{homens !== 1 ? 'ens' : ''}</span>,{' '}
                  <span className="text-foreground font-medium">{mulheres} mulher{mulheres !== 1 ? 'es' : ''}</span> e{' '}
                  <span className="text-foreground font-medium">{criancas} criança{criancas !== 1 ? 's' : ''}</span>
                </p>
                {petiscosSelecionadosList.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Petiscos: {petiscosSelecionadosList.map((p) => p.nome).join(', ')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {resultados.map((r) => (
                  <div key={r.nome} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Beef className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">{r.nome}</span>
                    </div>
                    <span className="text-base font-bold text-primary">{r.lb} LB</span>
                  </div>
                ))}
              </div>

              <div
                className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 flex items-center justify-between"
                style={{ boxShadow: 'var(--gold-shadow)' }}
              >
                <span className="text-sm font-semibold text-foreground">Total de carne</span>
                <span className="text-xl font-bold text-primary">{totalLb.toFixed(2)} LB</span>
              </div>

              <p className="text-[11px] text-muted-foreground">
                * Estimativa: ~0.75 LB/homem, ~0.5 LB/mulher e ~0.35 LB/criança, distribuídos pelos cortes selecionados.
              </p>
            </div>
          )}
        </div>

        {/* nav buttons */}
        <div className="flex items-center justify-between border-t border-border px-5 py-4 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEtapa((e) => Math.max(1, e - 1))}
            disabled={etapa === 1}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>
          {etapa < 4 ? (
            <Button
              size="sm"
              onClick={() => {
                if (etapa === 3 && cortesSelecionados.size === 0) return;
                setEtapa((e) => e + 1);
              }}
              disabled={etapa === 3 && cortesSelecionados.size === 0}
              className="gap-1"
              style={{ background: 'var(--gold-gradient)', color: 'hsl(var(--primary-foreground))' }}
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={adicionarTudoAoCarrinho}
              className="gap-1.5"
              style={{ background: 'var(--gold-gradient)', color: 'hsl(var(--primary-foreground))' }}
            >
              <ShoppingCart className="h-4 w-4" />
              Adicionar ao Carrinho
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
