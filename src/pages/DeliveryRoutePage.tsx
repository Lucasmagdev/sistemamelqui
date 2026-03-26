import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, MapPin, PackageCheck, RefreshCcw, TriangleAlert } from "lucide-react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { backendRequest } from "@/lib/backendClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type RouteOrder = {
  id: number;
  orderId: number;
  code?: string;
  clientName?: string;
  phone?: string;
  city?: string;
  fullAddress?: string;
  productsPreview?: string;
  routeOrder: number;
  assignedDriverName: string | null;
  deliveryState: string;
  deliveredAt?: string | null;
  failureReason?: string | null;
};

type RouteBatch = {
  id: number;
  label: string;
  routeDate: string;
  publicLink: string;
  orderCount: number;
  unassignedCount: number;
  assignedCount: number;
  deliveredCount: number;
  failedCount: number;
  orders: RouteOrder[];
};

type RouteResponse = {
  batch: RouteBatch | null;
};

const DRIVER_STORAGE_KEY = "delivery-route-driver-name";
const getErrorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const getPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este aparelho nao suporta geolocalizacao."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      reject(new Error(error.message || "Nao foi possivel obter a localizacao."));
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });

const queryKeyForToken = (token: string) => ["delivery-route-public", token];

export default function DeliveryRoutePage() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [driverName, setDriverName] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [failureReason, setFailureReason] = useState<Record<number, string>>({});

  useEffect(() => {
    setDriverName(window.localStorage.getItem(DRIVER_STORAGE_KEY) || "");
  }, []);

  const routeQuery = useQuery<RouteResponse>({
    queryKey: queryKeyForToken(token),
    queryFn: () => backendRequest(`/api/delivery-routes/public/${token}`),
    enabled: Boolean(token),
    refetchInterval: 30_000,
  });

  const batch = routeQuery.data?.batch || null;
  const orders = useMemo(() => batch?.orders ?? [], [batch?.orders]);
  const unassignedOrders = useMemo(() => orders.filter((order) => !order.assignedDriverName), [orders]);
  const myOrders = useMemo(
    () => orders.filter((order) => order.assignedDriverName === driverName).sort((a, b) => a.routeOrder - b.routeOrder),
    [orders, driverName],
  );

  const persistDriverName = () => {
    const normalized = driverName.trim();
    if (!normalized) {
      toast.error("Informe seu nome para usar a rota.");
      return false;
    }
    window.localStorage.setItem(DRIVER_STORAGE_KEY, normalized);
    setDriverName(normalized);
    return true;
  };

  const refreshRoute = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeyForToken(token) });
  };

  const claimMutation = useMutation({
    mutationFn: async (orderIds: number[]) => {
      const normalized = driverName.trim();
      const response = await backendRequest(`/api/delivery-routes/public/${token}/claim`, {
        method: "POST",
        body: JSON.stringify({ driverName: normalized, orderIds }),
      });
      return response as { claimedCount: number; conflicts?: Array<{ assignedDriverName?: string | null }> };
    },
    onSuccess: async (payload) => {
      if (payload.conflicts?.length) {
        toast.warning(`Alguns pedidos nao puderam ser assumidos. Atualizando a rota.`);
      } else {
        toast.success(`${payload.claimedCount} pedido(s) assumido(s).`);
      }
      setSelectedOrderIds([]);
      await refreshRoute();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Erro ao assumir pedidos."));
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (nextOrderIds: number[]) =>
      backendRequest(`/api/delivery-routes/public/${token}/reorder`, {
        method: "POST",
        body: JSON.stringify({
          driverName: driverName.trim(),
          items: nextOrderIds.map((orderId, index) => ({ orderId, routeOrder: index + 1 })),
        }),
      }),
    onSuccess: async () => {
      await refreshRoute();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Erro ao reordenar rota."));
    },
  });

  const deliverMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const position = await getPosition();
      return backendRequest(`/api/delivery-routes/public/${token}/orders/${orderId}/deliver`, {
        method: "POST",
        body: JSON.stringify({
          driverName: driverName.trim(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      });
    },
    onSuccess: async () => {
      toast.success("Entrega registrada com localizacao.");
      await refreshRoute();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Erro ao concluir entrega."));
    },
  });

  const failureMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: number; reason: string }) => {
      let latitude = null;
      let longitude = null;
      try {
        const position = await getPosition();
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch {
        // Falha pode ser registrada mesmo sem localizacao, mas fica auditada.
      }

      return backendRequest(`/api/delivery-routes/public/${token}/orders/${orderId}/failure`, {
        method: "POST",
        body: JSON.stringify({
          driverName: driverName.trim(),
          reason,
          latitude,
          longitude,
        }),
      });
    },
    onSuccess: async (_payload, variables) => {
      toast.success("Falha registrada.");
      setFailureReason((current) => ({ ...current, [variables.orderId]: "" }));
      await refreshRoute();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Erro ao registrar falha."));
    },
  });

  const toggleSelection = (orderId: number) => {
    setSelectedOrderIds((current) => (
      current.includes(orderId)
        ? current.filter((value) => value !== orderId)
        : [...current, orderId]
    ));
  };

  const moveOrder = async (orderId: number, direction: -1 | 1) => {
    const currentIndex = myOrders.findIndex((order) => order.orderId === orderId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= myOrders.length) return;

    const nextOrderIds = [...myOrders.map((order) => order.orderId)];
    const [moved] = nextOrderIds.splice(currentIndex, 1);
    nextOrderIds.splice(targetIndex, 0, moved);
    await reorderMutation.mutateAsync(nextOrderIds);
  };

  const openNavigation = (order: RouteOrder) => {
    const destination = encodeURIComponent(`${order.fullAddress || ""} ${order.city || ""}`.trim());
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, "_blank", "noopener,noreferrer");
  };

  const isBusy = claimMutation.isPending || reorderMutation.isPending || deliverMutation.isPending || failureMutation.isPending;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#4b556320,transparent_38%),linear-gradient(180deg,#111827,#030712)] p-4 text-white md:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card className="border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-emerald-300/80">Rota do dia</div>
              <h1 className="mt-2 text-3xl font-black text-white">{batch?.label || "Carregando rota..."}</h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-300">
                Link geral sem login. Assuma seus pedidos, reorganize sua rota e conclua cada entrega com geolocalizacao.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-zinc-300 md:grid-cols-4">
              <div><strong>{batch?.orderCount || 0}</strong> pedidos</div>
              <div><strong>{batch?.assignedCount || 0}</strong> atribuidos</div>
              <div><strong>{batch?.deliveredCount || 0}</strong> entregues</div>
              <div><strong>{batch?.failedCount || 0}</strong> falhas</div>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 lg:flex-row">
            <Input
              value={driverName}
              onChange={(event) => setDriverName(event.target.value)}
              placeholder="Seu nome para assumir a rota"
              className="border-white/10 bg-black/30 text-white"
            />
            <Button type="button" onClick={persistDriverName} disabled={isBusy}>Salvar nome</Button>
            <Button type="button" variant="outline" onClick={() => void refreshRoute()} disabled={routeQuery.isFetching}>
              <RefreshCcw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
          </div>
        </Card>

        {routeQuery.isLoading ? (
          <Card className="border-white/10 bg-white/5 p-6 text-zinc-300">Carregando rota...</Card>
        ) : routeQuery.isError ? (
          <Card className="border-red-500/30 bg-red-500/10 p-6 text-red-100">
            {getErrorMessage(routeQuery.error, "Erro ao carregar rota.")}
          </Card>
        ) : !batch ? (
          <Card className="border-white/10 bg-white/5 p-6 text-zinc-300">Nenhuma rota publicada para este link.</Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Pedidos disponiveis</h2>
                  <p className="text-sm text-zinc-400">Assuma somente o que voce vai entregar.</p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    if (!persistDriverName()) return;
                    void claimMutation.mutate(selectedOrderIds);
                  }}
                  disabled={!selectedOrderIds.length || isBusy}
                >
                  <PackageCheck className="mr-2 h-4 w-4" /> Assumir selecionados
                </Button>
              </div>
              <div className="mt-4 space-y-3">
                {unassignedOrders.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                    Nenhum pedido disponivel no momento. Atualize se outro entregador devolver pedidos.
                  </div>
                ) : unassignedOrders.map((order) => (
                  <label key={order.orderId} className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.includes(order.orderId)}
                      onChange={() => toggleSelection(order.orderId)}
                      className="mt-1 h-4 w-4 accent-emerald-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-emerald-300">{order.code}</div>
                        <div className="text-xs text-zinc-500">{order.city || "-"}</div>
                      </div>
                      <div className="mt-1 text-base font-semibold">{order.clientName || "Cliente"}</div>
                      <div className="text-sm text-zinc-400">{order.fullAddress || "-"}</div>
                      {order.productsPreview ? <div className="mt-2 text-xs text-zinc-500">{order.productsPreview}</div> : null}
                    </div>
                  </label>
                ))}
              </div>
            </Card>

            <Card className="border-white/10 bg-white/5 p-5">
              <div>
                <h2 className="text-xl font-bold">Minha rota</h2>
                <p className="text-sm text-zinc-400">Reordene, abra no mapa e finalize com geolocalizacao.</p>
              </div>
              <div className="mt-4 space-y-4">
                {myOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-zinc-400">
                    Salve seu nome e assuma pedidos para montar sua rota.
                  </div>
                ) : myOrders.map((order, index) => (
                  <div key={order.orderId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Parada {index + 1}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-semibold text-emerald-300">{order.code}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${order.deliveryState === "delivered" ? "bg-emerald-500/20 text-emerald-200" : order.deliveryState === "failed" ? "bg-red-500/20 text-red-200" : "bg-amber-500/20 text-amber-200"}`}>
                            {order.deliveryState === "delivered" ? "Entregue" : order.deliveryState === "failed" ? "Falha" : "Em rota"}
                          </span>
                        </div>
                        <div className="mt-2 text-lg font-semibold">{order.clientName || "Cliente"}</div>
                        <div className="text-sm text-zinc-400">{order.fullAddress || "-"}</div>
                        {order.productsPreview ? <div className="mt-2 text-xs text-zinc-500">{order.productsPreview}</div> : null}
                        {order.failureReason ? (
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-200">
                            <TriangleAlert className="h-3.5 w-3.5" /> {order.failureReason}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="icon" onClick={() => void moveOrder(order.orderId, -1)} disabled={index === 0 || isBusy}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon" onClick={() => void moveOrder(order.orderId, 1)} disabled={index === myOrders.length - 1 || isBusy}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" onClick={() => openNavigation(order)}>
                          <MapPin className="mr-2 h-4 w-4" /> Mapa
                        </Button>
                        <Button type="button" onClick={() => {
                          if (!persistDriverName()) return;
                          void deliverMutation.mutate(order.orderId);
                        }} disabled={order.deliveryState === "delivered" || isBusy}>
                          Concluir
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                      <Textarea
                        value={failureReason[order.orderId] || ""}
                        onChange={(event) => setFailureReason((current) => ({ ...current, [order.orderId]: event.target.value }))}
                        placeholder="Motivo da falha, endereco fechado, cliente ausente..."
                        className="min-h-24 border-white/10 bg-black/30 text-white"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (!persistDriverName()) return;
                          const reason = (failureReason[order.orderId] || "").trim();
                          if (!reason) {
                            toast.error("Informe o motivo da falha.");
                            return;
                          }
                          void failureMutation.mutate({ orderId: order.orderId, reason });
                        }}
                        disabled={isBusy}
                      >
                        Registrar falha
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {batch ? (
          <Card className="border-white/10 bg-white/5 p-5 text-sm text-zinc-300">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold text-white">Abrir rota em outra aba</div>
                <div className="text-zinc-400">{batch.publicLink}</div>
              </div>
              <Button type="button" variant="outline" onClick={() => window.open(batch.publicLink, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir link
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
