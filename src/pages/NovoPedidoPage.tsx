import { useState } from 'react';
import { mockProdutos } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function NovoPedidoPage() {
  const navigate = useNavigate();
  const [cliente, setCliente] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [precoKg, setPrecoKg] = useState('');
  const [obs, setObs] = useState('');

  const produtoSelecionado = mockProdutos.find((p) => p.id === produtoId);
  const qtdNum = parseFloat(quantidade) || 0;
  const precoNum = parseFloat(precoKg) || 0;
  const valorTotal = qtdNum * precoNum;
  const restante = produtoSelecionado ? produtoSelecionado.pesoDisponivel - qtdNum : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Pedido registrado com sucesso!');
    navigate('/pedidos');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Novo Pedido</h1>
        <p className="text-sm text-muted-foreground">Registrar venda com baixa no estoque</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-border bg-card p-6 card-elevated">
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" required />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Produto</Label>
            <select
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              <option value="">Selecione...</option>
              {mockProdutos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} — {p.pesoDisponivel}kg disp. ({p.lote})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade (kg)</Label>
            <Input type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Preço por kg (R$)</Label>
            <Input type="number" value={precoKg} onChange={(e) => setPrecoKg(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Valor Total</Label>
            <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-semibold text-foreground">
              R$ {valorTotal.toFixed(2)}
            </div>
          </div>
        </div>

        {produtoSelecionado && qtdNum > 0 && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${restante >= 0 ? 'status-ok' : 'status-critical'}`}>
            Após confirmar, restarão <strong>{restante.toFixed(1)} kg</strong> no lote {produtoSelecionado.lote}.
            {restante < 0 && <span className="ml-2 font-medium">⚠ Quantidade excede o disponível!</span>}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={restante < 0} className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
            Confirmar Pedido
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/pedidos')}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
