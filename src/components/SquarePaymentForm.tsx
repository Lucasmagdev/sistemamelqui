import { useEffect, useRef, useState } from 'react';
import { Loader2, CreditCard, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { backendRequest } from '@/lib/backendClient';

interface SquareConfig {
  enabled: boolean;
  applicationId: string | null;
  locationId: string | null;
  environment: string;
}

interface Props {
  totalUsd: number;
  orderId?: number;
  onSuccess: (paymentId: string) => void;
  onError: (msg: string) => void;
}

declare global {
  interface Window {
    Square?: any;
  }
}

const CARD_BRANDS = [
  { name: 'Visa', svg: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/visa.svg' },
  { name: 'Mastercard', svg: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/mastercard.svg' },
  { name: 'Amex', svg: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/americanexpress.svg' },
];

let squareConfigCache: SquareConfig | null = null;

async function loadSquareConfig(): Promise<SquareConfig> {
  if (squareConfigCache) return squareConfigCache;
  const data = await backendRequest<SquareConfig>('/api/square/config');
  squareConfigCache = data;
  return data;
}

function loadSquareScript(env: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Square) { resolve(); return; }
    const src =
      env === 'production'
        ? 'https://web.squarecdn.com/v1/square.js'
        : 'https://sandbox.web.squarecdn.com/v1/square.js';
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Square SDK'));
    document.head.appendChild(script);
  });
}

export function SquarePaymentForm({ totalUsd, orderId, onSuccess, onError }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cardInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const cfg = await loadSquareConfig();

        if (!cfg.enabled || !cfg.applicationId || !cfg.locationId) {
          setUnavailable(true);
          setLoading(false);
          return;
        }

        await loadSquareScript(cfg.environment);

        // Wait for the container to be painted and visible before attaching.
        // Square SDK throws "unable to be initialized in time" if the div has
        // zero dimensions (e.g. modal still animating when attach() is called).
        await new Promise<void>(resolve => setTimeout(resolve, 300));

        if (cancelled || !cardRef.current) return;

        const payments = window.Square.payments(cfg.applicationId, cfg.locationId);
        const card = await payments.card();
        await card.attach(cardRef.current);
        cardInstanceRef.current = card;
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Erro ao inicializar pagamento');
          setLoading(false);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const handlePay = async () => {
    if (!cardInstanceRef.current) return;
    setPaying(true);
    setError(null);

    try {
      const result = await cardInstanceRef.current.tokenize();

      if (result.status !== 'OK') {
        const msg = result.errors?.[0]?.message || 'Dados do cartão inválidos';
        setError(msg);
        setPaying(false);
        return;
      }

      const sourceId = result.token;

      const payment = await backendRequest<{ ok: boolean; paymentId: string }>('/api/square/payment', {
        method: 'POST',
        body: JSON.stringify({
          sourceId,
          amount: totalUsd,
          currency: 'USD',
          orderId,
          note: `Imperial Meat - Pedido #${orderId || 'online'}`,
        }),
      });

      if (payment.ok) {
        setSuccess(true);
        setTimeout(() => onSuccess(payment.paymentId), 1200);
      } else {
        throw new Error('Pagamento não aprovado');
      }
    } catch (e: any) {
      const msg = e?.message || 'Erro ao processar pagamento';
      setError(msg);
      onError(msg);
    } finally {
      setPaying(false);
    }
  };

  if (unavailable) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        Pagamento com cartão via Square não configurado ainda.
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="rounded-full bg-green-100 p-4">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <p className="text-base font-semibold text-foreground">Pagamento aprovado!</p>
        <p className="text-sm text-muted-foreground">Seu pedido foi confirmado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CreditCard className="h-4 w-4 text-primary" />
          Dados do Cartão
        </div>
        <div className="flex items-center gap-1.5">
          {CARD_BRANDS.map((brand) => (
            <img
              key={brand.name}
              src={brand.svg}
              alt={brand.name}
              title={brand.name}
              className="h-5 w-auto opacity-50 grayscale"
            />
          ))}
        </div>
      </div>

      <div
        ref={cardRef}
        className="min-h-[90px] rounded-xl border border-border bg-card p-3"
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando formulário seguro...
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
        Pagamento seguro — criptografado pela Square (PCI DSS)
      </div>

      <Button
        type="button"
        onClick={handlePay}
        disabled={loading || paying}
        className="w-full font-semibold"
        style={{ background: 'var(--gold-gradient)', color: 'hsl(var(--primary-foreground))' }}
      >
        {paying ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</>
        ) : (
          `Pagar $${totalUsd.toFixed(2)}`
        )}
      </Button>
    </div>
  );
}
