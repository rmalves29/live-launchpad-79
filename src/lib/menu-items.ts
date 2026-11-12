// Catálogo dos itens do menu que o super admin liga/desliga por empresa (Configurações > Empresas > Editar).
// Três itens continuam usando as colunas antigas da empresa (enable_live, enable_loja_live, enable_sendflow),
// porque elas também controlam outras coisas (ex.: link público da vitrine). O resto fica em tenants.menu_flags.
// Item que não aparece em menu_flags usa o padrão: ligado, exceto os de DEFAULT_OFF.

export type MenuKey =
  | 'pedidos'
  | 'checkout'
  | 'sorteio'
  | 'loja_live'
  | 'live_instagram'
  | 'live_tiktok'
  | 'tiktok_automacao'
  | 'pedido_manual'
  | 'sendflow'
  | 'fluxo_envio'
  | 'produtos'
  | 'clientes'
  | 'fila_espera'
  | 'relatorios'
  | 'push'
  | 'tutoriais'
  | 'whatsapp'
  | 'integracoes'
  | 'etiquetas'
  | 'configuracoes';

type ColumnFlag = 'enable_live' | 'enable_loja_live' | 'enable_sendflow';

export interface MenuItemDef {
  key: MenuKey;
  label: string;
  group: string;
  path: string;
  column?: ColumnFlag;
}

export const MENU_ITEMS: MenuItemDef[] = [
  { key: 'pedidos', label: 'Pedidos', group: 'Principal', path: '/pedidos' },
  { key: 'checkout', label: 'Checkout', group: 'Principal', path: '/checkout' },
  { key: 'sorteio', label: 'Sorteio', group: 'Principal', path: '/sorteio' },
  { key: 'loja_live', label: 'Loja da Live (e link público da vitrine)', group: 'Live', path: '/loja-da-live', column: 'enable_loja_live' },
  { key: 'live_instagram', label: 'Lançar pedidos Instagram', group: 'Live', path: '/live', column: 'enable_live' },
  { key: 'live_tiktok', label: 'Lançar pedidos TikTok', group: 'Live', path: '/live-tiktok' },
  { key: 'tiktok_automacao', label: 'Automação de live TikTok', group: 'Live', path: '/tiktok-automacao' },
  { key: 'pedido_manual', label: 'Pedido Manual', group: 'Live', path: '/pedidos-manual' },
  { key: 'sendflow', label: 'SendFlow', group: 'Grupo VIP', path: '/sendflow', column: 'enable_sendflow' },
  { key: 'fluxo_envio', label: 'Fluxo de Envio', group: 'Grupo VIP', path: '/fluxo-envio/painel' },
  { key: 'produtos', label: 'Produtos', group: 'Gestão', path: '/produtos' },
  { key: 'clientes', label: 'Clientes', group: 'Gestão', path: '/clientes' },
  { key: 'fila_espera', label: 'Fila de Espera', group: 'Gestão', path: '/fila-espera' },
  { key: 'relatorios', label: 'Relatórios', group: 'Gestão', path: '/relatorios' },
  { key: 'push', label: 'Push', group: 'Comunicação', path: '/comunicacao/push' },
  { key: 'tutoriais', label: 'Tutoriais', group: 'Comunicação', path: '/ajuda' },
  { key: 'whatsapp', label: 'WhatsApp (conexão, templates, cobrança, envios)', group: 'Comunicação', path: '/whatsapp/zapi' },
  { key: 'integracoes', label: 'Integrações', group: 'Sistema', path: '/integracoes' },
  { key: 'etiquetas', label: 'Etiquetas', group: 'Sistema', path: '/etiquetas' },
  { key: 'configuracoes', label: 'Configurações', group: 'Sistema', path: '/config' },
];

export const MENU_GROUPS = ['Principal', 'Live', 'Grupo VIP', 'Gestão', 'Comunicação', 'Sistema'];

// Desligados por padrão (empresa nova ou que nunca teve o item configurado).
export const DEFAULT_OFF_MENUS: MenuKey[] = ['live_tiktok', 'tiktok_automacao'];

export type MenuFlags = Partial<Record<MenuKey, boolean>>;

export interface TenantMenuSource {
  enable_live?: boolean | null;
  enable_loja_live?: boolean | null;
  enable_sendflow?: boolean | null;
  menu_flags?: MenuFlags | Record<string, boolean> | null;
}

export function isMenuEnabled(tenant: TenantMenuSource | null | undefined, key: MenuKey): boolean {
  if (!tenant) return !DEFAULT_OFF_MENUS.includes(key);
  const def = MENU_ITEMS.find((m) => m.key === key);
  if (def?.column) return tenant[def.column] ?? true;
  const v = (tenant.menu_flags as Record<string, boolean> | null | undefined)?.[key];
  return typeof v === 'boolean' ? v : !DEFAULT_OFF_MENUS.includes(key);
}

/** Primeiro item ligado (para onde mandar quem abre uma página desligada). */
export function firstEnabledPath(tenant: TenantMenuSource | null | undefined, except?: MenuKey): string | null {
  const item = MENU_ITEMS.find((m) => m.key !== except && m.key !== 'checkout' && isMenuEnabled(tenant, m.key));
  return item ? item.path : null;
}
