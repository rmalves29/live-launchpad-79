import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutos em milissegundos

export const useSessionTimeout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimeout = () => {
      localStorage.setItem('lastActivity', Date.now().toString());
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        await supabase.auth.signOut();
        localStorage.removeItem('lastActivity');
        toast({
          title: "Sessão expirada",
          description: "Você foi desconectado por inatividade.",
          variant: "destructive"
        });
        navigate('/', { replace: true });
      }, TIMEOUT_DURATION);
    };

    const checkExistingSession = () => {
      const lastActivity = localStorage.getItem('lastActivity');
      if (lastActivity) {
        const timeSinceLastActivity = Date.now() - parseInt(lastActivity);
        if (timeSinceLastActivity > TIMEOUT_DURATION) {
          // Sessão já expirou
          supabase.auth.signOut();
          localStorage.removeItem('lastActivity');
          navigate('/', { replace: true });
          return;
        }
      }
      resetTimeout();
    };

    // Verificar sessão existente ao montar
    checkExistingSession();

    // Eventos que resetam o timeout
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, resetTimeout, true);
    });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      events.forEach(event => {
        document.removeEventListener(event, resetTimeout, true);
      });
    };
  }, [navigate, toast]);
};