import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Plus, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderList, Order } from "@/components/dashboard/OrderList";
import { useAdminDeliveryRouteCurrentQuery, useAdminOrdersQuery } from "@/hooks/useAdminQueries";
import { backendRequest } from "@/lib/backendClient";
import { toast } from "sonner";

const PAGE_SIZE = 10;

type ProductChip = {
  label: string;
};

type PedidoRow = Order & {
  fullAddress: string;
  data_pedido: string | null;
  products: ProductChip[];
};

type OrdersResponse = {
  rows: PedidoRow[];
  summary: {
    totalCount: number;
    openCount: number;
    concludedCount: number;
    totalValue: number;
  };
  cities: string[];
  pageInfo: {
    page: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
  };
};

type DeliveryRouteOrderAudit = {
  orderId: number;
  code?: string;
  clientName?: string;
  city?: string;
  assignedDriverName?: string | null;
  routeOrder: number;
  deliveryState: string;
  deliveredAt?: string | null;
  failureReason?: string | null;
};

type DeliveryRouteDriverAudit = {
  driverName: string;
  orderCount: number;
  deliveredCount: number;
  failedCount: number;
  orders: DeliveryRouteOrderAudit[];
};

type DeliveryRouteBatchResponse = {
  id: number;
  label: string;
  routeDate: string;
  publicLink: string;
  orderCount: number;
  unassignedCount: number;
  assignedCount: number;
  deliveredCount: number;
  failedCount: number;
  drivers: DeliveryRouteDriverAudit[];
  orders: DeliveryRouteOrderAudit[];
};

type DeliveryRouteAuditEvent = {
  id: number;
  event_type: string;
  driver_name?: string | null;
  event_at: string;
  order_id?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  payload?: Record<string, unknown> | null;
};

const getErrorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const statusLabel = (status: number) => {
  switch (status) {
    case 0:
      return "Pedido recebido";
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
    default:
      return "Desconhecido";
  }
};

const statusClass = (status: number) => {
  if (status === 5) return "status-ok";
  if (status <= 1) return "status-warning";
  return "status-critical";
};

const deliveryEventLabel = (eventType: string) => {
  switch (eventType) {
    case "batch_published":
      return "Rota publicada";
    case "assigned":
      return "Pedido assumido";
    case "reordered":
      return "Rota reordenada";
    case "delivered":
      return "Entrega concluida";
    case "failed":
      return "Falha registrada";
    default:
      return eventType;
  }
};

