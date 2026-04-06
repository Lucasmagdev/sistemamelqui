import React from "react";
import { ChevronDown, ChevronUp, CheckCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { backendRequest } from "@/lib/backendClient";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const shouldSendStatusWhatsApp = (previousStatus: number, newStatus: number) =>
  (previousStatus === 0 && newStatus === 1) ||
  (previousStatus === 3 && newStatus === 4) ||
  (previousStatus !== 5 && newStatus === 5);

const describeNotificationReason = (reason?: string) => {
  switch (reason) {
    case "phone-not-on-whatsapp":
      return "o numero do cliente nao existe no WhatsApp";
    case "missing-phone":
      return "o cliente nao possui telefone cadastrado";
    case "missing-client":
      return "o cliente do pedido nao foi encontrado";
    case "missing-zapi-config":
      return "a configuracao da Z-API esta incompleta";
    case "zapi-send-error":
      return "a Z-API rejeitou a mensagem";
    case "zapi-missing-message-id":
      return "a Z-API nao devolveu o identificador da mensagem";
    case "store-phone-discovery-failed":
      return "o numero da loja nao foi identificado na instancia conectada";
    default:
      return reason || "sem motivo";
  }
};

const messageStatusLabel = (status?: string) => {
  switch (status) {
    case "queued":
      return "Na fila";
    case "failed":
      return "Falhou";
    case "delivered":
      return "Entregue";
    case "read":
      return "Lida";
    case "not_sent":
      return "Nao enviada";
    default:
      return status || "Desconhecido";
  }
};

const orderStatusSteps = [
  {
    label: "Pedido Recebido",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </svg>
    ),
  },
  {
    label: "Aceito/Confirmado",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9 12l2 2l4-4" />
      </svg>
    ),
  },
  {
    label: "Em Preparacao",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-9.6 9.6M14.5 17.5l-8-8a2.828 2.828 0 014-4l8 8a2.828 2.828 0 01-4 4z" />
        <path d="M16 19l2 2" />
      </svg>
    ),
  },
  {
    label: "Finalizado/Pronto",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 3v4M8 3v4" />
      </svg>
    ),
  },
  {
    label: "Saiu para Entrega",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <path d="M16 8h2a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    label: "Concluido",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9 12l2 2l4-4" />
      </svg>
    ),
  },
];

type PrepItem = {
  id: string;
  label: string;
  quantity: number;
  productName: string;
};

export type Order = {
  id: string;
  code: string;
  clientName: string;
  city: string;
  phone: string;
  value: number;
  status: number;
  produtos?: string;
};

