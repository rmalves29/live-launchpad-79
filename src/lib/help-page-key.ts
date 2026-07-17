// Mapeia pathname -> page_key + rótulo humano para a Central de Tutoriais.

export interface HelpPageMeta {
  key: string;
  label: string;
}

const MAP: Array<{ match: RegExp; key: string; label: string }> = [
  { match: /^\/$/, key: 'dashboard', label: 'Painel Inicial' },
  { match: /^\/pedidos-manual/, key: 'pedidos-manual', label: 'Pedidos Manual' },
  { match: /^\/pedidos/, key: 'pedidos', label: 'Pedidos' },
  { match: /^\/live/, key: 'live', label: 'Live' },
  { match: /^\/sorteio/, key: 'sorteio', label: 'Sorteio' },
  { match: /^\/produtos/, key: 'produtos', label: 'Produtos' },
  { match: /^\/clientes/, key: 'clientes', label: 'Clientes' },
  { match: /^\/relatorios/, key: 'relatorios', label: 'Relatórios' },
  { match: /^\/fila-espera/, key: 'fila-espera', label: 'Fila de Espera' },
  { match: /^\/sendflow/, key: 'sendflow', label: 'SendFlow' },
  { match: /^\/etiquetas/, key: 'etiquetas', label: 'Etiquetas' },
  { match: /^\/fluxo-envio/, key: 'fluxo-envio', label: 'Fluxo de Envio' },
  { match: /^\/comunicacao\/push/, key: 'push', label: 'Notificações Push' },
  { match: /^\/whatsapp\/templates/, key: 'whatsapp-templates', label: 'Templates WhatsApp' },
  { match: /^\/whatsapp\/cobranca/, key: 'whatsapp-cobranca', label: 'Cobrança WhatsApp' },
  { match: /^\/whatsapp\/(conexao|zapi)/, key: 'whatsapp-conexao', label: 'Conexão WhatsApp' },
  { match: /^\/whatsapp\/oficial/, key: 'whatsapp-oficial', label: 'WhatsApp Oficial' },
  { match: /^\/envios-ativos/, key: 'envios-ativos', label: 'Envios Ativos' },
  { match: /^\/integracoes/, key: 'integracoes', label: 'Integrações' },
  { match: /^\/agente-ia/, key: 'agente-ia', label: 'Agente de IA' },
  { match: /^\/suporte-ia/, key: 'suporte-ia', label: 'Suporte IA' },
  { match: /^\/config/, key: 'config', label: 'Configurações' },
  { match: /^\/empresas/, key: 'empresas', label: 'Empresas' },
  { match: /^\/admin\/tutoriais/, key: 'admin-tutoriais', label: 'Central de Tutoriais' },
  { match: /^\/admin\/comunicados/, key: 'admin-comunicados', label: 'Comunicados' },
  { match: /^\/admin\/saude/, key: 'admin-saude', label: 'Saúde do Sistema' },
  { match: /^\/admin\/erros/, key: 'admin-erros', label: 'Erros' },
  { match: /^\/admin/, key: 'admin', label: 'Admin' },
];

export function getHelpPageMeta(pathname: string): HelpPageMeta {
  const hit = MAP.find((m) => m.match.test(pathname));
  if (hit) return { key: hit.key, label: hit.label };
  const seg = pathname.split('/').filter(Boolean)[0] || 'dashboard';
  return { key: seg, label: seg.replace(/-/g, ' ') };
}

export const ALL_HELP_PAGES: HelpPageMeta[] = MAP.map(({ key, label }) => ({ key, label }));

export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
      return u.searchParams.get('v');
    }
  } catch {
    /* ignore */
  }
  return null;
}
