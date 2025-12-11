import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutos em milissegundos

export const useSessionTimeout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialCheckDone = useRef(false);

  const handleSessionExpired = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('lastActivity');
    toast({
      title: "Sessão expirada",
      description: "Você foi desconectado por inatividade.",
      variant: "destructive"
    });
    navigate('/', { replace: true });
  }, [navigate, toast]);

  const resetTimeout = useCallback(() => {
    localStorage.setItem('lastActivity', Date.now().toString());
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(handleSessionExpired, TIMEOUT_DURATION);
  }, [handleSessionExpired]);

  useEffect(() => {
    // Verificar sessão existente apenas uma vez ao montar
    if (!initialCheckDone.current) {
      initialCheckDone.current = true;
      const lastActivity = localStorage.getItem('lastActivity');
      if (lastActivity) {
        const timeSinceLastActivity = Date.now() - parseInt(lastActivity);
        if (timeSinceLastActivity > TIMEOUT_DURATION) {
          // Sessão já expirou - mas não navegar automaticamente aqui
          // Deixar o sistema de auth lidar com isso
          supabase.auth.signOut();
          localStorage.removeItem('lastActivity');
          return;
        }
      }
      resetTimeout();
    }

    // Eventos que resetam o timeout
    const events = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, resetTimeout, true);
    });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        document.removeEventListener(event, resetTimeout, true);
      });
    };
  }, [resetTimeout]);
};