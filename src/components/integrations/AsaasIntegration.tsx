import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, RefreshCw, Info } from 'lucide-react';

interface Props {
  tenantId: string;
}

interface AsaasRow {
  id: string;
  api_key: string | null;
  webhook_token: string | null;
  environment: string;
  is_active: boolean;
}

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-webhook`;
const EVENTOS = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'SUBSCRIPTION_DELETED',
  'SUBSCRIPTION_INACTIVATED',
];

function novoToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export default function AsaasIntegration({ tenantId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [webhookToken, setWebhookToken] = useState('');
  const [ativo, setAtivo] = useState(true);

  const { data: row, isLoading } = useQuery({
    queryKey: ['asaas-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('integration_asaas' as any).select('*').eq('tenant_id', tenantId).maybeSingle();
      if (error) throw error;
      return data as unknown as AsaasRow | null;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (row) {
      setApiKey(row.api_key || '');
      setSandbox(row.environment === 'sandbox');
      setWebhookToken(row.webhook_token || '');
      setAtivo(row.is_active);
    } else if (!isLoading) {
      setWebhookToken((t) => t || novoToken());
    }
  }, [row, isLoading]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!apiKey.trim()) throw new Error('Informe a chave de API do Asaas');
      if (webhookToken.trim().length < 24) throw new Error('O token do webhook precisa ter 24 caracteres ou mais');
      const payload = {
        tenant_id: tenantId,
        api_key: apiKey.trim(),
        webhook_token: webhookToken.trim(),
        environment: sandbox ? 'sandbox' : 'production',
        is_active: ativo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('integration_asaas' as any).upsert(payload, { onConflict: 'tenant_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asaas-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['asaas-status', tenantId] });
      toast({ title: 'Asaas salvo', description: 'Cadastre o webhook no painel do Asaas com a URL e o token abaixo.' });
    },
    onError: (e: Error) => toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' }),
  });

  const copiar = (texto: string, rotulo: string) => {
    navigator.clipboard?.writeText(texto).then(() => toast({ title: `${rotulo} copiado` })).catch(() => undefined);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Asaas</CardTitle>
          <CardDescription>
            Cobrança da assinatura mensal do Cartzy vendida pelo site (link de pagamento recorrente, só cartão). Não é uma forma de pagamento dos pedidos
            das lojas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="asaas-key">Chave de API</Label>
            <Input
              id="asaas-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="$aact_..."
            />
            <p className="text-xs text-muted-foreground">No Asaas: Integrações → Chave de API.</p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="asaas-sandbox">Ambiente de teste (sandbox)</Label>
              <p className="text-xs text-muted-foreground">Ligue só com a chave do sandbox. Desligado = cobra de verdade.</p>
            </div>
            <Switch id="asaas-sandbox" checked={sandbox} onCheckedChange={setSandbox} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="asaas-ativo">Integração ativa</Label>
              <p className="text-xs text-muted-foreground">Desligada, o botão Assinar usa os secrets do servidor, se existirem.</p>
            </div>
            <Switch id="asaas-ativo" checked={ativo} onCheckedChange={setAtivo} />
          </div>

          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook (cadastrar no painel do Asaas)</CardTitle>
          <CardDescription>Asaas → Integrações → Webhooks → Novo webhook. Salve a chave acima antes de cadastrar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={WEBHOOK_URL} />
              <Button type="button" variant="outline" size="icon" onClick={() => copiar(WEBHOOK_URL, 'URL')}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Token de autenticação</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookToken} />
              <Button type="button" variant="outline" size="icon" onClick={() => copiar(webhookToken, 'Token')}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" title="Gerar outro token" onClick={() => setWebhookToken(novoToken())}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Se gerar outro token, salve de novo e atualize o mesmo valor no Asaas.</p>
          </div>
          <div className="space-y-1">
            <Label>Eventos a marcar</Label>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {EVENTOS.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>Tipo de envio: sequencial. Versão da API: v3. O sistema só libera acesso depois de confirmar o pagamento direto no Asaas.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
