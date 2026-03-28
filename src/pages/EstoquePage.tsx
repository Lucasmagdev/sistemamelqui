import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCcw, AlertTriangle, Package, CheckSquare, TrendingDown, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { backendRequest } from "@/lib/backendClient";

type StockRow = {
  product_id: number;
  product_name: string;
  category: string;
  stock_enabled: boolean;
  stock_min: number;
  stock_unit: "LB" | "KG" | "UN";
  saldo_qty: number;
  low_stock: boolean;
  status: "ok" | "low" | "disabled";
  lots_expiring_7d: number;
  lots_expiring_30d: number;
  last_movement_at: string | null;
};

type StockBalanceResponse = {
  rows: StockRow[];
  summary: {
    total_products: number;
    stock_enabled_products: number;
    low_stock_products: number;
    expiring_7d_products: number;
  };
};

type StockAlertsResponse = {
  alerts: {
    current: StockRow[];
  };
};

type RowDraft = {
  stock_enabled: boolean;
  stock_min: string;
  stock_unit: "LB" | "KG" | "UN";
  saving: boolean;
};

type StatusFilter = "all" | "ok" | "low" | "disabled";
type FocusFilter = "all" | "low" | "expiring" | "disabled";
type SortKey = "name" | "saldo_desc" | "saldo_asc" | "movement_desc" | "expiring_desc";

const normalizeUnit = (value: string): "LB" | "KG" | "UN" => {
  const raw = String(value || "").toUpperCase();
  if (raw === "KG") return "KG";
  if (raw === "UN") return "UN";
  return "LB";
};

const normalizeSearchText = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
};

const isDraftDirty = (row: StockRow, draft: RowDraft) => {
  const draftMin = Number(draft.stock_min || 0);
  const currentMin = Number(row.stock_min || 0);
  return (
    draft.stock_enabled !== row.stock_enabled
    || normalizeUnit(draft.stock_unit) !== normalizeUnit(row.stock_unit)
    || Math.abs(draftMin - currentMin) > 0.0001
  );
};

