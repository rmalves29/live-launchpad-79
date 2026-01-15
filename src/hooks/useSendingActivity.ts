import { useRef, useCallback, useEffect } from 'react';

/**
 * Hook para gerenciar atividade de envio ativa.
 * Quando há envio ativo, o sistema de timeout de sessão não deve deslogar o usuário.
 */

// Chave global para marcar que há envio ativo
const SENDING_ACTIVE_KEY = 'sendingActive';
const LAST_SENDING_UPDATE_KEY = 'lastSendingUpdate';

export const useSendingActivity = () => {
  const isActiveRef = useRef(false);

  // Marca que há envio ativo
  const setActive = useCallback(() => {
    isActiveRef.current = true;
    localStorage.setItem(SENDING_ACTIVE_KEY, 'true');
    localStorage.setItem(LAST_SENDING_UPDATE_KEY, Date.now().toString());
  }, []);

  // Marca que não há mais envio ativo
  const setInactive = useCallback(() => {
    isActiveRef.current = false;
    localStorage.removeItem(SENDING_ACTIVE_KEY);
    localStorage.removeItem(LAST_SENDING_UPDATE_KEY);
  }, []);

  // Atualiza o timestamp de atividade (chamado durante o envio para manter sessão viva)
  const updateActivity = useCallback(() => {
    if (isActiveRef.current) {
      localStorage.setItem(LAST_SENDING_UPDATE_KEY, Date.now().toString());
      // Também atualiza o lastActivity para manter a sessão viva
      localStorage.setItem('lastActivity', Date.now().toString());
    }
  }, []);

  // Verifica se há envio ativo
  const isActive = useCallback(() => {
    return localStorage.getItem(SENDING_ACTIVE_KEY) === 'true';
  }, []);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      // Não remove automaticamente - deixa para o componente decidir
    };
  }, []);

  return {
    setActive,
    setInactive,
    updateActivity,
    isActive
  };
};

// Função utilitária para verificar se há envio ativo (para uso fora de componentes)
export const isSendingActive = (): boolean => {
  const active = localStorage.getItem(SENDING_ACTIVE_KEY) === 'true';
  if (active) {
    const lastUpdate = localStorage.getItem(LAST_SENDING_UPDATE_KEY);
    if (lastUpdate) {
      // Se o último update foi há mais de 5 minutos, considera como inativo (crash/fechou aba)
      const timeSinceUpdate = Date.now() - parseInt(lastUpdate);
      if (timeSinceUpdate > 5 * 60 * 1000) {
        localStorage.removeItem(SENDING_ACTIVE_KEY);
        localStorage.removeItem(LAST_SENDING_UPDATE_KEY);
        return false;
      }
    }
    return true;
  }
  return false;
};