export default function PedidosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [city, setCity] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [routeLabel, setRouteLabel] = useState(`Rota ${new Date().toLocaleDateString("pt-BR")}`);
  const [routeNotes, setRouteNotes] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [start, end, search, status, city, onlyOpen]);

  const ordersQuery = useAdminOrdersQuery({
    start,
    end,
    search,
    status,
    city,
    onlyOpen,
    page,
    pageSize: PAGE_SIZE,
  });
  const deliveryRouteQuery = useAdminDeliveryRouteCurrentQuery() as {
    data?: { batch: DeliveryRouteBatchResponse | null; audit: DeliveryRouteAuditEvent[] };
    isLoading: boolean;
    isFetching: boolean;
  };

  const orders = useMemo(() => ((ordersQuery.data as OrdersResponse | undefined)?.rows || []), [ordersQuery.data]);
  const summary = (ordersQuery.data as OrdersResponse | undefined)?.summary;
  const pageInfo = (ordersQuery.data as OrdersResponse | undefined)?.pageInfo;
  const cities = (ordersQuery.data as OrdersResponse | undefined)?.cities || [];
  const openOrders = useMemo(() => orders.filter((order) => Number(order.status) < 5), [orders]);
  const isInitialLoading = ordersQuery.isLoading && !ordersQuery.data;
  const activeBatch = deliveryRouteQuery.data?.batch || null;
  const routeAudit = deliveryRouteQuery.data?.audit || [];

  const publishRouteMutation = useMutation({
    mutationFn: () =>
      backendRequest("/api/delivery-routes/admin/batches", {
        method: "POST",
        body: JSON.stringify({
          routeDate: new Date().toISOString().slice(0, 10),
          label: routeLabel.trim() || `Rota ${new Date().toLocaleDateString("pt-BR")}`,
          notes: routeNotes.trim(),
          start,
          end,
          search,
          status,
          city,
        }),
      }),
    onSuccess: async (payload: { batch?: { orderCount?: number } }) => {
      toast.success(`Rota publicada com ${payload?.batch?.orderCount || 0} pedido(s).`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "delivery-route-current"] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Erro ao publicar rota do dia."));
    },
  });

  const exportarCSV = () => {
    const header = ["Codigo", "Cliente", "Cidade", "Endereco", "Produtos", "Data", "Valor", "Status"];
    const rows = orders.map((order) => [
      order.code,
      order.clientName,
      order.city || "-",
      order.fullAddress || "-",
      order.products.map((product) => product.label).join(", "),
      order.data_pedido ? new Date(order.data_pedido).toLocaleDateString("pt-BR") : "-",
      Number(order.value || 0).toFixed(2),
      statusLabel(Number(order.status || 0)),
    ]);
    const csv = [header, ...rows].map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pedidos-admin.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const limparFiltros = () => {
    setStart("");
    setEnd("");
    setSearchInput("");
    setSearch("");
    setStatus("");
    setCity("");
    setOnlyOpen(false);
    setPage(1);
  };

  const cards = [
    { label: "Pedidos no filtro", value: summary?.totalCount || 0, accent: "text-foreground" },
    { label: "Em aberto", value: summary?.openCount || 0, accent: "text-amber-300" },
    { label: "Concluidos", value: summary?.concludedCount || 0, accent: "text-emerald-300" },
    { label: "Valor total", value: money(summary?.totalValue), accent: "text-yellow-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Resumo do periodo, filtros fortes e operacao dos pedidos em aberto.</p>
        </div>
        <Button onClick={() => navigate("/admin/pedidos/novo")} className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
          <Plus className="mr-2 h-4 w-4" /> Novo pedido
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-5">
            <div className="text-sm text-muted-foreground">{card.label}</div>
            {isInitialLoading ? <Skeleton className="mt-3 h-8 w-28" /> : <div className={`mt-3 text-3xl font-bold ${card.accent}`}>{card.value}</div>}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-yellow-400">
                <Route className="h-4 w-4" /> Rota do Dia
              </div>
              <h2 className="mt-2 text-xl font-bold text-foreground">Publicar link geral da entrega</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Publica a rota com os pedidos `Pronto` e `Saiu para entrega` dentro dos filtros atuais.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Titulo da rota</label>
              <Input value={routeLabel} onChange={(event) => setRouteLabel(event.target.value)} placeholder="Ex.: Rota sabado ilha" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Observacoes</label>
              <Input value={routeNotes} onChange={(event) => setRouteNotes(event.target.value)} placeholder="Regiao, cidade ou instrucoes internas" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => publishRouteMutation.mutate()} disabled={publishRouteMutation.isPending}>
              Publicar rota do dia
            </Button>
            {activeBatch?.publicLink ? (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(activeBatch.publicLink);
                    toast.success("Link da rota copiado.");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copiar link
                </Button>
                <Button variant="outline" onClick={() => window.open(activeBatch.publicLink, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Abrir rota
                </Button>
              </>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-foreground">Auditoria da rota ativa</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Quem assumiu, em que ordem, e quais entregas foram concluídas ou falharam.
              </p>
            </div>
            {deliveryRouteQuery.isFetching ? <span className="text-xs text-muted-foreground">Atualizando...</span> : null}
          </div>
          {!activeBatch ? (
            <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Nenhuma rota ativa publicada ainda.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-border/70 p-3">
                  <div className="text-xs text-muted-foreground">Pedidos</div>
                  <div className="mt-2 text-2xl font-bold text-foreground">{activeBatch.orderCount}</div>
                </div>
                <div className="rounded-xl border border-border/70 p-3">
                  <div className="text-xs text-muted-foreground">Atribuidos</div>
                  <div className="mt-2 text-2xl font-bold text-yellow-400">{activeBatch.assignedCount}</div>
                </div>
                <div className="rounded-xl border border-border/70 p-3">
                  <div className="text-xs text-muted-foreground">Entregues</div>
                  <div className="mt-2 text-2xl font-bold text-emerald-400">{activeBatch.deliveredCount}</div>
                </div>
                <div className="rounded-xl border border-border/70 p-3">
                  <div className="text-xs text-muted-foreground">Sem responsavel</div>
                  <div className="mt-2 text-2xl font-bold text-foreground">{activeBatch.unassignedCount}</div>
                </div>
              </div>
              <div className="space-y-3">
                {activeBatch.drivers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                    Aguardando entregadores assumirem pedidos.
                  </div>
                ) : activeBatch.drivers.map((driver) => (
                  <div key={driver.driverName} className="rounded-xl border border-border/70 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="font-semibold text-foreground">{driver.driverName}</div>
                      <div className="text-xs text-muted-foreground">
                        {driver.orderCount} pedidos • {driver.deliveredCount} entregues • {driver.failedCount} falhas
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {driver.orders.map((order) => (
                        <span key={`${driver.driverName}-${order.orderId}`} className="rounded-full border border-border/70 px-2.5 py-1 text-[11px]">
                          #{order.routeOrder} {order.code} {order.deliveryState === "delivered" ? "• entregue" : order.deliveryState === "failed" ? "• falha" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-xl border border-border/70 p-4">
                <div className="text-sm font-semibold text-foreground">Ultimos eventos</div>
                {routeAudit.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sem eventos ainda.</div>
                ) : routeAudit.slice(0, 8).map((event) => (
                  <div key={event.id} className="flex flex-col gap-1 border-t border-border/60 pt-2 text-sm first:border-t-0 first:pt-0">
                    <div className="font-medium text-foreground">
                      {deliveryEventLabel(event.event_type)}
                      {event.driver_name ? ` • ${event.driver_name}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {event.order_id ? `Pedido #${event.order_id} • ` : ""}
                      {new Date(event.event_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="sticky top-3 z-10 border-border/70 bg-card/95 p-4 backdrop-blur">
        <div className="grid gap-3 xl:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))]">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Buscar por cliente, telefone ou codigo</label>
            <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Ex.: IMP102, Joao, 319..." />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Inicio</label>
            <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Fim</label>
            <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Todos</option>
              <option value="0">Pedido recebido</option>
              <option value="1">Confirmado</option>
              <option value="2">Em preparacao</option>
              <option value="3">Pronto</option>
              <option value="4">Saiu para entrega</option>
              <option value="5">Concluido</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Cidade</label>
            <select value={city} onChange={(event) => setCity(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Todas</option>
              {cities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm">
              <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
              Somente em aberto
            </label>
            <Button variant="outline" onClick={exportarCSV}>
              <Download className="mr-2 h-4 w-4" /> Exportar
            </Button>
            <Button variant="ghost" onClick={limparFiltros}>Limpar</Button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{pageInfo?.totalItems || 0} pedido(s) encontrados</span>
          {ordersQuery.isFetching ? <span>Atualizando dados...</span> : null}
        </div>
      </Card>

      {openOrders.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Pedidos em aberto nesta visao</h2>
            <p className="text-sm text-muted-foreground">Atualize status rapido sem sair da pagina.</p>
          </div>
          <OrderList
            orders={openOrders}
            moeda="USD"
            unidadePeso="LB"
            onStatusChange={() => {
              queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
              queryClient.invalidateQueries({ queryKey: ["admin", "operational-report"] });
              queryClient.invalidateQueries({ queryKey: ["admin", "stock-products"] });
              queryClient.invalidateQueries({ queryKey: ["admin", "delivery-route-current"] });
            }}
          />
        </section>
      ) : null}

      <Card className="overflow-hidden border-border/70 bg-card p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Cidade</th>
                <th className="px-4 py-3">Endereco</th>
                <th className="px-4 py-3">Produtos</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`orders-skeleton-${index}`} className="border-t border-border/60">
                    {Array.from({ length: 8 }).map((__, cellIndex) => (
                      <td key={`orders-skeleton-${index}-${cellIndex}`} className="px-4 py-4">
                        <Skeleton className="h-5 w-full max-w-[140px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Nenhum pedido encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-t border-border/60 align-top">
                    <td className="px-4 py-4">
                      <div className="font-mono text-xs font-bold text-yellow-400">{order.code}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-foreground">{order.clientName}</div>
                      <div className="text-xs text-muted-foreground">{order.phone || "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{order.city || "-"}</td>
                    <td className="max-w-[280px] px-4 py-4 text-muted-foreground">{order.fullAddress || "-"}</td>
                    <td className="px-4 py-4">
                      <div className="flex max-w-[260px] flex-wrap gap-1.5">
                        {order.products.slice(0, 3).map((product) => (
                          <span key={`${order.id}-${product.label}`} className="rounded-full border border-border/70 bg-muted/30 px-2 py-1 text-[11px]">
                            {product.label}
                          </span>
                        ))}
                        {order.products.length > 3 ? (
                          <span className="rounded-full border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                            +{order.products.length - 3} item(ns)
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {order.data_pedido ? new Date(order.data_pedido).toLocaleString("pt-BR") : "-"}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-yellow-400">{money(order.value)}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClass(Number(order.status || 0))}`}>
                        {statusLabel(Number(order.status || 0))}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Pagina {pageInfo?.page || 1} de {pageInfo?.totalPages || 1}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={(pageInfo?.page || 1) <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            Anterior
          </Button>
          <Button variant="outline" disabled={!pageInfo?.hasNextPage} onClick={() => setPage((current) => current + 1)}>
            Proxima
          </Button>
        </div>
      </div>
    </div>
  );
}
