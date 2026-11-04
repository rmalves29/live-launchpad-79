import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NONE = '__none__';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  phone?: string;
  instagram?: string;
}

/** "Indicado por": afiliados aprovados; pré-preenche pelo WhatsApp ou @Instagram de um lead dos últimos 60 dias. */
export function AffiliateSelect({ value, onChange, phone, instagram }: Props) {
  const [list, setList] = useState<{ id: string; nome: string; codigo: string }[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    supabase.from('platform_affiliates' as any).select('id, nome, codigo').eq('status', 'aprovado').order('nome')
      .then(({ data }) => setList((data as any) || []));
  }, []);

  useEffect(() => {
    const digits = (phone || '').replace(/\D/g, '');
    const ig = (instagram || '').trim();
    if (touched.current || (digits.length < 10 && ig.length < 2)) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('platform_affiliate_lookup_lead' as any, { _phone: digits || null, _instagram: ig || null });
      const row = Array.isArray(data) ? (data as any[])[0] : null;
      if (row && !touched.current) {
        if (value !== row.affiliate_id) onChange(row.affiliate_id);
        setHint(`Indicação de ${row.affiliate_nome}`);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [phone, instagram, value, onChange]);

  return (
    <div className="space-y-2">
      <Label>Indicado por</Label>
      <Select value={value || NONE} onValueChange={(v) => { touched.current = true; setHint(null); onChange(v === NONE ? null : v); }}>
        <SelectTrigger><SelectValue placeholder="Sem indicação" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sem indicação</SelectItem>
          {list.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome} ({a.codigo})</SelectItem>)}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs font-medium text-primary">{hint}</p>}
    </div>
  );
}
