import { useEffect, useMemo, useState } from 'react';
import { Zap, CreditCard, Truck, ClipboardCheck, MessageCircle, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getActiveRef, rememberRef, whatsappText } from '@/lib/affiliate-ref';
import cartzyLogo from '@/assets/cartzy-logo.png';

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
  const [whats, setWhats] = useState('');
  const [form, setForm] = useState({ nome: '', whatsapp: '', instagram: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Cartzy — venda em live sem bagunça';
    supabase.functions.invoke('platform-affiliates', { body: { action: 'landing_info', codigo: ref } })
      .then(({ data }) => { setAffiliate(data?.affiliate ?? null); setWhats(data?.whatsapp || ''); });
  }, [ref]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSending(true);
    const win = window.open('', '_blank');
    try {
      const { data } = await supabase.functions.invoke('platform-affiliates', { body: { action: 'lead', ...form, ref } });
      if (!data?.success) { win?.close(); setError(data?.error || 'Não foi possível enviar agora'); return; }
      const number = data.whatsapp || whats;
      const link = `https://wa.me/${number}?text=${encodeURIComponent(whatsappText(data.affiliate ?? affiliate))}`;
      if (win) win.location.href = link; else window.location.href = link;
    } catch { win?.close(); setError('Não foi possível enviar agora'); } finally { setSending(false); }
  };

  const scrollToForm = () => document.getElementById('quero-conhecer')?.scrollIntoView({ behavior: 'smooth' });

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
          <Button size="lg" className="mt-8 h-12 px-8 text-base" onClick={scrollToForm}>
            Quero conhecer <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
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

      <section id="quero-conhecer" className="mx-auto max-w-md px-5 pb-20">
        <form onSubmit={submit} className="rounded-2xl border bg-card p-6 shadow-lg space-y-4">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quero conhecer</h2>
          <p className="text-sm text-muted-foreground">Deixe seu contato e fale com a gente no WhatsApp.</p>
          <div><Label htmlFor="nome">Seu nome</Label><Input id="nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div><Label htmlFor="wa">WhatsApp com DDD</Label><Input id="wa" required inputMode="tel" placeholder="(11) 99999-9999" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
          <div><Label htmlFor="ig">@ do Instagram da loja</Label><Input id="ig" placeholder="@sualoja" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full h-12" disabled={sending}>
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Falar no WhatsApp <MessageCircle className="ml-2 h-5 w-5" /></>}
          </Button>
        </form>
      </section>
    </div>
  );
}
