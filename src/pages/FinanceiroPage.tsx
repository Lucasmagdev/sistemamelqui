import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("carne");
  const [amount, setAmount] = useState("");
  const [competencyDate, setCompetencyDate] = useState(today);
  const [postedAt, setPostedAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const overviewQuery = useFinanceOverviewQuery({ start, end });
  const historyQuery = useExpensesHistoryQuery({ start, end }, historyOpen);

  const overview = overviewQuery.data as any;
  const expenses = (historyQuery.data as any)?.expenses || [];

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
      toast.success("Despesa registrada");
      queryClient.invalidateQueries({ queryKey: ["admin", "finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "expenses-history"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao registrar despesa");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Lancamento de despesas na frente e consolidado de saidas com equipe.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="w-[170px]" />
          <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="w-[170px]" />
        </div>
      </div>

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

      <div className="grid gap-6 lg:grid-cols-[420px,1fr]">
        <Card className="p-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Nova despesa</h2>
            <p className="mt-1 text-sm text-muted-foreground">Registre a despesa e anexe o comprovante sem abrir a area de historico.</p>
          </div>
          <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); submitExpenseMutation.mutate(); }}>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Descricao</label>
              <Input value={description} onChange={(event) => setDescription(event.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Competencia</label>
                <Input type="date" value={competencyDate} onChange={(event) => setCompetencyDate(event.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Lancamento</label>
                <Input type="datetime-local" value={postedAt} onChange={(event) => setPostedAt(event.target.value)} required />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Comprovante</label>
              <Input type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Observacoes</label>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <Button type="submit" className="w-full" disabled={submitExpenseMutation.isPending}>
              {submitExpenseMutation.isPending ? "Salvando..." : "Registrar despesa"}
            </Button>
          </form>
        </Card>

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
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setHistoryOpen((current) => !current)}>
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
                      {expenses.map((expense: any) => (
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
              )
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Expanda para ver os registros detalhados do periodo.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
