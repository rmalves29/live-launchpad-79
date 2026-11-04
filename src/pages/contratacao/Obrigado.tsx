import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { SlotPicker, fullSlotLabel } from '@/components/affiliates/SlotPicker';
import cartzyLogo from '@/assets/cartzy-logo.png';

type St = { status: string; empresa: string; payment_url: string | null; meeting_at: string | null };

export default function ContratacaoObrigado() {
  const token = new URLSearchParams(window.location.search).get('t') || '';
  const [st, setSt] = useState<St | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    const { data } = await supabase.functions.invoke('self-signup', { body: { action: 'status', token } });
    if (!data?.success) { setNotFound(true); return null; }
    setSt(data); return data as St;
  }, [token]);

  const loadSlots = useCallback(() => {
    setLoadingSlots(true);
    supabase.functions.invoke('self-signup', { body: { action: 'slots' } })
      .then(({ data }) => setSlots(data?.slots || [])).finally(() => setLoadingSlots(false));
  }, []);

  useEffect(() => {
    document.title = 'Cartzy — confirmando pagamento';
    let stop = false;
    const tick = async () => {
      const r = await check();
      if (stop) return;
      if (r?.status === 'pago') { if (!r.meeting_at) loadSlots(); return; }
      if (r) setTimeout(tick, 4000);
    };
    tick();
    return () => { stop = true; };
  }, [check, loadSlots]);

  const book = async () => {
    if (!slot) return setError('Escolha o dia e o horário');
    setBooking(true); setError(null);
    const { data } = await supabase.functions.invoke('self-signup', { body: { action: 'book_onboarding', token, meeting_at: slot } });
    setBooking(false);
    if (!data?.success) { setError(data?.error || 'Não foi possível agendar'); setSlot(null); loadSlots(); return; }
    setSt((s) => (s ? { ...s, meeting_at: data.meeting_at } : s));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-md px-5 py-10 space-y-6">
        <img src={cartzyLogo} alt="Cartzy" className="h-8 w-auto" />
        {notFound ? (
          <p className="text-muted-foreground">Cadastro não encontrado. Confira o link ou fale com a gente.</p>
        ) : !st ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : st.status !== 'pago' ? (
          <div className="rounded-2xl border bg-card p-6 shadow-lg space-y-4 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Confirmando seu pagamento...</h1>
            <p className="text-muted-foreground">Conta da <strong>{st.empresa}</strong> criada. Assim que o pagamento for aprovado, esta tela atualiza sozinha.</p>
            {st.status === 'expirado' && <p className="text-sm text-destructive">Esse cadastro passou de 7 dias sem pagamento, mas você ainda pode concluir.</p>}
            {st.payment_url ? (
              <Button asChild size="lg" className="w-full h-12"><a href={st.payment_url} target="_blank" rel="noreferrer"><CreditCard className="mr-2 h-5 w-5" />Ir para o pagamento</a></Button>
            ) : <p className="text-sm text-muted-foreground">O link de pagamento ainda não está disponível. Nossa equipe vai te chamar no WhatsApp.</p>}
          </div>
        ) : st.meeting_at ? (
          <div className="rounded-2xl border bg-card p-6 shadow-lg space-y-3 text-center">
            <CalendarCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Onboarding agendado!</h1>
            <p className="text-muted-foreground">{fullSlotLabel(st.meeting_at)} (horário de Brasília), 30 minutos.</p>
            <Button asChild className="w-full"><a href="/auth">Entrar no Cartzy</a></Button>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-6 shadow-lg space-y-4">
            <div className="text-center space-y-2">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Pagamento confirmado!</h1>
              <p className="text-muted-foreground">Agende sua reunião de onboarding (30 min) para configurarmos tudo com você.</p>
            </div>
            <SlotPicker slots={slots} loading={loadingSlots} value={slot} onChange={setSlot} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button size="lg" className="w-full h-12" onClick={book} disabled={booking || !slot}>{booking ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Agendar onboarding'}</Button>
            <a href="/auth" className="block text-center text-sm text-muted-foreground underline">Agendar depois e entrar no Cartzy</a>
          </div>
        )}
      </main>
    </div>
  );
}
