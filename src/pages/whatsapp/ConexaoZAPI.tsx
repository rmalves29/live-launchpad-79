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
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

function maskMiddle(value: string, visible = 4): string {
  if (!value) return '';
  if (value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}${'•'.repeat(Math.min(8, value.length - visible * 2))}${value.slice(-visible)}`;
}

function formatPhone(phone?: string | null): string {
  if (!phone) return '-';
  const digits = phone.replace(/\D/g, '');
  // Brazilian format
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const part1 = digits.slice(4, 9);
    const part2 = digits.slice(9, 13);
    return `(${ddd}) ${part1}-${part2}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export default function ConexaoZAPI() {
  const { tenant } = useTenantContext();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [hasZAPIConfig, setHasZAPIConfig] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [loadingQR, setLoadingQR] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  // Credentials form
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [clientToken, setClientToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showClientToken, setShowClientToken] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

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
    if (hasZAPIConfig && tenant?.id) {
      startPolling();
      return () => stopPolling();
    }
  }, [hasZAPIConfig, tenant?.id]);

  const loadIntegration = async () => {
    if (!tenant?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('id, zapi_instance_id, zapi_token, zapi_client_token, provider, is_active')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setIntegrationId((data as any).id);
        setInstanceId((data as any).zapi_instance_id || '');
        setToken((data as any).zapi_token || '');
        setClientToken((data as any).zapi_client_token || '');
        setHasZAPIConfig(!!((data as any).zapi_instance_id && (data as any).zapi_token));
      } else {
        setHasZAPIConfig(false);
      }
    } catch (e: any) {
      console.error('Error loading Z-API config:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveCredentials = async () => {
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

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    checkStatus();
    pollingRef.current = setInterval(() => { if (mountedRef.current) checkStatus(); }, POLLING_INTERVAL_MS);
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

  const checkStatus = async () => {
    if (!tenant?.id || !mountedRef.current) return;
    try {
      const r = await fetch('https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
        body: JSON.stringify({ action: 'status', tenant_id: tenant.id })
      });
      if (!mountedRef.current) return;
      const data = await r.json();
      setLastSyncAt(new Date());
      if (data.error) {
        setWhatsappStatus(prev => prev?.status === 'qr_ready' && prev?.qrCode ? prev : { connected: false, status: 'error', error: data.error, message: data.message });
        return;
      }
      if (data.connected) {
        stopQRCountdown();
        setWhatsappStatus({ connected: true, status: data.status, message: data.message, user: data.user });
      } else {
        setWhatsappStatus(prev => prev?.status === 'qr_ready' && prev?.qrCode ? prev : { connected: false, status: data.status || 'disconnected', message: data.message, user: data.user });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getQRCode = async () => {
    if (!tenant?.id) return;
    setLoadingQR(true);
    try {
      const r = await fetch('https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
        body: JSON.stringify({ action: 'qr-code', tenant_id: tenant.id })
      });
      const data = await r.json();
      if (data.qrCode) {
        setWhatsappStatus(prev => ({ ...prev, connected: false, status: 'qr_ready', qrCode: data.qrCode, hasQR: true, message: 'Escaneie o QR Code' }));
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

  const handleDisconnect = async () => {
    if (!tenant?.id) return;
    setIsReconnecting(true);
    try {
      await fetch('https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
        body: JSON.stringify({ action: 'disconnect', tenant_id: tenant.id })
      });
      setWhatsappStatus({ connected: false, status: 'disconnected', message: 'WhatsApp desconectado' });
      toast({ title: 'Desconectado', description: 'Sessão WhatsApp encerrada.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      await getQRCode();
    } finally {
      setIsReconnecting(false);
    }
  };

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

  const isConnected = !!whatsappStatus?.connected;
  const isQrReady = whatsappStatus?.status === 'qr_ready' && whatsappStatus.qrCode;

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">WhatsApp — Conexão</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie a conexão do seu WhatsApp via Z-API</p>
      </div>

      {/* Top row: Status + QR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status da Conexão */}
        <Card>
          <CardContent className="p-6">
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
                <span className="text-muted-foreground">Instance ID</span>
                <span className="font-mono">{instanceId ? maskMiddle(instanceId, 4) : '—'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Token</span>
                <span className="font-mono">{token ? `zapi_${'•'.repeat(8)}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Última sync</span>
                <span className={isConnected ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}>
                  {lastSyncLabel}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button variant="outline" onClick={handleDisconnect} disabled={isReconnecting || !isConnected}>
                {isReconnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <WifiOff className="h-4 w-4 mr-2" />}
                Desconectar
              </Button>
              <Button onClick={handleReconnect} disabled={isReconnecting || loadingQR}>
                {(isReconnecting || loadingQR) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Reconectar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card>
          <CardContent className="p-6 flex flex-col items-center">
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold">QR Code para emparelhar</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Abra o WhatsApp no celular → Dispositivos Conectados → Conectar Dispositivo
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

            <Button variant="outline" className="w-full" onClick={getQRCode} disabled={loadingQR || isConnected}>
              {loadingQR ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCodeIcon className="h-4 w-4 mr-2" />}
              Gerar novo QR Code
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Configurações Z-API */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-6">Configurações Z-API</h2>

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
              <Input
                id="instance-id"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                placeholder="3DF82A-XXXX"
              />
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
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <Input
                id="webhook-url"
                value={`https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-webhook`}
                readOnly
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label>Modo de Envio</Label>
              <Input value="Direto" readOnly />
            </div>

            <Button onClick={saveCredentials} disabled={savingConfig} className="h-10">
              {savingConfig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar configurações
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mensagens automáticas + Proteção por consentimento */}
      <ZAPIAdvancedSettings />
    </div>
  );
}
