import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { backendRequest } from "@/lib/backendClient";
import { readFileAsDataUrl } from "@/lib/fileToDataUrl";
import { supabase } from "@/lib/supabaseClient";
import { useAdminClientsQuery } from "@/hooks/useAdminQueries";
import { CalendarClock, CheckCircle2, Download, ImagePlus, LoaderCircle, Mail, MessageSquareText, Phone, RefreshCw, Star, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

type SortField = "nome" | "email" | "vip" | "pedidos";
type Segment = "all" | "vip" | "non_vip";
type CampaignCountry = "all" | "br" | "us";
type CampaignStep = 1 | 2;
type ScheduleMode = "now" | "schedule";

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
  cidade?: string | null;
  pais?: string | null;
  preferred_locale?: string | null;
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
  filters: {
    segment: Segment;
    search: string;
    withOrders: boolean;
    country: CampaignCountry;
    onlyWithPhone: boolean;
  };
  targetCount: number;
  audienceCount: number;
  excludedWithoutPhone: number;
  breakdown: {
    vipCount: number;
    nonVipCount: number;
    withOrdersCount: number;
    withoutOrdersCount: number;
    brCount: number;
    usCount: number;
    otherCount: number;
    topCities: Array<{ city: string; count: number }>;
  };
  sampleRecipients: Array<{
    id: string;
    nome: string;
    phone: string;
    country: string | null;
  }>;
  previewText: string;
  mediaType?: "text" | "image";
};

type CampaignSendResponse = {
  campaignId: number;
  status: string;
  targetCount: number;
  validCount: number;
  skippedCount: number;
  scheduledAt: string | null;
};

type CampaignStatusResponse = {
  campaign: {
    id: number;
    status: string;
    target_count: number;
    valid_count: number;
    skipped_count: number;
    sent_count: number;
    failed_count: number;
    progressPercent: number;
    processedCount: number;
    canRetryFailed: boolean;
    created_at: string;
    updated_at: string;
    metadata?: {
      schedule?: {
        mode?: ScheduleMode;
        scheduledAt?: string | null;
        nextRunAt?: string | null;
        windowStart?: string | null;
        windowEnd?: string | null;
      };
      progress?: {
        state?: string;
        processedCount?: number;
        totalCount?: number;
        startedAt?: string | null;
        finishedAt?: string | null;
        updatedAt?: string | null;
      };
      retryOfCampaignId?: number | null;
    };
  };
  recentRecipients: Array<{
    id: number;
    client_name: string | null;
    destination_phone: string | null;
    local_status: string;
    error_detail: string | null;
  }>;
  failedRecipients: Array<{
    id: number;
    client_name: string | null;
    destination_phone: string | null;
    local_status: string;
    error_detail: string | null;
  }>;
};

function enderecoCompleto(cliente: ClientRow) {
  return cliente.address || "-";
}

const ACTIVE_CAMPAIGN_STORAGE_KEY = "clients-admin-active-campaign-id";

