import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { isSendingActive } from '@/hooks/useSendingActivity';

const TIMEOUT_DURATION = 60 * 60 * 1000; // 1 hora

export const useSessionTimeout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialized = useRef(false);

  const handleSessionExpired = useCallback(async () => {
    // NÃO deslogar se houver envio ativo
    if (isSendingActive()) {
      console.log('⏸️ Sessão timeout ignorado - envio ativo em andamento');
      // Reagendar o timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(handleSessionExpired, TIMEOUT_DURATION);
      return;
    }

    await supabase.auth.signOut();
    localStorage.removeItem('lastActivity');
    toast({
      title: "Sessão expirada",
      description: "Você foi desconectado por inatividade.",
      variant: "destructive"
    });
    navigate('/auth', { replace: true });
  }, [navigate, toast]);

  const resetTimeout = useCallback(() => {
    localStorage.setItem('lastActivity', Date.now().toString());
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(handleSessionExpired, TIMEOUT_DURATION);
  }, [handleSessionExpired]);

  useEffect(() => {
    // Só inicializa uma vez
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Verificar se sessão expirou (só na inicialização)
    const lastActivity = localStorage.getItem('lastActivity');
    if (lastActivity) {
      const timeSinceLastActivity = Date.now() - parseInt(lastActivity);
      if (timeSinceLastActivity > TIMEOUT_DURATION) {
        // Sessão expirou silenciosamente
        supabase.auth.signOut();
        localStorage.removeItem('lastActivity');
        return;
      }
    }
    
    // Iniciar timeout
    resetTimeout();

    // Eventos que resetam o timeout - apenas interações diretas
    const events = ['mousedown', 'keypress', 'touchstart'];
    
    const handleActivity = () => {
      resetTimeout();
    };
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimeout]);
};
