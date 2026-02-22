import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Download, Search, Filter } from 'lucide-react';

export default function ClientesAdminPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    async function fetchClientes() {
      setLoading(true);
      const { data, error } = await supabase.from('clients').select('*');
      if (!error) setClientes(data || []);
      setLoading(false);
    }
    fetchClientes();
  }, []);

  const clientesFiltrados = useMemo(() => {
    let filtrados = clientes;
    if (busca) {
      filtrados = filtrados.filter((c) =>
        c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
        c.email?.toLowerCase().includes(busca.toLowerCase()) ||
        c.documento?.toLowerCase().includes(busca.toLowerCase())
      );
    }
    if (filtro) {
      filtrados = filtrados.filter((c) => c.endereco?.toLowerCase().includes(filtro.toLowerCase()));
    }
    return filtrados;
  }, [clientes, busca, filtro]);

  function exportarCSV() {
    const header = ['Nome', 'Documento', 'Telefone', 'E-mail', 'Endereço'];
    const rows = clientesFiltrados.map((c) => [c.nome, c.documento, c.telefone, c.email, c.endereco]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-2 md:px-0">
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Clientes cadastrados</h1>
          <p className="text-sm text-muted-foreground">Gestão premium dos clientes do sistema</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Buscar por nome, email ou documento..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-64 bg-background border-border focus:ring-primary"
            prefix={<Search className="h-4 w-4 text-muted-foreground" />}
          />
          <Input
            placeholder="Filtrar por cidade, estado..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="w-48 bg-background border-border"
            prefix={<Filter className="h-4 w-4 text-muted-foreground" />}
          />
          <Button variant="outline" onClick={exportarCSV} className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="premium-glass gold-glow rounded-2xl shadow-lg overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</div>
        ) : (
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-muted/45 text-left">
                <th className="rounded-tl-2xl px-5 py-3 font-semibold text-muted-foreground">Cliente</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground">Documento</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground">Telefone</th>
                <th className="px-5 py-3 font-semibold text-muted-foreground">E-mail</th>
                <th className="rounded-tr-2xl px-5 py-3 font-semibold text-muted-foreground">Endereço</th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{c.nome?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-foreground">{c.nome}</span>
                  </td>
                  <td className="px-5 py-3">{c.documento}</td>
                  <td className="px-5 py-3">{c.telefone}</td>
                  <td className="px-5 py-3">{c.email}</td>
                  <td className="px-5 py-3">{c.endereco}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
