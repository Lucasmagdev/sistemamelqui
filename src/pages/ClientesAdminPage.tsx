import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { backendRequest } from "@/lib/backendClient";
import { supabase } from "@/lib/supabaseClient";
import { useAdminClientsQuery } from "@/hooks/useAdminQueries";
import { Download, Mail, MessageSquareText, Phone, Star } from "lucide-react";
import { toast } from "sonner";

type SortField = "nome" | "email" | "vip" | "pedidos";
type Segment = "all" | "vip" | "non_vip";

type ClientRow = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  vip: boolean;
  vip_observacao?: string | null;
  order_count: number;
  address: string;
};

type ClientsResponse = {
  rows: ClientRow[];
  summary: {
    totalClients: number;
    totalVips: number;
    totalOrders: number;
    matchingClients: number;
  };
  pageInfo: {
    page: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
  };
};

type CampaignPreview = {
  audienceCount: number;
  excludedWithoutPhone: number;
  sampleRecipients: Array<{
    id: string;
    nome: string;
    phone: string;
    previewText: string;
  }>;
  previewText: string;
};

function enderecoCompleto(cliente: ClientRow) {
  return cliente.address || "-";
}

export default function ClientesAdminPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [withOrders, setWithOrders] = useState(false);
  const [sortField, setSortField] = useState<SortField>("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [modalVIP, setModalVIP] = useState<{ open: boolean; cliente: ClientRow | null }>({ open: false, cliente: null });
  const [vipObservacao, setVipObservacao] = useState("");
  const [modalPerfil, setModalPerfil] = useState<{ open: boolean; cliente: ClientRow | null }>({ open: false, cliente: null });
  const [campaignSegment, setCampaignSegment] = useState<Segment>("all");
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignPreview, setCampaignPreview] = useState<CampaignPreview | null>(null);
  const [campaignPreviewOpen, setCampaignPreviewOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, segment, withOrders, sortField, sortDir]);

  const clientsQuery = useAdminClientsQuery({
    search,
    segment,
    withOrders,
    page,
    pageSize: 10,
    sortField,
    sortDir,
  });

  const clients = (clientsQuery.data as ClientsResponse | undefined)?.rows || [];
  const summary = (clientsQuery.data as ClientsResponse | undefined)?.summary;
  const pageInfo = (clientsQuery.data as ClientsResponse | undefined)?.pageInfo;
  const isInitialLoading = clientsQuery.isLoading && !clientsQuery.data;

  const previewMutation = useMutation({
    mutationFn: () =>
      backendRequest<CampaignPreview>("/api/client-campaigns/preview", {
        method: "POST",
        body: JSON.stringify({
          segment: campaignSegment,
          search,
          withOrders,
          message: campaignMessage,
        }),
      }),
    onSuccess: (payload) => {
      setCampaignPreview(payload);
      setCampaignPreviewOpen(true);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao gerar previa da campanha");
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      backendRequest("/api/client-campaigns/send", {
        method: "POST",
        body: JSON.stringify({
          segment: campaignSegment,
          search,
          withOrders,
          message: campaignMessage,
          createdBy: window.localStorage.getItem("imperial-flow-nome") || "admin",
        }),
      }),
    onSuccess: (payload: any) => {
      toast.success(`Campanha enviada: ${payload.sentCount} enviado(s), ${payload.failedCount} falha(s), ${payload.skippedCount} ignorado(s).`);
      setCampaignPreviewOpen(false);
      setCampaignPreview(null);
      setCampaignMessage("");
      setCampaignSegment("all");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao enviar campanha");
    },
  });

  const toggleVipMutation = useMutation({
    mutationFn: async () => {
      if (!modalVIP.cliente) throw new Error("Cliente invalido.");
      const { error } = await supabase
        .from("clients")
        .update({
          vip: !modalVIP.cliente.vip,
          vip_observacao: vipObservacao || null,
        })
        .eq("id", modalVIP.cliente.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "clients"] });
      toast.success("Status VIP atualizado");
      setModalVIP({ open: false, cliente: null });
      setVipObservacao("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar VIP");
    },
  });

  const exportarCSV = () => {
    const header = ["Nome", "Email", "Telefone", "VIP", "Pedidos"];
    const rows = clients.map((client) => [
      client.nome,
      client.email || "-",
      client.telefone || "-",
      client.vip ? "Sim" : "Nao",
      client.order_count,
    ]);
    const csv = [header, ...rows].map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "clientes-admin.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const cards = useMemo(
    () => [
      { label: "VIPs", value: summary?.totalVips || 0, icon: <Star className="h-6 w-6 text-yellow-400" />, accent: "text-yellow-400" },
      { label: "Clientes", value: summary?.totalClients || 0, icon: <Phone className="h-6 w-6 text-primary" />, accent: "text-primary" },
      { label: "Pedidos", value: summary?.totalOrders || 0, icon: <Mail className="h-6 w-6 text-zinc-300" />, accent: "text-zinc-100" },
    ],
    [summary],
  );

  const alternarOrdenacao = (field: SortField) => {
    if (sortField === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir("asc");
  };

  const limparFiltros = () => {
    setSearchInput("");
    setSearch("");
    setSegment("all");
    setWithOrders(false);
    setSortField("nome");
    setSortDir("asc");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {cards.map((card) => (
          <Card key={card.label} className="flex items-center gap-4 p-5">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5">{card.icon}</div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{card.label}</div>
              {isInitialLoading ? <Skeleton className="mt-2 h-8 w-16" /> : <div className={`text-3xl font-extrabold ${card.accent}`}>{card.value}</div>}
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground">Base do relacionamento, segmentacao VIP e campanhas por WhatsApp.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportarCSV}>
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
            <span className="self-center text-xs text-muted-foreground">{summary?.matchingClients || 0} cliente(s) no filtro</span>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Buscar cliente</label>
            <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nome, email, telefone ou documento" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Segmento</label>
            <select value={segment} onChange={(event) => setSegment(event.target.value as Segment)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="all">Todos</option>
              <option value="vip">Somente VIP</option>
              <option value="non_vip">Somente nao VIP</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Ordenar por</label>
            <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="nome">Nome</option>
              <option value="email">Email</option>
              <option value="vip">VIP</option>
              <option value="pedidos">Pedidos</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => setSortDir((current) => (current === "asc" ? "desc" : "asc"))}>
              Ordem: {sortDir === "asc" ? "Crescente" : "Decrescente"}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm">
              <input type="checkbox" checked={withOrders} onChange={(event) => setWithOrders(event.target.checked)} />
              Com pedidos
            </label>
            <Button variant="ghost" onClick={limparFiltros}>Limpar</Button>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 border-emerald-500/20 bg-[linear-gradient(160deg,rgba(12,29,21,0.9),rgba(10,10,10,0.98))] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Campanha para clientes</div>
            <h2 className="mt-2 text-2xl font-bold text-foreground">WhatsApp com previa antes do envio</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Escolha a audiencia, personalize com <code>{`{nome}`}</code> e confira a previa antes de disparar.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Filtros reaproveitados da tela: busca atual e opcao "com pedidos".
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[220px,1fr]">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Audiencia</label>
            <select value={campaignSegment} onChange={(event) => setCampaignSegment(event.target.value as Segment)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="all">Todos os clientes</option>
              <option value="vip">Somente VIP</option>
              <option value="non_vip">Somente nao VIP</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Mensagem</label>
            <textarea
              value={campaignMessage}
              onChange={(event) => setCampaignMessage(event.target.value)}
              className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm"
              placeholder="Ex.: Oi, {nome}! Temos novidades para voce hoje."
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending || !campaignMessage.trim()}>
            <MessageSquareText className="mr-2 h-4 w-4" />
            {previewMutation.isPending ? "Gerando previa..." : "Gerar previa"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Segmento da campanha independe do filtro visual da lista, mas usa a busca atual e o filtro "com pedidos".
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 cursor-pointer" onClick={() => alternarOrdenacao("nome")}>Nome</th>
                <th className="px-5 py-3 cursor-pointer" onClick={() => alternarOrdenacao("email")}>Email</th>
                <th className="px-5 py-3">Telefone</th>
                <th className="px-5 py-3">Endereco</th>
                <th className="px-5 py-3 cursor-pointer" onClick={() => alternarOrdenacao("vip")}>VIP</th>
                <th className="px-5 py-3 cursor-pointer" onClick={() => alternarOrdenacao("pedidos")}>Pedidos</th>
                <th className="px-5 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`clients-skeleton-${index}`} className="border-t border-border/50">
                    {Array.from({ length: 7 }).map((__, cellIndex) => (
                      <td key={`clients-skeleton-${index}-${cellIndex}`} className="px-5 py-4">
                        <Skeleton className="h-5 w-full max-w-[160px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id} className="border-t border-border/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 ring-1 ring-border/60">
                          <AvatarFallback>{String(client.nome || "?").split(" ").map((item) => item[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold text-foreground">{client.nome}</div>
                          {client.telefone ? <div className="text-xs text-muted-foreground">{client.telefone}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">{client.email || "-"}</td>
                    <td className="px-5 py-4">{client.telefone || "-"}</td>
                    <td className="px-5 py-4 max-w-[280px] text-muted-foreground">{enderecoCompleto(client)}</td>
                    <td className="px-5 py-4">
                      {client.vip ? <span className="inline-flex rounded-full bg-yellow-300 px-2.5 py-1 text-xs font-bold text-yellow-900">VIP</span> : <span className="text-xs text-muted-foreground">Nao</span>}
                      {client.vip_observacao ? <div className="mt-1 text-xs text-muted-foreground">{client.vip_observacao}</div> : null}
                    </td>
                    <td className="px-5 py-4 font-bold text-yellow-400">{client.order_count}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setModalPerfil({ open: true, cliente: client })}>
                          Ver perfil
                        </Button>
                        <Button
                          size="sm"
                          variant={client.vip ? "outline" : "default"}
                          className={client.vip ? "" : "bg-yellow-500 text-black hover:bg-yellow-400"}
                          onClick={() => {
                            setVipObservacao(client.vip_observacao || "");
                            setModalVIP({ open: true, cliente: client });
                          }}
                        >
                          {client.vip ? "Remover VIP" : "Marcar VIP"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {isInitialLoading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={`client-mobile-${index}`} className="h-28 w-full rounded-xl" />)
          ) : clients.length === 0 ? (
            <div className="rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            clients.map((client) => (
              <div key={`mobile-${client.id}`} className="rounded-xl border border-border/60 bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">{client.nome}</div>
                    <div className="text-xs text-muted-foreground">{client.email || "-"}</div>
                  </div>
                  {client.vip ? <span className="inline-flex rounded-full bg-yellow-300 px-2 py-1 text-[10px] font-bold text-yellow-900">VIP</span> : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-muted/20 p-2">
                    <p className="text-muted-foreground">Telefone</p>
                    <p className="mt-0.5 font-medium text-foreground">{client.telefone || "-"}</p>
                  </div>
                  <div className="rounded-md bg-muted/20 p-2">
                    <p className="text-muted-foreground">Pedidos</p>
                    <p className="mt-0.5 font-bold text-yellow-400">{client.order_count}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setModalPerfil({ open: true, cliente: client })}>
                    Ver perfil
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={client.vip ? "outline" : "default"}
                    onClick={() => {
                      setVipObservacao(client.vip_observacao || "");
                      setModalVIP({ open: true, cliente: client });
                    }}
                  >
                    {client.vip ? "Remover VIP" : "Marcar VIP"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Pagina {pageInfo?.page || 1} de {pageInfo?.totalPages || 1}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={(pageInfo?.page || 1) <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            Anterior
          </Button>
          <Button variant="outline" disabled={!pageInfo?.hasNextPage} onClick={() => setPage((current) => current + 1)}>
            Proxima
          </Button>
        </div>
      </div>

      <Modal open={modalVIP.open} onClose={() => setModalVIP({ open: false, cliente: null })} title={modalVIP.cliente?.vip ? "Remover VIP" : "Marcar VIP"}>
        <div className="space-y-4">
          <label className="text-sm font-semibold text-foreground">Observacao para status VIP</label>
          <textarea
            value={vipObservacao}
            onChange={(event) => setVipObservacao(event.target.value)}
            className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Justifique o status VIP..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalVIP({ open: false, cliente: null })}>Cancelar</Button>
            <Button onClick={() => toggleVipMutation.mutate()} disabled={toggleVipMutation.isPending}>
              {toggleVipMutation.isPending ? "Salvando..." : modalVIP.cliente?.vip ? "Remover VIP" : "Marcar VIP"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={modalPerfil.open} onClose={() => setModalPerfil({ open: false, cliente: null })} title={modalPerfil.cliente?.nome || "Perfil do cliente"}>
        {modalPerfil.cliente ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback>{String(modalPerfil.cliente.nome || "?").split(" ").map((item) => item[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-bold text-lg text-foreground">{modalPerfil.cliente.nome}</div>
                <div className="text-xs text-muted-foreground">{modalPerfil.cliente.email || "-"}</div>
              </div>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div>Telefone: {modalPerfil.cliente.telefone || "-"}</div>
              <div>Endereco: {enderecoCompleto(modalPerfil.cliente)}</div>
              <div>Pedidos: <span className="font-semibold text-primary">{modalPerfil.cliente.order_count}</span></div>
            </div>
            {modalPerfil.cliente.vip ? <span className="inline-flex rounded-full bg-yellow-300 px-2.5 py-1 text-xs font-bold text-yellow-900">VIP</span> : null}
            {modalPerfil.cliente.vip_observacao ? <div className="text-xs text-muted-foreground">{modalPerfil.cliente.vip_observacao}</div> : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={campaignPreviewOpen} onClose={() => setCampaignPreviewOpen(false)} title="Confirmar campanha do WhatsApp">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Destinatarios validos</div>
              <div className="mt-2 text-2xl font-bold text-emerald-300">{campaignPreview?.audienceCount || 0}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Sem telefone</div>
              <div className="mt-2 text-2xl font-bold text-amber-300">{campaignPreview?.excludedWithoutPhone || 0}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Segmento</div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {campaignSegment === "vip" ? "Somente VIP" : campaignSegment === "non_vip" ? "Somente nao VIP" : "Todos"}
              </div>
            </Card>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-foreground">Texto final</div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm whitespace-pre-wrap">
              {campaignPreview?.previewText || campaignMessage}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-foreground">Exemplos de destinatarios</div>
            <div className="space-y-2">
              {(campaignPreview?.sampleRecipients || []).map((recipient) => (
                <div key={recipient.id} className="rounded-lg border border-border/60 p-3">
                  <div className="font-medium text-foreground">{recipient.nome}</div>
                  <div className="text-xs text-muted-foreground">{recipient.phone}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCampaignPreviewOpen(false)}>Cancelar</Button>
            <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? "Enviando..." : "Confirmar envio"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
