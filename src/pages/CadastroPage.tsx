
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/contexts/I18nContext';
import { extractPhoneDigits, normalizePhoneInput } from '@/lib/phone';

const PHONE_DEFAULT_COUNTRY = '55';

function toNormalizedPhone(value: string) {
  const digits = extractPhoneDigits(value);
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) return `+${PHONE_DEFAULT_COUNTRY}${digits}`;
  return `+${digits}`;
}

export default function CadastroPage() {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enderecoNumero, setEnderecoNumero] = useState('');
  const [enderecoRua, setEnderecoRua] = useState('');
  const [enderecoApt, setEnderecoApt] = useState('');
  const [enderecoCidade, setEnderecoCidade] = useState('');
  const [enderecoEstado, setEnderecoEstado] = useState('');
  const [enderecoZip, setEnderecoZip] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const emailNormalizado = email.trim().toLowerCase();
    const telefoneNormalizado = toNormalizedPhone(telefone);
    // 1. Cria usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: emailNormalizado,
      password: senha,
    });
    if (authError) {
      setLoading(false);
      toast.error('Erro ao criar usuário: ' + authError.message);
      return;
    }
    const auth_user_id = authData?.user?.id;
    // 2. Salva dados pessoais na tabela clients, incluindo auth_user_id
    const clientePayload = {
      nome,
      telefone: telefoneNormalizado,
      email: emailNormalizado,
      endereco_numero: enderecoNumero,
      endereco_rua: enderecoRua,
      endereco_complemento: enderecoApt,
      cidade: enderecoCidade,
      estado: enderecoEstado,
      cep: enderecoZip,
      pais: 'USA',
      tenant_id: 1,
      auth_user_id,
      last_user_agent: navigator.userAgent,
      preferred_locale: locale,
    };
    let clientError = null;
    try {
      let clienteExistente: { id: string } | null = null;

      if (auth_user_id) {
        const byAuth = await supabase
          .from('clients')
          .select('id')
          .eq('auth_user_id', auth_user_id)
          .order('id', { ascending: false })
          .limit(1);
        if (byAuth.error) throw byAuth.error;
        if (byAuth.data && byAuth.data.length > 0) clienteExistente = byAuth.data[0];
      }

      if (!clienteExistente && emailNormalizado) {
        const byEmail = await supabase
          .from('clients')
          .select('id')
          .eq('email', emailNormalizado)
          .order('id', { ascending: false })
          .limit(1);
        if (byEmail.error) throw byEmail.error;
        if (byEmail.data && byEmail.data.length > 0) clienteExistente = byEmail.data[0];
      }

      if (!clienteExistente && telefoneNormalizado) {
        const byPhone = await supabase
          .from('clients')
          .select('id')
          .eq('telefone', telefoneNormalizado)
          .order('id', { ascending: false })
          .limit(1);
        if (byPhone.error) throw byPhone.error;
        if (byPhone.data && byPhone.data.length > 0) clienteExistente = byPhone.data[0];
      }

      if (clienteExistente) {
        const updateClient = await supabase
          .from('clients')
          .update(clientePayload)
          .eq('id', clienteExistente.id);
        clientError = updateClient.error;
      } else {
        const insertClient = await supabase.from('clients').insert([clientePayload]);
        clientError = insertClient.error;
      }
    } catch (error: any) {
      clientError = error;
    }
    if (clientError) {
      setLoading(false);
      toast.error('Usuário criado, mas erro ao salvar dados pessoais: ' + clientError.message);
      return;
    }

    // 3. Insere usuário na tabela 'users' com tipo 'cliente'
    const userPayload = {
      nome,
      email: emailNormalizado,
      senha,
      tipo: 'cliente',
      tenant_id: 1,
      auth_user_id,
    };
    const { error: userError } = await supabase.from('users').insert([userPayload]);
    setLoading(false);
    if (userError) {
      toast.error('Cliente cadastrado, mas erro ao vincular usuário: ' + userError.message);
      return;
    }
    toast.success('Cadastro realizado com sucesso! Faça login.');
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form onSubmit={handleCadastro} className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-xl space-y-5">
        <h1 className="text-2xl font-bold mb-2 text-center">Criar Conta</h1>
        <div>
          <label className="text-xs text-muted-foreground">Nome completo</label>
          <input value={nome} onChange={e => setNome(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" required />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Telefone (EUA: +1 XXX-XXX-XXXX)</label>
          <input value={telefone} onChange={e => setTelefone(normalizePhoneInput(e.target.value))} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" placeholder="+55 31 99999-9999" required />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">E-mail</label>
          <input value={email} onChange={e => setEmail(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" type="email" required />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Senha</label>
          <input value={senha} onChange={e => setSenha(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" type="password" required />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Street Number + Street Name</label>
          <div className="flex gap-2">
            <input value={enderecoNumero} onChange={e => setEnderecoNumero(e.target.value)} className="mt-1 h-10 w-24 rounded-md border border-border bg-background px-3 text-sm" placeholder="350" required />
            <input value={enderecoRua} onChange={e => setEnderecoRua(e.target.value)} className="mt-1 h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm" placeholder="5th Ave" required />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Apt / Suite / Unit (opcional)</label>
          <input value={enderecoApt} onChange={e => setEnderecoApt(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" placeholder="Apt 12, Suite 8..." />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">City</label>
          <input value={enderecoCidade} onChange={e => setEnderecoCidade(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" required />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">State (2 letras)</label>
          <input value={enderecoEstado} onChange={e => setEnderecoEstado(e.target.value.toUpperCase().slice(0,2))} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm uppercase" maxLength={2} required />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">ZIP Code</label>
          <input value={enderecoZip} onChange={e => setEnderecoZip(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" placeholder="10118" required />
        </div>
        <Button type="submit" className="w-full mt-4" disabled={loading}>Cadastrar</Button>
        <div className="text-center text-xs text-muted-foreground mt-2">
          Já tem conta? <a href="/login" className="text-primary underline">Entrar</a>
        </div>
      </form>
    </div>
  );
}
