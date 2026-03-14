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

export default function FuncionariosPage() {
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [loading, setLoading] = useState(true);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [employeeName, setEmployeeName] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeRole, setEmployeeRole] = useState('');
  const [employeeNotes, setEmployeeNotes] = useState('');
  const [paymentEmployeeId, setPaymentEmployeeId] = useState('');
  const [weekReference, setWeekReference] = useState(today);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentFile, setPaymentFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [employeesPayload, paymentsPayload] = await Promise.all([
        backendRequest<{ employees: any[] }>('/api/employees'),
        backendRequest<{ payments: any[] }>('/api/employee-payments?start=' + start + '&end=' + end),
      ]);
      setEmployees(employeesPayload.employees || []);
      setPayments(paymentsPayload.payments || []);
      if (!paymentEmployeeId && employeesPayload.employees?.[0]?.id) {
        setPaymentEmployeeId(String(employeesPayload.employees[0].id));
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar funcionarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [start, end]);

  const submitEmployee = async (event: any) => {
    event.preventDefault();
    setSavingEmployee(true);
    try {
      await backendRequest('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          name: employeeName,
          phone: employeePhone || null,
          email: employeeEmail || null,
          roleTitle: employeeRole || null,
          notes: employeeNotes || null,
        }),
      });
      setEmployeeName('');
      setEmployeePhone('');
      setEmployeeEmail('');
      setEmployeeRole('');
      setEmployeeNotes('');
      toast.success('Funcionario cadastrado');
      load();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao cadastrar funcionario');
    } finally {
      setSavingEmployee(false);
    }
  };

  const submitPayment = async (event: any) => {
    event.preventDefault();
    setSavingPayment(true);
    try {
      const attachmentBase64 = paymentFile ? await readFileAsDataUrl(paymentFile) : null;
      await backendRequest('/api/employee-payments', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: paymentEmployeeId,
          weekReference,
          amount: paymentAmount,
          paidAt: new Date(paidAt).toISOString(),
          notes: paymentNotes || null,
          attachmentBase64,
          attachmentName: paymentFile?.name || null,
          attachmentMimeType: paymentFile?.type || null,
          createdBy: window.localStorage.getItem('imperial-flow-nome') || 'admin',
        }),
      });
      setWeekReference(today);
      setPaymentAmount('');
      setPaidAt(new Date().toISOString().slice(0, 16));
      setPaymentNotes('');
      setPaymentFile(null);
      toast.success('Pagamento registrado');
      load();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao registrar pagamento');
    } finally {
      setSavingPayment(false);
    }
  };

  const toggleEmployee = async (employee: any) => {
    try {
      await backendRequest('/api/employees/' + employee.id, {
        method: 'PATCH',
        body: JSON.stringify({ active: !employee.active }),
      });
      toast.success('Status do funcionario atualizado');
      load();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar funcionario');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funcionarios</h1>
          <p className="text-sm text-muted-foreground">Cadastro, historico semanal e comprovantes de pagamento</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-[170px]" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-[170px]" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px,380px,1fr]">
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-foreground">Novo funcionario</h2>
          <form className="mt-4 space-y-3" onSubmit={submitEmployee}>
            <Input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Nome completo" required />
            <Input value={employeePhone} onChange={(e) => setEmployeePhone(e.target.value)} placeholder="Telefone" />
            <Input value={employeeEmail} onChange={(e) => setEmployeeEmail(e.target.value)} placeholder="E-mail" />
            <Input value={employeeRole} onChange={(e) => setEmployeeRole(e.target.value)} placeholder="Funcao" />
            <textarea
              value={employeeNotes}
              onChange={(e) => setEmployeeNotes(e.target.value)}
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Observacoes"
            />
            <Button type="submit" className="w-full" disabled={savingEmployee}>
              {savingEmployee ? 'Salvando...' : 'Cadastrar funcionario'}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-foreground">Pagamento semanal</h2>
          <form className="mt-4 space-y-3" onSubmit={submitPayment}>
            <select
              value={paymentEmployeeId}
              onChange={(e) => setPaymentEmployeeId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            >
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={weekReference} onChange={(e) => setWeekReference(e.target.value)} required />
              <Input value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Valor" required />
            </div>
            <Input type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
            <Input type="file" accept="image/*,.pdf" onChange={(e) => setPaymentFile(e.target.files?.[0] || null)} />
            <textarea
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Observacoes"
            />
            <Button type="submit" className="w-full" disabled={savingPayment || employees.length === 0}>
              {savingPayment ? 'Salvando...' : 'Registrar pagamento'}
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Equipe</h2>
              <span className="text-xs text-muted-foreground">{employees.length} cadastrados</span>
            </div>
            {loading ? (
              <div className="mt-4 text-sm text-muted-foreground">Carregando...</div>
            ) : (
              <div className="mt-4 space-y-3">
                {employees.map((employee) => (
                  <div key={employee.id} className="rounded-xl border border-border/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">{employee.name}</div>
                        <div className="text-sm text-muted-foreground">{employee.role_title || 'Sem funcao definida'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{employee.phone || employee.email || '-'}</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => toggleEmployee(employee)}>
                        {employee.active ? 'Inativar' : 'Reativar'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Historico de pagamentos</h2>
              <span className="text-xs text-muted-foreground">{payments.length} registros</span>
            </div>
            {loading ? (
              <div className="mt-4 text-sm text-muted-foreground">Carregando...</div>
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
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-t border-border/60">
                        <td className="py-3">
                          <div className="font-medium">{payment.employee_name || payment.employee_id}</div>
                          <div className="text-xs text-muted-foreground">{payment.notes || '-'}</div>
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
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
