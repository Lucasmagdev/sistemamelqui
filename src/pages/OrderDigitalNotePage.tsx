import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { backendRequest } from "@/lib/backendClient";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type DigitalNotePayload = {
  orderId: number;
  orderCode: string;
  placedAt: string | null;
  status: number;
  paymentMethodLabel: string;
  deliveryAddress: string | null;
  client: {
    nome?: string | null;
    telefone?: string | null;
    email?: string | null;
    cidade?: string | null;
  } | null;
  branding: {
    nomeEmpresa?: string | null;
    logoUrl?: string | null;
    cnpj?: string | null;
    inscricaoEstadual?: string | null;
    endereco?: string | null;
  } | null;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    cutType?: string | null;
    notes?: string | null;
  }>;
  total: number;
};

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
};

const statusLabel = (status: number) => {
  switch (status) {
    case 1:
      return "Confirmado";
    case 2:
      return "Em preparacao";
    case 3:
      return "Pronto";
    case 4:
      return "Saiu para entrega";
    case 5:
      return "Concluido";
    case 6:
      return "Cancelado";
    default:
      return "Pedido recebido";
  }
};

export default function OrderDigitalNotePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { config } = useTenant();
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<DigitalNotePayload | null>(null);

  const code = useMemo(() => searchParams.get("codigo") || "", [searchParams]);

  useEffect(() => {
    const load = async () => {
      if (!id || !code) {
        setLoading(false);
        return;
      }

      try {
        const response = await backendRequest<{ ok: true; note: DigitalNotePayload }>(`/api/orders/public/digital-note/${id}?code=${encodeURIComponent(code)}`);
        setNote(response.note);
      } catch (error: any) {
        toast.error(error.message || "Nao foi possivel carregar a nota digital.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [code, id]);

  const companyName = note?.branding?.nomeEmpresa || config.nomeEmpresa;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#faf7ef_0%,#ffffff_38%,#f6f6f6_100%)] px-4 py-8 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-5xl space-y-6 print:max-w-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Nota digital</div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">Espelho do pedido</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Documento digital de conferencia com os dados do pedido, itens, pagamento e entrega.
            </p>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Voltar para a loja</Link>
            </Button>
          </div>
        </div>

        {!id || !code ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Link da nota digital invalido.</Card>
        ) : loading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Carregando nota digital...</Card>
        ) : !note ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Pedido nao encontrado para esta nota digital.</Card>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] print:rounded-none print:border-0 print:shadow-none">
            <div className="border-t-[3px] px-6 py-6 sm:px-8 print:px-6" style={{ borderTopColor: config.corPrimaria }}>
              <div className="grid gap-6 sm:grid-cols-[1.1fr_0.9fr]">
                <div className="flex gap-4">
                  {note.branding?.logoUrl ? (
                    <img
                      src={note.branding.logoUrl}
                      alt={companyName}
                      className="h-16 w-16 rounded-2xl border border-border/70 object-contain p-2"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/70 bg-muted/30 text-primary">
                      <FileText className="h-7 w-7" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="text-2xl font-extrabold tracking-tight text-foreground">{companyName}</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Espelho de pedido</div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {note.branding?.cnpj ? <div>CNPJ {note.branding.cnpj}</div> : null}
                      {note.branding?.inscricaoEstadual ? <div>IE {note.branding.inscricaoEstadual}</div> : null}
                      {note.branding?.endereco ? <div>{note.branding.endereco}</div> : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-left sm:text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Identificacao</div>
                  <div className="font-mono text-2xl font-extrabold text-foreground">{note.orderCode}</div>
                  <div className="font-mono text-sm text-muted-foreground">{formatDate(note.placedAt)}</div>
                  <div className="text-sm font-semibold text-foreground">{statusLabel(note.status)}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 border-t border-border/70 px-6 py-6 sm:grid-cols-2 sm:px-8 print:px-6">
              <div className="rounded-2xl border border-border/70 px-5 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Cliente</div>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  <div>{note.client?.nome || "Cliente nao identificado"}</div>
                  {note.client?.telefone ? <div className="text-muted-foreground">{note.client.telefone}</div> : null}
                  {note.client?.email ? <div className="text-muted-foreground">{note.client.email}</div> : null}
                  {note.client?.cidade ? <div className="text-muted-foreground">{note.client.cidade}</div> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 px-5 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Entrega</div>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  <div>{note.deliveryAddress || "Endereco nao informado"}</div>
                  <div className="text-muted-foreground">Pagamento: {note.paymentMethodLabel || "-"}</div>
                </div>
              </div>
            </div>

            <div className="border-t border-border/70 px-6 py-6 sm:px-8 print:px-6">
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/25">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Descricao</th>
                      <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">UN</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">QTD</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">VL. UNIT</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {note.items.map((item, index) => (
                      <tr key={item.id} className={index < note.items.length - 1 ? "border-t border-border/60" : ""}>
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-foreground">{item.name}</div>
                          {item.cutType || item.notes ? (
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              {[item.cutType ? `Tipo de corte: ${item.cutType}` : null, item.notes ? `Obs.: ${item.notes}` : null]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-center align-top text-foreground">{item.unit || "-"}</td>
                        <td className="px-4 py-4 text-right align-top font-mono text-foreground">
                          {Number(item.quantity || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-4 text-right align-top font-mono text-foreground">{money(item.unitPrice)}</td>
                        <td className="px-4 py-4 text-right align-top font-mono font-bold text-foreground">{money(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 border-t border-border/70 px-6 py-6 sm:grid-cols-[0.95fr_1.05fr] sm:px-8 print:px-6">
              <div className="rounded-2xl border border-border/70 px-5 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Documento digital</div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <div>Este espelho digital resume os dados do pedido para consulta e conferencia.</div>
                  <div>Documento sem valor fiscal.</div>
                  <div>Obrigado pela preferencia. Conserve os alimentos sob refrigeracao ou congelamento conforme a orientacao de preparo.</div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 px-5 py-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Metodo de pagamento</span>
                    <span className="font-semibold text-foreground">{note.paymentMethodLabel || "-"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Tributos informativos</span>
                    <span className="max-w-[320px] text-right text-xs text-muted-foreground">
                      Lei da Transparencia (Lei 12.741/2012): tributos nao calculados neste espelho de conferencia.
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-4 border-t border-border/70 pt-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Total geral</div>
                      <div className="mt-1 text-xs text-muted-foreground">Documento espelho de conferencia.</div>
                    </div>
                    <div className="font-mono text-3xl font-extrabold tracking-tight text-foreground">{money(note.total)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
