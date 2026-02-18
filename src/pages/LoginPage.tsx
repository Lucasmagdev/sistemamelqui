import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Crown } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl gold-gradient-bg gold-shadow">
            <Crown className="h-7 w-7 text-accent-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Imperial Tec Solution</h1>
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
          © 2025 Imperial Tec Solution. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
