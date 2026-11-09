/**
 * Logística reversa nos Correios (mesmo modelo do Troca Fácil).
 * Com o código do serviço de reversa do contrato preenchido, toda remessa criada pela tela de Etiquetas
 * sai como logística reversa. Vazio = PAC / SEDEX / Mini Envios normais.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Undo2 } from 'lucide-react';

interface Props {
  tenantId: string;
}

export default function CorreiosReversaSettings({ tenantId }: Props) {
  const { toast } = useToast();
  const [codigo, setCodigo] = useState('');
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
      setCodigo(String(data?.service_codes?.Reversa ?? ''));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [tenantId]);

  async function save() {
    const limpo = codigo.replace(/\D/g, '');
    if (limpo && (limpo.length < 4 || limpo.length > 5)) {
      toast({ title: 'Código inválido', description: 'O código do serviço tem 4 ou 5 dígitos (ex.: 03247). Deixe vazio para usar PAC/SEDEX normais.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: atual } = await (supabase as any)
      .from('shipping_integrations')
      .select('service_codes')
      .eq('tenant_id', tenantId)
      .eq('provider', 'correios')
      .maybeSingle();
    const codes: Record<string, string> = { ...(atual?.service_codes || {}) };
    if (limpo) codes.Reversa = limpo.padStart(5, '0');
    else delete codes.Reversa;
    const { error } = await (supabase as any)
      .from('shipping_integrations')
      .update({ service_codes: codes })
      .eq('tenant_id', tenantId)
      .eq('provider', 'correios');
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: limpo ? 'Logística reversa ligada' : 'Logística reversa desligada', description: limpo ? `Serviço ${limpo.padStart(5, '0')}` : 'Voltou para PAC / SEDEX / Mini Envios.' });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Undo2 className="h-4 w-4" /> Logística reversa</CardTitle>
        <CardDescription>
          Informe o código do serviço de logística reversa do seu contrato dos Correios. Preenchido, as remessas criadas em Etiquetas saem como logística reversa (mesmo modelo do Troca Fácil). Vazio, valem PAC, SEDEX e Mini Envios normais.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 max-w-xs">
          <Label htmlFor="reversa_code">Código do serviço de reversa</Label>
          <Input id="reversa_code" inputMode="numeric" placeholder="vazio = desligado" value={codigo} disabled={loading} onChange={(e) => setCodigo(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
