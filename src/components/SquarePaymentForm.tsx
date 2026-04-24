import { useEffect, useRef, useState } from 'react';
import { Loader2, CreditCard, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Lock } from 'lucide-react';
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

// Maps Square error codes / messages to friendly Portuguese guidance.
function friendlyError(raw: string): { title: string; hint: string } {
  const code = raw.toUpperCase();
  if (code.includes('PAN_FAILURE') || code.includes('INVALID_CARD'))
    return { title: 'Número do cartão inválido', hint: 'Confira os 16 dígitos e tente novamente.' };
  if (code.includes('CVV_FAILURE') || code.includes('VERIFY_CVV'))
    return { title: 'Código de segurança incorreto', hint: 'O CVV fica no verso do cartão (3 ou 4 dígitos).' };
  if (code.includes('EXPIRATION') || code.includes('EXPIRED'))
    return { title: 'Cartão vencido', hint: 'Use outro cartão com validade em dia.' };
  if (code.includes('AVS') || code.includes('ADDRESS'))
    return { title: 'CEP não corresponde ao cartão', hint: 'Digite o CEP cadastrado no cartão.' };
  if (code.includes('INSUFFICIENT_FUNDS'))
    return { title: 'Saldo insuficiente', hint: 'Tente outro cartão ou entre em contato com seu banco.' };
  if (code.includes('CARD_NOT_SUPPORTED'))
    return { title: 'Cartão não aceito', hint: 'Aceitamos Visa, Mastercard e Amex.' };
  if (code.includes('PAYMENT_LIMIT'))
    return { title: 'Limite do cartão excedido', hint: 'Tente outro cartão ou contate seu banco.' };
  if (code.includes('DECLINED') || code.includes('GENERIC_DECLINE'))
    return { title: 'Pagamento recusado pelo banco', hint: 'Seu banco não autorizou. Tente outro cartão ou ligue para seu banco.' };
  if (code.includes('TIMEOUT') || code.includes('INITIALIZED'))
    return { title: 'Tempo de conexão esgotado', hint: 'Verifique sua internet e tente novamente.' };
  return { title: 'Não foi possível processar', hint: 'Verifique os dados e tente novamente. Se o problema persistir, escolha outra forma de pagamento.' };
}

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
    script.onerror = () => reject(new Error('TIMEOUT'));
    document.head.appendChild(script);
  });
}

type Phase = 'loading' | 'ready' | 'paying' | 'success' | 'failed' | 'unavailable' | 'init_error';

export function SquarePaymentForm({ totalUsd, orderId, onSuccess, onError }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cardInstanceRef = useRef<any>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ title: string; hint: string } | null>(null);

  async function initCard() {
    setPhase('loading');
    setFailure(null);
    cardInstanceRef.current = null;

    try {
      const cfg = await loadSquareConfig();

      if (!cfg.enabled || !cfg.applicationId || !cfg.locationId) {
        setPhase('unavailable');
        return;
      }

      await loadSquareScript(cfg.environment);

      // Wait for container to be painted before attach() — Square SDK requires
      // the div to have non-zero dimensions or throws "unable to be initialized".
      await new Promise<void>(resolve => setTimeout(resolve, 300));

      if (!cardRef.current) return;

      const payments = window.Square.payments(cfg.applicationId, cfg.locationId);
      const card = await payments.card();
      await card.attach(cardRef.current);
      cardInstanceRef.current = card;
      setPhase('ready');
    } catch (e: any) {
      setPhase('init_error');
    }
  }

  useEffect(() => {
    initCard();
  }, []);

  const handlePay = async () => {
    if (!cardInstanceRef.current) return;
    setPhase('paying');
    setFailure(null);

    try {
      const result = await cardInstanceRef.current.tokenize();

      if (result.status !== 'OK') {
        const rawMsg = result.errors?.[0]?.message || result.errors?.[0]?.type || 'INVALID_CARD';
        const err = friendlyError(rawMsg);
        setFailure(err);
        setPhase('failed');
        onError(err.title);
        return;
      }

      const payment = await backendRequest<{ ok: boolean; paymentId: string }>('/api/square/payment', {
        method: 'POST',
        body: JSON.stringify({
          sourceId: result.token,
          amount: totalUsd,
          currency: 'USD',
          orderId,
          note: `Imperial Meat - Pedido #${orderId || 'online'}`,
        }),
      });

      if (payment.ok) {
        setPhase('success');
        setTimeout(() => onSuccess(payment.paymentId), 1800);
      } else {
        throw new Error('DECLINED');
      }
    } catch (e: any) {
      const err = friendlyError(e?.message || 'DECLINED');
      setFailure(err);
      setPhase('failed');
      onError(err.title);
    }
  };

  // ── Unavailable ────────────────────────────────────────────────────────────
  if (phase === 'unavailable') {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        Pagamento com cartão não disponível no momento.
      </div>
    );
  }

  // ── Init error ─────────────────────────────────────────────────────────────
  if (phase === 'init_error') {
    return (
      <div className="flex flex-col items-center gap-3 py-5 text-center">
        <div className="rounded-full bg-muted p-3">
          <AlertCircle className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Não foi possível carregar o formulário</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Verifique sua conexão com a internet.</p>
        </div>
        <Button variant="outline" size="sm" onClick={initCard} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
        </Button>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (phase === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="rounded-full bg-green-100 p-4">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-foreground">Pagamento aprovado!</p>
          <p className="mt-1 text-sm text-muted-foreground">Seu pedido foi confirmado. Aguarde a confirmação.</p>
        </div>
      </div>
    );
  }

  // ── Failed ─────────────────────────────────────────────────────────────────
  if (phase === 'failed' && failure) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="mt-0.5 shrink-0 rounded-full bg-destructive/10 p-1.5">
            <AlertCircle className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-semibold text-destructive">{failure.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{failure.hint}</p>
          </div>
        </div>

        {/* Show card field again for retry */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Tente com outro cartão:</p>
          <div
            ref={cardRef}
            className="min-h-[90px] rounded-xl border border-border bg-card p-3"
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 gap-2 text-sm"
            onClick={initCard}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Recarregar
          </Button>
          <Button
            type="button"
            onClick={handlePay}
            className="flex-1 font-semibold text-sm"
            style={{ background: 'var(--gold-gradient)', color: 'hsl(var(--primary-foreground))' }}
          >
            Tentar novamente
          </Button>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Se o problema persistir, escolha outra forma de pagamento ou entre em contato.
        </p>
      </div>
    );
  }

  // ── Loading / Ready / Paying ───────────────────────────────────────────────
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

      <div className="relative">
        <div
          ref={cardRef}
          className="min-h-[90px] rounded-xl border border-border bg-card p-3"
        />
        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-card text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando formulário seguro...
          </div>
        )}
      </div>

      {phase === 'paying' && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Processando pagamento com segurança...
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3 text-primary/60" />
        <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
        Pagamento 100% seguro — criptografado pela Square (PCI DSS Level 1)
      </div>

      <Button
        type="button"
        onClick={handlePay}
        disabled={phase !== 'ready'}
        className="w-full font-semibold"
        style={{ background: 'var(--gold-gradient)', color: 'hsl(var(--primary-foreground))' }}
      >
        {phase === 'loading' ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aguardando formulário...</>
        ) : phase === 'paying' ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</>
        ) : (
          `Pagar $${totalUsd.toFixed(2)} com segurança`
        )}
      </Button>
    </div>
  );
}
