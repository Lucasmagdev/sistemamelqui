// Mock data for Imperial Tec Solution

export interface Produto {
  id: string;
  nome: string;
  lote: string;
  dataEntrada: string;
  dataValidade: string;
  pesoDisponivel: number;
  pesoInicial: number;
  custoMedio: number;
  origem: string;
  observacoes?: string;
  status: 'normal' | 'atencao' | 'risco';
}

export interface Pedido {
  id: string;
  numero: string;
  cliente: string;
  data: string;
  produtos: { nome: string; quantidade: number; precoKg: number }[];
  valorTotal: number;
  status: 'concluido' | 'pendente' | 'cancelado';
}

export interface Alerta {
  id: string;
  produto: string;
  lote: string;
  motivo: string;
  diasRestantes: number;
  giroMedio: number;
  sugestao: string;
  nivel: 'critico' | 'atencao' | 'normal';
}

export const mockProdutos: Produto[] = [
  { id: '1', nome: 'Picanha', lote: 'LT-2025-001', dataEntrada: '2025-01-15', dataValidade: '2025-02-28', pesoDisponivel: 120, pesoInicial: 200, custoMedio: 89.90, origem: 'Frigorífico Friboi', status: 'normal' },
  { id: '2', nome: 'Costela', lote: 'LT-2025-002', dataEntrada: '2025-01-20', dataValidade: '2025-02-20', pesoDisponivel: 45, pesoInicial: 150, custoMedio: 34.50, origem: 'Frigorífico Marfrig', status: 'atencao' },
  { id: '3', nome: 'Fraldinha', lote: 'LT-2025-003', dataEntrada: '2025-02-01', dataValidade: '2025-02-18', pesoDisponivel: 30, pesoInicial: 80, custoMedio: 42.00, origem: 'Frigorífico Minerva', status: 'risco' },
  { id: '4', nome: 'Contra-filé', lote: 'LT-2025-004', dataEntrada: '2025-02-05', dataValidade: '2025-03-15', pesoDisponivel: 200, pesoInicial: 250, custoMedio: 55.00, origem: 'Frigorífico JBS', status: 'normal' },
  { id: '5', nome: 'Alcatra', lote: 'LT-2025-005', dataEntrada: '2025-02-10', dataValidade: '2025-03-10', pesoDisponivel: 90, pesoInicial: 180, custoMedio: 52.30, origem: 'Frigorífico Friboi', status: 'normal' },
  { id: '6', nome: 'Maminha', lote: 'LT-2025-006', dataEntrada: '2025-01-28', dataValidade: '2025-02-22', pesoDisponivel: 15, pesoInicial: 100, custoMedio: 48.00, origem: 'Frigorífico Marfrig', status: 'risco' },
  { id: '7', nome: 'Filé Mignon', lote: 'LT-2025-007', dataEntrada: '2025-02-12', dataValidade: '2025-03-20', pesoDisponivel: 60, pesoInicial: 80, custoMedio: 95.00, origem: 'Frigorífico JBS', status: 'normal' },
  { id: '8', nome: 'Cupim', lote: 'LT-2025-008', dataEntrada: '2025-02-01', dataValidade: '2025-02-25', pesoDisponivel: 25, pesoInicial: 120, custoMedio: 38.00, origem: 'Frigorífico Minerva', status: 'atencao' },
];

export const mockPedidos: Pedido[] = [
  { id: '1', numero: 'PED-001', cliente: 'Churrascaria Fogo de Chão', data: '2025-02-17', produtos: [{ nome: 'Picanha', quantidade: 20, precoKg: 110 }, { nome: 'Alcatra', quantidade: 15, precoKg: 65 }], valorTotal: 3175, status: 'concluido' },
  { id: '2', numero: 'PED-002', cliente: 'Restaurante Sabor da Carne', data: '2025-02-17', produtos: [{ nome: 'Contra-filé', quantidade: 30, precoKg: 68 }], valorTotal: 2040, status: 'pendente' },
  { id: '3', numero: 'PED-003', cliente: 'Mercado Central', data: '2025-02-16', produtos: [{ nome: 'Costela', quantidade: 40, precoKg: 45 }, { nome: 'Cupim', quantidade: 20, precoKg: 48 }], valorTotal: 2760, status: 'concluido' },
  { id: '4', numero: 'PED-004', cliente: 'Açougue Premium', data: '2025-02-16', produtos: [{ nome: 'Filé Mignon', quantidade: 10, precoKg: 120 }, { nome: 'Picanha', quantidade: 15, precoKg: 110 }], valorTotal: 2850, status: 'pendente' },
  { id: '5', numero: 'PED-005', cliente: 'Distribuidora Boi Gordo', data: '2025-02-15', produtos: [{ nome: 'Fraldinha', quantidade: 25, precoKg: 55 }], valorTotal: 1375, status: 'cancelado' },
];

export const mockAlertas: Alerta[] = [
  { id: '1', produto: 'Fraldinha', lote: 'LT-2025-003', motivo: 'Validade expirada hoje', diasRestantes: 0, giroMedio: 2.5, sugestao: 'Venda imediata com desconto de 30%', nivel: 'critico' },
  { id: '2', produto: 'Maminha', lote: 'LT-2025-006', motivo: 'Vence em 4 dias, estoque baixo', diasRestantes: 4, giroMedio: 3.2, sugestao: 'Aplicar promoção de 15%', nivel: 'critico' },
  { id: '3', produto: 'Costela', lote: 'LT-2025-002', motivo: 'Vence em 2 dias', diasRestantes: 2, giroMedio: 5.0, sugestao: 'Promoção relâmpago 20% off', nivel: 'critico' },
  { id: '4', produto: 'Cupim', lote: 'LT-2025-008', motivo: 'Vence em 7 dias, giro lento', diasRestantes: 7, giroMedio: 1.8, sugestao: 'Incluir em combo promocional', nivel: 'atencao' },
  { id: '5', produto: 'Alcatra', lote: 'LT-2025-005', motivo: 'Estoque acima do giro projetado', diasRestantes: 20, giroMedio: 4.0, sugestao: 'Monitorar nos próximos 5 dias', nivel: 'normal' },
];

export const dashboardStats = {
  totalEstoque: 585,
  lotesRisco: 3,
  pedidosDia: 2,
  faturamentoDia: 5215,
  alertasAtivos: 4,
};
