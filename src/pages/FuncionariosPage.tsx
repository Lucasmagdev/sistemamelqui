import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Briefcase, CalendarRange, ChevronDown, ChevronUp, DollarSign, FileText, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { backendRequest } from "@/lib/backendClient";
import { readFileAsDataUrl } from "@/lib/fileToDataUrl";
import { useEmployeePaymentsHistoryQuery, useEmployeesDashboardQuery } from "@/hooks/useAdminQueries";

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Sem pagamento";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem pagamento";
  return parsed.toLocaleDateString("pt-BR");
};

export default function FuncionariosPage() {
  const queryClient = useQueryClient();
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [paymentAdvancedOpen, setPaymentAdvancedOpen] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeePhone, setEmployeePhone] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeeRole, setEmployeeRole] = useState("");
  const [employeeNotes, setEmployeeNotes] = useState("");
  const [paymentEmployeeId, setPaymentEmployeeId] = useState("");
  const [weekReference, setWeekReference] = useState(today);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyEmployeeId, setHistoryEmployeeId] = useState("all");
  const [historyProofStatus, setHistoryProofStatus] = useState("all");

  const dashboardQuery = useEmployeesDashboardQuery();
  const paymentsHistoryQuery = useEmployeePaymentsHistoryQuery({ start, end }, historyOpen);

  const dashboard = dashboardQuery.data as any;
  const employees = ((dashboard?.employees || []) as any[]).slice();
  const monthSummary = dashboard?.summary || null;
  const topEmployees = ((dashboard?.top_employees || []) as any[]).slice();
  const payments = ((paymentsHistoryQuery.data as any)?.payments || []) as any[];

  useEffect(() => {
    if (!paymentEmployeeId && employees[0]?.employee_id) {
      setPaymentEmployeeId(String(employees[0].employee_id));
    }
  }, [employees, paymentEmployeeId]);

  const filteredPayments = useMemo(
    () =>
      payments.filter((payment: any) => {
        const matchesSearch =
          !historySearch ||
          String(payment.employee_name || "").toLowerCase().includes(historySearch.toLowerCase()) ||
          String(payment.notes || "").toLowerCase().includes(historySearch.toLowerCase());
        const matchesEmployee = historyEmployeeId === "all" || String(payment.employee_id) === historyEmployeeId;
        const hasAttachment = Boolean(payment.attachment_url);
        const matchesProof =
          historyProofStatus === "all" ||
          (historyProofStatus === "with_proof" && hasAttachment) ||
          (historyProofStatus === "without_proof" && !hasAttachment);
        return matchesSearch && matchesEmployee && matchesProof;
      }),
    [historyEmployeeId, historyProofStatus, historySearch, payments],
  );

  const submitEmployeeMutation = useMutation({
    mutationFn: () =>
      backendRequest("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          name: employeeName,
          phone: employeePhone || null,
          email: employeeEmail || null,
          roleTitle: employeeRole || null,
          notes: employeeNotes || null,
        }),
      }),
    onSuccess: () => {
      setEmployeeName("");
      setEmployeePhone("");
      setEmployeeEmail("");
      setEmployeeRole("");
      setEmployeeNotes("");
      setEmployeeFormOpen(false);
      toast.success("Funcionario cadastrado");
      queryClient.invalidateQueries({ queryKey: ["admin", "employees-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "employees"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao cadastrar funcionario");
    },
  });

  const submitPaymentMutation = useMutation({
    mutationFn: async () => {
      const attachmentBase64 = paymentFile ? await readFileAsDataUrl(paymentFile) : null;
      return backendRequest("/api/employee-payments", {
        method: "POST",
        body: JSON.stringify({
          employeeId: paymentEmployeeId,
          weekReference,
          amount: paymentAmount,
          paidAt: new Date(paidAt).toISOString(),
          notes: paymentNotes || null,
          attachmentBase64,
          attachmentName: paymentFile?.name || null,
          attachmentMimeType: paymentFile?.type || null,
          createdBy: window.localStorage.getItem("imperial-flow-nome") || "admin",
        }),
      });
    },
    onSuccess: () => {
      setWeekReference(today);
      setPaymentAmount("");
      setPaidAt(new Date().toISOString().slice(0, 16));
      setPaymentNotes("");
      setPaymentFile(null);
      setPaymentAdvancedOpen(false);
      setPaymentFormOpen(false);
      toast.success("Pagamento registrado");
      queryClient.invalidateQueries({ queryKey: ["admin", "employees-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "employee-payments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "employee-payments-history"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "operational-report"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao registrar pagamento");
    },
  });

  const toggleEmployeeMutation = useMutation({
    mutationFn: (employee: any) =>
      backendRequest(`/api/employees/${employee.employee_id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !employee.active }),
      }),
    onSuccess: () => {
      toast.success("Status do funcionario atualizado");
      queryClient.invalidateQueries({ queryKey: ["admin", "employees-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "employees"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar funcionario");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funcionarios</h1>
          <p className="text-sm text-muted-foreground">Visao gerencial por pessoa, custo mensal da equipe e operacao rapida de cadastro e pagamento.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 text-primary" />
            Equipe ativa
          </div>
          {dashboardQuery.isLoading && !dashboardQuery.data ? <Skeleton className="mt-3 h-8 w-24" /> : <div className="mt-2 text-3xl font-bold text-primary">{monthSummary?.active_count || 0}</div>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Pago no mes atual
          </div>
          {dashboardQuery.isLoading && !dashboardQuery.data ? <Skeleton className="mt-3 h-8 w-24" /> : <div className="mt-2 text-3xl font-bold text-emerald-400">{money(monthSummary?.payments_total)}</div>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="h-4 w-4 text-yellow-400" />
            Media por ativo
          </div>
          {dashboardQuery.isLoading && !dashboardQuery.data ? <Skeleton className="mt-3 h-8 w-24" /> : <div className="mt-2 text-3xl font-bold text-yellow-400">{money(monthSummary?.avg_per_active_employee)}</div>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarRange className="h-4 w-4 text-sky-400" />
            Pagamentos no mes
          </div>
          {dashboardQuery.isLoading && !dashboardQuery.data ? <Skeleton className="mt-3 h-8 w-24" /> : <div className="mt-2 text-3xl font-bold text-sky-400">{monthSummary?.payments_count || 0}</div>}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px,420px,1fr]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Novo funcionario</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cadastre a pessoa para ela entrar imediatamente na visao da equipe.</p>
            </div>
            <Button type="button" variant={employeeFormOpen ? "outline" : "default"} className={employeeFormOpen ? "" : "bg-primary text-primary-foreground hover:bg-primary/90"} onClick={() => setEmployeeFormOpen((current) => !current)}>
              {employeeFormOpen ? "Fechar" : "Abrir cadastro"}
            </Button>
          </div>

          {employeeFormOpen ? (
            <form className="mt-5 space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4" onSubmit={(event) => { event.preventDefault(); submitEmployeeMutation.mutate(); }}>
              <Input value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder="Nome completo" required />
              <Input value={employeeRole} onChange={(event) => setEmployeeRole(event.target.value)} placeholder="Funcao" />
              <Input value={employeePhone} onChange={(event) => setEmployeePhone(event.target.value)} placeholder="Telefone" />
              <Input value={employeeEmail} onChange={(event) => setEmployeeEmail(event.target.value)} placeholder="E-mail" />
              <textarea value={employeeNotes} onChange={(event) => setEmployeeNotes(event.target.value)} className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Observacoes opcionais" />
              <Button type="submit" className="w-full" disabled={submitEmployeeMutation.isPending}>
                {submitEmployeeMutation.isPending ? "Salvando..." : "Cadastrar funcionario"}
              </Button>
            </form>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Clique para abrir o formulario de cadastro.
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Registrar pagamento</h2>
              <p className="mt-1 text-sm text-muted-foreground">Esse registro entra automaticamente no total de saidas do mes.</p>
            </div>
            <Button type="button" variant={paymentFormOpen ? "outline" : "default"} className={paymentFormOpen ? "" : "bg-primary text-primary-foreground hover:bg-primary/90"} onClick={() => setPaymentFormOpen((current) => !current)}>
              {paymentFormOpen ? "Fechar" : "Lancar pagamento"}
            </Button>
          </div>

          {paymentFormOpen ? (
            <form className="mt-5 space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4" onSubmit={(event) => { event.preventDefault(); submitPaymentMutation.mutate(); }}>
              <select value={paymentEmployeeId} onChange={(event) => setPaymentEmployeeId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                {employees.map((employee) => (
                  <option key={employee.employee_id} value={employee.employee_id}>
                    {employee.employee_name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={weekReference} onChange={(event) => setWeekReference(event.target.value)} required />
                <Input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Valor" required />
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setPaymentAdvancedOpen((current) => !current)}>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Opcoes extras</div>
                    <div className="text-xs text-muted-foreground">Comprovante, horario exato e observacoes ficam aqui.</div>
                  </div>
                  {paymentAdvancedOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                </button>

                {paymentAdvancedOpen ? (
                  <div className="mt-4 space-y-3">
                    <Input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required />
                    <Input type="file" accept="image/*,.pdf" onChange={(event) => setPaymentFile(event.target.files?.[0] || null)} />
                    {paymentFile ? (
                      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 text-foreground">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="truncate">{paymentFile.name}</span>
                        </div>
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setPaymentFile(null)}>
                          Remover
                        </button>
                      </div>
                    ) : null}
                    <textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Observacoes opcionais" />
                  </div>
                ) : null}
              </div>

              <Button type="submit" className="w-full" disabled={submitPaymentMutation.isPending || employees.length === 0}>
                {submitPaymentMutation.isPending ? "Salvando..." : "Registrar pagamento"}
              </Button>
            </form>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Clique para abrir o formulario de pagamento.
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-foreground">Maiores custos do mes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Quem mais pesou na folha no mes atual.</p>
          {dashboardQuery.isLoading && !dashboardQuery.data ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={`top-employee-${index}`} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : topEmployees.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Nenhum pagamento registrado no mes atual.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {topEmployees.map((employee: any, index: number) => (
                <div key={employee.employee_id} className="flex items-center justify-between rounded-xl border border-border/70 p-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">#{index + 1}</div>
                    <div className="font-semibold text-foreground">{employee.employee_name}</div>
                  </div>
                  <div className="text-right font-semibold text-emerald-400">{money(employee.month_total)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Equipe em cards</h2>
            <p className="text-sm text-muted-foreground">Visao mensal por pessoa, com acoes rapidas sem entrar em tabelas.</p>
          </div>
          <div className="text-xs text-muted-foreground">
            Periodo dos cards: {dashboard?.monthRange?.startDate || today} ate {dashboard?.monthRange?.endDate || today}
          </div>
        </div>

        {dashboardQuery.isLoading && !dashboardQuery.data ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`employee-card-${index}`} className="h-56 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {employees.map((employee: any) => (
              <div key={employee.employee_id} className="rounded-2xl border border-border/70 bg-background/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">{employee.employee_name}</div>
                    <div className="text-sm text-muted-foreground">{employee.role_title || "Sem funcao definida"}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${employee.active ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/10 text-zinc-400"}`}>
                    {employee.active ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <div className="mt-3 text-sm text-muted-foreground">{employee.contact || "Sem contato cadastrado"}</div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/70 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Pago no mes</div>
                    <div className="mt-2 text-base font-semibold text-emerald-400">{money(employee.month_total)}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Registros</div>
                    <div className="mt-2 text-base font-semibold text-foreground">{employee.month_count}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ultimo pgto</div>
                    <div className="mt-2 text-base font-semibold text-foreground">{formatDate(employee.last_payment_at)}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      setPaymentEmployeeId(String(employee.employee_id));
                      setPaymentFormOpen(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Registrar pagamento
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setHistoryOpen(true);
                      setHistoryEmployeeId(String(employee.employee_id));
                      setHistorySearch(employee.employee_name || "");
                    }}
                  >
                    Ver historico
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleEmployeeMutation.mutate(employee)}
                    disabled={toggleEmployeeMutation.isPending}
                  >
                    {employee.active ? "Inativar" : "Reativar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Historico de pagamentos</h2>
            <p className="text-sm text-muted-foreground">Use o periodo do topo analitico para conferir comprovantes e lancamentos da equipe.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
            <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border/70 bg-muted/20 p-4">
          <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setHistoryOpen((current) => !current)}>
            <div>
              <div className="text-sm font-semibold text-foreground">Ver registros do periodo</div>
              <div className="text-xs text-muted-foreground">O historico so e carregado quando esta area abre.</div>
            </div>
            {historyOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </button>

          {historyOpen ? (
            paymentsHistoryQuery.isLoading && !paymentsHistoryQuery.data ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={`payments-${index}`} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : payments.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Nenhum pagamento no periodo.
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Buscar por nome ou observacao" className="pl-10" />
                  </div>
                  <select value={historyEmployeeId} onChange={(event) => setHistoryEmployeeId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="all">Todos os funcionarios</option>
                    {employees.map((employee: any) => (
                      <option key={`history-${employee.employee_id}`} value={employee.employee_id}>
                        {employee.employee_name}
                      </option>
                    ))}
                  </select>
                  <select value={historyProofStatus} onChange={(event) => setHistoryProofStatus(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="all">Todos os comprovantes</option>
                    <option value="with_proof">Com comprovante</option>
                    <option value="without_proof">Sem comprovante</option>
                  </select>
                </div>

                {filteredPayments.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                    Nenhum pagamento combina com os filtros atuais.
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="pb-3">Funcionario</th>
                          <th className="pb-3">Semana</th>
                          <th className="pb-3">Pago em</th>
                          <th className="pb-3">Comprovante</th>
                          <th className="pb-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPayments.map((payment: any) => (
                          <tr key={payment.id} className="border-t border-border/60">
                            <td className="py-3">
                              <div className="font-medium">{payment.employee_name || payment.employee_id}</div>
                              <div className="text-xs text-muted-foreground">{payment.notes || "-"}</div>
                            </td>
                            <td className="py-3">{payment.week_reference}</td>
                            <td className="py-3">{formatDate(payment.paid_at)}</td>
                            <td className="py-3">
                              {payment.attachment_url ? (
                                <a href={payment.attachment_url} target="_blank" rel="noreferrer" className="text-primary underline">
                                  Abrir
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="py-3 text-right font-semibold">{money(payment.amount)}</td>
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
              Expanda para ver os comprovantes e os pagamentos do periodo.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
