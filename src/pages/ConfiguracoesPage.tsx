import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { backendRequest } from '@/lib/backendClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Copy, MessageSquareText, PowerOff, QrCode, RefreshCw, Smartphone, Trash2, Truck, Upload, Users, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

type TemplateLocale = {
  pt: string;
  en: string;
};

type ZapiTemplates = {
  confirmed: TemplateLocale;
  out_for_delivery: TemplateLocale;
};

type TemplatesResponse = {
  ok: true;
  tenantId: number;
  placeholders: string[];
  defaults: ZapiTemplates;
  templates: ZapiTemplates;
};

type ZapiConnectionResponse = {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  connectedKnown: boolean;
  status: string | null;
  reason: string | null;
  phone: string | null;
  phoneSource: string | null;
  phoneSourcePath: string | null;
  phoneConfidence: string | null;
  checkedAt: string;
};

type ZapiQrResponse = {
  ok: boolean;
  configured: boolean;
  qrCodeDataUrl: string | null;
  mimeType: string | null;
  reason: string | null;
  fetchedAt: string;
};

type ZapiGroupOption = {
  id: string;
  name: string;
};

type ZapiGroupsResponse = {
  ok: boolean;
  configured: boolean;
  reason: string | null;
  groups: ZapiGroupOption[];
  config?: {
    orderConfirmedGroupId: string | null;
    orderConfirmedGroupName: string | null;
  };
};

const emptyTemplates: ZapiTemplates = {
  confirmed: { pt: '', en: '' },
  out_for_delivery: { pt: '', en: '' },
};

const previewData = {
  nome: 'Maria',
  codigo_pedido: 'IMP123',
  itens: '- Costela: 2\n- Linguica: 1',
  itens_bloco: 'Itens do pedido:\n- Costela: 2\n- Linguica: 1',
  total_estimado: '$48.50',
  total_bloco: 'Total estimado: $48.50',
  endereco_entrega: '123 Main St, Dallas, TX',
  endereco_bloco: 'Endereco de entrega: 123 Main St, Dallas, TX',
};

const eventMeta = {
  confirmed: {
    title: 'Pedido confirmado',
    description: 'Enviado quando o status muda para confirmado.',
    icon: MessageSquareText,
  },
  out_for_delivery: {
    title: 'Saiu para entrega',
    description: 'Enviado quando o status muda para entrega.',
    icon: Truck,
  },
} as const;

