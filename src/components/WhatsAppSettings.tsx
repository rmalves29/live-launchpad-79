import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

export function WhatsAppSettings() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [integration, setIntegration] = useState<any>(null);
  const [apiUrl, setApiUrl] = useState('');

  useEffect(() => {
    loadIntegration();
  }, [tenant?.id]);

  const loadIntegration = async () => {
    if (!tenant?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setIntegration(data);
        setApiUrl(data.api_url || '');
      }
    } catch (error: any) {
      console.error('Error loading WhatsApp integration:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar integração do WhatsApp',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenant?.id) return;

    if (!apiUrl.trim()) {
      toast({
        title: 'Erro',
        description: 'URL da API é obrigatória',
        variant: 'destructive'
      });
      return;
    }

    // Validar formato da URL
    try {
      new URL(apiUrl);
    } catch {
      toast({
        title: 'Erro',
        description: 'URL inválida. Use o formato: https://seu-servidor.railway.app',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      if (integration?.id) {
        // Atualizar integração existente
        const { error } = await supabase
          .from('integration_whatsapp')
          .update({
            api_url: apiUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', integration.id);

        if (error) throw error;
      } else {
        // Criar nova integração
        const { error } = await supabase
          .from('integration_whatsapp')
          .insert({
            tenant_id: tenant.id,
            api_url: apiUrl,
            instance_name: tenant.name || 'default',
            webhook_secret: crypto.randomUUID(),
            is_active: true
          });

        if (error) throw error;
      }

      toast({
        title: 'Sucesso',
        description: 'Configuração do WhatsApp atualizada',
      });

      loadIntegration();
    } catch (error: any) {
      console.error('Error saving WhatsApp integration:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar configuração',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MessageSquare className="h-5 w-5 mr-2" />
            WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MessageSquare className="h-5 w-5 mr-2" />
          WhatsApp
        </CardTitle>
        <CardDescription>
          Configure o servidor WhatsApp (Railway, Render, etc.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="api-url">URL do Servidor WhatsApp</Label>
          <Input
            id="api-url"
            type="url"
            placeholder="https://seu-app.up.railway.app"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            URL pública do seu servidor WhatsApp (ex: Railway, Render)
          </p>
        </div>

        {integration && (
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={integration.is_active ? 'default' : 'secondary'}>
                {integration.is_active ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Ativo
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Inativo
                  </>
                )}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Instância</span>
              <span className="text-sm text-muted-foreground">{integration.instance_name}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