function formatCampaignStatus(status: string) {
  switch (status) {
    case "queued":
      return "Na fila";
    case "scheduled":
      return "Agendada";
    case "sending":
      return "Enviando";
    case "completed":
      return "Concluida";
    case "completed_with_failures":
      return "Concluida com falhas";
    case "failed":
      return "Falhou";
    default:
      return "Rascunho";
  }
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
  const [campaignCountry, setCampaignCountry] = useState<CampaignCountry>("all");
  const [campaignOnlyWithPhone, setCampaignOnlyWithPhone] = useState(true);
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignStep, setCampaignStep] = useState<CampaignStep>(1);
  const [campaignPreview, setCampaignPreview] = useState<CampaignPreview | null>(null);
  const [campaignScheduleMode, setCampaignScheduleMode] = useState<ScheduleMode>("now");
  const [campaignScheduledAt, setCampaignScheduledAt] = useState("");
  const [campaignWindowEnabled, setCampaignWindowEnabled] = useState(false);
  const [campaignWindowStart, setCampaignWindowStart] = useState("09:00");
  const [campaignWindowEnd, setCampaignWindowEnd] = useState("18:00");
  const [campaignImageBase64, setCampaignImageBase64] = useState<string | null>(null);
  const [campaignImageFileName, setCampaignImageFileName] = useState("");
  const [campaignImageMimeType, setCampaignImageMimeType] = useState("");
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
    const parsed = Number(raw || "");
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, segment, withOrders, sortField, sortDir]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeCampaignId) {
      window.localStorage.setItem(ACTIVE_CAMPAIGN_STORAGE_KEY, String(activeCampaignId));
    } else {
      window.localStorage.removeItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
    }
  }, [activeCampaignId]);

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

  const buildCampaignPayload = () => ({
    segment: campaignSegment,
    search,
    withOrders,
    country: campaignCountry,
    onlyWithPhone: campaignOnlyWithPhone,
    message: campaignMessage,
    imageBase64: campaignImageBase64,
    imageFileName: campaignImageFileName || null,
    imageMimeType: campaignImageMimeType || null,
  });

  const handleCampaignImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      setCampaignImageBase64(null);
      setCampaignImageFileName("");
      setCampaignImageMimeType("");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(selectedFile);
      setCampaignImageBase64(dataUrl);
      setCampaignImageFileName(selectedFile.name);
      setCampaignImageMimeType(selectedFile.type || "image/jpeg");
    } catch (error: any) {
      toast.error(error.message || "Erro ao preparar imagem da campanha");
    } finally {
      event.target.value = "";
    }
  };

  const clearCampaignImage = () => {
    setCampaignImageBase64(null);
    setCampaignImageFileName("");
    setCampaignImageMimeType("");
  };

  const previewMutation = useMutation({
    mutationFn: () =>
      backendRequest<CampaignPreview>("/api/client-campaigns/preview", {
        method: "POST",
        body: JSON.stringify(buildCampaignPayload()),
      }),
    onSuccess: (payload) => {
      setCampaignPreview(payload);
      setCampaignStep(2);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao gerar previa da campanha");
    },
  });

  const campaignStatusQuery = useQuery({
    queryKey: ["admin", "client-campaign", activeCampaignId],
    enabled: Boolean(activeCampaignId),
    queryFn: () => backendRequest<CampaignStatusResponse>(`/api/client-campaigns/${activeCampaignId}`),
    refetchInterval: (query) => {
      const payload = query.state.data;
      const status = payload?.campaign?.status;
      if (status === "queued" || status === "scheduled" || status === "sending") return 2500;
      return false;
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      backendRequest<CampaignSendResponse>("/api/client-campaigns/send", {
        method: "POST",
        body: JSON.stringify({
          ...buildCampaignPayload(),
          schedule: {
            mode: campaignScheduleMode,
            scheduledAt: campaignScheduleMode === "schedule" ? campaignScheduledAt : null,
            windowStart: campaignWindowEnabled ? campaignWindowStart : null,
            windowEnd: campaignWindowEnabled ? campaignWindowEnd : null,
          },
          createdBy: window.localStorage.getItem("imperial-flow-nome") || "admin",
        }),
      }),
    onSuccess: (payload) => {
      setActiveCampaignId(payload.campaignId);
      queryClient.invalidateQueries({ queryKey: ["admin", "client-campaign", payload.campaignId] });
      toast.success(
        payload.status === "scheduled"
          ? "Campanha agendada com sucesso."
          : "Campanha colocada na fila de envio.",
      );
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao enviar campanha");
    },
  });

  const retryFailedMutation = useMutation({
    mutationFn: () => {
      if (!activeCampaignId) throw new Error("Nenhuma campanha ativa para reenviar.");
      return backendRequest<{ campaignId: number; retryCount: number; status: string }>(`/api/client-campaigns/${activeCampaignId}/retry-failed`, {
        method: "POST",
        body: JSON.stringify({
          createdBy: window.localStorage.getItem("imperial-flow-nome") || "admin",
        }),
      });
    },
    onSuccess: (payload) => {
      setActiveCampaignId(payload.campaignId);
      queryClient.invalidateQueries({ queryKey: ["admin", "client-campaign", payload.campaignId] });
      toast.success(`Reenvio iniciado para ${payload.retryCount} destinatario(s).`);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao reenviar falhas");
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
      { label: "VIPs", value: summary?.totalVips || 0, icon: <Star className="h-5 w-5 text-yellow-400" />, iconBg: "bg-yellow-500/15", accent: "text-yellow-400", context: "marcados como VIP" },
      { label: "Clientes", value: summary?.totalClients || 0, icon: <Phone className="h-5 w-5 text-violet-400" />, iconBg: "bg-violet-500/15", accent: "text-violet-400", context: "total na base" },
      { label: "Pedidos", value: summary?.totalOrders || 0, icon: <Mail className="h-5 w-5 text-blue-400" />, iconBg: "bg-blue-500/15", accent: "text-blue-400", context: "dos clientes filtrados" },
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

  useEffect(() => {
    setCampaignPreview(null);
  }, [campaignSegment, campaignCountry, campaignOnlyWithPhone, campaignMessage, campaignImageBase64, search, withOrders]);

  const currentCampaign = campaignStatusQuery.data?.campaign;
  const currentCampaignStatus = currentCampaign?.status || null;
  const isCampaignBusy = currentCampaignStatus === "queued" || currentCampaignStatus === "scheduled" || currentCampaignStatus === "sending";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card card-elevated p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                <p className={`text-3xl font-extrabold ${card.accent}`}>{isInitialLoading ? <span className="block h-8 w-16 animate-pulse rounded-md bg-muted" /> : card.value}</p>
              </div>
              <div className={`rounded-xl ${card.iconBg} p-3`}>{card.icon}</div>
            </div>
            <p className="text-xs text-muted-foreground">{card.context}</p>
          </div>
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

      <Card className="space-y-5 border-emerald-500/20 bg-[linear-gradient(160deg,rgba(12,29,21,0.92),rgba(10,10,10,0.98))] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Campanha para clientes</div>
            <h2 className="mt-2 text-2xl font-bold text-foreground">Fluxo guiado de WhatsApp</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Monte a audiencia, teste a mensagem e acompanhe o progresso em tempo real sem sair da aba de clientes.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            A campanha usa a busca atual da tela e o filtro visual <span className="font-semibold">com pedidos</span>.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {[
            { step: 1 as CampaignStep, label: "Publico e mensagem" },
            { step: 2 as CampaignStep, label: "Revisao e envio" },
          ].map((item) => (
            <button
              key={item.step}
              type="button"
              onClick={() => setCampaignStep(item.step)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                campaignStep === item.step
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/70 bg-background/40 hover:border-primary/20"
              }`}
            >
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Etapa {item.step}</div>
              <div className="mt-2 text-base font-semibold text-foreground">{item.label}</div>
            </button>
          ))}
        </div>

        {campaignStep === 1 ? (
          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Audiencia</label>
                  <select value={campaignSegment} onChange={(event) => setCampaignSegment(event.target.value as Segment)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="all">Todos os clientes</option>
                    <option value="vip">Somente VIP</option>
                    <option value="non_vip">Somente nao VIP</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Pais</label>
                  <select value={campaignCountry} onChange={(event) => setCampaignCountry(event.target.value as CampaignCountry)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="all">Brasil + EUA</option>
                    <option value="br">Somente Brasil</option>
                    <option value="us">Somente EUA</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm">
                  <input type="checkbox" checked={campaignOnlyWithPhone} onChange={(event) => setCampaignOnlyWithPhone(event.target.checked)} />
                  Apenas com telefone valido
                </label>
                <div className="rounded-md border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                  Busca reaproveitada: <span className="font-semibold text-foreground">{search || "sem termo"}</span>
                </div>
                <div className="rounded-md border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                  Filtro global: <span className="font-semibold text-foreground">{withOrders ? "Com pedidos" : "Todos os clientes"}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  Resumo rapido
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <div>Segmento: <span className="font-medium text-foreground">{campaignSegment === "vip" ? "VIP" : campaignSegment === "non_vip" ? "Nao VIP" : "Todos"}</span></div>
                  <div>Pais: <span className="font-medium text-foreground">{campaignCountry === "br" ? "Brasil" : campaignCountry === "us" ? "EUA" : "Brasil + EUA"}</span></div>
                  <div>Telefone: <span className="font-medium text-foreground">{campaignOnlyWithPhone ? "Somente validos" : "Com ou sem telefone"}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 bg-background/35 p-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Mensagem</label>
                <textarea
                  value={campaignMessage}
                  onChange={(event) => setCampaignMessage(event.target.value)}
                  className="min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm"
                  placeholder="Ex.: Oi, {nome}! Temos novidades para voce hoje."
                />
              </div>
              <div className="rounded-xl border border-border/60 bg-background/35 p-3 text-xs text-muted-foreground">
                Variavel disponivel agora: <code>{`{nome}`}</code>
              </div>
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/20 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Imagem opcional</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Se houver imagem, a legenda enviada sera o texto da mensagem acima.
                    </div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground transition hover:border-primary/40">
                    <ImagePlus className="h-4 w-4 text-primary" />
                    Selecionar imagem
                    <input type="file" accept="image/*" className="hidden" onChange={handleCampaignImageChange} />
                  </label>
                </div>
                {campaignImageBase64 ? (
                  <div className="mt-4 space-y-3">
                    <div className="overflow-hidden rounded-2xl border border-border/70 bg-black/30">
                      <img src={campaignImageBase64} alt={campaignImageFileName || "Imagem da campanha"} className="max-h-72 w-full object-contain" />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      <span>{campaignImageFileName || "Imagem pronta para envio"}</span>
                      <Button type="button" size="sm" variant="outline" onClick={clearCampaignImage}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Remover imagem
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {campaignStep === 2 ? (
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">Revisao da campanha</div>
                  <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending || !campaignMessage.trim()}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${previewMutation.isPending ? "animate-spin" : ""}`} />
                    {previewMutation.isPending ? "Atualizando..." : "Atualizar revisao"}
                  </Button>
                </div>

                {campaignPreview ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Card className="p-4">
                        <div className="text-xs text-muted-foreground">Destinatarios validos</div>
                        <div className="mt-2 text-2xl font-bold text-emerald-300">{campaignPreview.audienceCount}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="text-xs text-muted-foreground">Sem telefone</div>
                        <div className="mt-2 text-2xl font-bold text-amber-300">{campaignPreview.excludedWithoutPhone}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="text-xs text-muted-foreground">Total no publico</div>
                        <div className="mt-2 text-2xl font-bold text-sky-300">{campaignPreview.targetCount}</div>
                      </Card>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                        VIPs: <span className="font-semibold text-foreground">{campaignPreview.breakdown.vipCount}</span>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                        Nao VIP: <span className="font-semibold text-foreground">{campaignPreview.breakdown.nonVipCount}</span>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                        Brasil: <span className="font-semibold text-foreground">{campaignPreview.breakdown.brCount}</span>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                        EUA: <span className="font-semibold text-foreground">{campaignPreview.breakdown.usCount}</span>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-semibold text-foreground">Mensagem final</div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        {campaignImageBase64 ? (
                          <div className="space-y-3">
                            <img src={campaignImageBase64} alt={campaignImageFileName || "Preview da campanha"} className="max-h-80 w-full rounded-xl object-contain" />
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Tipo de envio: {campaignPreview.mediaType === "image" ? "Imagem + legenda" : "Imagem + legenda"}
                            </div>
                            <div className="text-sm whitespace-pre-wrap text-foreground">
                              {campaignPreview.previewText || campaignMessage}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm whitespace-pre-wrap text-foreground">
                            {campaignPreview.previewText || campaignMessage}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div>
                        <div className="mb-2 text-sm font-semibold text-foreground">Exemplos de destinatarios</div>
                        <div className="space-y-2">
                          {campaignPreview.sampleRecipients.map((recipient) => (
                            <div key={recipient.id} className="rounded-lg border border-border/60 p-3">
                              <div className="font-medium text-foreground">{recipient.nome}</div>
                              <div className="text-xs text-muted-foreground">{recipient.phone}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{recipient.country || "Sem pais"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
                    Gere a revisao para ver a contagem final, exemplos reais e a distribuicao da audiencia.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                <div className="text-sm font-semibold text-foreground">Janela de envio</div>
                <div className="mt-4 space-y-3">
                  <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <input type="radio" checked={campaignScheduleMode === "now"} onChange={() => setCampaignScheduleMode("now")} />
                    Enviar agora
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <input type="radio" checked={campaignScheduleMode === "schedule"} onChange={() => setCampaignScheduleMode("schedule")} />
                    Agendar
                  </label>
                  {campaignScheduleMode === "schedule" ? (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Data e hora</label>
                      <Input type="datetime-local" value={campaignScheduledAt} onChange={(event) => setCampaignScheduledAt(event.target.value)} />
                    </div>
                  ) : null}

                  <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <input type="checkbox" checked={campaignWindowEnabled} onChange={(event) => setCampaignWindowEnabled(event.target.checked)} />
                    Restringir horario de envio
                  </label>
                  {campaignWindowEnabled ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Inicio</label>
                        <Input type="time" value={campaignWindowStart} onChange={(event) => setCampaignWindowStart(event.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Fim</label>
                        <Input type="time" value={campaignWindowEnd} onChange={(event) => setCampaignWindowEnd(event.target.value)} />
                      </div>
                    </div>
                  ) : null}
                </div>

                <Button
                  onClick={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending || !campaignPreview || !campaignMessage.trim() || (campaignScheduleMode === "schedule" && !campaignScheduledAt)}
                  className="mt-5 w-full gold-gradient-bg text-accent-foreground font-semibold gold-shadow hover:opacity-90"
                >
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {sendMutation.isPending ? "Processando..." : campaignScheduleMode === "schedule" ? "Agendar campanha" : "Iniciar campanha"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Etapa atual: <span className="font-semibold text-foreground">{campaignStep}</span> de 2
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={campaignStep === 1}
              onClick={() => setCampaignStep(1)}
            >
              Voltar
            </Button>
            {campaignStep === 1 ? (
              <Button onClick={() => previewMutation.mutate()} disabled={!campaignMessage.trim() || previewMutation.isPending} className="gold-gradient-bg text-accent-foreground font-semibold">
                <MessageSquareText className="mr-2 h-4 w-4" />
                {previewMutation.isPending ? "Gerando revisao..." : "Ir para revisao"}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {activeCampaignId ? (
        <Card className="space-y-4 border-primary/20 bg-card/80 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-primary/80">Campanha ativa</div>
              <h3 className="mt-2 text-2xl font-bold text-foreground">
                {currentCampaign ? formatCampaignStatus(currentCampaign.status) : "Carregando status..."}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Acompanhe fila, agendamento, envio e falhas sem sair desta tela.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => campaignStatusQuery.refetch()} disabled={campaignStatusQuery.isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${campaignStatusQuery.isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button
                variant="outline"
                onClick={() => retryFailedMutation.mutate()}
                disabled={!currentCampaign?.canRetryFailed || retryFailedMutation.isPending || isCampaignBusy}
              >
                <LoaderCircle className={`mr-2 h-4 w-4 ${retryFailedMutation.isPending ? "animate-spin" : "hidden"}`} />
                Reenviar falhas
              </Button>
            </div>
          </div>

          {campaignStatusQuery.isLoading && !campaignStatusQuery.data ? (
            <Skeleton className="h-32 w-full rounded-2xl" />
          ) : currentCampaign ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="mt-2 text-2xl font-bold text-foreground">{currentCampaign.target_count}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Enviados</div>
                  <div className="mt-2 text-2xl font-bold text-emerald-300">{currentCampaign.sent_count}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Falhas</div>
                  <div className="mt-2 text-2xl font-bold text-amber-300">{currentCampaign.failed_count}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Pulados</div>
                  <div className="mt-2 text-2xl font-bold text-sky-300">{currentCampaign.skipped_count}</div>
                </Card>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-semibold text-foreground">{currentCampaign.progressPercent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#d4af37,#f6e27a)] transition-all" style={{ width: `${currentCampaign.progressPercent}%` }} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Processados: <span className="font-semibold text-foreground">{currentCampaign.processedCount}</span> de <span className="font-semibold text-foreground">{currentCampaign.target_count}</span>
                </div>
              </div>

              {currentCampaign.metadata?.schedule?.nextRunAt || currentCampaign.metadata?.schedule?.scheduledAt ? (
                <div className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm text-muted-foreground">
                  Proxima execucao:{" "}
                  <span className="font-semibold text-foreground">
                    {new Date(currentCampaign.metadata?.schedule?.nextRunAt || currentCampaign.metadata?.schedule?.scheduledAt || "").toLocaleString("pt-BR")}
                  </span>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Eventos recentes
                  </div>
                  <div className="space-y-2">
                    {(campaignStatusQuery.data?.recentRecipients || []).length ? campaignStatusQuery.data?.recentRecipients.map((recipient) => (
                      <div key={recipient.id} className="rounded-lg border border-border/60 p-3 text-sm">
                        <div className="font-medium text-foreground">{recipient.client_name || "Cliente"}</div>
                        <div className="text-xs text-muted-foreground">{recipient.destination_phone || "-"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Status: <span className="font-semibold text-foreground">{recipient.local_status}</span></div>
                      </div>
                    )) : (
                      <div className="rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">Sem eventos ainda.</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-foreground">Falhas recentes</div>
                  <div className="space-y-2">
                    {(campaignStatusQuery.data?.failedRecipients || []).length ? campaignStatusQuery.data?.failedRecipients.map((recipient) => (
                      <div key={recipient.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
                        <div className="font-medium text-foreground">{recipient.client_name || "Cliente"}</div>
                        <div className="text-xs text-muted-foreground">{recipient.destination_phone || "-"}</div>
                        <div className="mt-1 text-xs text-amber-200">{recipient.error_detail || "Falha sem detalhe do provedor."}</div>
                      </div>
                    )) : (
                      <div className="rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">Nenhuma falha listada.</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">Nao foi possivel carregar a campanha ativa.</div>
          )}
        </Card>
      ) : null}

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
                  <tr key={client.id} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
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
                      {client.vip ? <span className="inline-flex items-center rounded-full border border-yellow-500/20 bg-yellow-500/15 px-2.5 py-0.5 text-xs font-semibold text-yellow-400">VIP</span> : <span className="text-xs text-muted-foreground">Nao</span>}
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
                  {client.vip ? <span className="inline-flex items-center rounded-full border border-yellow-500/20 bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">VIP</span> : null}
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
            {modalPerfil.cliente.vip ? <span className="inline-flex items-center rounded-full border border-yellow-500/20 bg-yellow-500/15 px-2.5 py-0.5 text-xs font-semibold text-yellow-400">VIP</span> : null}
            {modalPerfil.cliente.vip_observacao ? <div className="text-xs text-muted-foreground">{modalPerfil.cliente.vip_observacao}</div> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
