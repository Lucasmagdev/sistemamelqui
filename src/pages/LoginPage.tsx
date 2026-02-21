import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useTenant } from '@/contexts/TenantContext';

const MOCK_ADMIN = {
  email: 'admin@imperial.com',
  password: 'admin123',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginAs } = useAuth();
  const { config } = useTenant();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const isAdminLogin =
      normalizedEmail === MOCK_ADMIN.email && password === MOCK_ADMIN.password;

    if (normalizedEmail.includes('admin') && !isAdminLogin) {
      toast.error('Credenciais de administrador inválidas');
      return;
    }

    loginAs(isAdminLogin ? 'admin' : 'cliente');
    navigate(isAdminLogin ? '/admin' : '/');
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
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@imperial.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <Button type="submit" className="w-full gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow h-11">
            Entrar
          </Button>
        </form>

        <p className="text-center text-[11px] text-muted-foreground">
          Admin mock: {MOCK_ADMIN.email} / {MOCK_ADMIN.password}
        </p>

        <p className="text-center text-[11px] text-muted-foreground">
          © 2025 Imperial Tec Solution. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
