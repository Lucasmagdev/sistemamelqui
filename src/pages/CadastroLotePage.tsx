import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function CadastroLotePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    produto: '', origem: '', pesoTotal: '', custoTotal: '',
    dataEntrada: '', dataValidade: '', observacoes: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Lote cadastrado com sucesso!');
    navigate('/admin/estoque');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cadastro de Lote</h1>
        <p className="text-sm text-muted-foreground">Registre um novo lote no estoque</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-border bg-card p-6 card-elevated">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="produto">Produto</Label>
            <Input name="produto" value={form.produto} onChange={handleChange} placeholder="Ex: Picanha" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="origem">Origem</Label>
            <Input name="origem" value={form.origem} onChange={handleChange} placeholder="Ex: Frigorífico Friboi" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pesoTotal">Peso Total (kg)</Label>
            <Input name="pesoTotal" type="number" value={form.pesoTotal} onChange={handleChange} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custoTotal">Custo Total (R$)</Label>
            <Input name="custoTotal" type="number" value={form.custoTotal} onChange={handleChange} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dataEntrada">Data de Entrada</Label>
            <Input name="dataEntrada" type="date" value={form.dataEntrada} onChange={handleChange} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dataValidade">Data de Validade</Label>
            <Input name="dataValidade" type="date" value={form.dataValidade} onChange={handleChange} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="observacoes">Observações</Label>
          <Textarea name="observacoes" value={form.observacoes} onChange={handleChange} rows={3} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
            Salvar Lote
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/admin/estoque')}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
