import { useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ConfiguracoesPage() {
  const { config, updateConfig } = useTenant();
  const [nome, setNome] = useState(config.nomeEmpresa);
  const [cor, setCor] = useState(config.corPrimaria);

  const handleSave = () => {
    updateConfig({ nomeEmpresa: nome, corPrimaria: cor });
    toast.success('Configurações salvas!');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">White Label — personalização do tenant</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 card-elevated space-y-5">
        <div className="space-y-1.5">
          <Label>Nome da Empresa</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cor Primária</Label>
          <div className="flex items-center gap-3">
            <Input value={cor} onChange={(e) => setCor(e.target.value)} className="max-w-[200px]" />
            <div className="h-10 w-10 rounded-md border border-border" style={{ backgroundColor: cor }} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Logo (URL)</Label>
          <Input placeholder="https://..." onChange={(e) => updateConfig({ logoUrl: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Tenant ID</Label>
          <Input value={config.tenantId} disabled className="bg-muted" />
        </div>
        <Button onClick={handleSave} className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
