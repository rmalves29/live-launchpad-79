import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const TZ = { timeZone: 'America/Sao_Paulo' } as const;
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', TZ);
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { ...TZ, weekday: 'short', day: '2-digit', month: '2-digit' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { ...TZ, hour: '2-digit', minute: '2-digit' });
export const fullSlotLabel = (iso: string) => new Date(iso).toLocaleString('pt-BR', { ...TZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Seletor de dia/horário (30 min, horário de Brasília) usado na agenda da landing e no onboarding. */
export function SlotPicker({ slots, loading, value, onChange }: { slots: string[]; loading: boolean; value: string | null; onChange: (s: string | null) => void }) {
  const [day, setDay] = useState<string | null>(null);
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    slots.forEach((s) => { const k = dayKey(s); m.set(k, [...(m.get(k) || []), s]); });
    return m;
  }, [slots]);
  return (
    <div className="space-y-3">
      <div>
        <Label>Dia da reunião</Label>
        {loading ? <Loader2 className="mt-2 h-5 w-5 animate-spin text-primary" /> : byDay.size === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Sem horários livres agora. Tente mais tarde.</p>
        ) : (
          <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
            {[...byDay.keys()].map((k) => (
              <Button key={k} type="button" size="sm" variant={day === k ? 'default' : 'outline'} className="shrink-0" onClick={() => { setDay(k); onChange(null); }}>
                {dayLabel(byDay.get(k)![0])}
              </Button>
            ))}
          </div>
        )}
      </div>
      {day && byDay.get(day) && (
        <div>
          <Label>Horário (Brasília)</Label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {byDay.get(day)!.map((s) => (
              <Button key={s} type="button" size="sm" variant={value === s ? 'default' : 'outline'} onClick={() => onChange(s)}>{timeLabel(s)}</Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
