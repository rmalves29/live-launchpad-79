import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/pedidos-manual': 'Manual',
  '/live': 'Live',
  '/checkout': 'Checkout',
  '/pedidos/checkout': 'Checkout',
  '/produtos': 'Produtos',
  '/clientes': 'Clientes',
  '/pedidos': 'Pedidos',
  '/sendflow': 'SendFlow',
  '/relatorios': 'Relatórios',
  '/sorteio': 'Sorteio',
  '/etiquetas': 'Etiquetas',
  '/integracoes': 'Integrações',
  '/admin/tenants': 'Empresas',
  '/config': 'Config',
  '/whatsapp/templates': 'Templates',
  '/whatsapp/cobranca': 'Cobrança',
  '/whatsapp/zapi': 'Conexão Z-API',
  '/whatsapp/conexao': 'Conexão WhatsApp',
  '/auth': 'Entrar',
  '/debug': 'Debug',
};

export const usePageTitle = (customTitle?: string) => {
  const location = useLocation();

  useEffect(() => {
    const baseTitle = 'OrderZap';
    
    if (customTitle) {
      document.title = `${baseTitle} - ${customTitle}`;
      return;
    }

    const pageTitle = pageTitles[location.pathname];
    
    if (pageTitle) {
      document.title = `${baseTitle} - ${pageTitle}`;
    } else {
      // Check for dynamic routes
      if (location.pathname.startsWith('/t/')) {
        document.title = `${baseTitle} - Checkout`;
      } else {
        document.title = `${baseTitle} - Gestão de Pedidos`;
      }
    }
  }, [location.pathname, customTitle]);
};
