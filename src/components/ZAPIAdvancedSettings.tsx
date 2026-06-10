import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Bell, MessageSquare, Save, Loader2, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

interface MessageFlags {
  send_item_added_msg: boolean;
  send_paid_order_msg: boolean;
  send_product_canceled_msg: boolean;
  send_out_of_stock_msg: boolean;
}

export function ZAPIAdvancedSettings() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | null>(null);

  const [messageFlags, setMessageFlags] = useState<MessageFlags>({
    send_item_added_msg: true,
    send_paid_order_msg: true,
    send_product_canceled_msg: true,
    send_out_of_stock_msg: true,
  });

  const [consentProtectionEnabled, setConsentProtectionEnabled] = useState(false);
  const [templateSolicitacao, setTemplateSolicitacao] = useState('');
  const [templateComLink, setTemplateComLink] = useState('');
  const [itemAddedButtonEnabled, setItemAddedButtonEnabled] = useState(true);
  const [itemAddedButtonLabel, setItemAddedButtonLabel] = useState('Pagar Agora');
  const [itemAddedButtonUrl, setItemAddedButtonUrl] = useState('');

  useEffect(() => {
    if (tenant?.id) load();
  }, [tenant?.id]);

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('id, send_item_added_msg, send_paid_order_msg, send_product_canceled_msg, send_out_of_stock_msg, consent_protection_enabled, template_solicitacao, template_com_link, item_added_button_enabled, item_added_button_label, item_added_button_url')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setIntegrationId((data as any).id);
        setMessageFlags({
          send_item_added_msg: (data as any).send_item_added_msg ?? true,
          send_paid_order_msg: (data as any).send_paid_order_msg ?? true,
          send_product_canceled_msg: (data as any).send_product_canceled_msg ?? true,
          send_out_of_stock_msg: (data as any).send_out_of_stock_msg ?? true,
        });
        setConsentProtectionEnabled((data as any).consent_protection_enabled ?? false);
        setTemplateSolicitacao((data as any).template_solicitacao ?? '');
        setTemplateComLink((data as any).template_com_link ?? '');
        setItemAddedButtonEnabled((data as any).item_added_button_enabled ?? true);
        setItemAddedButtonLabel((data as any).item_added_button_label ?? 'Pagar Agora');
        setItemAddedButtonUrl((data as any).item_added_button_url ?? '');
      }
    } catch (e: any) {
      console.error('Error loading advanced settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFlag = async (flag: keyof MessageFlags) => {
    if (!integrationId) {
      toast({ title: 'Aviso', description: 'Salve as credenciais Z-API primeiro', variant: 'destructive' });
      return;
    }
    const newValue = !messageFlags[flag];
    setMessageFlags(prev => ({ ...prev, [flag]: newValue }));
    try {
      const { error } = await supabase
        .from('integration_whatsapp')
        .update({ [flag]: newValue, updated_at: new Date().toISOString() })
        .eq('id', integrationId);
      if (error) throw error;
      toast({ title: newValue ? 'Ativado' : 'Desativado' });
    } catch {
      setMessageFlags(prev => ({ ...prev, [flag]: !newValue }));
      toast({ title: 'Erro', description: 'Não foi possível salvar', variant: 'destructive' });
    }
  };

  const handleSaveConsent = async () => {
    if (!integrationId) {
      toast({ title: 'Aviso', description: 'Salve as credenciais Z-API primeiro', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('integration_whatsapp')
        .update({
          consent_protection_enabled: consentProtectionEnabled,
          template_solicitacao: templateSolicitacao || null,
          template_com_link: templateComLink || null,
          item_added_button_enabled: itemAddedButtonEnabled,
          item_added_button_label: (itemAddedButtonLabel || 'Pagar Agora').slice(0, 20),
          item_added_button_url: (() => {
            const v = (itemAddedButtonUrl || '').trim();
            if (!v) return null;
            if (/^https?:\/\//i.test(v)) return v;
            return `https://${v.replace(/^[a-z]{0,4}:?\/\//i, '')}`;
          })(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', integrationId);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Configuração de proteção salva' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card>
    );
  }

  const flagItems: Array<{ key: keyof MessageFlags; title: string; desc: string }> = [
    { key: 'send_item_added_msg', title: 'Item Adicionado', desc: 'Enviar quando um item for adicionado ao carrinho' },
    { key: 'send_paid_order_msg', title: 'Pagamento Confirmado', desc: 'Enviar quando o pagamento for confirmado' },
    { key: 'send_product_canceled_msg', title: 'Produto Cancelado', desc: 'Enviar quando um produto for cancelado do pedido' },
    { key: 'send_out_of_stock_msg', title: 'Produto Esgotado', desc: 'Enviar quando um produto estiver sem estoque' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Mensagens Automáticas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" />
            Mensagens Automáticas
          </CardTitle>
          <CardDescription>Controle quais mensagens automáticas serão enviadas via WhatsApp</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {flagItems.map(item => (
            <div key={item.key} className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-sm font-medium cursor-pointer">{item.title}</Label>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={messageFlags[item.key]}
                  onCheckedChange={() => handleToggleFlag(item.key)}
                />
              </div>

              {item.key === 'send_item_added_msg' && messageFlags.send_item_added_msg && (
                <div className="space-y-3 p-3 rounded-lg border bg-muted/30 ml-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-sm font-medium">Botão "Pagar Agora" (clicável)</Label>
                      <p className="text-xs text-muted-foreground">Envia a mensagem com um botão clicável de URL no WhatsApp</p>
                    </div>
                    <Switch checked={itemAddedButtonEnabled} onCheckedChange={setItemAddedButtonEnabled} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Texto do botão (máx. 20)</Label>
                      <Input
                        value={itemAddedButtonLabel}
                        maxLength={20}
                        onChange={(e) => setItemAddedButtonLabel(e.target.value)}
                        placeholder="Pagar Agora"
                        disabled={!itemAddedButtonEnabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">URL do botão (opcional)</Label>
                      <Input
                        value={itemAddedButtonUrl}
                        onChange={(e) => setItemAddedButtonUrl(e.target.value)}
                        placeholder="Padrão: link do checkout"
                        disabled={!itemAddedButtonEnabled}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Variáveis disponíveis na mensagem: {'{{produto}}'}, {'{{quantidade}}'}, {'{{valor}}'}, {'{{link_checkout}}'}, {'{{itens_pedido}}'}, {'{{total_pedido}}'}, {'{{numero_pedido}}'}
                  </p>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleSaveConsent} disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? 'Salvando...' : 'Salvar Botão'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Proteção por Consentimento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            🛡️ Modo de Proteção por Consentimento
          </CardTitle>
          <CardDescription>
            Quando ativado, verifica se o cliente deu permissão nos últimos 3 dias antes de enviar link
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <Label className="text-sm font-medium">Ativar proteção</Label>
            <Switch checked={consentProtectionEnabled} onCheckedChange={setConsentProtectionEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Template A — Solicitação de Permissão</Label>
            <p className="text-xs text-muted-foreground">
              Variáveis: {'{{produto}}'}, {'{{quantidade}}'}, {'{{valor}}'}
            </p>
            <Textarea
              value={templateSolicitacao}
              onChange={(e) => setTemplateSolicitacao(e.target.value)}
              rows={6}
              className="font-mono text-sm"
              placeholder={`🛒 *Item adicionado*\n\n✅ {{produto}}\nQtd: *{{quantidade}}*\nValor: *R$ {{valor}}*\n\nPosso te enviar o link? Responda *SIM*. ✨`}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Template B — Com Link (Consentimento Válido)</Label>
            <p className="text-xs text-muted-foreground">
              Variáveis: {'{{produto}}'}, {'{{quantidade}}'}, {'{{valor}}'}, {'{{link_checkout}}'}, {'{{itens_pedido}}'}, {'{{total_pedido}}'}, {'{{numero_pedido}}'}
            </p>
            <Textarea
              value={templateComLink}
              onChange={(e) => setTemplateComLink(e.target.value)}
              rows={6}
              className="font-mono text-sm"
              placeholder={`🛒 *Item adicionado*\n\n{{itens_pedido}}\n\nTotal: *R$ {{total_pedido}}*\nPedido: #{{numero_pedido}}\n\n👉 Finalize: {{link_checkout}}`}
            />
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Importante:</strong> Quando o cliente responder "SIM", o sistema apenas registrará o consentimento. O link será enviado automaticamente no <strong>próximo</strong> evento de "Item Adicionado".
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveConsent} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Salvando...' : 'Salvar Proteção'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
