import { useEffect, useMemo, useState } from 'react';
import { Zap, CreditCard, Truck, ClipboardCheck, MessageCircle, Loader2, ArrowRight, Sparkles, CalendarCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getActiveRef, rememberRef } from '@/lib/affiliate-ref';
import cartzyLogo from '@/assets/cartzy-logo.png';
import { SelfSignupForm } from '@/components/affiliates/SelfSignupForm';

const TZ = { timeZone: 'America/Sao_Paulo' } as const;
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', TZ);
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { ...TZ, weekday: 'short', day: '2-digit', month: '2-digit' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { ...TZ, hour: '2-digit', minute: '2-digit' });
const fullLabel = (iso: string) => new Date(iso).toLocaleString('pt-BR', { ...TZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const FEATURES = [
  { icon: Zap, title: 'Compra em até 3 toques', text: 'Sua cliente compra sem sair da live. Comentou o código, o pedido já está montado.' },
  { icon: CreditCard, title: 'Pagamento e frete pagos', text: 'Link de pagamento com frete calculado. O dinheiro entra antes de você separar a peça.' },
  { icon: ClipboardCheck, title: 'Pedido organizado', text: 'Nada de caderno ou print. Cada pedido com cliente, itens, endereço e status.' },
  { icon: MessageCircle, title: 'WhatsApp no automático', text: 'Resumo do pedido, confirmação de pagamento e código de rastreio enviados sozinhos.' },
];

export default function Indicacao() {
  const ref = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get('ref');
    const active = getActiveRef();
    if (active) return active;
    return q ? rememberRef(q.toUpperCase()) : null;
  }, []);
  const [affiliate, setAffiliate] = useState<{ nome: string; codigo: string } | null>(null);
  const [form, setForm] = useState({ nome: '', empresa: '', whatsapp: '', instagram: '', vende_live: '' as '' | 'sim' | 'nao' });
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [price, setPrice] = useState(299);
  const [showMeeting, setShowMeeting] = useState(false);

  const loadSlots = () => {
    setLoadingSlots(true);
    supabase.functions.invoke('affiliate-booking', { body: { action: 'slots', ref } })
      .then(({ data }) => { setAffiliate(data?.affiliate ?? null); setSlots(data?.slots || []); })
      .finally(() => setLoadingSlots(false));
  };
  useEffect(() => {
    document.title = 'Cartzy — venda em live sem bagunça'; loadSlots();
    supabase.functions.invoke('self-signup', { body: { action: 'config' } }).then(({ data }) => { if (data?.price) setPrice(Number(data.price)); });
  }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    slots.forEach((s) => { const k = dayKey(s); m.set(k, [...(m.get(k) || []), s]); });
    return m;
  }, [slots]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.vende_live) return setError('Conte se você já vende em live');
    if (!slot) return setError('Escolha o dia e o horário da reunião');
    setSending(true);
    try {
      const { data } = await supabase.functions.invoke('affiliate-booking', {
        body: { action: 'book', ...form, vende_live: form.vende_live === 'sim', meeting_at: slot, ref },
      });
      if (!data?.success) { setError(data?.error || 'Não foi possível agendar agora'); setSlot(null); loadSlots(); return; }
      setDone(data.meeting_at);
    } catch { setError('Não foi possível agendar agora'); } finally { setSending(false); }
  };

  const scrollToForm = () => { setShowMeeting(true); setTimeout(() => document.getElementById('quero-conhecer')?.scrollIntoView({ behavior: 'smooth' }), 50); };
  const scrollToSignup = () => document.getElementById('contratar')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-background to-accent/10">
        <div className="mx-auto max-w-5xl px-5 pt-6 pb-16 md:pb-24">
          <img src={cartzyLogo} alt="Cartzy" className="h-8 w-auto" />
          {affiliate && (
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm">
              <Sparkles className="h-4 w-4 text-primary" /> Indicação de <strong>{affiliate.nome}</strong>
            </div>
          )}
          <h1 className="mt-6 font-display text-4xl md:text-6xl font-bold leading-tight tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Venda na live.<br /><span className="text-primary">O Cartzy cuida do resto.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Pedido, pagamento, frete e WhatsApp organizados sozinhos — para você focar em vender.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <Button size="lg" className="h-12 px-8 text-base" onClick={scrollToSignup}>
              Contratar agora <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <button type="button" onClick={scrollToForm} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Prefiro conversar antes — agendar uma apresentação
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-14 grid gap-4 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-1 text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-10 grid gap-3 sm:grid-cols-3 text-center">
        {[['Sem sair da live', 'a cliente compra no celular'], ['Frete na hora', 'calculado no checkout'], ['Rastreio', 'enviado no WhatsApp']].map(([a, b]) => (
          <div key={a} className="rounded-xl bg-muted/50 p-4"><Truck className="mx-auto mb-2 h-5 w-5 text-primary" /><div className="font-semibold">{a}</div><div className="text-sm text-muted-foreground">{b}</div></div>
        ))}
      </section>

      <section id="contratar" className="mx-auto max-w-md px-5 pb-10">
        <SelfSignupForm refCode={ref} price={price} />
        {!showMeeting && (
          <button type="button" onClick={scrollToForm} className="mt-4 block w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Prefiro conversar antes — agendar uma apresentação
          </button>
        )}
      </section>

      {showMeeting && <section id="quero-conhecer" className="mx-auto max-w-md px-5 pb-20">
        {done ? (
          <div className="rounded-2xl border bg-card p-6 shadow-lg space-y-3 text-center">
            <CalendarCheck className="mx-auto h-10 w-10 text-primary" />
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Reunião agendada!</h2>
            <p className="text-muted-foreground">{fullLabel(done)} (horário de Brasília), 30 minutos.</p>
            <p className="text-sm text-muted-foreground">Enviamos a confirmação no seu WhatsApp. O link da reunião chega lá no horário marcado.</p>
          </div>
        ) : (
        <form onSubmit={submit} className="rounded-2xl border bg-card p-6 shadow-lg space-y-4">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Agende uma conversa</h2>
          <p className="text-sm text-muted-foreground">30 minutos por vídeo para mostrar o Cartzy na prática.</p>
          <div><Label htmlFor="nome">Seu nome</Label><Input id="nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div><Label htmlFor="empresa">Nome da loja / empresa</Label><Input id="empresa" required value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></div>
          <div><Label htmlFor="wa">WhatsApp com DDD</Label><Input id="wa" required inputMode="tel" placeholder="(11) 99999-9999" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
          <div><Label htmlFor="ig">@ do Instagram da loja</Label><Input id="ig" placeholder="@sualoja" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} /></div>
          <div>
            <Label>Você já vende em live?</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {([['sim', 'Sim'], ['nao', 'Ainda não']] as const).map(([v, l]) => (
                <Button key={v} type="button" variant={form.vende_live === v ? 'default' : 'outline'} onClick={() => setForm({ ...form, vende_live: v })}>{l}</Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Dia da reunião</Label>
            {loadingSlots ? <Loader2 className="mt-2 h-5 w-5 animate-spin text-primary" /> : byDay.size === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Sem horários livres agora. Tente mais tarde.</p>
            ) : (
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {[...byDay.keys()].map((k) => (
                  <Button key={k} type="button" size="sm" variant={day === k ? 'default' : 'outline'} className="shrink-0" onClick={() => { setDay(k); setSlot(null); }}>
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
                  <Button key={s} type="button" size="sm" variant={slot === s ? 'default' : 'outline'} onClick={() => setSlot(s)}>{timeLabel(s)}</Button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full h-12" disabled={sending}>
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Agendar reunião <CalendarCheck className="ml-2 h-5 w-5" /></>}
          </Button>
        </form>
        )}
      </section>
    </div>
  );
}
