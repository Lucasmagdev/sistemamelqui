import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/contexts/I18nContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const { config } = useTenant();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError || !authData?.user) {
        toast.error(t('auth.invalidCredentials'));
        setLoading(false);
        return;
      }
      const authUserId = authData.user.id;
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('tipo, nome')
        .eq('auth_user_id', authUserId)
        .single();
      if (userError || !userData) {
        toast.error(t('auth.noLinkedProfile'));
        setLoading(false);
        return;
      }
      await refreshProfile();
      navigate(userData.tipo === 'admin' ? '/admin' : '/');
    } catch (_err) {
      toast.error(t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {/* Subtle radial background glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.07),transparent_60%)]" />

      <div className="relative w-full max-w-sm animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {/* Gold signature line */}
          <div className="h-[2px] w-full" style={{ background: 'var(--gold-gradient)' }} />

          <div className="space-y-7 px-8 py-8">
            {/* Logo */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="h-16 w-16 overflow-hidden rounded-2xl border border-primary/30" style={{ boxShadow: 'var(--gold-shadow)' }}>
                  <img src={config.logoUrl} alt={config.nomeEmpresa} className="h-full w-full object-cover" />
                </div>
              </div>
              <div className="text-center">
                <h1 className="text-xl font-bold text-foreground">{config.nomeEmpresa}</h1>
                <p className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">{t('common.erpPremium')}</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">{t('common.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('common.yourEmail')}
                  className="h-11 rounded-xl border-border bg-background/80 focus:border-primary/50"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">{t('common.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl border-border bg-background/80 focus:border-primary/50"
                  required
                />
              </div>
              <Button
                type="submit"
                className="gold-gradient-bg h-11 w-full rounded-xl font-semibold text-accent-foreground hover:opacity-90"
                disabled={loading}
                style={{ boxShadow: loading ? 'none' : 'var(--gold-shadow)' }}
              >
                {loading ? t('common.loading') : t('common.login')}
              </Button>
            </form>

            {/* Sign up link */}
            <p className="text-center text-xs text-muted-foreground">
              Não tem conta?{' '}
              <a href="/cadastro" className="font-medium text-primary transition hover:text-primary/80">
                Cadastre-se
              </a>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground/60">
          © 2025 Imperial Tec Solution. {t('common.rightsReserved')}
        </p>
      </div>
    </div>
  );
}
