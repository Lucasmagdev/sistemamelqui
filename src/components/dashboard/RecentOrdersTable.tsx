import { type Pedido } from '@/data/mockData';

interface RecentOrdersTableProps {
  orders: Pedido[];
}

const statusClass = (status: Pedido['status']) => {
  if (status === 'concluido') return 'border-status-ok/30 bg-status-ok/15 text-status-ok';
  if (status === 'pendente') return 'border-status-warning/30 bg-status-warning/15 text-status-warning';
  return 'border-status-critical/30 bg-status-critical/15 text-status-critical';
};

const statusLabel = (status: Pedido['status']) => {
  if (status === 'concluido') return 'Concluído';
  if (status === 'pendente') return 'Pendente';
  return 'Cancelado';
};

export default function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  return (
    <section className="premium-glass rounded-2xl p-1">
      <div className="overflow-x-auto rounded-2xl">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-muted/45 text-left">
              <th className="rounded-tl-xl px-5 py-3 font-medium text-muted-foreground">Pedido</th>
              <th className="px-5 py-3 font-medium text-muted-foreground">Cliente</th>
              <th className="px-5 py-3 font-medium text-muted-foreground">Data</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">Valor</th>
              <th className="rounded-tr-xl px-5 py-3 text-center font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="group transition-colors hover:bg-primary/6">
                <td className="border-b border-border/70 px-5 py-4 font-mono text-xs font-semibold text-foreground">
                  {order.numero}
                </td>
                <td className="border-b border-border/70 px-5 py-4 text-foreground">{order.cliente}</td>
                <td className="border-b border-border/70 px-5 py-4 text-muted-foreground">
                  {new Date(order.data).toLocaleDateString('pt-BR')}
                </td>
                <td className="border-b border-border/70 px-5 py-4 text-right font-semibold text-foreground">
                  R$ {order.valorTotal.toLocaleString('pt-BR')}
                </td>
                <td className="border-b border-border/70 px-5 py-4 text-center">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${statusClass(order.status)}`}
                  >
                    {statusLabel(order.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