export default function EstoquePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [summary, setSummary] = useState<StockBalanceResponse["summary"] | null>(null);
  const [alerts, setAlerts] = useState<StockRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [balance, alertsPayload] = await Promise.all([
        backendRequest<StockBalanceResponse>("/api/stock/balance"),
        backendRequest<StockAlertsResponse>("/api/stock/alerts"),
      ]);

      setRows(balance.rows || []);
      setSummary(balance.summary || null);
      setAlerts(alertsPayload.alerts?.current || []);
      setDrafts(
        Object.fromEntries(
          (balance.rows || []).map((row) => [
            row.product_id,
            {
              stock_enabled: row.stock_enabled,
              stock_min: String(row.stock_min ?? 0),
              stock_unit: row.stock_unit,
              saving: false,
            },
          ]),
        ),
      );
    } catch (error: any) {
      toast.error(error.message || "Erro ao carregar estoque");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(() => {
    if (summary) return summary;
    return {
      total_products: rows.length,
      stock_enabled_products: rows.filter((row) => row.stock_enabled).length,
      low_stock_products: rows.filter((row) => row.low_stock).length,
      expiring_7d_products: rows.filter((row) => row.lots_expiring_7d > 0).length,
    };
  }, [rows, summary]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => String(row.category || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeSearchText(searchTerm);
    const next = rows.filter((row) => {
      const matchesSearch = !normalizedSearch
        || normalizeSearchText(`${row.product_name} ${row.category || ""}`).includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const normalizedCategory = String(row.category || "").trim();
      const matchesCategory = categoryFilter === "all" || normalizedCategory === categoryFilter;
      const matchesFocus = focusFilter === "all"
        || (focusFilter === "low" && row.low_stock)
        || (focusFilter === "expiring" && row.lots_expiring_7d > 0)
        || (focusFilter === "disabled" && !row.stock_enabled);

      return matchesSearch && matchesStatus && matchesCategory && matchesFocus;
    });

    next.sort((left, right) => {
      if (sortKey === "saldo_desc") return right.saldo_qty - left.saldo_qty;
      if (sortKey === "saldo_asc") return left.saldo_qty - right.saldo_qty;
      if (sortKey === "expiring_desc") return right.lots_expiring_7d - left.lots_expiring_7d;
      if (sortKey === "movement_desc") {
        return (
          new Date(right.last_movement_at || 0).getTime()
          - new Date(left.last_movement_at || 0).getTime()
        );
      }

      return left.product_name.localeCompare(right.product_name, "pt-BR");
    });

    return next;
  }, [categoryFilter, focusFilter, rows, searchTerm, sortKey, statusFilter]);

  const filteredSummary = useMemo(
    () => ({
      total: filteredRows.length,
      enabled: filteredRows.filter((row) => row.stock_enabled).length,
      low: filteredRows.filter((row) => row.low_stock).length,
      expiring: filteredRows.filter((row) => row.lots_expiring_7d > 0).length,
    }),
    [filteredRows],
  );

  const hasActiveFilters = searchTerm.trim() || statusFilter !== "all" || focusFilter !== "all" || categoryFilter !== "all" || sortKey !== "name";

  const updateDraft = (id: number, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {
          stock_enabled: false,
          stock_min: "0",
          stock_unit: "LB",
          saving: false,
        }),
        ...patch,
      },
    }));
  };

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setFocusFilter("all");
    setCategoryFilter("all");
    setSortKey("name");
  };

  const saveProductSettings = async (id: number) => {
    const draft = drafts[id];
    if (!draft) return;

    updateDraft(id, { saving: true });
    try {
      await backendRequest(`/api/stock/products/${id}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          stock_enabled: draft.stock_enabled,
          stock_min: Number(draft.stock_min || 0),
          stock_unit: draft.stock_unit,
        }),
      });
      toast.success("Configuracao de estoque salva");
      await loadData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar configuracao");
    } finally {
      updateDraft(id, { saving: false });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estoque</h1>
          <p className="text-sm text-muted-foreground">Saldo real, alertas e configuracao por produto</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
          <Button onClick={() => navigate("/admin/lotes/novo")} className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
            <Plus className="mr-2 h-4 w-4" /> Novo Lote / Nota
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card card-elevated p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Produtos</p>
              <p className="text-3xl font-extrabold text-foreground">{loading ? <span className="block h-8 w-16 animate-pulse rounded-md bg-muted" /> : totals.total_products}</p>
            </div>
            <div className="rounded-xl bg-violet-500/15 p-3 text-violet-400"><Package className="h-5 w-5" /></div>
          </div>
          <p className="text-xs text-muted-foreground">cadastrados no sistema</p>
        </div>
        <div className="rounded-xl border border-border bg-card card-elevated p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Controle ativo</p>
              <p className="text-3xl font-extrabold text-foreground">{loading ? <span className="block h-8 w-16 animate-pulse rounded-md bg-muted" /> : totals.stock_enabled_products}</p>
            </div>
            <div className="rounded-xl bg-emerald-500/15 p-3 text-emerald-400"><CheckSquare className="h-5 w-5" /></div>
          </div>
          <p className="text-xs text-muted-foreground">com controle habilitado</p>
        </div>
        <div className="rounded-xl border border-border bg-card card-elevated p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estoque baixo</p>
              <p className="text-3xl font-extrabold text-red-400">{loading ? <span className="block h-8 w-16 animate-pulse rounded-md bg-muted" /> : totals.low_stock_products}</p>
            </div>
            <div className="rounded-xl bg-red-500/15 p-3 text-red-400"><TrendingDown className="h-5 w-5" /></div>
          </div>
          <p className="text-xs text-muted-foreground">abaixo do minimo</p>
        </div>
        <div className="rounded-xl border border-border bg-card card-elevated p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vencendo em 7 dias</p>
              <p className="text-3xl font-extrabold text-yellow-400">{loading ? <span className="block h-8 w-16 animate-pulse rounded-md bg-muted" /> : totals.expiring_7d_products}</p>
            </div>
            <div className="rounded-xl bg-yellow-500/15 p-3 text-yellow-400"><Clock className="h-5 w-5" /></div>
          </div>
          <p className="text-xs text-muted-foreground">lotes proximos do vencimento</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 card-elevated">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Buscar produto ou categoria</label>
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Ex.: picanha, aves, congelados"
            />
          </div>
          <div className="min-w-[180px] space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">Todos</option>
              <option value="ok">OK</option>
              <option value="low">Baixo</option>
              <option value="disabled">Desativado</option>
            </select>
          </div>
          <div className="min-w-[180px] space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Foco rapido</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={focusFilter}
              onChange={(event) => setFocusFilter(event.target.value as FocusFilter)}
            >
              <option value="all">Tudo</option>
              <option value="low">Somente estoque baixo</option>
              <option value="expiring">Somente vencendo em 7 dias</option>
              <option value="disabled">Somente desativados</option>
            </select>
          </div>
          <div className="min-w-[180px] space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Categoria</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">Todas</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Ordenar por</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="name">Nome do produto</option>
              <option value="saldo_desc">Maior saldo</option>
              <option value="saldo_asc">Menor saldo</option>
              <option value="movement_desc">Movimentacao mais recente</option>
              <option value="expiring_desc">Mais itens vencendo</option>
            </select>
          </div>
          <Button variant="outline" onClick={resetFilters} disabled={!hasActiveFilters}>
            Limpar filtros
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <button type="button" className={`rounded-full border px-3 py-1 ${focusFilter === "low" ? "border-red-500/70 bg-red-500/10 text-red-300" : "border-border text-muted-foreground"}`} onClick={() => setFocusFilter((current) => (current === "low" ? "all" : "low"))}>
            Baixo ({totals.low_stock_products})
          </button>
          <button type="button" className={`rounded-full border px-3 py-1 ${focusFilter === "expiring" ? "border-yellow-500/70 bg-yellow-500/10 text-yellow-300" : "border-border text-muted-foreground"}`} onClick={() => setFocusFilter((current) => (current === "expiring" ? "all" : "expiring"))}>
            Vencendo em 7 dias ({totals.expiring_7d_products})
          </button>
          <button type="button" className={`rounded-full border px-3 py-1 ${focusFilter === "disabled" ? "border-zinc-500/70 bg-zinc-500/10 text-zinc-200" : "border-border text-muted-foreground"}`} onClick={() => setFocusFilter((current) => (current === "disabled" ? "all" : "disabled"))}>
            Desativados ({rows.filter((row) => !row.stock_enabled).length})
          </button>
          <span className="ml-auto text-muted-foreground">
            Exibindo {filteredSummary.total} de {rows.length} produtos
          </span>
        </div>
      </div>

      {alerts.length > 0 ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-red-300">
              <AlertTriangle className="h-4 w-4" />
              Alertas de estoque baixo
              <span className="ml-1 inline-flex items-center rounded-full bg-red-500/20 border border-red-500/30 px-2 py-0.5 text-xs font-bold text-red-300">
                {alerts.length}
              </span>
            </h2>
            <Button variant="outline" size="sm" onClick={() => { setFocusFilter("low"); setStatusFilter("low"); }}>
              Ver somente alertas
            </Button>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 8).map((item) => (
              <div key={item.product_id} className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{item.product_name}</span>
                <span className="text-right text-xs font-medium text-red-300">
                  Saldo: {item.saldo_qty} {item.stock_unit} · Min: {item.stock_min} {item.stock_unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card card-elevated overflow-hidden">
        <div className="grid gap-3 border-b border-border bg-muted/20 px-4 py-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Produtos visiveis</p>
            <p className="font-semibold">{filteredSummary.total}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Controle ativo na visao</p>
            <p className="font-semibold">{filteredSummary.enabled}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Baixo na visao</p>
            <p className="font-semibold text-red-300">{filteredSummary.low}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Vencendo em 7 dias</p>
            <p className="font-semibold text-yellow-300">{filteredSummary.expiring}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Produto</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categoria</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldo</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vence 7d</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultima mov.</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configuracao</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const draft = drafts[row.product_id] || {
                  stock_enabled: row.stock_enabled,
                  stock_min: String(row.stock_min ?? 0),
                  stock_unit: row.stock_unit,
                  saving: false,
                };
                const dirty = isDraftDirty(row, draft);

                return (
                  <tr key={row.product_id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <p className="font-medium">{row.product_name}</p>
                        {dirty ? <p className="text-[11px] text-amber-300">Alteracoes pendentes</p> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{row.category || "-"}</td>
                    <td className="px-3 py-3 text-right">{row.saldo_qty.toFixed(3)} {row.stock_unit}</td>
                    <td className="px-3 py-3 text-right">{row.stock_min.toFixed(3)} {row.stock_unit}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                        row.status === "low"
                          ? "bg-red-500/15 text-red-400 border-red-500/20"
                          : row.status === "ok"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                            : "bg-zinc-500/15 text-zinc-400 border-zinc-500/20"
                      }`}>
                        {row.status === "low" ? "Baixo" : row.status === "ok" ? "OK" : "Desativado"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {row.lots_expiring_7d > 0 ? (
                        <span className="inline-flex items-center rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                          {row.lots_expiring_7d} lote{row.lots_expiring_7d > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(row.last_movement_at)}</td>
                    <td className="px-3 py-3">
                      <div className="min-w-[300px] space-y-2">
                        <label className="flex items-center gap-2 text-xs font-medium">
                          <input type="checkbox" checked={draft.stock_enabled} onChange={(e) => updateDraft(row.product_id, { stock_enabled: e.target.checked })} />
                          Controlar estoque deste produto
                        </label>
                        <div className="grid gap-2 sm:grid-cols-[92px_88px_auto]">
                          <Input className="h-8" type="number" step="0.001" value={draft.stock_min} onChange={(e) => updateDraft(row.product_id, { stock_min: e.target.value })} />
                          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={draft.stock_unit} onChange={(e) => updateDraft(row.product_id, { stock_unit: normalizeUnit(e.target.value) })}>
                            <option value="LB">LB</option>
                            <option value="KG">KG</option>
                            <option value="UN">UN</option>
                          </select>
                          <Button className="h-8" size="sm" onClick={() => saveProductSettings(row.product_id)} disabled={draft.saving || !dirty}>
                            {draft.saving ? "Salvando..." : dirty ? "Salvar ajustes" : "Sem alteracao"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Minimo e unidade base usados nos alertas de reposicao.</p>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum produto encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
