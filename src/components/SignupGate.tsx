import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export type SignupInfo = { signup_status: string | null; signup_token: string | null; onboarding_meeting_at: string | null };
const cache = new Map<string, { v: SignupInfo | null; at: number }>();

/** Status da contratação direta do tenant logado (null = cadastro normal). */
export function useSignupStatus(tenantId: string | null): SignupInfo | null {
  const [v, setV] = useState<SignupInfo | null>(() => (tenantId ? cache.get(tenantId)?.v ?? null : null));
  useEffect(() => {
    if (!tenantId) { setV(null); return; }
    const c = cache.get(tenantId);
    if (c && Date.now() - c.at < 60_000) { setV(c.v); return; }
    supabase.from('tenants').select('signup_status, signup_token, onboarding_meeting_at').eq('id', tenantId).maybeSingle()
      .then(({ data }) => {
        const info = (data as any)?.signup_status ? (data as unknown as SignupInfo) : null;
        cache.set(tenantId, { v: info, at: Date.now() });
        setV(info);
      });
  }, [tenantId]);
  return v;
}

/** Banner até a reunião de onboarding ser marcada. */
export function OnboardingBanner({ status }: { status: SignupInfo | null }) {
  if (!status || status.signup_status !== 'pago' || status.onboarding_meeting_at || !status.signup_token) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
      <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" />Agende sua reunião de onboarding para configurarmos tudo com você.</span>
      <Button asChild size="sm"><a href={`/contratacao/obrigado?t=${status.signup_token}`}>Agendar agora</a></Button>
    </div>
  );
}