function renderPreview(template: string) {
  let output = template || '';
  for (const [key, value] of Object.entries(previewData)) {
    output = output.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
  }

  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function ConfiguracoesPage() {
  const { config, updateConfig } = useTenant();
  const [nome, setNome] = useState(config.nomeEmpresa);
  const [cor, setCor] = useState(config.corPrimaria);
  const [logoUrl, setLogoUrl] = useState(config.logoUrl || '');
  const [publicStoreUrl, setPublicStoreUrl] = useState(config.publicStoreUrl || '');
  const [templates, setTemplates] = useState<ZapiTemplates>(emptyTemplates);
  const [defaultTemplates, setDefaultTemplates] = useState<ZapiTemplates>(emptyTemplates);
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [activeTemplateType, setActiveTemplateType] = useState<keyof ZapiTemplates>('confirmed');
  const [activeLocale, setActiveLocale] = useState<keyof TemplateLocale>('pt');
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null);
  const [veoQrBase64, setVeoQrBase64] = useState<string | null>(null);
  const [veoPaymentLink, setVeoPaymentLink] = useState('');
  const [loadingVeoQr, setLoadingVeoQr] = useState(true);
  const [savingVeoQr, setSavingVeoQr] = useState(false);
  const veoFileRef = useRef<HTMLInputElement>(null);
  const [zapiConnection, setZapiConnection] = useState<ZapiConnectionResponse | null>(null);
  const [loadingZapiConnection, setLoadingZapiConnection] = useState(true);
  const [refreshingZapiConnection, setRefreshingZapiConnection] = useState(false);
  const [zapiQrCodeDataUrl, setZapiQrCodeDataUrl] = useState<string | null>(null);
  const [loadingZapiQrCode, setLoadingZapiQrCode] = useState(false);
  const [refreshingZapiQrCode, setRefreshingZapiQrCode] = useState(false);
  const [disconnectingZapi, setDisconnectingZapi] = useState(false);
  const [zapiQrFetchedAt, setZapiQrFetchedAt] = useState<string | null>(null);
  const [zapiQrReason, setZapiQrReason] = useState<string | null>(null);
  const [zapiGroups, setZapiGroups] = useState<ZapiGroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [savingGroups, setSavingGroups] = useState(false);

  useEffect(() => {
    setNome(config.nomeEmpresa);
    setCor(config.corPrimaria);
    setLogoUrl(config.logoUrl || '');
    setPublicStoreUrl(config.publicStoreUrl || '');
  }, [config.corPrimaria, config.logoUrl, config.nomeEmpresa, config.publicStoreUrl]);

  useEffect(() => {
    let active = true;
    const loadVemoQr = async () => {
      try {
        setLoadingVeoQr(true);
        const res = await backendRequest<{ ok: true; hasQrCode: boolean; base64: string | null; paymentLink: string | null }>('/api/admin/vemo-qr-code');
        if (!active) return;
        setVeoQrBase64(res.base64 || null);
        setVeoPaymentLink(res.paymentLink || '');
      } catch {
        // silently ignore, qr can be unset
      } finally {
        if (active) setLoadingVeoQr(false);
      }
    };
    void loadVemoQr();
    return () => { active = false; };
  }, []);

  const loadZapiConnection = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'refresh') => {
    try {
      if (mode === 'initial') {
        setLoadingZapiConnection(true);
      } else if (mode === 'refresh') {
        setRefreshingZapiConnection(true);
      }

      const response = await backendRequest<ZapiConnectionResponse>('/api/admin/zapi-connection');
      setZapiConnection(response);

      if (response.connected) {
        setZapiQrCodeDataUrl(null);
      }
    } catch (error: any) {
      if (mode !== 'silent') toast.error(error.message || 'Erro ao carregar conexao da Z-API');
    } finally {
      if (mode !== 'silent') {
        setLoadingZapiConnection(false);
        setRefreshingZapiConnection(false);
      }
    }
  }, []);

  const loadZapiQrCode = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'refresh') => {
    try {
      if (mode === 'initial') {
        setLoadingZapiQrCode(true);
      } else if (mode === 'refresh') {
        setRefreshingZapiQrCode(true);
      }

      const response = await backendRequest<ZapiQrResponse>('/api/admin/zapi-qr-code');
      setZapiQrCodeDataUrl(response.qrCodeDataUrl || null);
      setZapiQrFetchedAt(response.fetchedAt || null);
      setZapiQrReason(response.reason || null);

      if (!response.ok && response.reason !== 'already-connected' && mode !== 'silent') {
        toast.error(response.reason || 'Nao foi possivel carregar o QR Code da Z-API');
      }
    } catch (error: any) {
      if (mode !== 'silent') toast.error(error.message || 'Erro ao carregar QR Code da Z-API');
    } finally {
      if (mode !== 'silent') {
        setLoadingZapiQrCode(false);
        setRefreshingZapiQrCode(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadZapiConnection('initial');

    const intervalId = window.setInterval(() => {
      void loadZapiConnection('silent');
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadZapiConnection]);

  useEffect(() => {
    if (!zapiConnection?.configured) {
      setZapiQrCodeDataUrl(null);
      setZapiQrFetchedAt(null);
      setZapiQrReason(null);
      setLoadingZapiQrCode(false);
      return;
    }

    if (zapiConnection.connected) {
      setZapiQrCodeDataUrl(null);
      setZapiQrReason('already-connected');
      setLoadingZapiQrCode(false);
      return;
    }

    if (!zapiQrCodeDataUrl) {
      void loadZapiQrCode('initial');
    }
  }, [loadZapiQrCode, zapiConnection?.configured, zapiConnection?.connected, zapiQrCodeDataUrl]);

  useEffect(() => {
    if (!zapiConnection?.configured || zapiConnection.connected) return;

    const intervalId = window.setInterval(() => {
      void loadZapiQrCode('silent');
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [loadZapiQrCode, zapiConnection?.configured, zapiConnection?.connected]);

  const handleVeoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setVeoQrBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveVeoQr = async () => {
    if (!veoQrBase64 && !veoPaymentLink.trim()) return;
    try {
      setSavingVeoQr(true);
      await backendRequest('/api/admin/vemo-qr-code', {
        method: 'PATCH',
        body: JSON.stringify({ base64: veoQrBase64 || '', paymentLink: veoPaymentLink.trim() }),
      });
      toast.success('Configuracao do Vemo salva!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar configuracao do Vemo');
    } finally {
      setSavingVeoQr(false);
    }
  };

  const handleRemoveVeoQr = async () => {
    try {
      setSavingVeoQr(true);
      await backendRequest('/api/admin/vemo-qr-code', { method: 'DELETE' });
      setVeoQrBase64(null);
      setVeoPaymentLink('');
      if (veoFileRef.current) veoFileRef.current.value = '';
      toast.success('Configuracao do Vemo removida!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao remover configuracao do Vemo');
    } finally {
      setSavingVeoQr(false);
    }
  };

  const handleDisconnectZapi = async () => {
    try {
      setDisconnectingZapi(true);
      const response = await backendRequest<{ ok: boolean; configured: boolean; reason: string | null }>('/api/admin/zapi-disconnect', {
        method: 'POST',
      });

      if (!response.ok) {
        toast.error(response.reason || 'Nao foi possivel desconectar a instancia');
        return;
      }

      toast.success('Instancia Z-API desconectada');
      setZapiQrCodeDataUrl(null);
      setZapiQrFetchedAt(null);
      setZapiQrReason(null);
      await loadZapiConnection('refresh');
      await loadZapiQrCode('refresh');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao desconectar a instancia Z-API');
    } finally {
      setDisconnectingZapi(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadTemplates = async () => {
      try {
        setLoadingTemplates(true);
        const response = await backendRequest<TemplatesResponse>('/api/admin/zapi-message-templates');
        if (!active) return;
        setTemplates(response.templates || emptyTemplates);
        setDefaultTemplates(response.defaults || emptyTemplates);
        setPlaceholders(response.placeholders || []);
      } catch (error: any) {
        if (!active) return;
        toast.error(error.message || 'Erro ao carregar mensagens da Z-API');
      } finally {
        if (active) setLoadingTemplates(false);
      }
    };

    void loadTemplates();

    return () => {
      active = false;
    };
  }, []);

  const loadZapiGroups = useCallback(async () => {
    try {
      setLoadingGroups(true);
      const response = await backendRequest<ZapiGroupsResponse>('/api/admin/zapi-groups');
      setZapiGroups(response.groups || []);
      setSelectedGroupId(response.config?.orderConfirmedGroupId || '');
      setSelectedGroupName(response.config?.orderConfirmedGroupName || '');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar grupos da Z-API');
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    void loadZapiGroups();
  }, [loadZapiGroups]);

  const previews = useMemo(() => ({
    confirmed: {
      pt: renderPreview(templates.confirmed.pt),
      en: renderPreview(templates.confirmed.en),
    },
    out_for_delivery: {
      pt: renderPreview(templates.out_for_delivery.pt),
      en: renderPreview(templates.out_for_delivery.en),
    },
  }), [templates]);

  const handleSaveBrand = async () => {
    try {
      await updateConfig({ nomeEmpresa: nome, corPrimaria: cor, logoUrl, publicStoreUrl });
      toast.success('Branding salvo com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar branding');
    }
  };

  const handleSaveGroup = async () => {
    try {
      setSavingGroups(true);
      const selected = zapiGroups.find((group) => group.id === selectedGroupId);
      await backendRequest('/api/admin/zapi-groups', {
        method: 'PATCH',
        body: JSON.stringify({
          orderConfirmedGroupId: selectedGroupId,
          orderConfirmedGroupName: selected?.name || selectedGroupName || '',
        }),
      });
      setSelectedGroupName(selected?.name || selectedGroupName || '');
      toast.success('Grupo de pedido confirmado salvo!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar grupo da Z-API');
    } finally {
      setSavingGroups(false);
    }
  };

  const handleTemplateChange = (type: keyof ZapiTemplates, locale: keyof TemplateLocale, value: string) => {
    setTemplates((current) => ({
      ...current,
      [type]: {
        ...current[type],
        [locale]: value,
      },
    }));
  };

  const handleSaveTemplates = async () => {
    try {
      setSavingTemplates(true);
      const response = await backendRequest<TemplatesResponse>('/api/admin/zapi-message-templates', {
        method: 'PATCH',
        body: JSON.stringify({ templates }),
      });
      setTemplates(response.templates || emptyTemplates);
      setDefaultTemplates(response.defaults || emptyTemplates);
      setPlaceholders(response.placeholders || []);
      toast.success('Mensagens da Z-API salvas!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar mensagens da Z-API');
    } finally {
      setSavingTemplates(false);
    }
  };

  const handleRestoreDefaults = async () => {
    try {
      setSavingTemplates(true);
      const response = await backendRequest<TemplatesResponse>('/api/admin/zapi-message-templates', {
        method: 'PATCH',
        body: JSON.stringify({ templates: defaultTemplates }),
      });
      setTemplates(response.templates || emptyTemplates);
      setDefaultTemplates(response.defaults || emptyTemplates);
      setPlaceholders(response.placeholders || []);
      toast.success('Padroes da Z-API restaurados!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao restaurar padroes da Z-API');
    } finally {
      setSavingTemplates(false);
    }
  };

  const handleCopyPlaceholder = async (placeholder: string) => {
    try {
      await navigator.clipboard.writeText(placeholder);
      setCopiedPlaceholder(placeholder);
      toast.success('Placeholder copiado');
      window.setTimeout(() => {
        setCopiedPlaceholder((current) => (current === placeholder ? null : current));
      }, 1500);
    } catch {
      toast.error('Nao foi possivel copiar o placeholder');
    }
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    setTemplates((current) => ({
      ...current,
      [activeTemplateType]: {
        ...current[activeTemplateType],
        [activeLocale]: `${current[activeTemplateType][activeLocale]}${current[activeTemplateType][activeLocale] ? '\n' : ''}${placeholder}`,
      },
    }));
  };

  const activePreview = previews[activeTemplateType][activeLocale];
  const activeTemplate = templates[activeTemplateType][activeLocale];
  const activeEvent = eventMeta[activeTemplateType];
  const ActiveEventIcon = activeEvent.icon;
  const zapiConfigured = Boolean(zapiConnection?.configured);
  const zapiConnected = Boolean(zapiConnection?.connected);
  const zapiStatusLabel = !zapiConfigured
    ? 'Nao configurado'
    : zapiConnected
      ? 'Conectado'
      : zapiConnection?.connectedKnown
        ? 'Desconectado'
        : 'Verificando';
  const zapiStatusClass = !zapiConfigured
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
    : zapiConnected
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  const zapiLastCheckedLabel = zapiConnection?.checkedAt ? new Date(zapiConnection.checkedAt).toLocaleString('pt-BR') : 'agora';
  const zapiQrFetchedLabel = zapiQrFetchedAt ? new Date(zapiQrFetchedAt).toLocaleString('pt-BR') : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuracoes</h1>
        <p className="text-sm text-muted-foreground">White label local e mensagens automaticas da Z-API</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 card-elevated space-y-5">
        <div className="space-y-1.5">
          <Label>Nome da Empresa</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cor Primaria</Label>
          <div className="flex items-center gap-3">
            <Input value={cor} onChange={(e) => setCor(e.target.value)} className="max-w-[200px]" />
            <div className="h-10 w-10 rounded-md border border-border" style={{ backgroundColor: cor }} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Logo (URL)</Label>
          <Input value={logoUrl} placeholder="https://..." onChange={(e) => setLogoUrl(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>URL publica da loja</Label>
          <Input value={publicStoreUrl} placeholder="https://seudominio.com" onChange={(e) => setPublicStoreUrl(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Essa URL sera usada no QR Code da nota digital, mesmo quando o PDF for gerado localmente.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Tenant ID</Label>
          <Input value={config.tenantId} disabled className="bg-muted" />
        </div>
        <Button onClick={handleSaveBrand} className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
          Salvar branding
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 card-elevated space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border/70 bg-muted/40 p-2.5">
            <QrCode className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">QR Code Vemo</h2>
            <p className="text-sm text-muted-foreground">Imagem enviada automaticamente ao cliente quando o pedido for confirmado com pagamento Vemo. Voce tambem pode incluir um link de pagamento na mesma mensagem.</p>
          </div>
        </div>

        {loadingVeoQr ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-col gap-3 flex-1">
              <Label>Imagem do QR code</Label>
              <input
                ref={veoFileRef}
                type="file"
                accept="image/*"
                onChange={handleVeoFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
              />
              <div className="space-y-2">
                <Label>Link de pagamento Vemo</Label>
                <Input
                  value={veoPaymentLink}
                  onChange={(e) => setVeoPaymentLink(e.target.value)}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground">
                  Esse link vai junto com o QR code na mensagem enviada ao cliente.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveVeoQr}
                  disabled={savingVeoQr || (!veoQrBase64 && !veoPaymentLink.trim())}
                  className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {savingVeoQr ? 'Salvando...' : 'Salvar configuracao'}
                </Button>
                {(veoQrBase64 || veoPaymentLink.trim()) && (
                  <Button variant="outline" onClick={handleRemoveVeoQr} disabled={savingVeoQr} className="border-border/80">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </Button>
                )}
              </div>
            </div>
            {veoQrBase64 && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">Previa</p>
                <img src={veoQrBase64} alt="QR Code Vemo" className="h-40 w-40 rounded-xl border border-border object-contain bg-white p-2" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 card-elevated space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border/70 bg-muted/40 p-2.5">
              {zapiConnected ? <Wifi className="h-5 w-5 text-primary" /> : <WifiOff className="h-5 w-5 text-primary" />}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Conexao WhatsApp Z-API</h2>
              <p className="text-sm text-muted-foreground">
                Mostra se a instancia esta conectada, exibe o QR Code para pareamento e permite desconectar pelo admin.
              </p>
            </div>
          </div>
          <Badge variant="outline" className={`px-3 py-1 text-[11px] font-medium ${zapiStatusClass}`}>
            {zapiStatusLabel}
          </Badge>
        </div>

        {loadingZapiConnection ? (
          <p className="text-sm text-muted-foreground">Carregando status da Z-API...</p>
        ) : (
          <div className="space-y-4">
            {!zapiConfigured ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
                Configure `ZAPI_INSTANCE_ID` e `ZAPI_INSTANCE_TOKEN` no `backend/.env` para habilitar a conexao do WhatsApp.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border/80 bg-background/50 p-4 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Telefone conectado</p>
                    <div className="flex items-center gap-2 text-foreground">
                      <Smartphone className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{zapiConnection?.phone || 'Nao identificado ainda'}</span>
                    </div>
                    {zapiConnection?.phoneSource && (
                      <p className="text-xs text-muted-foreground">
                        Origem: {zapiConnection.phoneSourcePath || zapiConnection.phoneSource}
                        {zapiConnection.phoneConfidence ? ` (${zapiConnection.phoneConfidence})` : ''}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/80 bg-background/50 p-4 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado da instancia</p>
                    <p className="font-semibold text-foreground">{zapiConnection?.status || (zapiConnected ? 'connected' : 'disconnected')}</p>
                    <p className="text-xs text-muted-foreground">
                      Ultima verificacao: {zapiConnection?.checkedAt ? new Date(zapiConnection.checkedAt).toLocaleString('pt-BR') : 'agora'}
                    </p>
                    {zapiConnection?.reason && (
                      <p className="text-xs text-amber-200">Detalhe: {zapiConnection.reason}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                      type="button"
                      variant="outline"
                      onClick={() => void loadZapiConnection('refresh')}
                      disabled={refreshingZapiConnection}
                      className="border-border/80 bg-background/70"
                    >
                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshingZapiConnection ? 'animate-spin' : ''}`} />
                    Atualizar status
                  </Button>

                  {!zapiConnected && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void loadZapiQrCode('refresh')}
                      disabled={loadingZapiQrCode || refreshingZapiQrCode}
                      className="border-border/80 bg-background/70"
                    >
                      <QrCode className="mr-2 h-4 w-4" />
                      {loadingZapiQrCode || refreshingZapiQrCode ? 'Atualizando QR...' : 'Atualizar QR'}
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDisconnectZapi}
                    disabled={!zapiConfigured || disconnectingZapi}
                    className="border-border/80 bg-background/70"
                  >
                    <PowerOff className="mr-2 h-4 w-4" />
                    {disconnectingZapi ? 'Desconectando...' : 'Desconectar instancia'}
                  </Button>
                </div>

                {zapiConnected && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_55%),linear-gradient(180deg,rgba(16,185,129,0.08),rgba(16,185,129,0.03))] p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Wifi className="h-5 w-5 text-emerald-300" />
                          <p className="text-lg font-semibold text-emerald-50">WhatsApp conectado</p>
                        </div>
                        <p className="text-sm text-emerald-100/80">
                          A instancia da Z-API esta ativa e pronta para enviar mensagens pelo sistema.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
                            numero: {zapiConnection?.phone || 'nao identificado'}
                          </Badge>
                          <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
                            status: {zapiConnection?.status || 'connected'}
                          </Badge>
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-400/20 bg-black/20 px-4 py-3 text-right">
                        <p className="text-xs uppercase tracking-wide text-emerald-100/60">ultima verificacao</p>
                        <p className="text-sm font-medium text-emerald-50">{zapiLastCheckedLabel}</p>
                      </div>
                    </div>
                  </div>
                )}

                {!zapiConnected && (
                  <div className="rounded-xl border border-border/80 bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">QR Code para conectar WhatsApp</p>
                        <p className="text-xs text-muted-foreground">
                          Abra o WhatsApp no celular, entre em dispositivos conectados e escaneie este QR.
                        </p>
                        {zapiQrFetchedLabel && (
                          <p className="text-xs text-muted-foreground">Ultima atualizacao do QR: {zapiQrFetchedLabel}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-200">
                        aguardando pareamento
                      </Badge>
                    </div>

                    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="flex min-h-[220px] min-w-[220px] items-center justify-center rounded-2xl border border-border bg-white p-3">
                        {zapiQrCodeDataUrl ? (
                          <img src={zapiQrCodeDataUrl} alt="QR Code Z-API" className="h-52 w-52 object-contain" />
                        ) : (
                          <p className="max-w-[220px] text-center text-sm text-muted-foreground">
                            {loadingZapiQrCode
                              ? 'Buscando QR Code...'
                              : zapiQrReason === 'already-connected'
                                ? 'A instancia conectou. Atualize o status para ver o estado ativo.'
                                : 'O QR Code ainda nao foi retornado pela Z-API. Clique em atualizar QR.'}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p>1. No celular, abra o WhatsApp.</p>
                        <p>2. Entre em dispositivos conectados.</p>
                        <p>3. Escaneie o QR mostrado nesta tela.</p>
                        <p>4. Assim que conectar, o status acima muda automaticamente.</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 card-elevated space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border/70 bg-muted/40 p-2.5">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Grupo para pedido confirmado</h2>
            <p className="text-sm text-muted-foreground">Selecione o grupo da Z-API que vai receber o resumo quando um pedido for confirmado.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="space-y-1.5">
            <Label>Grupo do WhatsApp</Label>
            <select
              value={selectedGroupId}
              onChange={(event) => {
                const nextId = event.target.value;
                const nextGroup = zapiGroups.find((group) => group.id === nextId);
                setSelectedGroupId(nextId);
                setSelectedGroupName(nextGroup?.name || '');
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={loadingGroups}
            >
              <option value="">Nao enviar para grupo</option>
              {zapiGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadZapiGroups()} disabled={loadingGroups} className="self-end border-border/80 bg-background/70">
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingGroups ? 'animate-spin' : ''}`} />
            Atualizar grupos
          </Button>
          <Button type="button" onClick={handleSaveGroup} disabled={savingGroups} className="self-end gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow">
            {savingGroups ? 'Salvando...' : 'Salvar grupo'}
          </Button>
        </div>

        {selectedGroupName ? (
          <div className="rounded-xl border border-border/70 bg-background/50 p-4 text-sm text-muted-foreground">
            Grupo selecionado: <span className="font-semibold text-foreground">{selectedGroupName}</span>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 card-elevated space-y-6">
        <div className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-foreground">Mensagens automaticas do WhatsApp</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              O admin pode cadastrar os textos usados no pedido confirmado e no pedido saiu para entrega.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-200">
              2 eventos configuraveis
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200">
              Preview em tempo real
            </Badge>
          </div>
        </div>

        <Tabs value={activeTemplateType} onValueChange={(value) => setActiveTemplateType(value as keyof ZapiTemplates)} className="space-y-5">
          <TabsList className="grid h-auto grid-cols-1 gap-2 bg-transparent p-0 lg:grid-cols-2">
            {Object.entries(eventMeta).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="h-auto rounded-xl border border-border/80 bg-background/60 px-4 py-4 data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <div className="flex w-full items-start gap-3 text-left">
                    <div className="mt-0.5 rounded-lg border border-border/70 bg-muted/40 p-2">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold">{meta.title}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{meta.description}</div>
                    </div>
                  </div>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {Object.keys(eventMeta).map((typeKey) => (
            <TabsContent key={typeKey} value={typeKey} className="mt-0">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div className="space-y-5 rounded-2xl border border-border/80 bg-background/40 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl border border-border/70 bg-muted/40 p-2.5">
                        <ActiveEventIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{activeEvent.title}</h3>
                        <p className="text-sm text-muted-foreground">{activeEvent.description}</p>
                      </div>
                    </div>
                    <Tabs value={activeLocale} onValueChange={(value) => setActiveLocale(value as keyof TemplateLocale)}>
                      <TabsList className="bg-muted/60">
                        <TabsTrigger value="pt">PT-BR</TabsTrigger>
                        <TabsTrigger value="en">EN</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Atalhos de placeholders</p>
                        <p className="text-xs text-muted-foreground">
                          Clique para inserir no template atual ou use copiar para colar onde quiser.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {placeholders.map((placeholder) => (
                        <div key={placeholder} className="flex items-center gap-1 rounded-full border border-border bg-background/70 p-1">
                          <button
                            type="button"
                            onClick={() => handleInsertPlaceholder(placeholder)}
                            className="rounded-full px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                          >
                            {placeholder}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyPlaceholder(placeholder)}
                            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                            aria-label={`Copiar ${placeholder}`}
                            title={`Copiar ${placeholder}`}
                          >
                            {copiedPlaceholder === placeholder ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Os blocos `itens_bloco`, `total_bloco` e `endereco_bloco` sao ideais quando voce quer ocultar a linha automaticamente se nao houver conteudo.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>{activeLocale === 'pt' ? 'Template em portugues' : 'Template em ingles'}</Label>
                      <span className="text-xs text-muted-foreground">
                        {activeTemplate.trim().split(/\s+/).filter(Boolean).length} palavras
                      </span>
                    </div>
                    <Textarea
                      value={activeTemplate}
                      onChange={(e) => handleTemplateChange(activeTemplateType, activeLocale, e.target.value)}
                      className="min-h-[320px] resize-y rounded-xl border-border/80 bg-background/70 font-medium leading-6"
                      disabled={loadingTemplates}
                    />
                  </div>
                </div>

                <aside className="space-y-4 rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 to-background p-5">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Previa da mensagem</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Exemplo com dados ficticios para validar leitura, espacamento e placeholders.
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-emerald-500/20 bg-[#111714] p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.05)]">
                    <div className="rounded-[18px] bg-[#0b0f0d] p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-emerald-500/20" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-50">WhatsApp cliente</p>
                          <p className="text-[11px] text-emerald-200/60">{activeLocale === 'pt' ? 'Visualizacao do envio' : 'Send preview'}</p>
                        </div>
                      </div>
                      <div className="max-h-[360px] overflow-auto rounded-2xl bg-[#17221b] px-4 py-3 text-sm leading-6 text-emerald-50 whitespace-pre-wrap">
                        {activePreview || 'Sem texto'}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                    <p className="text-sm font-medium text-foreground">Boas praticas</p>
                    <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                      <li>Mantenha a primeira linha objetiva com o status e o codigo do pedido.</li>
                      <li>Use blocos para itens, total e endereco sem deixar linhas vazias desnecessarias.</li>
                      <li>Evite mensagens muito longas para nao prejudicar leitura no celular.</li>
                    </ul>
                  </div>
                </aside>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleRestoreDefaults}
            disabled={loadingTemplates || savingTemplates}
            className="border-border/80 bg-background/70"
          >
            Restaurar padroes
          </Button>
          <Button
            onClick={handleSaveTemplates}
            disabled={loadingTemplates || savingTemplates}
            className="gold-gradient-bg text-accent-foreground font-semibold hover:opacity-90 gold-shadow"
          >
            {savingTemplates ? 'Salvando mensagens...' : 'Salvar mensagens da Z-API'}
          </Button>
        </div>
      </div>
    </div>
  );
}
