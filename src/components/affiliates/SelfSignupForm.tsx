import { useEffect, useRef, useState } from 'react';
import { Loader2, Eye, EyeOff, Check, ChevronLeft, ChevronRight, Building2, LayoutGrid, KeyRound, Radio, Users, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export type SignupPlan = 'live' | 'grupos_vip' | 'completo';
export type PlanPrices = Record<SignupPlan, number>;
export const DEFAULT_PRICES: PlanPrices = { live: 299, grupos_vip: 299, completo: 499 };

const PLANS: { id: SignupPlan; nome: string; desc: string; icon: typeof Radio }[] = [
  { id: 'live', nome: 'Sistema de Live', desc: 'Vendas em live no Instagram com carrinho, checkout e frete', icon: Radio },
  { id: 'grupos_vip', nome: 'Sistema de Grupos WhatsApp', desc: 'Vendas e disparos nos seus grupos VIP de WhatsApp', icon: Users },
  { id: 'completo', nome: 'Combo (2 sistemas)', desc: 'Live + Grupos WhatsApp juntos, num acesso só', icon: Layers },
];
const STEPS = [
  { title: 'Empresa', icon: Building2 },
  { title: 'Sistema', icon: LayoutGrid },
  { title: 'Acesso', icon: KeyRound },
];
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const digits = (v: string) => v.replace(/\D/g, '');

/** Validação de CPF/CNPJ no navegador (o servidor valida de novo). */
function validDoc(v: string) {
  const d = digits(v);
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    for (const len of [9, 10]) {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
      if (((sum * 10) % 11) % 10 !== Number(d[len])) return false;
    }
    return true;
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const calc = (len: number) => {
      const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const r = w.reduce((a, wi, i) => a + Number(d[i]) * wi, 0) % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}
const maskDoc = (v: string) => {
  const d = digits(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};
const maskPhone = (v: string) => {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/** Contratação direta em 3 etapas: empresa → sistema → acesso; no fim cria a conta e leva ao pagamento. */
export function SelfSignupForm({ refCode, prices = DEFAULT_PRICES }: { refCode: string | null; prices?: PlanPrices }) {
  const startedAt = useRef(Date.now());
  const topRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [f, setF] = useState({ empresa: '', documento: '', whatsapp: '', instagram: '', cidade: '', uf: '', nome: '', email: '', senha: '', senha2: '', plano: '' as '' | SignupPlan, website: '' });
  const [terms, setTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, mask?: (v: string) => string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: mask ? mask(e.target.value) : e.target.value });

  const moved = useRef(false);
  useEffect(() => {
    setError(null);
    if (!moved.current) return;
    const el = topRef.current?.querySelector<HTMLElement>('[data-step] input:not([tabindex="-1"]), [data-step] button[role="radio"]');
    el?.focus({ preventScroll: true });
  }, [step]);

  const stepError = (i: number): string | null => {
    if (i === 0) {
      if (f.empresa.trim().length < 2) return 'Informe o nome da empresa';
      if (!validDoc(f.documento)) return 'CNPJ ou CPF inválido';
      if (digits(f.whatsapp).length < 10) return 'Informe o WhatsApp com DDD';
      if (!f.cidade.trim() || !f.uf) return 'Informe a cidade e o estado';
    }
    if (i === 1 && !f.plano) return 'Escolha o sistema que você vai contratar';
    if (i === 2) {
      if (f.nome.trim().length < 2) return 'Informe o nome do responsável';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) return 'E-mail inválido';
      if (f.senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres';
      if (f.senha !== f.senha2) return 'As senhas não conferem';
      if (!terms) return 'Aceite os termos para continuar';
    }
    return null;
  };

  const go = (to: number) => {
    if (to > step) {
      for (let i = step; i < to; i++) { const e = stepError(i); if (e) { setStep(i); setError(e); return; } }
    }
    moved.current = true;
    setDir(to > step ? 1 : -1);
    setStep(to);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 2) return go(step + 1);
    const err = stepError(0) || stepError(1) || stepError(2);
    if (err) return setError(err);
    setSending(true);
    setError(null);
    try {
      const { senha2: _s2, ...payload } = f;
      const { data } = await supabase.functions.invoke('self-signup', { body: { action: 'create', ...payload, terms, ref: refCode, started_at: startedAt.current } });
      if (!data?.success) { setError(data?.error || 'Não foi possível cadastrar agora'); return; }
      window.location.href = `/contratacao/obrigado?t=${data.token}`;
    } catch { setError('Não foi possível cadastrar agora'); } finally { setSending(false); }
  };

  const plan = f.plano ? PLANS.find((p) => p.id === f.plano) : null;
  const anim = dir === 1 ? 'slide-in-from-right-6' : 'slide-in-from-left-6';

  return (
    <form ref={topRef} onSubmit={submit} noValidate className="scroll-mt-6 rounded-2xl border bg-card p-6 shadow-lg" autoComplete="on">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Contratar agora</h2>
        <span className="text-xs text-muted-foreground">Etapa {step + 1} de {STEPS.length}</span>
      </div>

      {/* Barra segmentada (inspirada no "Segmented Progress Pill Stepper" do 21st.dev) */}
      <div className="relative mt-5 h-2 w-full rounded-full bg-muted" aria-hidden="true">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/20 transition-all duration-500 ease-out" style={{ width: `${(step / STEPS.length) * 100}%` }} />
        <div className="absolute inset-y-0 rounded-full bg-primary transition-all duration-500 ease-out" style={{ left: `${(step / STEPS.length) * 100}%`, width: `${100 / STEPS.length}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-1">
        {STEPS.map((s, i) => {
          const done = i < step, active = i === step;
          return (
            <li key={s.title}>
              <button type="button" onClick={() => go(i)} aria-current={active ? 'step' : undefined}
                className={cn('flex w-full items-center justify-center gap-1 text-xs font-medium transition-colors',
                  active ? 'text-foreground' : done ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <s.icon className="h-3.5 w-3.5" />}{s.title}
              </button>
            </li>
          );
        })}
      </ol>

      {/* honeypot anti-robô: invisível para pessoas */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />

      <div key={step} data-step className={cn('mt-6 space-y-4 animate-in fade-in duration-300', anim)}>
        {step === 0 && (
          <>
            <div>
              <h3 className="font-semibold">Dados da empresa</h3>
              <p className="text-sm text-muted-foreground">Conte sobre a sua loja.</p>
            </div>
            <div><Label htmlFor="ss-emp">Nome da empresa</Label><Input id="ss-emp" autoComplete="organization" value={f.empresa} onChange={set('empresa')} /></div>
            <div><Label htmlFor="ss-doc">CNPJ ou CPF</Label><Input id="ss-doc" inputMode="numeric" placeholder="00.000.000/0000-00" value={f.documento} onChange={set('documento', maskDoc)} /></div>
            <div><Label htmlFor="ss-wa">WhatsApp com DDD</Label><Input id="ss-wa" inputMode="tel" autoComplete="tel-national" placeholder="(11) 99999-9999" value={f.whatsapp} onChange={set('whatsapp', maskPhone)} /></div>
            <div><Label htmlFor="ss-ig">@ do Instagram <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input id="ss-ig" placeholder="@sualoja" value={f.instagram} onChange={set('instagram')} /></div>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <div><Label htmlFor="ss-cid">Cidade</Label><Input id="ss-cid" autoComplete="address-level2" value={f.cidade} onChange={set('cidade')} /></div>
              <div><Label htmlFor="ss-uf">UF</Label>
                <select id="ss-uf" value={f.uf} onChange={set('uf')} className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">--</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select></div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <h3 className="font-semibold">Qual sistema você vai contratar?</h3>
              <p className="text-sm text-muted-foreground">Pagamento mensal no cartão. Cancele quando quiser.</p>
            </div>
            <div className="grid gap-3" role="radiogroup" aria-label="Sistema">
              {PLANS.map((p) => {
                const active = f.plano === p.id;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={active} onClick={() => setF({ ...f, plano: p.id })}
                    className={cn('relative flex items-center gap-3 rounded-xl border p-4 text-left transition-all',
                      active ? 'border-primary bg-primary/5 ring-2 ring-primary shadow-sm' : 'border-input hover:border-primary/50 hover:bg-muted/40')}>
                    <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
                      <p.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-tight">{p.nome}</span>
                      <span className="block text-xs text-muted-foreground">{p.desc}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-bold">{brl(prices[p.id])}</span>
                      <span className="block text-xs text-muted-foreground">por mês</span>
                    </span>
                    {p.id === 'completo' && prices.live + prices.grupos_vip > prices.completo && (
                      <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        Economize {brl(prices.live + prices.grupos_vip - prices.completo)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h3 className="font-semibold">Crie seu acesso</h3>
              <p className="text-sm text-muted-foreground">É com esse e-mail e senha que você entra no Cartzy.</p>
            </div>
            {plan && (
              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <span><strong>{f.empresa || 'Sua empresa'}</strong> · {plan.nome}</span>
                <span className="font-semibold">{brl(prices[plan.id])}/mês</span>
              </div>
            )}
            <div><Label htmlFor="ss-nome">Nome do responsável</Label><Input id="ss-nome" autoComplete="name" value={f.nome} onChange={set('nome')} /></div>
            <div><Label htmlFor="ss-email">E-mail (será seu login)</Label><Input id="ss-email" type="email" autoComplete="email" value={f.email} onChange={set('email')} /></div>
            <div className="relative"><Label htmlFor="ss-pw">Senha</Label><Input id="ss-pw" type={show ? 'text' : 'password'} minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={f.senha} onChange={set('senha')} />
              <button type="button" className="absolute right-2 top-8 text-muted-foreground" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            <div><Label htmlFor="ss-pw2">Confirme a senha</Label><Input id="ss-pw2" type={show ? 'text' : 'password'} autoComplete="new-password" value={f.senha2} onChange={set('senha2')} /></div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} className="mt-0.5" />
              <span>Li e aceito os <a href="/termos-de-uso" target="_blank" rel="noreferrer" className="text-primary underline">termos de uso</a> e a <a href="/politica-de-privacidade" target="_blank" rel="noreferrer" className="text-primary underline">política de privacidade</a>.</span>
            </label>
          </>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
        <Button type="button" variant="ghost" onClick={() => go(step - 1)} disabled={step === 0 || sending} className={cn(step === 0 && 'invisible')}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        <Button type="submit" size="lg" className="h-12 flex-1 sm:flex-none sm:px-8" disabled={sending}>
          {sending ? <Loader2 className="h-5 w-5 animate-spin" />
            : step < 2 ? <>Continuar <ChevronRight className="ml-1 h-4 w-4" /></>
            : 'Ir para o pagamento'}
        </Button>
      </div>
    </form>
  );
}
