import { useRef, useState } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

/** Contratação direta: cria empresa + acesso e leva ao pagamento do plano. */
export function SelfSignupForm({ refCode, price }: { refCode: string | null; price: number }) {
  const startedAt = useRef(Date.now());
  const [f, setF] = useState({ empresa: '', documento: '', whatsapp: '', instagram: '', cidade: '', uf: '', nome: '', email: '', senha: '', senha2: '', plano: 'live', website: '' });
  const [terms, setTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.senha.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres');
    if (f.senha !== f.senha2) return setError('As senhas não conferem');
    if (!terms) return setError('Aceite os termos para continuar');
    setSending(true);
    try {
      const { senha2: _s2, ...payload } = f;
      const { data } = await supabase.functions.invoke('self-signup', { body: { action: 'create', ...payload, terms, ref: refCode, started_at: startedAt.current } });
      if (!data?.success) { setError(data?.error || 'Não foi possível cadastrar agora'); return; }
      if (data.payment_url) window.open(data.payment_url, '_blank', 'noopener');
      window.location.href = `/contratacao/obrigado?t=${data.token}`;
    } catch { setError('Não foi possível cadastrar agora'); } finally { setSending(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-6 shadow-lg space-y-4" autoComplete="on">
      <h2 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Contratar agora</h2>
      <p className="text-sm text-muted-foreground">Plano mensal de {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no cartão. Você cria seu acesso e já vai para o pagamento.</p>
      {/* honeypot anti-robô: invisível para pessoas */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />

      <div className="text-sm font-semibold pt-1">Dados da empresa</div>
      <div><Label htmlFor="ss-emp">Nome da empresa</Label><Input id="ss-emp" required value={f.empresa} onChange={set('empresa')} /></div>
      <div><Label htmlFor="ss-doc">CNPJ ou CPF</Label><Input id="ss-doc" required inputMode="numeric" value={f.documento} onChange={set('documento')} /></div>
      <div><Label htmlFor="ss-wa">WhatsApp com DDD</Label><Input id="ss-wa" required inputMode="tel" placeholder="(11) 99999-9999" value={f.whatsapp} onChange={set('whatsapp')} /></div>
      <div><Label htmlFor="ss-ig">@ do Instagram</Label><Input id="ss-ig" placeholder="@sualoja" value={f.instagram} onChange={set('instagram')} /></div>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <div><Label htmlFor="ss-cid">Cidade</Label><Input id="ss-cid" required value={f.cidade} onChange={set('cidade')} /></div>
        <div><Label htmlFor="ss-uf">UF</Label>
          <select id="ss-uf" required value={f.uf} onChange={set('uf')} className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">--</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select></div>
      </div>
      <div>
        <Label>Sistema</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {([['live', 'Vendas em live'], ['grupos_vip', 'Grupos VIP']] as const).map(([v, l]) => (
            <Button key={v} type="button" variant={f.plano === v ? 'default' : 'outline'} onClick={() => setF({ ...f, plano: v })}>{l}</Button>
          ))}
        </div>
      </div>

      <div className="text-sm font-semibold pt-1">Dados de acesso</div>
      <div><Label htmlFor="ss-nome">Nome do responsável</Label><Input id="ss-nome" required value={f.nome} onChange={set('nome')} /></div>
      <div><Label htmlFor="ss-email">E-mail (será seu login)</Label><Input id="ss-email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></div>
      <div className="relative"><Label htmlFor="ss-pw">Senha</Label><Input id="ss-pw" type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={f.senha} onChange={set('senha')} />
        <button type="button" className="absolute right-2 top-8 text-muted-foreground" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
      <div><Label htmlFor="ss-pw2">Confirme a senha</Label><Input id="ss-pw2" type={show ? 'text' : 'password'} required autoComplete="new-password" value={f.senha2} onChange={set('senha2')} /></div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} className="mt-0.5" />
        <span>Li e aceito os <a href="/termos-de-uso" target="_blank" rel="noreferrer" className="text-primary underline">termos de uso</a> e a <a href="/politica-de-privacidade" target="_blank" rel="noreferrer" className="text-primary underline">política de privacidade</a>.</span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full h-12" disabled={sending}>
        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Criar conta e ir para o pagamento'}
      </Button>
    </form>
  );
}
