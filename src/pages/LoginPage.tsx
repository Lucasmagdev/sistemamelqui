import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginAs } = useAuth();
  const { config } = useTenant();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Autentica com Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError || !authData?.user) {
        toast.error('Usuário ou senha inválidos');
        setLoading(false);
        return;
      }
      const auth_user_id = authData.user.id;
      // 2. Busca tipo do usuário na tabela users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('tipo, nome')
        .eq('auth_user_id', auth_user_id)
        .single();
      if (userError || !userData) {
        toast.error('Usuário sem perfil vinculado.');
        setLoading(false);
        return;
      }
      window.localStorage.setItem('imperial-flow-nome', userData.nome || 'Usuário');
      loginAs(userData.tipo === 'admin' ? 'admin' : 'cliente');
      navigate(userData.tipo === 'admin' ? '/admin' : '/');
    } catch (err) {
      toast.error('Erro ao tentar logar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-2xl gold-shadow overflow-hidden border border-primary/35">
            <img src={config.logoUrl} alt={config.nomeEmpresa} className="h-full w-full object-cover" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{config.nomeEmpresa}</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">ERP Premium</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <Button type="submit" className="w-full gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow h-11" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
        <p className="text-center text-[11px] text-muted-foreground">
          © 2025 Imperial Tec Solution. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
