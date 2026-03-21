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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="flex flex-col items-center gap-3">
          <div className="gold-shadow h-16 w-16 overflow-hidden rounded-2xl border border-primary/35">
            <img src={config.logoUrl} alt={config.nomeEmpresa} className="h-full w-full object-cover" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{config.nomeEmpresa}</h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{t('common.erpPremium')}</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('common.email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('common.yourEmail')}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t('common.password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="........"
              required
            />
          </div>
          <Button
            type="submit"
            className="gold-gradient-bg gold-shadow h-11 w-full font-semibold text-accent-foreground hover:opacity-90"
            disabled={loading}
          >
            {loading ? t('common.loading') : t('common.login')}
          </Button>
        </form>
        <p className="text-center text-[11px] text-muted-foreground">
          © 2025 Imperial Tec Solution. {t('common.rightsReserved')}
        </p>
      </div>
    </div>
  );
}
