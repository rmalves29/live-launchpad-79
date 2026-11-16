/**
 * Pacote padrão usado para cotar o frete no checkout e na live: peso de UM item e medidas da embalagem.
 * Vale para todas as transportadoras da empresa. Sem preenchimento, vale o padrão global do sistema.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Package } from 'lucide-react';

const num = (v: string) => Number(String(v).replace(',', '.'));

export default function ShippingPackageDefaults({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ weight_g: '', width: '', height: '', length: '' });
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-shipping-defaults', tenantId],
    queryFn: async () => {
      const { data: t } = await supabase.from('tenant_shipping_defaults' as any).select('*').eq('tenant_id', tenantId).maybeSingle();
      const { data: g } = await supabase.from('app_settings').select('default_weight_kg, default_width_cm, default_height_cm, default_length_cm').limit(1).maybeSingle();
      return { tenant: t as any, global: g as any };
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!data) return;
    const s = data.tenant || {
      weight_kg: data.global?.default_weight_kg ?? 0.01, width_cm: data.global?.default_width_cm ?? 13,
      height_cm: data.global?.default_height_cm ?? 6, length_cm: data.global?.default_length_cm ?? 16,
    };
    setF({ weight_g: String(Math.round(Number(s.weight_kg) * 1000)), width: String(s.width_cm), height: String(s.height_cm), length: String(s.length_cm) });
  }, [data]);

  async function save() {
    const row = { tenant_id: tenantId, weight_kg: num(f.weight_g) / 1000, width_cm: num(f.width), height_cm: num(f.height), length_cm: num(f.length), updated_at: new Date().toISOString() };
    if (![row.weight_kg, row.width_cm, row.height_cm, row.length_cm].every((n) => Number.isFinite(n) && n > 0)) { toast.error('Preencha peso e medidas com números maiores que zero.'); return; }
    setSaving(true);
    const { error } = await supabase.from('tenant_shipping_defaults' as any).upsert(row, { onConflict: 'tenant_id' });
    setSaving(false);
    if (error) { toast.error('Não foi possível salvar.'); return; }
    toast.success('Pacote padrão salvo. Vale na próxima cotação de frete.');
    qc.invalidateQueries({ queryKey: ['tenant-shipping-defaults', tenantId] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Pacote padrão para cotar o frete</CardTitle>
        <CardDescription>
          O checkout e a live cotam o frete com este pacote: o peso é de <b>um item</b> (multiplicado pela quantidade) e as medidas são da embalagem.
          Vale para todas as transportadoras desta empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1"><Label>Peso de 1 item (g)</Label><Input inputMode="decimal" value={f.weight_g} onChange={(e) => setF({ ...f, weight_g: e.target.value })} /></div>
              <div className="space-y-1"><Label>Largura (cm)</Label><Input inputMode="decimal" value={f.width} onChange={(e) => setF({ ...f, width: e.target.value })} /></div>
              <div className="space-y-1"><Label>Altura (cm)</Label><Input inputMode="decimal" value={f.height} onChange={(e) => setF({ ...f, height: e.target.value })} /></div>
              <div className="space-y-1"><Label>Comprimento (cm)</Label><Input inputMode="decimal" value={f.length} onChange={(e) => setF({ ...f, length: e.target.value })} /></div>
            </div>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar pacote</Button>
            {!data?.tenant && <p className="text-xs text-muted-foreground">Ainda não personalizado: usando o padrão do sistema ({Math.round(Number(data?.global?.default_weight_kg ?? 0.01) * 1000)} g, {data?.global?.default_width_cm ?? 13}x{data?.global?.default_height_cm ?? 6}x{data?.global?.default_length_cm ?? 16} cm).</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
