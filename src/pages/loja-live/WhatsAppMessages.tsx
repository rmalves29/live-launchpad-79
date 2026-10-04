import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { MessageCircle } from 'lucide-react';

type MsgType = 'ITEM_ADDED' | 'PAID_ORDER' | 'TRACKING';

const TYPES: Array<{ type: MsgType; title: string; when: string; vars: string[]; example: string }> = [
  {
    type: 'ITEM_ADDED',
    title: 'Pedido criado',
    when: 'Enviada ao cliente assim que ele faz o pedido na Loja da Live (uma por peça do pedido).',
    vars: ['{{produto}}', '{{codigo}}', '{{quantidade}}', '{{valor}}', '{{itens_pedido}}', '{{total_pedido}}', '{{numero_pedido}}', '{{link_checkout}}'],
    example: 'Item adicionado ao pedido\n\n{{produto}}\nQtd: *{{quantidade}}*\nValor: *R$ {{valor}}*\n\nFinalize seu pedido: {{link_checkout}}',
  },
  {
    type: 'PAID_ORDER',
    title: 'Pagamento confirmado',
    when: 'Enviada quando o pagamento do pedido é aprovado.',
    vars: ['{{order_id}}', '{{total}}', '{{customer_name}}'],
    example: 'Pagamento Confirmado - Pedido #{{order_id}}\n\nRecebemos seu pagamento!\nValor: *R$ {{total}}*\n\nSeu pedido está sendo preparado.',
  },
  {
    type: 'TRACKING',
    title: 'Código de rastreio',
    when: 'Enviada quando o pedido é postado e o código de rastreio fica disponível.',
    vars: ['{{customer_name}}', '{{order_id}}', '{{tracking_code}}', '{{shipped_at}}'],
    example: 'Seu pedido *#{{order_id}}* foi enviado!\n\nCódigo de Rastreio: *{{tracking_code}}*\nData de Envio: {{shipped_at}}',
  },
];

type Row = { is_active: boolean; content: string };
const DEFAULT_ROW: Row = { is_active: true, content: '' };

export default function WhatsAppMessages() {
  const { tenant } = useTenant();
  const [saved, setSaved] = useState<Record<MsgType, Row>>({ ITEM_ADDED: DEFAULT_ROW, PAID_ORDER: DEFAULT_ROW, TRACKING: DEFAULT_ROW });
  const [draft, setDraft] = useState<Record<MsgType, Row>>(saved);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase.from('live_shop_whatsapp' as any).select('message_type, is_active, content').eq('tenant_id', tenant.id);
    const next: Record<MsgType, Row> = { ITEM_ADDED: DEFAULT_ROW, PAID_ORDER: DEFAULT_ROW, TRACKING: DEFAULT_ROW };
    for (const r of (data as any[]) || []) {
      if (r.message_type in next) next[r.message_type as MsgType] = { is_active: r.is_active !== false, content: r.content || '' };
    }
    setSaved(next);
    setDraft(next);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => { load(); }, [load]);

  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  async function save() {
    if (!tenant?.id) return;
    setSaving(true);
    const rows = TYPES.map((t) => ({
      tenant_id: tenant.id,
      message_type: t.type,
      is_active: draft[t.type].is_active,
      content: draft[t.type].content.trim() || null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('live_shop_whatsapp' as any).upsert(rows as any, { onConflict: 'tenant_id,message_type' });
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    setSaved(draft);
    toast({ title: 'Mensagens de WhatsApp salvas' });
  }

  const set = (t: MsgType, patch: Partial<Row>) => setDraft((d) => ({ ...d, [t]: { ...d[t], ...patch } }));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-100 p-2"><MessageCircle className="h-5 w-5 text-emerald-700" /></div>
          <div>
            <h3 className="font-semibold">Mensagens de WhatsApp da Loja da Live</h3>
            <p className="text-xs text-muted-foreground">
              Escolha quais mensagens o cliente recebe no WhatsApp quando compra pela Loja da Live e personalize o texto de cada uma.
              Valem <b>somente para pedidos feitos na Loja da Live</b>; as compras do bazar continuam usando os modelos de Templates.
              Deixe o texto em branco para usar o modelo padrão da loja.
            </p>
          </div>
        </div>
      </Card>

      {TYPES.map((t) => {
        const row = draft[t.type];
        return (
          <Card key={t.type} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">{t.title}</h4>
                <p className="text-xs text-muted-foreground">{t.when}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Label htmlFor={`wa-${t.type}`} className="text-sm">{row.is_active ? 'Enviar' : 'Não enviar'}</Label>
                <Switch id={`wa-${t.type}`} checked={row.is_active} disabled={loading} onCheckedChange={(v) => set(t.type, { is_active: v })} />
              </div>
            </div>
            <div className={row.is_active ? '' : 'opacity-50 pointer-events-none'}>
              <Textarea
                rows={5}
                value={row.content}
                onChange={(e) => set(t.type, { content: e.target.value })}
                placeholder={`Modelo padrão da loja:\n${t.example}`}
                aria-label={`Texto da mensagem: ${t.title}`}
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Variáveis:</span>
                {t.vars.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono hover:bg-muted/70"
                    onClick={() => set(t.type, { content: `${row.content}${row.content && !row.content.endsWith(' ') && !row.content.endsWith('\n') ? ' ' : ''}${v}` })}
                  >
                    {v}
                  </button>
                ))}
                {row.content && (
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-xs ml-auto" onClick={() => set(t.type, { content: '' })}>
                    Usar modelo padrão
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
        {dirty && <span className="text-xs text-amber-700 mr-auto">Alterações não salvas</span>}
        <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(saved)}>Descartar</Button>
        <Button disabled={!dirty || saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar mensagens'}</Button>
      </div>
    </div>
  );
}
