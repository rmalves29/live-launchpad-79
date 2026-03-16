import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

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
    }, 15000);

    return () => clearTimeout(timer);
  }, [tenantSlug, campaignSlug]);

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😔</div>
          <h1 style={{ color: '#f87171', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {error}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            Não foi possível processar este link.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.5rem',
              padding: '0.75rem 2rem',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        {/* WhatsApp icon */}
        <div style={{ marginBottom: '1.5rem' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto' }}>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/>
            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.96 7.96 0 01-4.107-1.138l-.293-.176-2.867.852.852-2.867-.176-.293A7.96 7.96 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" fill="#25D366"/>
          </svg>
        </div>

        {/* Spinner */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: '#25D366',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto',
          }} />
        </div>

        <h1 style={{
          color: '#f1f5f9',
          fontSize: '1.25rem',
          fontWeight: 600,
          marginBottom: '0.5rem',
        }}>
          Entrando no grupo...
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          Você será redirecionado em instantes
        </p>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
