import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import cartzyLogo from '@/assets/cartzy-logo.png';

export default function AfiliadoCadastro() {
  const [f, setF] = useState({ nome: '', email: '', telefone: '', senha: '', pix_key: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      const { data } = await supabase.functions.invoke('platform-affiliates', { body: { action: 'signup', ...f } });
      if (data?.success) setDone(true); else setError(data?.error || 'Não foi possível cadastrar');
    } catch { setError('Não foi possível cadastrar'); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg">
        <img src={cartzyLogo} alt="Cartzy" className="h-8 w-auto mb-6" />
        {done ? (
          <div className="text-center space-y-3">
            <CheckCircle className="mx-auto h-12 w-12 text-primary" />
            <h1 className="text-xl font-bold">Cadastro recebido!</h1>
            <p className="text-muted-foreground">Vamos analisar e avisar quando for aprovado. Depois é só entrar com seu e-mail e senha.</p>
            <Button asChild className="w-full"><Link to="/auth">Ir para o login</Link></Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Seja afiliado Cartzy</h1>
              <p className="text-sm text-muted-foreground">Indique lojas e ganhe 20% de cada mensalidade paga, todo mês.</p>
            </div>
            <div><Label>Nome completo</Label><Input required value={f.nome} onChange={(e) => set('nome', e.target.value)} /></div>
            <div><Label>E-mail</Label><Input required type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
            <div><Label>WhatsApp</Label><Input inputMode="tel" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} /></div>
            <div><Label>Senha (mín. 8 caracteres)</Label><Input required type="password" minLength={8} autoComplete="new-password" value={f.senha} onChange={(e) => set('senha', e.target.value)} /></div>
            <div><Label>Chave PIX</Label><Input value={f.pix_key} onChange={(e) => set('pix_key', e.target.value)} /></div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-11" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Quero ser afiliado'}</Button>
            <p className="text-center text-sm text-muted-foreground">Já tem conta? <Link to="/auth" className="text-primary underline">Entrar</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
