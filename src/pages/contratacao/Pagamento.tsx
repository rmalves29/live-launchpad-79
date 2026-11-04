import { useEffect, useState } from 'react';
import { CreditCard, Loader2, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import cartzyLogo from '@/assets/cartzy-logo.png';

/** Tela única para quem contratou e ainda não pagou. */
export default function ContratacaoPagamento() {
  const { profile, signOut } = useAuth() as any;
  const [t, setT] = useState<any>(null);
  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase.from('tenants').select('name, signup_status, signup_payment_url, signup_token').eq('id', profile.tenant_id).maybeSingle()
      .then(({ data }) => {
        if (data && !['aguardando_pagamento', 'expirado'].includes((data as any).signup_status)) { window.location.href = '/'; return; }
        setT(data);
      });
  }, [profile?.tenant_id]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg space-y-4 text-center">
        <img src={cartzyLogo} alt="Cartzy" className="mx-auto h-8 w-auto" />
        {!t ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : (
          <>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Falta só o pagamento</h1>
            <p className="text-muted-foreground">A conta da <strong>{t.name}</strong> será liberada assim que o pagamento do plano for confirmado.</p>
            {t.signup_payment_url ? (
              <Button asChild size="lg" className="w-full h-12"><a href={t.signup_payment_url} target="_blank" rel="noreferrer"><CreditCard className="mr-2 h-5 w-5" />Concluir pagamento</a></Button>
            ) : <p className="text-sm text-muted-foreground">Nossa equipe vai te chamar no WhatsApp com o link de pagamento.</p>}
            {t.signup_token && <Button asChild variant="outline" className="w-full"><a href={`/contratacao/obrigado?t=${t.signup_token}`}>Já paguei — verificar</a></Button>}
          </>
        )}
        <Button variant="ghost" size="sm" onClick={() => signOut?.()}><LogOut className="mr-1 h-4 w-4" />Sair</Button>
      </div>
    </div>
  );
}
