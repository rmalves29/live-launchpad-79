import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function CampaignRedirect() {
  const { tenantSlug, campaignSlug } = useParams();

  useEffect(() => {
    if (!campaignSlug || !tenantSlug) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || `https://hxtbsieodbtzgcvvkeqx.supabase.co`;
    const redirectUrl = `${supabaseUrl}/functions/v1/fe-campaign-redirect?slug=${encodeURIComponent(campaignSlug)}&tenant=${encodeURIComponent(tenantSlug)}`;
    window.location.replace(redirectUrl);
  }, [tenantSlug, campaignSlug]);

  // Render nothing — the browser follows the redirect to the group instantly.
  return null;
}
