import { useEffect, useState } from 'react';
import { backendRequest } from '@/lib/backendClient';
import { readFileAsDataUrl } from '@/lib/fileToDataUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function FinanceiroPage() {
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('carne');
  const [amount, setAmount] = useState('');
  const [competencyDate, setCompetencyDate] = useState(today);
  const [postedAt, setPostedAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [expensesPayload, summaryPayload] = await Promise.all([
        backendRequest<{ expenses: any[] }>('/api/expenses?start=' + start + '&end=' + end),
        backendRequest<{ by_category: any[]; total: number }>('/api/expenses/summary?start=' + start + '&end=' + end),
      ]);
      setExpenses(expensesPayload.expenses || []);
      setSummary(summaryPayload);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar financeiro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [start, end]);

  const submitExpense = async (event: any) => {
    event.preventDefault();
    setSaving(true);
    try {
      const attachmentBase64 = file ? await readFileAsDataUrl(file) : null;
      await backendRequest('/api/expenses', {
        method: 'POST',
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
          createdBy: window.localStorage.getItem('imperial-flow-nome') || 'admin',
        }),
      });
      setDescription('');
      setCategory('carne');
      setAmount('');
      setCompetencyDate(today);
      setPostedAt(new Date().toISOString().slice(0, 16));
      setNotes('');
      setFile(null);
      toast.success('Despesa registrada');
      load();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao registrar despesa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Despesas operacionais, comprovantes e consolidacao mensal</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-[170px]" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-[170px]" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Total de despesas</div>
          <div className="mt-2 text-3xl font-bold text-primary">{money(summary?.total)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Categorias no periodo</div>
          <div className="mt-2 text-3xl font-bold text-yellow-400">{summary?.by_category?.length || 0}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px,1fr]">
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-foreground">Nova despesa</h2>
          <form className="mt-4 space-y-3" onSubmit={submitExpense}>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Descricao</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="carne">Carne</option>
                  <option value="limpeza">Limpeza</option>
                  <option value="aluguel">Aluguel</option>
                  <option value="outras">Outras</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Valor</label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Competencia</label>
                <Input type="date" value={competencyDate} onChange={(e) => setCompetencyDate(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Lancamento</label>
                <Input type="datetime-local" value={postedAt} onChange={(e) => setPostedAt(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Comprovante</label>
              <Input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Observacoes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Salvando...' : 'Registrar despesa'}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">Historico de despesas</h2>
            <div className="flex flex-wrap gap-2">
              {(summary?.by_category || []).map((item: any) => (
                <span key={item.category} className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                  {item.category}: {money(item.total)}
                </span>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-muted-foreground">Carregando...</div>
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
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="border-t border-border/60">
                      <td className="py-3">{expense.competency_date}</td>
                      <td className="py-3">
                        <div className="font-medium">{expense.description}</div>
                        <div className="text-xs text-muted-foreground">{expense.notes || '-'}</div>
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
        </Card>
      </div>
    </div>
  );
}
