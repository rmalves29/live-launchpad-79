import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  Phone,
  RefreshCw,
  Loader2,
  QrCode as QrCodeIcon,
  WifiOff,
  Save,
  Eye,
  EyeOff,
  Zap,
  Shield,
  Trash2,
  Plus,
} from "lucide-react";
import { ZAPIAdvancedSettings } from "@/components/ZAPIAdvancedSettings";

interface WhatsAppStatus {
  connected: boolean;
  status: string;
  qrCode?: string;
  hasQR?: boolean;
  message?: string;
  error?: string;
  user?: { phone?: string };
}

const POLLING_INTERVAL_MS = 5000;
const QR_CODE_EXPIRATION_SECONDS = 60;
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

type Provider = 'zapi' | 'evolution';

function maskMiddle(value: string, visible = 4): string {
  if (!value) return '';
  if (value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}${'•'.repeat(Math.min(8, value.length - visible * 2))}${value.slice(-visible)}`;
}

function formatPhone(phone?: string | null): string {
  if (!phone) return '-';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function callFunction(name: string, body: object) {
  return fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

export default function ConexaoZAPI() {
  const { tenant } = useTenantContext();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<Provider>('zapi'); // tab currently viewed
  const [activeProvider, setActiveProvider] = useState<Provider>('zapi'); // what's saved in DB
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [loadingQR, setLoadingQR] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  // Z-API fields
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [clientToken, setClientToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showClientToken, setShowClientToken] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Evolution API fields
  const [evolutionInstanceName, setEvolutionInstanceName] = useState('');
  const [evolutionDraftName, setEvolutionDraftName] = useState('');
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [deletingInstance, setDeletingInstance] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const qrTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (tenant?.id) loadIntegration();
  }, [tenant?.id]);

  useEffect(() => {
    stopPolling();
    setWhatsappStatus(null);
    setLastSyncAt(null);
    // Only poll when viewing the provider that is actually active in DB
    if (provider !== activeProvider) return () => stopPolling();
    if (provider === 'zapi' && instanceId && token) {
      startPollingZapi();
    } else if (provider === 'evolution' && evolutionInstanceName) {
      startPollingEvolution();
    }
    return () => stopPolling();
  }, [provider, activeProvider, instanceId, token, evolutionInstanceName]);

  const loadIntegration = async () => {
    if (!tenant?.id) return;
    try {
      setLoading(true);
      const { data } = await supabase
        .from('integration_whatsapp')
        .select('id, zapi_instance_id, zapi_token, zapi_client_token, evolution_instance_name, provider, is_active')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (data) {
        setIntegrationId((data as any).id);
        setInstanceId((data as any).zapi_instance_id || '');
        setToken((data as any).zapi_token || '');
        setClientToken((data as any).zapi_client_token || '');
        setEvolutionInstanceName((data as any).evolution_instance_name || '');
        const savedProvider: Provider = (data as any).provider === 'evolution' ? 'evolution' : 'zapi';
        setProvider(savedProvider);
        setActiveProvider(savedProvider);
      }
    } catch (e: any) {
      console.error('Error loading integration:', e);
    } finally {
      setLoading(false);
    }
  };

  // ─── Z-API ───────────────────────────────────────────────────────────────

  const saveZapiCredentials = async () => {
    if (!tenant?.id) return;
    if (!instanceId.trim() || !token.trim()) {
      toast({ title: 'Erro', description: 'Instance ID e Token são obrigatórios', variant: 'destructive' });
      return;
    }
    setSavingConfig(true);
    try {
      const payload = {
        zapi_instance_id: instanceId,
        zapi_token: token,
        zapi_client_token: clientToken || null,
        provider: 'zapi',
        updated_at: new Date().toISOString(),
      };
      if (integrationId) {
        const { error } = await supabase.from('integration_whatsapp').update(payload).eq('id', integrationId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('integration_whatsapp').insert({
          tenant_id: tenant.id,
          ...payload,
          instance_name: tenant.name || 'default',
          webhook_secret: crypto.randomUUID(),
          is_active: true,
        });
        if (error) throw error;
      }
      toast({ title: 'Sucesso', description: 'Configurações Z-API salvas' });
      await loadIntegration();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSavingConfig(false);
    }
  };

  const checkStatusZapi = async () => {
    if (!tenant?.id || !mountedRef.current) return;
    try {
      const data = await callFunction('zapi-proxy', { action: 'status', tenant_id: tenant.id });
      if (!mountedRef.current) return;
      setLastSyncAt(new Date());
      if (data.error) {
        setWhatsappStatus(prev => prev?.status === 'qr_ready' && prev?.qrCode ? prev : { connected: false, status: 'error', error: data.error });
        return;
      }
      if (data.connected) {
        stopQRCountdown();
        setWhatsappStatus({ connected: true, status: data.status, message: data.message, user: data.user });
      } else {
        setWhatsappStatus(prev => prev?.status === 'qr_ready' && prev?.qrCode ? prev : { connected: false, status: data.status || 'disconnected', user: data.user });
      }
    } catch (e) { console.error(e); }
  };

  const getQRCodeZapi = async () => {
    if (!tenant?.id) return;
    setLoadingQR(true);
    try {
      const data = await callFunction('zapi-proxy', { action: 'qr-code', tenant_id: tenant.id });
      if (data.qrCode) {
        setWhatsappStatus(prev => ({ ...prev, connected: false, status: 'qr_ready', qrCode: data.qrCode, hasQR: true }));
        startQRCountdown();
        toast({ title: 'QR Code gerado', description: 'Você tem 60 segundos para escanear' });
      } else if (data.error) {
        toast({ title: 'Erro', description: data.message || data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingQR(false);
    }
  };

  const handleDisconnectZapi = async () => {
    if (!tenant?.id) return;
    setIsReconnecting(true);
    try {
      await callFunction('zapi-proxy', { action: 'disconnect', tenant_id: tenant.id });
      setWhatsappStatus({ connected: false, status: 'disconnected' });
      toast({ title: 'Desconectado', description: 'Sessão WhatsApp encerrada.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setIsReconnecting(false);
    }
  };

  // ─── Evolution API ────────────────────────────────────────────────────────

  const createEvolutionInstance = async () => {
    if (!tenant?.id || !evolutionDraftName.trim()) {
      toast({ title: 'Erro', description: 'Informe um nome para a instância', variant: 'destructive' });
      return;
    }
    setCreatingInstance(true);
    try {
      const data = await callFunction('evolution-instance-manager', { action: 'create', tenant_id: tenant.id, instance_name: evolutionDraftName.trim() });
      if (data.success) {
        toast({ title: 'Instância criada', description: 'Agora gere o QR Code para conectar' });
        await loadIntegration();
      } else {
        toast({ title: 'Erro', description: data.error || 'Falha ao criar instância', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setCreatingInstance(false);
    }
  };

  const getQRCodeEvolution = async () => {
    if (!tenant?.id) return;
    setLoadingQR(true);
    try {
      const data = await callFunction('evolution-instance-manager', { action: 'qrcode', tenant_id: tenant.id });
      if (data.qrCode) {
        setWhatsappStatus(prev => ({ ...prev, connected: false, status: 'qr_ready', qrCode: data.qrCode, hasQR: true }));
        startQRCountdown();
        toast({ title: 'QR Code gerado', description: 'Você tem 60 segundos para escanear' });
      } else {
        toast({ title: 'Erro', description: data.error || 'Falha ao gerar QR Code', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingQR(false);
    }
  };

  const checkStatusEvolution = async () => {
    if (!tenant?.id || !mountedRef.current) return;
    try {
      const data = await callFunction('evolution-instance-manager', { action: 'status', tenant_id: tenant.id });
      if (!mountedRef.current) return;
      setLastSyncAt(new Date());
      if (data.connected) {
        stopQRCountdown();
        setWhatsappStatus({ connected: true, status: 'open', user: data.user });
      } else if (data.status !== 'not_configured') {
        setWhatsappStatus(prev => prev?.status === 'qr_ready' && prev?.qrCode ? prev : { connected: false, status: data.status || 'disconnected' });
      }
    } catch (e) { console.error(e); }
  };

  const deleteEvolutionInstance = async () => {
    if (!tenant?.id) return;
    if (!confirm('Tem certeza? Isso vai desconectar e remover a instância da Evolution API.')) return;
    setDeletingInstance(true);
    try {
      const data = await callFunction('evolution-instance-manager', { action: 'delete', tenant_id: tenant.id });
      if (data.success) {
        toast({ title: 'Instância removida' });
        setEvolutionInstanceName('');
        setEvolutionDraftName('');
        setWhatsappStatus(null);
        await loadIntegration();
      } else {
        toast({ title: 'Erro', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setDeletingInstance(false);
    }
  };

  // ─── Polling helpers ──────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  const startPollingZapi = useCallback(() => {
    stopPolling();
    checkStatusZapi();
    pollingRef.current = setInterval(() => { if (mountedRef.current) checkStatusZapi(); }, POLLING_INTERVAL_MS);
  }, []);

  const startPollingEvolution = useCallback(() => {
    stopPolling();
    checkStatusEvolution();
    pollingRef.current = setInterval(() => { if (mountedRef.current) checkStatusEvolution(); }, POLLING_INTERVAL_MS);
  }, []);

  const startQRCountdown = useCallback(() => {
    if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    setQrCountdown(QR_CODE_EXPIRATION_SECONDS);
    qrTimerRef.current = setInterval(() => {
      setQrCountdown(prev => {
        if (prev <= 1) {
          if (qrTimerRef.current) clearInterval(qrTimerRef.current);
          setWhatsappStatus(p => p?.status === 'qr_ready' ? { ...p, status: 'qr_expired', qrCode: undefined } : p);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const stopQRCountdown = useCallback(() => {
    if (qrTimerRef.current) { clearInterval(qrTimerRef.current); qrTimerRef.current = null; }
    setQrCountdown(0);
  }, []);

  // ─── Derived state ────────────────────────────────────────────────────────

  const isConnected = !!whatsappStatus?.connected;
  const isQrReady = whatsappStatus?.status === 'qr_ready' && whatsappStatus.qrCode;

  const lastSyncLabel = lastSyncAt
    ? (() => {
        const sec = Math.floor((Date.now() - lastSyncAt.getTime()) / 1000);
        if (sec < 10) return 'Agora há pouco';
        if (sec < 60) return `há ${sec}s`;
        return `há ${Math.floor(sec / 60)}min`;
      })()
    : '—';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">WhatsApp — Conexão</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie a conexão do seu WhatsApp</p>
      </div>

      {/* Provider selector */}
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <button
          onClick={() => setProvider('zapi')}
          className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
            provider === 'zapi'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/40 bg-card'
          }`}
        >
          <div className={`p-2 rounded-lg ${provider === 'zapi' ? 'bg-primary/10' : 'bg-muted'}`}>
            <Zap className={`h-5 w-5 ${provider === 'zapi' ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className={`text-sm font-semibold ${provider === 'zapi' ? 'text-primary' : 'text-foreground'}`}>Z-API</p>
              {activeProvider === 'zapi' && <Badge className="text-[10px] px-1 py-0 h-4 bg-primary/10 text-primary border-primary/20">Ativo</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Instância própria</p>
          </div>
        </button>

        <button
          onClick={() => setProvider('evolution')}
          className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
            provider === 'evolution'
              ? 'border-violet-500 bg-violet-500/5'
              : 'border-border hover:border-violet-400/40 bg-card'
          }`}
        >
          <div className={`p-2 rounded-lg ${provider === 'evolution' ? 'bg-violet-500/10' : 'bg-muted'}`}>
            <Shield className={`h-5 w-5 ${provider === 'evolution' ? 'text-violet-500' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className={`text-sm font-semibold ${provider === 'evolution' ? 'text-violet-600 dark:text-violet-400' : 'text-foreground'}`}>Evolution API</p>
              {activeProvider === 'evolution' && <Badge className="text-[10px] px-1 py-0 h-4 bg-violet-500/10 text-violet-600 border-violet-300 dark:text-violet-400">Ativo</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Anti-bloqueio avançado</p>
          </div>
        </button>
      </div>

      {/* Status + QR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status */}
        <Card>
          <CardContent className="p-6">
            {provider !== activeProvider && (
              <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                Este provedor não está ativo. Seu sistema usa <strong>{activeProvider === 'evolution' ? 'Evolution API' : 'Z-API'}</strong> como provedor atual.
              </div>
            )}
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40">
                <Phone className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">Status da Conexão</h2>
                <Badge
                  variant="outline"
                  className={
                    isConnected
                      ? 'mt-1 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'mt-1 bg-muted text-muted-foreground'
                  }
                >
                  {isConnected ? 'Conectado' : (isQrReady ? 'Aguardando QR' : 'Desconectado')}
                </Badge>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Número conectado</span>
                <span className="font-semibold">{formatPhone(whatsappStatus?.user?.phone)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">API</span>
                <Badge variant="outline" className={provider === 'evolution' ? 'text-violet-600 border-violet-300' : ''}>
                  {provider === 'evolution' ? 'Evolution API' : 'Z-API'}
                </Badge>
              </div>
              {provider === 'zapi' && (
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Instance ID</span>
                  <span className="font-mono">{instanceId ? maskMiddle(instanceId, 4) : '—'}</span>
                </div>
              )}
              {provider === 'evolution' && (
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Instância</span>
                  <span className="font-mono text-xs">{evolutionInstanceName || '—'}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Última sync</span>
                <span className={isConnected ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}>
                  {lastSyncLabel}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
              {provider === 'zapi' ? (
                <>
                  <Button variant="outline" onClick={handleDisconnectZapi} disabled={isReconnecting || !isConnected}>
                    {isReconnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <WifiOff className="h-4 w-4 mr-2" />}
                    Desconectar
                  </Button>
                  <Button onClick={() => getQRCodeZapi()} disabled={loadingQR || isConnected}>
                    {loadingQR ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Reconectar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={deleteEvolutionInstance}
                    disabled={deletingInstance || !evolutionInstanceName}
                    className="text-destructive hover:text-destructive"
                  >
                    {deletingInstance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Remover
                  </Button>
                  <Button onClick={getQRCodeEvolution} disabled={loadingQR || !evolutionInstanceName || isConnected}>
                    {loadingQR ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Reconectar
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card>
          <CardContent className="p-6 flex flex-col items-center">
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold">QR Code para emparelhar</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Abra o WhatsApp → Dispositivos Conectados → Conectar Dispositivo
              </p>
            </div>

            <div className="w-full flex justify-center my-4">
              <div className="w-72 h-72 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                {isQrReady ? (
                  <img src={whatsappStatus!.qrCode} alt="QR Code WhatsApp" className="w-full h-full object-contain p-3 bg-white" />
                ) : isConnected ? (
                  <div className="text-center text-emerald-600 dark:text-emerald-400">
                    <Phone className="h-12 w-12 mx-auto mb-2" />
                    <p className="text-sm font-medium">WhatsApp conectado</p>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <QrCodeIcon className="h-16 w-16 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">QR Code</p>
                  </div>
                )}
              </div>
            </div>

            {qrCountdown > 0 && (
              <p className="text-xs text-muted-foreground mb-2">Expira em {qrCountdown}s</p>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={provider === 'evolution' ? getQRCodeEvolution : getQRCodeZapi}
              disabled={loadingQR || isConnected || (provider === 'evolution' && !evolutionInstanceName)}
            >
              {loadingQR ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCodeIcon className="h-4 w-4 mr-2" />}
              Gerar novo QR Code
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Config section — changes based on provider */}
      {provider === 'zapi' ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <Zap className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Configurações Z-API</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <Label htmlFor="client-token">Client Token</Label>
                <div className="relative">
                  <Input
                    id="client-token"
                    type={showClientToken ? 'text' : 'password'}
                    value={clientToken}
                    onChange={(e) => setClientToken(e.target.value)}
                    placeholder="••••••••••"
                    className="pr-10"
                  />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowClientToken(v => !v)}>
                    {showClientToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instance-id">Instance ID</Label>
                <Input id="instance-id" value={instanceId} onChange={(e) => setInstanceId(e.target.value)} placeholder="3DF82A-XXXX" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="security-token">Security Token</Label>
                <div className="relative">
                  <Input
                    id="security-token"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="••••••••••"
                    className="pr-10"
                  />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowToken(v => !v)}>
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input value={`${SUPABASE_URL}/functions/v1/zapi-webhook`} readOnly className="font-mono text-xs" />
              </div>
              <div className="space-y-2">
                <Label>Modo de Envio</Label>
                <Input value="Direto" readOnly />
              </div>
              <Button onClick={saveZapiCredentials} disabled={savingConfig} className="h-10">
                {savingConfig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar configurações
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-violet-500" />
              <h2 className="text-lg font-semibold">Configurações Evolution API</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              A Evolution API roda no servidor da OrderZaps e simula comportamento humano real — digitando, lendo mensagens e reagindo antes de enviar.
            </p>

            {evolutionInstanceName ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800">
                  <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-lg">
                    <Shield className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-violet-800 dark:text-violet-300">Instância configurada</p>
                    <p className="text-xs font-mono text-violet-600 dark:text-violet-400 mt-0.5">{evolutionInstanceName}</p>
                  </div>
                  <Badge variant="outline" className={isConnected ? 'text-emerald-600 border-emerald-300' : 'text-muted-foreground'}>
                    {isConnected ? 'Conectado' : 'Desconectado'}
                  </Badge>
                </div>

                {!isConnected && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-700 dark:text-amber-400">
                    Gere o QR Code acima e escaneie com o WhatsApp para conectar este chip.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-4 text-sm text-blue-700 dark:text-blue-400">
                  Crie uma instância para começar. Use um nome simples como <span className="font-mono font-medium">minha-loja</span> ou <span className="font-mono font-medium">chip-vendas</span>.
                </div>

                <div className="flex gap-3">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="evo-instance-name">Nome da instância</Label>
                    <Input
                      id="evo-instance-name"
                      value={evolutionDraftName}
                      onChange={(e) => setEvolutionDraftName(e.target.value)}
                      placeholder="minha-loja"
                      onKeyDown={(e) => e.key === 'Enter' && createEvolutionInstance()}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={createEvolutionInstance} disabled={creatingInstance || !evolutionDraftName.trim()} className="bg-violet-600 hover:bg-violet-700 text-white">
                      {creatingInstance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      Criar instância
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mensagens automáticas + Proteção por consentimento */}
      <ZAPIAdvancedSettings />
    </div>
  );
}
