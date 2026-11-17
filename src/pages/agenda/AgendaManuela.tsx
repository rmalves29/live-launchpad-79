// Agenda pública da Manuela (Jarvis): a loja escolhe o dia e o horário da apresentação do Cartzy.
// Hoje fica sempre bloqueado; reuniões de 30 min; o horário trava para mais ninguém pegar.
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Clock, Loader2, MessageCircle, Video, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import cartzyLogo from '@/assets/cartzy-logo.png';

const TZ = { timeZone: 'America/Sao_Paulo' } as const;
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', TZ);
const weekday = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { ...TZ, weekday: 'short' }).replace('.', '');
const dayNum = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { ...TZ, day: '2-digit', month: '2-digit' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { ...TZ, hour: '2-digit', minute: '2-digit' });
const fullLabel = (iso: string) => new Date(iso).toLocaleString('pt-BR', { ...TZ, weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

export default function AgendaManuela() {
  const [form, setForm] = useState({ nome: '', whatsapp: '', email: '', empresa: '' });
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    supabase.functions.invoke('affiliate-booking', { body: { action: 'jarvis_slots' } })
      .then(({ data }) => setSlots(data?.slots || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { document.title = 'Cartzy — agende sua apresentação'; load(); }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    slots.forEach((s) => { const k = dayKey(s); m.set(k, [...(m.get(k) || []), s]); });
    return m;
  }, [slots]);
  useEffect(() => { if (!day && byDay.size) setDay([...byDay.keys()][0]); }, [byDay, day]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!slot) return setError('Escolha o dia e o horário da reunião');
    setSending(true);
    try {
      const { data } = await supabase.functions.invoke('affiliate-booking', { body: { action: 'jarvis_book', ...form, meeting_at: slot } });
      if (!data?.success) { setError(data?.error || 'Não foi possível agendar agora'); setSlot(null); load(); return; }
      setDone(data.meeting_at);
    } catch { setError('Não foi possível agendar agora'); } finally { setSending(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 text-foreground">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-8 md:grid-cols-[1fr_1.1fr] md:py-14">
        <aside className="space-y-6">
          <img src={cartzyLogo} alt="Cartzy" className="h-8 w-auto" />
          <div>
            <p className="text-sm font-medium text-primary">Manuela, da Cartzy</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight md:text-4xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Escolha o melhor horário pra gente conversar
            </h1>
            <p className="mt-3 text-muted-foreground">
              Em 30 minutos, por vídeo, o Rafael mostra na prática como a sua cliente compra sem sair da live, com pagamento e frete pagos, e o pedido chega organizado para você.
            </p>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Clock className="h-4 w-4" /></span>30 minutos, sem compromisso</li>
            <li className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Video className="h-4 w-4" /></span>Por Google Meet: o link chega no seu WhatsApp</li>
            <li className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><MessageCircle className="h-4 w-4" /></span>5 minutos antes a Manuela te avisa</li>
            <li className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Zap className="h-4 w-4" /></span>Compra em até 3 toques, sem sair da live</li>
          </ul>
        </aside>

        <main>
          {done ? (
            <div className="space-y-3 rounded-2xl border bg-card p-8 text-center shadow-lg">
              <CalendarCheck className="mx-auto h-12 w-12 text-primary" />
              <h2 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Reunião agendada!</h2>
              <p className="text-lg capitalize">{fullLabel(done)}</p>
              <p className="text-sm text-muted-foreground">Horário de Brasília, 30 minutos. A confirmação foi para o seu WhatsApp; 5 minutos antes a Manuela te avisa, e no horário chega o link da reunião.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-card p-6 shadow-lg">
              <div>
                <Label>Dia</Label>
                {loading ? <Loader2 className="mt-3 h-5 w-5 animate-spin text-primary" /> : byDay.size === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Sem horários livres agora. Tente mais tarde.</p>
                ) : (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {[...byDay.keys()].map((k) => {
                      const first = byDay.get(k)![0];
                      const on = day === k;
                      return (
                        <button key={k} type="button" onClick={() => { setDay(k); setSlot(null); }}
                          className={`flex w-14 shrink-0 flex-col items-center rounded-lg border px-1.5 py-1.5 transition ${on ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/60'}`}>
                          <span className="text-xs uppercase opacity-80">{weekday(first)}</span>
                          <span className="text-sm font-semibold">{dayNum(first)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {day && byDay.get(day) && (
                <div>
                  <Label>Horário (Brasília)</Label>
                  <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {byDay.get(day)!.map((s) => (
                      <Button key={s} type="button" size="sm" className="h-8 px-2 text-xs" variant={slot === s ? 'default' : 'outline'} onClick={() => setSlot(s)}>{timeLabel(s)}</Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label htmlFor="nome">Seu nome</Label><Input id="nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                <div><Label htmlFor="wa">WhatsApp com DDD</Label><Input id="wa" required inputMode="tel" placeholder="(11) 99999-9999" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: maskPhone(e.target.value) })} /></div>
                <div><Label htmlFor="email">E-mail</Label><Input id="email" type="email" required placeholder="voce@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label htmlFor="empresa">Nome da loja (opcional)</Label><Input id="empresa" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="h-12 w-full" disabled={sending}>
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Confirmar reunião <CalendarCheck className="ml-2 h-5 w-5" /></>}
              </Button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
