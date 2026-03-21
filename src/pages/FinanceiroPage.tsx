import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronDown, ChevronUp, FileText, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { backendRequest } from "@/lib/backendClient";
import { readFileAsDataUrl } from "@/lib/fileToDataUrl";
import { useExpensesHistoryQuery, useFinanceOverviewQuery } from "@/hooks/useAdminQueries";

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function FinanceiroPage() {
  const queryClient = useQueryClient();
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("carne");
  const [amount, setAmount] = useState("");
  const [competencyDate, setCompetencyDate] = useState(today);
  const [postedAt, setPostedAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyCategory, setHistoryCategory] = useState("todas");

  const overviewQuery = useFinanceOverviewQuery({ start, end });
  const historyQuery = useExpensesHistoryQuery({ start, end }, historyOpen);

  const overview = overviewQuery.data as any;
  const expenses = (historyQuery.data as any)?.expenses || [];
  const topCategory = useMemo(() => {
    const categories = ((overview?.expensesByCategory || []) as any[]).slice().sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
    return categories[0] || null;
  }, [overview?.expensesByCategory]);
  const filteredExpenses = useMemo(
    () =>
      expenses.filter((expense: any) => {
        const matchesSearch =
          !historySearch ||
          String(expense.description || "").toLowerCase().includes(historySearch.toLowerCase()) ||
          String(expense.notes || "").toLowerCase().includes(historySearch.toLowerCase());
        const matchesCategory = historyCategory === "todas" || String(expense.category || "").toLowerCase() === historyCategory;
        return matchesSearch && matchesCategory;
      }),
    [expenses, historyCategory, historySearch],
  );
  const historyCategories = useMemo(
    () => Array.from(new Set(expenses.map((expense: any) => String(expense.category || "outras").toLowerCase()))).filter(Boolean),
    [expenses],
  );

  const submitExpenseMutation = useMutation({
    mutationFn: async () => {
      const attachmentBase64 = file ? await readFileAsDataUrl(file) : null;
      return backendRequest("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          description,
          category,
          amount,
          competencyDate,
          postedAt: new Date(postedAt).toISOString(),
          notes,
          attachmentBase64,
          attachmentName: file?.name || null,
          attachmentMimeType: file?.type || null,
          createdBy: window.localStorage.getItem("imperial-flow-nome") || "admin",
        }),
      });
    },
    onSuccess: () => {
      setDescription("");
      setCategory("carne");
      setAmount("");
      setCompetencyDate(today);
      setPostedAt(new Date().toISOString().slice(0, 16));
      setNotes("");
      setFile(null);
      setAdvancedOpen(false);
      toast.success("Despesa registrada");
      queryClient.invalidateQueries({ queryKey: ["admin", "finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "expenses-history"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "operational-report"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao registrar despesa");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Tela pensada para lancar rapido, acompanhar saidas e consultar o historico so quando precisar.</p>
        </div>
      </div>

      <Card className="border-border/70 bg-muted/20 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarRange className="h-4 w-4 text-primary" />
              Filtro do painel
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Esse periodo afeta os cards e o historico. O lancamento abaixo continua independente.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Inicio</label>
              <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="w-full sm:w-[180px]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Fim</label>
              <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="w-full sm:w-[180px]" />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Despesas operacionais</div>
          {overviewQuery.isLoading && !overviewQuery.data ? <Skeleton className="mt-3 h-8 w-24" /> : <div className="mt-2 text-3xl font-bold text-primary">{money(overview?.expensesTotal)}</div>}
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Pagamentos da equipe</div>
          {overviewQuery.isLoading && !overviewQuery.data ? <Skeleton className="mt-3 h-8 w-24" /> : <div className="mt-2 text-3xl font-bold text-emerald-400">{money(overview?.payrollTotal)}</div>}
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Total de saidas</div>
          {overviewQuery.isLoading && !overviewQuery.data ? <Skeleton className="mt-3 h-8 w-24" /> : <div className="mt-2 text-3xl font-bold text-yellow-400">{money(overview?.totalOutflow)}</div>}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wallet className="h-4 w-4 text-primary" />
            Leitura rapida do periodo
          </div>
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-border/70 bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Maior peso nas despesas</div>
              {overviewQuery.isLoading && !overviewQuery.data ? (
                <Skeleton className="mt-3 h-6 w-40" />
              ) : topCategory ? (
                <>
                  <div className="mt-2 text-lg font-semibold text-foreground capitalize">{topCategory.category}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{money(topCategory.total)} no periodo filtrado</div>
                </>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">Sem despesas categorizadas no periodo.</div>
              )}
            </div>
            <div className="rounded-xl border border-border/70 bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Relacao com a equipe</div>
              {overviewQuery.isLoading && !overviewQuery.data ? (
                <Skeleton className="mt-3 h-6 w-32" />
              ) : (
                <>
                  <div className="mt-2 text-lg font-semibold text-foreground">{money(overview?.payrollTotal)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">Pagamentos da equipe incluidos no total de saidas.</div>
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2 p-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Nova despesa</h2>
            <p className="mt-1 text-sm text-muted-foreground">Lance o essencial primeiro. Comprovante, horario e observacoes ficam em campos avancados.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: "Carne", value: "carne" },
              { label: "Limpeza", value: "limpeza" },
              { label: "Aluguel", value: "aluguel" },
              { label: "Outras", value: "outras" },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  category === item.value ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); submitExpenseMutation.mutate(); }}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px]">
              <div>
              <label className="mb-1 block text-sm text-muted-foreground">Descricao</label>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} required placeholder="Ex.: Compra de caixa de frango, aluguel, limpeza..." />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Valor</label>
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Categoria</label>
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="carne">Carne</option>
                  <option value="limpeza">Limpeza</option>
                  <option value="aluguel">Aluguel</option>
                  <option value="outras">Outras</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Valor</label>
                <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">Moeda atual do sistema: dolar</div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Competencia</label>
                <Input type="date" value={competencyDate} onChange={(event) => setCompetencyDate(event.target.value)} required />
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setAdvancedOpen((current) => !current)}>
                <div>
                  <div className="text-sm font-semibold text-foreground">Campos avancados</div>
                  <div className="text-xs text-muted-foreground">Use quando precisar anexar comprovante, ajustar horario ou detalhar observacoes.</div>
                </div>
                {advancedOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </button>

              {advancedOpen ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">Lancamento</label>
                      <Input type="datetime-local" value={postedAt} onChange={(event) => setPostedAt(event.target.value)} required />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">Comprovante</label>
                      <Input type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                    </div>
                  </div>

                  {file ? (
                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 text-foreground">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="truncate">{file.name}</span>
                      </div>
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setFile(null)}>
                        Remover
                      </button>
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-sm text-muted-foreground">Observacoes</label>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Detalhes opcionais para consulta futura." />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Obrigatorio para lancar rapido: descricao, valor, categoria e competencia.</p>
              <Button type="submit" className="w-full sm:w-auto" disabled={submitExpenseMutation.isPending}>
                {submitExpenseMutation.isPending ? "Salvando..." : "Registrar despesa"}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Consolidado do periodo</h2>
            <p className="text-sm text-muted-foreground">Despesas operacionais e folha no mesmo painel.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {((overview?.expensesByCategory || []) as any[]).map((item) => (
              <span key={item.category} className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                {item.category}: {money(item.total)}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border/70 bg-muted/20 p-4">
          <button type="button" className="flex w-full items-center justify-between gap-4 text-left" onClick={() => setHistoryOpen((current) => !current)}>
            <div>
              <div className="text-sm font-semibold text-foreground">Ver registros do periodo</div>
              <div className="text-xs text-muted-foreground">O historico de despesas so e carregado quando esta area abre.</div>
            </div>
            {historyOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </button>

          {historyOpen ? (
            historyQuery.isLoading && !historyQuery.data ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={`expense-history-${index}`} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : expenses.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Nenhuma despesa encontrada no periodo.
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Buscar por descricao ou observacao" className="pl-10" />
                  </div>
                  <select value={historyCategory} onChange={(event) => setHistoryCategory(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="todas">Todas as categorias</option>
                    {historyCategories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                {filteredExpenses.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                    Nenhum registro combina com a busca atual.
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="pb-3">Competencia</th>
                          <th className="pb-3">Descricao</th>
                          <th className="pb-3">Categoria</th>
                          <th className="pb-3">Comprovante</th>
                          <th className="pb-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredExpenses.map((expense: any) => (
                          <tr key={expense.id} className="border-t border-border/60">
                            <td className="py-3">{expense.competency_date}</td>
                            <td className="py-3">
                              <div className="font-medium">{expense.description}</div>
                              <div className="text-xs text-muted-foreground">{expense.notes || "-"}</div>
                            </td>
                            <td className="py-3 capitalize">{expense.category}</td>
                            <td className="py-3">
                              {expense.attachment_url ? (
                                <a href={expense.attachment_url} target="_blank" rel="noreferrer" className="text-primary underline">
                                  Abrir
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="py-3 text-right font-semibold">{money(expense.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Expanda para ver os registros detalhados do periodo.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
