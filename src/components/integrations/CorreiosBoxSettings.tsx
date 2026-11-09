/**
 * Caixa padrão de envio da empresa (cm). É a medida que vai na pré-postagem dos Correios.
 * O Mini Envios tem caixa própria (16 x 11 x 3 cm) e não usa esta.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Package } from 'lucide-react';

interface Props {
  tenantId: string;
}

const toNum = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export default function CorreiosBoxSettings({ tenantId }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState({ length: '', width: '', height: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await (supabase as any)
        .from('tenants')
        .select('shipping_box_length_cm, shipping_box_width_cm, shipping_box_height_cm')
        .eq('id', tenantId)
        .maybeSingle();
      if (!alive) return;
      setForm({
        length: data?.shipping_box_length_cm != null ? String(data.shipping_box_length_cm) : '',
        width: data?.shipping_box_width_cm != null ? String(data.shipping_box_width_cm) : '',
        height: data?.shipping_box_height_cm != null ? String(data.shipping_box_height_cm) : '',
      });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [tenantId]);

  async function save() {
    const empty = !form.length.trim() && !form.width.trim() && !form.height.trim();
    const vals = { l: toNum(form.length), w: toNum(form.width), h: toNum(form.height) };
    if (!empty && [vals.l, vals.w, vals.h].some((n) => !Number.isFinite(n) || n < 1 || n > 105)) {
      toast({ title: 'Medidas inválidas', description: 'Preencha as três medidas, entre 1 e 105 cm (ou deixe todas vazias para usar o padrão do sistema).', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from('tenants')
      .update(empty
        ? { shipping_box_length_cm: null, shipping_box_width_cm: null, shipping_box_height_cm: null }
        : { shipping_box_length_cm: vals.l, shipping_box_width_cm: vals.w, shipping_box_height_cm: vals.h })
      .eq('id', tenantId);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar a caixa', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: empty ? 'Caixa padrão removida' : 'Caixa padrão salva', description: empty ? 'Volta a valer o padrão do sistema.' : `${vals.l} x ${vals.w} x ${vals.h} cm` });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Caixa padrão de envio</CardTitle>
        <CardDescription>
          Medidas da caixa usada na etiqueta dos Correios para PAC e SEDEX, em centímetros. O Mini Envios usa sempre a caixa 16 x 11 x 3 cm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="box_l">Comprimento (cm)</Label>
            <Input id="box_l" inputMode="decimal" placeholder="15" value={form.length} disabled={loading} onChange={(e) => setForm({ ...form, length: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="box_w">Largura (cm)</Label>
            <Input id="box_w" inputMode="decimal" placeholder="11" value={form.width} disabled={loading} onChange={(e) => setForm({ ...form, width: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="box_h">Altura (cm)</Label>
            <Input id="box_h" inputMode="decimal" placeholder="6" value={form.height} disabled={loading} onChange={(e) => setForm({ ...form, height: e.target.value })} />
          </div>
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar caixa
        </Button>
      </CardContent>
    </Card>
  );
}
