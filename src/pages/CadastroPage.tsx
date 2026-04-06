
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/contexts/I18nContext';
import { formatPhoneForDisplay, inferPhoneCountry, normalizePhoneInput, toStoragePhone } from '@/lib/phone';

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
    const telefoneNormalizado = toStoragePhone(telefone);
    const pais = inferPhoneCountry(telefone) || (locale === 'en' ? 'USA' : 'Brasil');
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
      pais,
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
          .in('telefone', [telefoneNormalizado, `+${telefoneNormalizado}`])
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
      tipo: 'cliente',
      tenant_id: 1,
      auth_user_id,
    };
    const { error: userError } = await supabase.from('users').insert([userPayload]);
    setLoading(false);
    if (userError) {
      const message = String(userError.message || '');
      if (message.toLowerCase().includes('senha')) {
        toast.error('Cliente cadastrado, mas o banco ainda exige a coluna senha em users. Execute a migration de remocao de senha e tente novamente.');
      } else {
        toast.error('Cliente cadastrado, mas erro ao vincular usuário: ' + userError.message);
      }
      return;
    }
    toast.success('Cadastro realizado com sucesso! Faça login.');
    navigate('/login');
  }

  const inputCls = "mt-1 h-10 w-full rounded-xl border border-border bg-background/80 px-3 text-sm text-foreground outline-none focus:border-primary/50";
  const labelCls = "text-xs font-medium text-muted-foreground";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      {/* Subtle radial background glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.07),transparent_60%)]" />

      <div className="relative w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {/* Gold signature line */}
          <div className="h-[2px] w-full" style={{ background: 'var(--gold-gradient)' }} />

          <form onSubmit={handleCadastro} className="space-y-6 px-7 py-7">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground">Criar Conta</h1>
              <p className="mt-1 text-sm text-muted-foreground">Preencha seus dados para acessar a loja</p>
            </div>

            {/* Seção: Dados pessoais */}
            <div className="space-y-3">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary">
                <span className="inline-block h-px w-3 bg-primary" />
                Dados pessoais
                <span className="inline-block h-px w-3 bg-primary" />
              </p>
              <div>
                <label className={labelCls}>Nome completo</label>
                <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>
                  Telefone <span className="text-muted-foreground/60">(Use +55 para Brasil ou +1 para EUA)</span>
                </label>
                <input
                  value={telefone}
                  onChange={e => setTelefone(normalizePhoneInput(e.target.value))}
                  onBlur={e => setTelefone(formatPhoneForDisplay(e.target.value))}
                  className={inputCls}
                  placeholder="+55 11 91234-5678 / +1 305-555-1212"
                  required
                />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input value={email} onChange={e => setEmail(e.target.value)} className={inputCls} type="email" required />
              </div>
              <div>
                <label className={labelCls}>Senha</label>
                <input value={senha} onChange={e => setSenha(e.target.value)} className={inputCls} type="password" placeholder="••••••••" required />
              </div>
            </div>

            {/* Seção: Endereço */}
            <div className="space-y-3">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary">
                <span className="inline-block h-px w-3 bg-primary" />
                Endereço de entrega
                <span className="inline-block h-px w-3 bg-primary" />
              </p>
              <div>
                <label className={labelCls}>Street Number + Street Name</label>
                <div className="flex gap-2">
                  <input value={enderecoNumero} onChange={e => setEnderecoNumero(e.target.value)} className="mt-1 h-10 w-24 rounded-xl border border-border bg-background/80 px-3 text-sm text-foreground outline-none focus:border-primary/50" placeholder="350" required />
                  <input value={enderecoRua} onChange={e => setEnderecoRua(e.target.value)} className="mt-1 h-10 flex-1 rounded-xl border border-border bg-background/80 px-3 text-sm text-foreground outline-none focus:border-primary/50" placeholder="5th Ave" required />
                </div>
              </div>
              <div>
                <label className={labelCls}>Apt / Suite / Unit <span className="text-muted-foreground/60">(opcional)</span></label>
                <input value={enderecoApt} onChange={e => setEnderecoApt(e.target.value)} className={inputCls} placeholder="Apt 12..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>City</label>
                  <input value={enderecoCidade} onChange={e => setEnderecoCidade(e.target.value)} className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input value={enderecoEstado} onChange={e => setEnderecoEstado(e.target.value.toUpperCase().slice(0,2))} className={inputCls + ' uppercase'} maxLength={2} placeholder="NY" required />
                </div>
              </div>
              <div>
                <label className={labelCls}>ZIP Code</label>
                <input value={enderecoZip} onChange={e => setEnderecoZip(e.target.value)} className={inputCls} placeholder="10118" required />
              </div>
            </div>

            <Button
              type="submit"
              className="gold-gradient-bg h-11 w-full rounded-xl font-semibold text-accent-foreground hover:opacity-90"
              disabled={loading}
              style={{ boxShadow: loading ? 'none' : 'var(--gold-shadow)' }}
            >
              {loading ? 'Cadastrando...' : 'Criar conta'}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Já tem conta?{' '}
              <a href="/login" className="font-medium text-primary transition hover:text-primary/80">
                Entrar
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
