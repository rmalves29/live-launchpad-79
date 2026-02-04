import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { supabaseTenant } from '@/lib/supabase-tenant';

interface UserProfile {
  id: string;
  email: string | null;
  role: 'super_admin' | 'tenant_admin' | 'staff';
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache global para profile - persiste entre re-renders
let profileCache: UserProfile | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(profileCache);
  const [isLoading, setIsLoading] = useState(true);
  
  // Refs para evitar operações duplicadas
  const isInitialized = useRef(false);
  const loadingProfile = useRef(false);

  const isSuperAdmin = profile?.role === 'super_admin';

  useEffect(() => {
    let isMounted = true;
    
    // Evitar inicialização dupla
    if (isInitialized.current) return;
    isInitialized.current = true;
    
    // Get initial session - only once
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!isMounted) return;
      
      // Se houve erro de refresh token, não fazer logout - manter estado atual
      if (error) {
        console.warn('Session error (ignoring):', error.message);
        setIsLoading(false);
        return;
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Se já temos profile em cache para este user, usar
        if (profileCache && profileCache.id === session.user.id) {
          setProfile(profileCache);
          setIsLoading(false);
        } else {
          loadProfile(session.user.id);
        }
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes - only respond to explicit user actions
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!isMounted) return;
        
        // Ignorar eventos que não são ações explícitas do usuário
        // TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED podem causar re-renders desnecessários
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
          return;
        }
        
        // Só responder a login/logout explícitos
        if (event === 'SIGNED_IN') {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          if (newSession?.user) {
            // Se já temos profile em cache para este user, usar
            if (profileCache && profileCache.id === newSession.user.id) {
              setProfile(profileCache);
            } else {
              setTimeout(() => {
                if (isMounted) loadProfile(newSession.user.id);
              }, 0);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          // Limpar tudo ao fazer logout
          localStorage.removeItem('previewTenantId');
          supabaseTenant.setTenantId(null);
          profileCache = null;
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadProfile = async (userId: string) => {
    // Evitar carregamentos simultâneos
    if (loadingProfile.current) return;
    loadingProfile.current = true;
    
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      
      // Atualizar cache global
      profileCache = profileData;
      setProfile(profileData);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      loadingProfile.current = false;
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const signOut = async () => {
    // Limpar localStorage de preview tenant para segurança
    localStorage.removeItem('previewTenantId');
    profileCache = null;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    user,
    session,
    profile,
    isLoading,
    isSuperAdmin,
    signIn,
    signUp,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};