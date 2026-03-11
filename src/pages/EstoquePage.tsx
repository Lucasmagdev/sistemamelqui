import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCcw, AlertTriangle } from "lucide-react";
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

const normalizeUnit = (value: string): "LB" | "KG" | "UN" => {
  const raw = String(value || "").toUpperCase();
  if (raw === "KG") return "KG";
  if (raw === "UN") return "UN";
  return "LB";
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
};

export default function EstoquePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [summary, setSummary] = useState<StockBalanceResponse["summary"] | null>(null);
  const [alerts, setAlerts] = useState<StockRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [loading, setLoading] = useState(false);

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

      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of balance.rows || []) {
          if (!next[row.product_id]) {
            next[row.product_id] = {
              stock_enabled: row.stock_enabled,
              stock_min: String(row.stock_min ?? 0),
              stock_unit: row.stock_unit,
              saving: false,
            };
          }
        }
        return next;
      });
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
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Produtos</p><p className="text-2xl font-bold">{totals.total_products}</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Controle Ativo</p><p className="text-2xl font-bold">{totals.stock_enabled_products}</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Estoque Baixo</p><p className="text-2xl font-bold text-red-400">{totals.low_stock_products}</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Vencimento em 7 dias</p><p className="text-2xl font-bold text-yellow-400">{totals.expiring_7d_products}</p></div>
      </div>

      {alerts.length > 0 ? (
        <div className="rounded-xl border border-red-500/50 bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-300"><AlertTriangle className="h-4 w-4" /> Alertas de estoque baixo</h2>
          <div className="space-y-2">
            {alerts.slice(0, 8).map((item) => (
              <div key={item.product_id} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                <span className="font-medium">{item.product_name}</span>
                <span className="text-red-300">Saldo {item.saldo_qty} {item.stock_unit} / Min {item.stock_min} {item.stock_unit}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3 text-left">Produto</th>
                <th className="px-3 py-3 text-left">Categoria</th>
                <th className="px-3 py-3 text-right">Saldo</th>
                <th className="px-3 py-3 text-right">Min</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Vence 7d</th>
                <th className="px-3 py-3 text-left">Ultima mov.</th>
                <th className="px-3 py-3 text-left">Configuracao</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.product_id] || {
                  stock_enabled: row.stock_enabled,
                  stock_min: String(row.stock_min ?? 0),
                  stock_unit: row.stock_unit,
                  saving: false,
                };

                return (
                  <tr key={row.product_id} className="border-b border-border last:border-0">
                    <td className="px-3 py-3 font-medium">{row.product_name}</td>
                    <td className="px-3 py-3 text-muted-foreground">{row.category || "-"}</td>
                    <td className="px-3 py-3 text-right">{row.saldo_qty.toFixed(3)} {row.stock_unit}</td>
                    <td className="px-3 py-3 text-right">{row.stock_min.toFixed(3)} {row.stock_unit}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${row.status === "low" ? "status-critical" : row.status === "ok" ? "status-ok" : "border-zinc-600 text-zinc-400"}`}>
                        {row.status === "low" ? "Baixo" : row.status === "ok" ? "OK" : "Desativado"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">{row.lots_expiring_7d}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(row.last_movement_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-[280px] items-center gap-2">
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={draft.stock_enabled} onChange={(e) => updateDraft(row.product_id, { stock_enabled: e.target.checked })} /> Controlar
                        </label>
                        <Input className="h-8 w-20" type="number" step="0.001" value={draft.stock_min} onChange={(e) => updateDraft(row.product_id, { stock_min: e.target.value })} />
                        <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={draft.stock_unit} onChange={(e) => updateDraft(row.product_id, { stock_unit: normalizeUnit(e.target.value) })}>
                          <option value="LB">LB</option>
                          <option value="KG">KG</option>
                          <option value="UN">UN</option>
                        </select>
                        <Button className="h-8" size="sm" onClick={() => saveProductSettings(row.product_id)} disabled={draft.saving}>{draft.saving ? "..." : "Salvar"}</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
