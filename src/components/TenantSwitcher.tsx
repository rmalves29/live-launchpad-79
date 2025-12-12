import { useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabaseTenant } from '@/lib/supabase-tenant';

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

const PREVIEW_TENANT_KEY = 'previewTenantId';

export const TenantSwitcher = () => {
  const { isMainSite } = useTenantContext();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);

  // Esconde quando não é super admin (isMainSite só é true para super admin)
  if (!isMainSite) return null;

  useEffect(() => {
    const current = localStorage.getItem(PREVIEW_TENANT_KEY) || undefined;
    setSelected(current);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .rpc('list_active_tenants_basic');
        if (error) throw error;
        setTenants(data || []);
        
        // Verificar se o tenant selecionado ainda é válido
        const current = localStorage.getItem(PREVIEW_TENANT_KEY);
        if (current && data) {
          const exists = data.find((t: Tenant) => t.id === current);
          if (!exists) {
            console.warn('⚠️ Tenant selecionado não encontrado, limpando localStorage');
            localStorage.removeItem(PREVIEW_TENANT_KEY);
            setSelected(undefined);
          }
        }
        
        // Se não há tenant selecionado mas existe "MANIA DE MULHER", selecionar automaticamente
        if (!current && data) {
          const maniaDeMulher = data.find((t: Tenant) => t.name === 'MANIA DE MULHER');
          if (maniaDeMulher) {
            console.log('✅ Auto-selecionando tenant MANIA DE MULHER:', maniaDeMulher.id);
            localStorage.setItem(PREVIEW_TENANT_KEY, maniaDeMulher.id);
            setSelected(maniaDeMulher.id);
            supabaseTenant.setTenantId(maniaDeMulher.id);
          }
        }
      } catch (e) {
        console.error('Erro ao listar empresas:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const currentLabel = useMemo(() => {
    if (!selected) return 'Selecionar empresa';
    const t = tenants.find(t => t.id === selected);
    return t ? t.name : 'Selecionar empresa';
  }, [selected, tenants]);

  const handleChange = (value: string) => {
    setSelected(value);
    if (value) {
      localStorage.setItem(PREVIEW_TENANT_KEY, value);
      supabaseTenant.setTenantId(value);
      // Recarrega para que listas/carregamentos reflitam o tenant escolhido
      window.location.reload();
    } else {
      localStorage.removeItem(PREVIEW_TENANT_KEY);
      supabaseTenant.setTenantId(null);
      window.location.reload();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="hidden lg:flex items-center gap-1">
        <Building2 className="h-3 w-3" />
        Preview
      </Badge>
      <Select value={selected} onValueChange={handleChange} disabled={loading || tenants.length === 0}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder={currentLabel} />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default TenantSwitcher;
