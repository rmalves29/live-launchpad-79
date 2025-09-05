import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  tenant_id: string | null;
  tenant_role: 'master' | 'admin' | 'user';
  email: string | null;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  whatsapp_api_url?: string;
  melhor_envio_from_cep?: string;
  melhor_envio_env?: string;
}

interface TenantContextType {
  currentTenant: Tenant | null;
  userProfile: Profile | null;
  isLoading: boolean;
  isMaster: boolean;
  isAdmin: boolean;
  user: User | null;
  refreshProfile: () => Promise<void>;
}

const defaultContextValue: TenantContextType = {
  currentTenant: null,
  userProfile: null,
  isLoading: true,
  isMaster: false,
  isAdmin: false,
  user: null,
  refreshProfile: async () => {},
};

const TenantContext = createContext<TenantContextType>(defaultContextValue);

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = async () => {
    if (!user) return;

    try {
      // Buscar profile do usuário
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;
      setUserProfile(profileData);

      // Se o usuário tem um tenant, buscar os dados do tenant
      if (profileData.tenant_id) {
        const { data: tenantData, error: tenantError } = await supabase
          .from("tenants")
          .select("*")
          .eq("id", profileData.tenant_id)
          .single();

        if (tenantError) throw tenantError;
        setCurrentTenant(tenantData);
      }
    } catch (error) {
      console.error("Erro ao buscar dados do tenant:", error);
    }
  };

  useEffect(() => {
    // Verificar sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Escutar mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          setUserProfile(null);
          setCurrentTenant(null);
        }
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      refreshProfile();
    }
  }, [user]);

  const isMaster = userProfile?.tenant_role === 'master';
  const isAdmin = userProfile?.tenant_role === 'admin' || isMaster;
  
  // Debug para verificar o status do usuário
  console.log('TenantContext Debug:', {
    user: user?.email,
    userProfile,
    isMaster,
    isAdmin,
    isLoading
  });

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        userProfile,
        isLoading,
        isMaster,
        isAdmin,
        user,
        refreshProfile,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  return useContext(TenantContext);
};