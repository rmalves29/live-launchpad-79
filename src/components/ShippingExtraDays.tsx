/**
 * Dias adicionais no prazo das transportadoras de integração (Correios, Melhor Envio, SuperFrete, Frenet, Mandae,
 * Manda Bem, Frete Barato...). O número é somado ao prazo de cada serviço cotado no checkout e na live.
 * Não mexe no preço nem nos fretes cadastrados à mão (esses têm o prazo que você escreveu).
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CalendarPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { clearExtraDeliveryDays } from '@/lib/shipping-days';

export function ShippingExtraDays() {
  const { tenantId } = useTenantContext();
  const { toast } = useToast();
  const [days, setDays] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let off = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('tenant_shipping_prazo' as any).select('extra_delivery_days').eq('tenant_id', tenantId).maybeSingle();
      if (!off) { setDays(String((data as any)?.extra_delivery_days ?? 0)); setLoading(false); }
    })();
    return () => { off = true; };
  }, [tenantId]);

  const save = async () => {
    if (!tenantId) return;
    const n = Math.floor(Number(days));
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      toast({ title: 'Valor inválido', description: 'Informe um número de dias entre 0 e 60.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('tenant_shipping_prazo' as any)
      .upsert({ tenant_id: tenantId, extra_delivery_days: n, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
    setSaving(false);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível salvar os dias adicionais.', variant: 'destructive' });
      return;
    }
    clearExtraDeliveryDays(tenantId);
    toast({ title: 'Salvo', description: n > 0 ? `Todos os prazos das transportadoras terão +${n} dia(s).` : 'Sem dias adicionais: valem os prazos das transportadoras.' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><CalendarPlus className="h-4 w-4" /> Dias adicionais no prazo das transportadoras</CardTitle>
        <CardDescription>
          Soma esse número ao prazo de entrega de <b>todas as transportadoras das integrações</b> (Correios, Melhor Envio, SuperFrete, Frenet, Mandae, Manda Bem, Frete Barato...).
          Vale no checkout e na live. Ex.: com 2 dias, "PAC · 5 dias úteis" aparece como "7 dias úteis". Não altera o preço nem os fretes cadastrados à mão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="extra_delivery_days">Dias adicionais</Label>
              <Input id="extra_delivery_days" type="number" inputMode="numeric" min={0} max={60} className="w-32" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Frete Barato mostra uma data prevista: nesse caso a data é adiada pelos dias informados. A mudança vale na próxima cotação (até 5 minutos para quem já está no checkout).</p>
      </CardContent>
    </Card>
  );
}