interface OrderCardProps {
  order: Order;
  onStatusChange?: () => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onStatusChange }) => {
  const [status, setStatus] = React.useState(order.status);
  const [prepOpen, setPrepOpen] = React.useState(order.status === 2);
  const [prepItems, setPrepItems] = React.useState<PrepItem[]>([]);
  const [confirmedItems, setConfirmedItems] = React.useState<boolean[]>([]);
  const [loadingPrepItems, setLoadingPrepItems] = React.useState(false);
  const [messagesOpen, setMessagesOpen] = React.useState(false);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [messages, setMessages] = React.useState<any[]>([]);

  const prepLoaded = prepItems.length > 0;

  React.useEffect(() => {
    setStatus(order.status);
    setPrepOpen(order.status === 2);
  }, [order.status]);

  const loadPrepItems = React.useCallback(async () => {
    if (loadingPrepItems) return;
    setLoadingPrepItems(true);
    try {
      const { data: itemsData } = await supabase
        .from("order_items")
        .select("id, produto_id, quantidade, products(nome)")
        .eq("pedido_id", order.id);

      const mappedItems: PrepItem[] = Array.isArray(itemsData)
        ? itemsData.map((item: any, index: number) => {
            const quantity = Number(item.quantidade || 0);
            const productName = item.products?.nome || "Produto";
            return {
              id: String(item.id || `${order.id}-${item.produto_id || index}`),
              quantity,
              productName,
              label: `${productName} (${quantity}x)`,
            };
          })
        : [];

      setPrepItems(mappedItems);
      setConfirmedItems(Array(mappedItems.length).fill(false));
    } catch {
      toast.error("Erro ao carregar itens do pedido.");
    } finally {
      setLoadingPrepItems(false);
    }
  }, [loadingPrepItems, order.id]);

  React.useEffect(() => {
    if (prepOpen && !prepLoaded) {
      loadPrepItems();
    }
  }, [prepLoaded, prepOpen, loadPrepItems]);

  const updateStatus = async (newStatus: number) => {
    const previousStatus = status;

    try {
      const result = await backendRequest<any>(`/api/orders/${order.id}/status`, {
        method: "POST",
        body: JSON.stringify({ newStatus }),
      });

      setStatus(newStatus);
      setPrepOpen(newStatus === 2);

      const notification = result?.notification;
      const expectsWhatsApp = shouldSendStatusWhatsApp(previousStatus, newStatus);

      if (notification?.sent) {
        toast.success("Status atualizado e WhatsApp enviado automaticamente.");
      } else if (notification?.queued) {
        toast.success("Status atualizado. Mensagem aceita pela Z-API e colocada na fila do WhatsApp.");
      } else if (expectsWhatsApp) {
        toast.info(`Status atualizado. WhatsApp nao encaminhado (${describeNotificationReason(notification?.reason)}).`);
      } else {
        toast.success("Status atualizado com sucesso.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Erro ao atualizar status do pedido.");
    }

    if (onStatusChange) onStatusChange();
  };

  const toggleItem = (idx: number) => {
    setConfirmedItems((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  };

  const markAllItems = (value: boolean) => {
    setConfirmedItems(Array(prepItems.length).fill(value));
  };

  const openMessages = async () => {
    setMessagesOpen(true);
    setMessagesLoading(true);
    try {
      const payload = await backendRequest<{ messages: any[] }>(`/api/orders/${order.id}/messages`);
      setMessages(payload.messages || []);
    } catch (error: any) {
      toast.error(error.message || "Erro ao carregar historico do WhatsApp.");
    } finally {
      setMessagesLoading(false);
    }
  };

  const confirmedCount = confirmedItems.filter(Boolean).length;
  const totalItems = prepItems.length;
  const allConfirmed = totalItems === 0 || confirmedCount === totalItems;

  const handleStatusStepClick = async (idx: number) => {
    if (idx === status && idx === 2) {
      setPrepOpen((prev) => !prev);
      return;
    }

    if (idx !== status + 1) return;
    if (status === 2 && idx === 3 && !allConfirmed) return;

    await updateStatus(idx);
  };

  return (
    <div className="mb-4 rounded-2xl border border-yellow-900 bg-[#18181b] p-4 shadow-lg">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="text-lg font-bold text-yellow-400">
            {order.code} <span className="align-middle text-xs">Pedido</span>
          </div>
          <div className="text-base font-semibold text-white">{order.clientName}</div>
          <div className="text-sm text-gray-400">{order.city} - {order.phone}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openMessages}
              className="rounded-md border border-yellow-500/40 px-2.5 py-1.5 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-500/10"
            >
              Ver WhatsApp
            </button>
            {status === 2 ? (
              <button
                type="button"
                onClick={() => setPrepOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
              >
                {prepOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Checklist de preparo
              </button>
            ) : null}
          </div>
        </div>

        <div className="text-left xl:text-right">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Valor do pedido</div>
          <div className="mt-1 text-3xl font-bold text-white">
            {order.value.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {orderStatusSteps.map((step, idx) => {
          const isCurrent = idx === status;
          const canAdvance = idx === status + 1;
          const isDisabled = idx > status + 1 || (status === 2 && idx === 3 && !allConfirmed);
          const isPrepCurrent = idx === 2 && status === 2;

          return (
            <button
              key={step.label}
              type="button"
              onClick={() => void handleStatusStepClick(idx)}
              disabled={!isCurrent && !canAdvance}
              className={`group rounded-2xl border px-3 py-4 text-center transition ${
                isCurrent
                  ? "border-yellow-400/60 bg-yellow-500/10"
                  : canAdvance && !isDisabled
                    ? "border-zinc-700 bg-zinc-900/40 hover:border-yellow-400/50 hover:bg-yellow-500/5"
                    : "border-zinc-800 bg-zinc-900/20 opacity-60"
              }`}
            >
              <div
                className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
                  isCurrent
                    ? "border-yellow-400 bg-yellow-400 text-black"
                    : canAdvance && !isDisabled
                      ? "border-zinc-500 text-zinc-200 group-hover:border-yellow-400 group-hover:text-yellow-300"
                      : "border-zinc-700 text-zinc-500"
                }`}
              >
                {step.icon}
              </div>
              <div className={`mt-3 text-sm ${isCurrent ? "font-bold text-yellow-300" : "text-zinc-300"}`}>{step.label}</div>
              {isPrepCurrent ? (
                <div className="mt-2 text-xs text-emerald-300">
                  {prepOpen ? "Checklist aberta" : "Abrir checklist"}
                </div>
              ) : null}
              {status === 2 && idx === 3 && !allConfirmed ? (
                <div className="mt-2 text-xs text-zinc-500">Confirme todos os itens primeiro</div>
              ) : null}
            </button>
          );
        })}
      </div>

      {status === 2 && prepOpen ? (
        <div className="mt-6 rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-[#1f2027] to-[#141419] p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-lg font-semibold text-yellow-300">Checklist de preparo</div>
              <p className="mt-1 text-sm text-zinc-400">
                Confirme cada item separado para liberar o pedido para a etapa de pronto.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${allConfirmed ? "bg-emerald-500/20 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}`}>
                {confirmedCount}/{totalItems || 0} confirmados
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => markAllItems(true)} disabled={!totalItems}>
                <CheckCheck className="mr-1 h-4 w-4" />
                Marcar todos
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => markAllItems(false)} disabled={!totalItems}>
                Limpar
              </Button>
            </div>
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${allConfirmed ? "bg-emerald-400" : "bg-yellow-400"}`}
              style={{ width: `${totalItems ? (confirmedCount / totalItems) * 100 : 0}%` }}
            />
          </div>

          {loadingPrepItems ? (
            <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              Carregando itens do pedido...
            </div>
          ) : totalItems === 0 ? (
            <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              Nenhum item encontrado neste pedido.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {prepItems.map((item, idx) => (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    confirmedItems[idx]
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-zinc-700 bg-zinc-900/50 hover:border-yellow-500/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={confirmedItems[idx] || false}
                    onChange={() => toggleItem(idx)}
                    className="h-4 w-4 cursor-pointer accent-emerald-500"
                    aria-label={`Confirmar item ${item.label}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm ${confirmedItems[idx] ? "font-semibold text-emerald-200" : "text-zinc-100"}`}>
                      {item.productName}
                    </div>
                    <div className="text-xs text-zinc-400">Quantidade: {item.quantity}x</div>
                  </div>
                  {confirmedItems[idx] ? (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
                      Ok
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-zinc-700/70 pt-4 md:flex-row md:items-center md:justify-between">
            <div className={`text-sm ${allConfirmed ? "text-emerald-300" : "text-zinc-300"}`}>
              {allConfirmed
                ? "Tudo conferido. O pedido pode avancar para Finalizado/Pronto."
                : "Confirme todos os itens antes de avancar."}
            </div>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              disabled={!allConfirmed || loadingPrepItems}
              onClick={() => void updateStatus(3)}
            >
              Avancar para Finalizado/Pronto
            </Button>
          </div>
        </div>
      ) : null}

      <Modal open={messagesOpen} onClose={() => setMessagesOpen(false)} title={`WhatsApp do pedido ${order.code}`}>
        {messagesLoading ? (
          <div className="text-sm text-muted-foreground">Carregando historico...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma mensagem registrada para este pedido.</div>
        ) : (
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {messages.map((message) => (
              <div key={message.id} className="rounded-lg border border-border/70 bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {message.target} - {message.event_type}
                  </div>
                  <div className="text-xs font-semibold text-primary">{messageStatusLabel(message.local_status)}</div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {message.destination_phone || "Sem numero"} - {new Date(message.created_at).toLocaleString("pt-BR")}
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm text-foreground">
                  {message.message_text || "Sem conteudo salvo."}
                </div>
                {message.error_detail ? <div className="mt-2 text-xs text-red-400">{message.error_detail}</div> : null}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

interface OrderListProps {
  orders: Order[];
  onStatusChange?: () => void;
  moeda?: string;
  unidadePeso?: string;
}

export const OrderList: React.FC<OrderListProps> = ({ orders, onStatusChange }) => {
  return (
    <div>
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} onStatusChange={onStatusChange} />
      ))}
    </div>
  );
};
