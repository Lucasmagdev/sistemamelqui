import React from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { backendRequest } from "@/lib/backendClient";
import { Modal } from "@/components/ui/modal";

const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

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
  const itensIniciais = React.useMemo(
    () => (order.produtos ? order.produtos.split(",").map((p) => p.trim()) : []),
    [order.produtos],
  );

  const [status, setStatus] = React.useState(order.status);
  const [showPrepPanel, setShowPrepPanel] = React.useState(order.status === 2);
  const [itensPedido, setItensPedido] = React.useState<string[]>(itensIniciais);
  const [itensConfirmados, setItensConfirmados] = React.useState<boolean[]>(
    () => Array(itensIniciais.length).fill(false),
  );
  const [messagesOpen, setMessagesOpen] = React.useState(false);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [messages, setMessages] = React.useState<any[]>([]);

  React.useEffect(() => {
    setStatus(order.status);
    if (order.status === 2) setShowPrepPanel(true);
  }, [order.status]);

  React.useEffect(() => {
    setItensConfirmados((prev) =>
      prev.length === itensPedido.length ? prev : Array(itensPedido.length).fill(false),
    );
  }, [itensPedido.length]);

  React.useEffect(() => {
    if (showPrepPanel && itensPedido.length === 0) {
      (async () => {
        const { data: itensData } = await supabase
          .from("order_items")
          .select("produto_id, quantidade, products(nome)")
          .eq("pedido_id", order.id);
        if (Array.isArray(itensData)) {
          const nomes = itensData.map((item: any) => `${item.products?.nome || "Produto"} (${item.quantidade}x)`);
          setItensPedido(nomes);
          setItensConfirmados(Array(nomes.length).fill(false));
        }
      })();
    }
  }, [showPrepPanel, order.id, itensPedido.length]);

  const updateStatus = async (newStatus: number) => {
    const previousStatus = status;

    try {
      const response = await fetch(`${backendBaseUrl}/api/orders/${order.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newStatus }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Falha ao atualizar status do pedido.");
      }

      setStatus(newStatus);

      const notification = result?.notification;
      const expectsWhatsApp = shouldSendStatusWhatsApp(previousStatus, newStatus);

      if (notification?.sent) {
        toast.success("Status atualizado e WhatsApp enviado automaticamente.");
      } else if (notification?.queued) {
        toast.success("Status atualizado. Mensagem aceita pela Z-API e colocada na fila do WhatsApp.");
      } else if (expectsWhatsApp) {
        toast.info(`Status atualizado. WhatsApp nao encaminhado (${describeNotificationReason(notification?.reason)}).`);
      } else {
        toast.success("Status atualizado. Esta etapa nao dispara WhatsApp automatico.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Erro ao atualizar status do pedido.");
    }

    if (onStatusChange) onStatusChange();
  };

  const handleCheckbox = (idx: number) => {
    setItensConfirmados((prev) => {
      const arr = [...prev];
      arr[idx] = !arr[idx];
      return arr;
    });
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

  const totalItens = itensPedido.length;
  const itensMarcados = itensConfirmados.filter(Boolean).length;
  const todosItensConfirmados = totalItens === 0 || itensMarcados === totalItens;

  return (
    <div className="mb-4 flex flex-col justify-between rounded-xl border border-yellow-900 bg-[#18181b] p-4 shadow-lg md:flex-row md:items-center">
      <div className="mb-2 md:mb-0">
        <div className="text-lg font-bold text-yellow-400">
          {order.code} <span className="align-middle text-xs">Pedido</span>
        </div>
        <div className="text-base font-semibold text-white">{order.clientName}</div>
        <div className="text-sm text-gray-400">{order.city} - {order.phone}</div>
        <button
          type="button"
          onClick={openMessages}
          className="mt-2 rounded-md border border-yellow-500/40 px-2 py-1 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-500/10"
        >
          Ver WhatsApp
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 md:flex-row md:gap-4">
        {orderStatusSteps.map((step, idx) => (
          <div key={step.label} className="flex min-w-[70px] flex-col items-center">
            <button
              className={`h-8 w-8 rounded-full border-2 transition-all duration-150 ${
                idx === status
                  ? "border-yellow-400 bg-yellow-400 text-black"
                  : "border-gray-600 bg-[#23232a] text-gray-400"
              } ${
                idx !== status + 1 ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-yellow-400 hover:bg-yellow-400 hover:text-black"
              } flex items-center justify-center`}
              disabled={idx !== status + 1 || (status === 2 && idx === 3 && !todosItensConfirmados)}
              onClick={() => {
                if (status === 2 && idx === 3 && !todosItensConfirmados) return;
                updateStatus(idx);
                if (idx === 2) setShowPrepPanel(true);
                if (idx === 3) setShowPrepPanel(false);
              }}
              onFocus={() => {
                if (idx === 2) setShowPrepPanel(true);
              }}
              onBlur={() => {
                if (idx === 2) setShowPrepPanel(false);
              }}
              title={step.label}
            >
              {step.icon}
            </button>
            <span className={`mt-1 text-center text-xs ${idx === status ? "font-bold text-yellow-400" : "text-gray-400"}`}>
              {step.label}
            </span>

            {idx === 2 && showPrepPanel && (
              <div className="mt-3 w-[280px] rounded-xl border border-yellow-500/40 bg-gradient-to-b from-[#1f2027] to-[#17171d] p-3.5 shadow-xl sm:w-[320px]">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold tracking-wide text-yellow-300">Itens do Pedido</div>
                    <p className="mt-0.5 text-[11px] text-zinc-400">Confirme todos os itens para liberar a proxima etapa</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${todosItensConfirmados ? "bg-emerald-500/20 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}`}>
                    {itensMarcados}/{totalItens || 0}
                  </span>
                </div>

                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-700/70">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${todosItensConfirmados ? "bg-emerald-400" : "bg-yellow-400"}`}
                    style={{ width: `${totalItens ? (itensMarcados / totalItens) * 100 : 0}%` }}
                  />
                </div>

                {totalItens > 0 ? (
                  <ul className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {itensPedido.map((item, i) => (
                      <li
                        key={`${item}-${i}`}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                          itensConfirmados[i]
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : "border-zinc-700 bg-zinc-800/50 hover:border-yellow-500/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={itensConfirmados[i]}
                          onChange={() => handleCheckbox(i)}
                          className="h-4 w-4 cursor-pointer accent-emerald-500"
                          aria-label={`Confirmar item ${item}`}
                        />
                        <span className={`flex-1 text-left text-sm ${itensConfirmados[i] ? "font-medium text-emerald-200" : "text-zinc-100"}`}>
                          {item}
                        </span>
                        {itensConfirmados[i] && <span className="text-xs font-bold uppercase tracking-wide text-emerald-300">OK</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-2.5 text-left text-xs text-zinc-300">
                    Nenhum item encontrado neste pedido.
                  </div>
                )}

                <div className="mt-3 border-t border-zinc-700/70 pt-2 text-left">
                  <span className={`text-xs font-medium ${todosItensConfirmados ? "text-emerald-300" : "text-zinc-300"}`}>
                    {todosItensConfirmados
                      ? "Tudo conferido. Pedido pronto para finalizar."
                      : 'Marque todos os itens para avancar para "Finalizado/Pronto".'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 text-right md:mt-0">
        <div className="text-lg font-bold text-white">
          {order.value.toLocaleString("en-US", { style: "currency", currency: "USD" })}
        </div>
      </div>

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
                    {message.target} • {message.event_type}
                  </div>
                  <div className="text-xs font-semibold text-primary">{messageStatusLabel(message.local_status)}</div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {message.destination_phone || "Sem numero"} • {new Date(message.created_at).toLocaleString("pt-BR")}
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
