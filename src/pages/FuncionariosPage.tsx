import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { backendRequest } from "@/lib/backendClient";
import { readFileAsDataUrl } from "@/lib/fileToDataUrl";
import { useEmployeePaymentsHistoryQuery, useEmployeePaymentsSummaryQuery, useEmployeesQuery } from "@/hooks/useAdminQueries";

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function FuncionariosPage() {
  const queryClient = useQueryClient();
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [teamOpen, setTeamOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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

  const employeesQuery = useEmployeesQuery();
  const paymentsSummaryQuery = useEmployeePaymentsSummaryQuery({ start, end });
  const paymentsHistoryQuery = useEmployeePaymentsHistoryQuery({ start, end }, historyOpen);

  const employees = ((employeesQuery.data as any)?.employees || []) as any[];
  const payments = ((paymentsHistoryQuery.data as any)?.payments || []) as any[];
  const paymentsSummary = (paymentsSummaryQuery.data as any)?.summary || null;

  useEffect(() => {
    if (!paymentEmployeeId && employees[0]?.id) {
      setPaymentEmployeeId(String(employees[0].id));
    }
  }, [employees, paymentEmployeeId]);

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
      toast.success("Funcionario cadastrado");
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
      toast.success("Pagamento registrado");
      queryClient.invalidateQueries({ queryKey: ["admin", "employee-payments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "employee-payments-history"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "finance-overview"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao registrar pagamento");
    },
  });

  const toggleEmployeeMutation = useMutation({
    mutationFn: (employee: any) =>
      backendRequest(`/api/employees/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !employee.active }),
      }),
    onSuccess: () => {
      toast.success("Status do funcionario atualizado");
      queryClient.invalidateQueries({ queryKey: ["admin", "employees"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar funcionario");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funcionarios</h1>
          <p className="text-sm text-muted-foreground">Cadastro e pagamento rapido, com equipe e historico sob expansao.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="w-[170px]" />
          <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="w-[170px]" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Equipe cadastrada</div>
          {employeesQuery.isLoading && !employeesQuery.data ? <Skeleton className="mt-3 h-8 w-20" /> : <div className="mt-2 text-3xl font-bold text-primary">{employees.length}</div>}
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Pagamentos no periodo</div>
          {paymentsSummaryQuery.isLoading && !paymentsSummaryQuery.data ? <Skeleton className="mt-3 h-8 w-20" /> : <div className="mt-2 text-3xl font-bold text-emerald-400">{money(paymentsSummary?.total)}</div>}
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Registros no periodo</div>
          {paymentsSummaryQuery.isLoading && !paymentsSummaryQuery.data ? <Skeleton className="mt-3 h-8 w-20" /> : <div className="mt-2 text-3xl font-bold text-yellow-400">{paymentsSummary?.count || 0}</div>}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px,380px,1fr]">
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-foreground">Novo funcionario</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre a pessoa e mantenha a operacao da equipe atualizada.</p>
          <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); submitEmployeeMutation.mutate(); }}>
            <Input value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder="Nome completo" required />
            <Input value={employeePhone} onChange={(event) => setEmployeePhone(event.target.value)} placeholder="Telefone" />
            <Input value={employeeEmail} onChange={(event) => setEmployeeEmail(event.target.value)} placeholder="E-mail" />
            <Input value={employeeRole} onChange={(event) => setEmployeeRole(event.target.value)} placeholder="Funcao" />
            <textarea value={employeeNotes} onChange={(event) => setEmployeeNotes(event.target.value)} className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Observacoes" />
            <Button type="submit" className="w-full" disabled={submitEmployeeMutation.isPending}>
              {submitEmployeeMutation.isPending ? "Salvando..." : "Cadastrar funcionario"}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-foreground">Pagamento semanal</h2>
          <p className="mt-1 text-sm text-muted-foreground">Este registro alimenta o consolidado do financeiro automaticamente.</p>
          <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); submitPaymentMutation.mutate(); }}>
            <select value={paymentEmployeeId} onChange={(event) => setPaymentEmployeeId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={weekReference} onChange={(event) => setWeekReference(event.target.value)} required />
              <Input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Valor" required />
            </div>
            <Input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required />
            <Input type="file" accept="image/*,.pdf" onChange={(event) => setPaymentFile(event.target.files?.[0] || null)} />
            <textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Observacoes" />
            <Button type="submit" className="w-full" disabled={submitPaymentMutation.isPending || employees.length === 0}>
              {submitPaymentMutation.isPending ? "Salvando..." : "Registrar pagamento"}
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setTeamOpen((current) => !current)}>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Equipe</h2>
                <p className="text-sm text-muted-foreground">Lista de funcionarios ativa apenas quando esta area abrir.</p>
              </div>
              {teamOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
            </button>

            {teamOpen ? (
              employeesQuery.isLoading && !employeesQuery.data ? (
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={`employees-${index}`} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {employees.map((employee) => (
                    <div key={employee.id} className="rounded-xl border border-border/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">{employee.name}</div>
                          <div className="text-sm text-muted-foreground">{employee.role_title || "Sem funcao definida"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{employee.phone || employee.email || "-"}</div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => toggleEmployeeMutation.mutate(employee)} disabled={toggleEmployeeMutation.isPending}>
                          {employee.active ? "Inativar" : "Reativar"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Expanda para consultar a lista completa da equipe.
              </div>
            )}
          </Card>

          <Card className="p-5">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setHistoryOpen((current) => !current)}>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Historico de pagamentos</h2>
                <p className="text-sm text-muted-foreground">Os registros do periodo so carregam quando esta area abrir.</p>
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
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="pb-3">Funcionario</th>
                        <th className="pb-3">Semana</th>
                        <th className="pb-3">Comprovante</th>
                        <th className="pb-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment: any) => (
                        <tr key={payment.id} className="border-t border-border/60">
                          <td className="py-3">
                            <div className="font-medium">{payment.employee_name || payment.employee_id}</div>
                            <div className="text-xs text-muted-foreground">{payment.notes || "-"}</div>
                          </td>
                          <td className="py-3">{payment.week_reference}</td>
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
              )
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Expanda para ver os comprovantes e os pagamentos do periodo.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
