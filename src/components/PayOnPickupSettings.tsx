/**
 * Chave "Pagar na retirada" (Configurações > Fretes).
 * Ligada, o checkout oferece essa forma de pagamento quando o cliente escolhe o frete Retirada.
 * O pedido fica sem pagamento até o dono marcar como pago na retirada.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Store } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';

export function PayOnPickupSettings() {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    (async () => {
      const { data } = await (supabase as any).from('tenants').select('pay_on_pickup_enabled').eq('id', tenantId).maybeSingle();
      if (!alive) return;
      setEnabled(!!data?.pay_on_pickup_enabled);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [tenantId]);

  async function toggle(next: boolean) {
    if (!tenantId) return;
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    const { error } = await (supabase as any)
      .from('tenants')
      .update({ pay_on_pickup_enabled: next, updated_at: new Date().toISOString() })
      .eq('id', tenantId);
    setSaving(false);
    if (error) {
      setEnabled(previous);
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: next ? 'Pagar na retirada ligado' : 'Pagar na retirada desligado',
      description: next
        ? 'O checkout vai oferecer essa forma de pagamento quando o cliente escolher o frete Retirada.'
        : 'A opção não aparece mais no checkout.',
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4" /> Pagar na retirada</CardTitle>
        <CardDescription>
          Permite que o cliente escolha pagar na loja quando o frete for Retirada. O pedido fica aguardando pagamento e não é cancelado
          automaticamente; você marca como pago quando o cliente retirar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Switch id="pay_on_pickup" checked={enabled} disabled={loading || saving} onCheckedChange={toggle} />
          <Label htmlFor="pay_on_pickup">{enabled ? 'Ligado' : 'Desligado'}</Label>
        </div>
      </CardContent>
    </Card>
  );
}
