export type CategoryKey = 'all' | 'offers' | 'bbq' | 'premium' | 'subscription' | 'contact';

export type ModoVisualizacao = 'grid' | 'compact' | 'list';

export interface HomeProduct {
  id: string;
  nome: string;
  descricao: string;
  imagem: string | null;
  preco: number;
  precoAnterior: number | null;
  destaque: boolean;
  selo: string;
  categoria: string;
}

export interface CartSummary {
  totalItens: number;
  totalLb: number;
  totalValor: number;
}
