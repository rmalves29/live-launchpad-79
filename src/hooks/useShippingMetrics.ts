import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export function useShippingMetrics() {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile?.tenant_id) return;

    async function load() {
      setLoading(true);
      // Fallback para quando a RPC ainda não existe ou para cálculo local no frontend
      // enquanto o usuário não executa o SQL no painel.
      const { data, error } = await supabase.rpc('admin_global_report', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString()
      });

      if (!error) setMetrics(data);
      setLoading(false);
    }

    load();
  }, [profile?.tenant_id]);

  return { metrics, loading };
}
