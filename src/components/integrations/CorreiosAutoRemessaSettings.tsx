/**
 * Criar a remessa dos Correios automaticamente quando o pedido é pago (Integrações > Correios).
 * Ligado, em até 1 minuto depois do pagamento a remessa (pré-postagem) já fica criada, sem ninguém clicar em "Criar Remessa".
 * A remessa NÃO marca o pedido como enviado nem avisa o cliente: isso só acontece quando os Correios confirmam a postagem.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PackageCheck } from 'lucide-react';

interface Props {
  tenantId: string;
}

export default function CorreiosAutoRemessaSettings({ tenantId }: Props) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await (supabase as any)
        .from('shipping_integrations')
        .select('service_codes')
        .eq('tenant_id', tenantId)
        .eq('provider', 'correios')
        .maybeSingle();
      if (!alive) return;
      setEnabled(data?.service_codes?.AutoRemessa === true || data?.service_codes?.AutoRemessa === 'true');
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [tenantId]);

  async function toggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const { data: atual } = await (supabase as any)
        .from('shipping_integrations')
        .select('service_codes')
        .eq('tenant_id', tenantId)
        .eq('provider', 'correios')
        .maybeSingle();
      const codes: Record<string, unknown> = { ...(atual?.service_codes || {}) };
      if (next) codes.AutoRemessa = true;
      else delete codes.AutoRemessa;
      const { error } = await (supabase as any)
        .from('shipping_integrations')
        .update({ service_codes: codes })
        .eq('tenant_id', tenantId)
        .eq('provider', 'correios');
      if (error) throw error;
      toast({
        title: next ? 'Remessa automática ligada' : 'Remessa automática desligada',
        description: next
          ? 'Os pedidos pagos (dos últimos 14 dias, com frete dos Correios) ganham a remessa em até 1 minuto.'
          : 'As remessas voltam a ser criadas só quando você clicar em Criar Remessa.',
      });
    } catch (e: any) {
      setEnabled(previous);
      toast({ title: 'Erro ao salvar', description: e?.message || 'Tente de novo', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><PackageCheck className="h-4 w-4" /> Criar remessa ao pagar</CardTitle>
        <CardDescription>
          Quando o pedido é pago, a remessa dos Correios é criada sozinha, sem clicar em Criar Remessa. Ela não marca o pedido como enviado e não avisa o cliente:
          isso só acontece depois que os Correios confirmam a postagem. Pedidos sem frete dos Correios (retirada, juntados com outro pedido) continuam manuais.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Switch id="auto_remessa" checked={enabled} disabled={loading || saving} onCheckedChange={toggle} />
          <Label htmlFor="auto_remessa">{enabled ? 'Ligado' : 'Desligado'}</Label>
        </div>
      </CardContent>
    </Card>
  );
}
