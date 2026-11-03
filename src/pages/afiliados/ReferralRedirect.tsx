import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { rememberRef } from '@/lib/affiliate-ref';

export default function ReferralRedirect() {
  const { codigo = '' } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    (async () => {
      let ref: string | null = null;
      try {
        const { data } = await supabase.functions.invoke('platform-affiliates', {
          body: {
            action: 'click', codigo, landing_path: window.location.pathname,
            utm_source: qs.get('utm_source'), utm_medium: qs.get('utm_medium'), utm_campaign: qs.get('utm_campaign'),
            referrer: document.referrer || null,
          },
        });
        if (data?.valid) ref = rememberRef(data.codigo);
      } catch { /* segue sem ref */ }
      navigate(ref ? `/indicacao?ref=${encodeURIComponent(ref)}` : '/indicacao', { replace: true });
    })();
  }, [codigo, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
