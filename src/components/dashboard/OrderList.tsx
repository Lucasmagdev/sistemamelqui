import React from "react";

const orderStatusSteps = [
  { label: "Pedido Recebido", icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
  ) },
  { label: "Aceito/Confirmado", icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2l4-4"/></svg>
  ) },
  { label: "Em Preparação", icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-9.6 9.6M14.5 17.5l-8-8a2.828 2.828 0 014-4l8 8a2.828 2.828 0 01-4 4z"/><path d="M16 19l2 2"/></svg>
  ) },
  { label: "Finalizado/Pronto", icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3v4M8 3v4"/></svg>
  ) },
  { label: "Saiu para Entrega", icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h2a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
  ) },
  { label: "Concluído", icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2l4-4"/></svg>
  ) },
];

export type Order = {
  id: string;
  code: string;
  clientName: string;
  city: string;
  phone: string;
  value: number;
  status: number; // index of current status
};

interface OrderCardProps {
  order: Order;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order }) => {
  const [status, setStatus] = React.useState(order.status);
  // Simulação: função para atualizar status no backend
  const updateStatus = async (newStatus: number) => {
    setStatus(newStatus);
    // Aqui você pode chamar a API para atualizar o status no banco
    // await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
  };
  return (
    <div className="bg-[#18181b] border border-yellow-900 rounded-xl p-4 mb-4 flex flex-col md:flex-row md:items-center justify-between shadow-lg">
      <div className="mb-2 md:mb-0">
        <div className="font-bold text-yellow-400 text-lg">{order.code} <span className="text-xs align-middle">🟡 Fel</span></div>
        <div className="font-semibold text-white text-base">{order.clientName}</div>
        <div className="text-gray-400 text-sm">{order.city} - {order.phone}</div>
      </div>
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4">
        {orderStatusSteps.map((step, idx) => (
          <div key={step.label} className="flex flex-col items-center min-w-[70px]">
            <button
              className={`w-8 h-8 flex items-center justify-center rounded-full border-2 transition-all duration-150 ${idx === status ? 'border-yellow-400 bg-yellow-400 text-black' : 'border-gray-600 bg-[#23232a] text-gray-400'} ${idx > status ? 'opacity-50 cursor-pointer' : ''}`}
              disabled={idx < status}
              onClick={() => updateStatus(idx)}
              title={step.label}
            >
              {step.icon}
            </button>
            <span className={`text-xs mt-1 text-center ${idx === status ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>{step.label}</span>
          </div>
        ))}
      </div>
      <div className="text-right mt-2 md:mt-0">
        <div className="text-white font-bold text-lg">R$ {order.value.toFixed(2)}</div>
      </div>
    </div>
  );
};

interface OrderListProps {
  orders: Order[];
}

export const OrderList: React.FC<OrderListProps> = ({ orders }) => {
  return (
    <div>
      {orders.map(order => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
};
