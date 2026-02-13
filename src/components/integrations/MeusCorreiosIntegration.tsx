import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Printer, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import CorreiosBulkLabels from './CorreiosBulkLabels';

interface MeusCorreiosIntegrationProps {
  tenantId: string;
}

interface MeusCorreiosData {
  id?: string;
  token_meuscorreios: string;
  cartao_postagem: string;
  codigo_remetente: string;
  correios_client_id: string;
  correios_client_secret: string;
  is_active: boolean;
}

export default function MeusCorreiosIntegration({ tenantId }: MeusCorreiosIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<MeusCorreiosData>({
    token_meuscorreios: '',
    cartao_postagem: '',
    codigo_remetente: '1',
    correios_client_id: '',
    correios_client_secret: '',
    is_active: false,
  });
  const [showSecrets, setShowSecrets] = useState(false);

  const { data: integration, isLoading } = useQuery({
    queryKey: ['meuscorreios-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('provider', 'meuscorreios')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFormData({
          id: data.id,
          token_meuscorreios: data.token_type || '',
          cartao_postagem: data.refresh_token || '',
          codigo_remetente: data.scope || '1',
          correios_client_id: data.client_id || '',
          correios_client_secret: data.client_secret || '',
          is_active: data.is_active,
        });
      }

      return data;
    },
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: MeusCorreiosData) => {
      const payload = {
        tenant_id: tenantId,
        provider: 'meuscorreios',
        access_token: 'meuscorreios_token',
        token_type: data.token_meuscorreios,
        refresh_token: data.cartao_postagem,
        scope: data.codigo_remetente || '1',
        client_id: data.correios_client_id || null,
        client_secret: data.correios_client_secret || null,
        is_active: data.is_active,
        sandbox: false,
      };

      if (data.id) {
        const { error } = await supabase
          .from('shipping_integrations')
          .update(payload)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shipping_integrations')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'Sucesso', description: 'Configuração do MeusCorreios salva com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['meuscorreios-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['meuscorreios-status', tenantId] });
    },
    onError: (error: any) => {
      toast({ title: 'Erro', description: error.message || 'Erro ao salvar configuração', variant: 'destructive' });
    },
  });

  const isFormValid = formData.token_meuscorreios && formData.cartao_postagem;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Printer className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle>MeusCorreios - Pré-Postagem e Etiquetas</CardTitle>
                <CardDescription>
                  Gere pré-postagens, etiquetas e rastreios via meuscorreios.app
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {formData.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Credenciais MeusCorreios</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowSecrets(!showSecrets)}>
                {showSecrets ? <><EyeOff className="h-4 w-4 mr-2" />Ocultar</> : <><Eye className="h-4 w-4 mr-2" />Mostrar</>}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="mc_token">Token MeusCorreios *</Label>
                <Input
                  id="mc_token"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.token_meuscorreios}
                  onChange={(e) => setFormData({ ...formData, token_meuscorreios: e.target.value })}
                  placeholder="Token gerado em MeusCorreios > Configurações > Tokens"
                />
                <p className="text-xs text-muted-foreground">
                  Acesse meuscorreios.app → Configurações → Tokens para gerar seu token.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mc_cartao">Cartão de Postagem *</Label>
                <Input
                  id="mc_cartao"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.cartao_postagem}
                  onChange={(e) => setFormData({ ...formData, cartao_postagem: e.target.value })}
                  placeholder="Número do cartão de postagem"
                />
                <p className="text-xs text-muted-foreground">
                  Número do cartão de postagem vinculado ao seu contrato.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mc_remetente">Código Remetente</Label>
                <Input
                  id="mc_remetente"
                  value={formData.codigo_remetente}
                  onChange={(e) => setFormData({ ...formData, codigo_remetente: e.target.value })}
                  placeholder="01"
                />
                <p className="text-xs text-muted-foreground">
                  Informe "1" se for remetente único, ou o código cadastrado no MeusCorreios.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-medium">Credenciais CWS Correios (opcional - para preços reais de contrato)</h3>
            <p className="text-xs text-muted-foreground">
              Se você possui contrato com os Correios, informe o Client ID e Client Secret do CWS para obter preços de contrato no checkout. Sem essas credenciais, o sistema usa preços da tabela pública.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cws_client_id">Client ID (CWS)</Label>
                <Input
                  id="cws_client_id"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.correios_client_id}
                  onChange={(e) => setFormData({ ...formData, correios_client_id: e.target.value })}
                  placeholder="Client ID do portal CWS Correios"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cws_client_secret">Client Secret (CWS)</Label>
                <Input
                  id="cws_client_secret"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.correios_client_secret}
                  onChange={(e) => setFormData({ ...formData, correios_client_secret: e.target.value })}
                  placeholder="Client Secret do portal CWS Correios"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending || !isFormValid}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Configuração
            </Button>
          </div>

          {formData.is_active && isFormValid && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Integração ativa! Use a seção abaixo para gerar etiquetas em massa e notificar clientes.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {formData.is_active && isFormValid && (
        <CorreiosBulkLabels tenantId={tenantId} />
      )}
    </div>
  );
}
