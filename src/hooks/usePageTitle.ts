import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/pedidos-manual': 'Manual',
  '/live': 'Live',
  '/live-tiktok': 'Live TikTok',
  '/tiktok-automacao': 'Automa��o TikTok',
  '/checkout': 'Checkout',
  '/pedidos/checkout': 'Checkout',
  '/produtos': 'Produtos',
  '/clientes': 'Clientes',
  '/pedidos': 'Pedidos',
  '/sendflow': 'SendFlow',
  '/relatorios': 'Relat�rios',
  '/sorteio': 'Sorteio',
  '/etiquetas': 'Etiquetas',
  '/integracoes': 'Integra��es',
  '/admin/tenants': 'Empresas',
  '/config': 'Config',
  '/whatsapp/templates': 'Templates',
  '/whatsapp/cobranca': 'Cobran�a',
  '/whatsapp/zapi': 'Conex�o Z-API',
  '/whatsapp/conexao': 'Conex�o WhatsApp',
  '/auth': 'Entrar',
  '/debug': 'Debug',
};

export const usePageTitle = (customTitle?: string) => {
  const location = useLocation();

  useEffect(() => {
    // This public page owns its title and social preview with the store's brand.
    if (/^\/t\/[^/]+\/cadastro-instagram\/?$/.test(location.pathname)) return;
    const baseTitle = 'Cartzy';
    
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
        document.title = `${baseTitle} - Gest�o de Pedidos`;
      }
    }
  }, [location.pathname, customTitle]);
};
