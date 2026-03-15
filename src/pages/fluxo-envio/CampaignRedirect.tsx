import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function CampaignRedirect() {
  const { tenantSlug, campaignSlug } = useParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignSlug || !tenantSlug) {
      setError('Link inválido');
      setLoading(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://hxtbsieodbtzgcvvkeqx.supabase.co`;
    const redirectUrl = `${supabaseUrl}/functions/v1/fe-campaign-redirect?slug=${encodeURIComponent(campaignSlug)}&tenant=${encodeURIComponent(tenantSlug)}`;
    
    window.location.href = redirectUrl;

    const timer = setTimeout(() => {
      setError('Tempo esgotado. Tente novamente.');
      setLoading(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [tenantSlug, campaignSlug]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-2">😔 {error}</h1>
          <p className="text-muted-foreground">Não foi possível processar este link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Redirecionando para o grupo...</p>
      </div>
    </div>
  );
}
