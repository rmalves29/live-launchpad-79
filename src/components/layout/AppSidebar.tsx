import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Package,
  Users,
  BarChart3,
  Send,
  GitBranch,
  MessageSquare,
  Settings,
  Tag,
  Plug,
  Building2,
  Trophy,
  PlusCircle,
  Radio,
  LogOut,
  Menu,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Shield,
  Bug,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import cartzyLogo from '@/assets/cartzy-logo.png';

type NavItem = { path: string; label: string; icon?: any; external?: string };
type NavEntry =
  | { type: 'item'; item: NavItem }
  | { type: 'collapsible'; key: string; label: string; icon: any; items: NavItem[] };
type NavGroup = { label: string; entries: NavEntry[] };

const SUPABASE_DASHBOARD_URL = 'https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/reports/database';
const LOVABLE_CLOUD_URL = 'https://lovable.dev/projects/154035f9-093b-4aed-ac82-a01434f3c19b';

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();

  const enableLive = tenant?.enable_live ?? true;
  const enableSendflow = tenant?.enable_sendflow ?? true;
  const isSuperAdmin = profile?.role === 'super_admin';
  const isRafael = user?.email === 'rafael@maniadmulher.com';

  const isActive = (path: string) => {
    if (path === '/pedidos') return location.pathname === '/pedidos';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const groups: NavGroup[] = [
    {
      label: 'Principal',
      entries: [
        { type: 'item', item: { path: '/pedidos', label: 'Pedidos', icon: ShoppingBag } },
        { type: 'item', item: { path: '/pedidos-manual', label: 'Pedido Manual', icon: PlusCircle } },
        ...(tenant?.slug
          ? [{ type: 'item' as const, item: { path: `/t/${tenant.slug}/checkout`, label: 'Checkout', icon: ShoppingCart } }]
          : []),
        ...(enableLive ? [{ type: 'item' as const, item: { path: '/live', label: 'Live', icon: Radio } }] : []),
        { type: 'item', item: { path: '/sorteio', label: 'Sorteio', icon: Trophy } },
      ],
    },
    {
      label: 'Gestão',
      entries: [
        { type: 'item', item: { path: '/produtos', label: 'Produtos', icon: Package } },
        { type: 'item', item: { path: '/clientes', label: 'Clientes', icon: Users } },
        { type: 'item', item: { path: '/relatorios', label: 'Relatórios', icon: BarChart3 } },
      ],
    },
    {
      label: 'Comunicação',
      entries: [
        ...(enableSendflow
          ? [{ type: 'item' as const, item: { path: '/sendflow', label: 'SendFlow', icon: Send } }]
          : []),
        { type: 'item', item: { path: '/fluxo-envio', label: 'Fluxo de Envio', icon: GitBranch } },
        {
          type: 'collapsible',
          key: 'whatsapp',
          label: 'WhatsApp',
          icon: MessageSquare,
          items: [
            { path: '/whatsapp/zapi', label: 'Conexão Z-API' },
            { path: '/whatsapp/oficial', label: 'API Oficial (Meta)' },
            { path: '/whatsapp/templates', label: 'Templates' },
            { path: '/whatsapp/cobranca', label: 'Cobrança em Massa' },
            { path: '/whatsapp/envios-ativos', label: 'Envios Ativos' },
          ],
        },
      ],
    },
    {
      label: 'Sistema',
      entries: [
        { type: 'item', item: { path: '/integracoes', label: 'Integrações', icon: Plug } },
        { type: 'item', item: { path: '/etiquetas', label: 'Etiquetas', icon: Tag } },
        { type: 'item', item: { path: '/config', label: 'Configurações', icon: Settings } },
        ...(isSuperAdmin
          ? [{ type: 'item' as const, item: { path: '/empresas', label: 'Empresas', icon: Building2 } }]
          : []),
      ],
    },
  ];

  // Open state for collapsible groups - default open if any child active
  const initialOpen: Record<string, boolean> = {};
  groups.forEach((g) =>
    g.entries.forEach((e) => {
      if (e.type === 'collapsible') {
        initialOpen[e.key] = e.items.some((i) => isActive(i.path));
      }
    }),
  );
  initialOpen['super_admin'] = ['/debug'].some((p) => isActive(p));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);
  const toggle = (k: string) => setOpenGroups((s) => ({ ...s, [k]: !s[k] }));

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onNavigate?.();
    navigate('/auth');
  };

  const renderItem = (item: NavItem, indent = false) => {
    const active = isActive(item.path);
    const Icon = item.icon;
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onNavigate}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[14px] transition-colors ${
          indent ? 'pl-10' : ''
        } ${
          active
            ? 'bg-[#eef2ff] text-[#4f46e5] font-semibold'
            : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]'
        }`}
      >
        {Icon && <Icon className="w-[18px] h-[18px] shrink-0" />}
        <span className="truncate">{item.label}</span>
      </NavLink>
    );
  };

  const renderCollapsible = (
    key: string,
    label: string,
    Icon: any,
    children: React.ReactNode,
  ) => {
    const open = !!openGroups[key];
    return (
      <div key={key}>
        <button
          onClick={() => toggle(key)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[14px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] transition-colors"
        >
          <Icon className="w-[18px] h-[18px] shrink-0" />
          <span className="truncate flex-1 text-left">{label}</span>
          {open ? (
            <ChevronDown className="w-4 h-4 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" />
          )}
        </button>
        {open && <div className="mt-1 space-y-0.5">{children}</div>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Brand */}
      <div className="p-4 border-b border-[#f3f4f6]">
        <NavLink to="/" onClick={onNavigate} className="flex items-center justify-center">
          <img src={cartzyLogo} alt="Cartzy" className="h-[4.3rem] w-auto object-contain" />
        </NavLink>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-y-auto scrollbar-thin">
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <div className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider px-3 pt-3 pb-1">
              {group.label}
            </div>
            {group.entries.map((entry) => {
              if (entry.type === 'item') return renderItem(entry.item);
              return renderCollapsible(
                entry.key,
                entry.label,
                entry.icon,
                entry.items.map((i) => renderItem(i, true)),
              );
            })}
          </div>
        ))}

        {isSuperAdmin && (
          <div className="mb-2">
            <div className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider px-3 pt-3 pb-1">
              Super admin
            </div>
            {renderCollapsible(
              'super_admin',
              'Ferramentas Admin',
              Shield,
              <>
                <button
                  onClick={() => window.open(SUPABASE_DASHBOARD_URL, '_blank', 'noopener,noreferrer')}
                  className="w-full flex items-center gap-2 px-3 py-2 pl-10 rounded-lg text-[14px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
                >
                  <ExternalLink className="w-[18px] h-[18px] shrink-0" />
                  <span className="truncate flex-1 text-left">Métricas Supabase</span>
                </button>
                <button
                  onClick={() => window.open(LOVABLE_CLOUD_URL, '_blank', 'noopener,noreferrer')}
                  className="w-full flex items-center gap-2 px-3 py-2 pl-10 rounded-lg text-[14px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
                >
                  <ExternalLink className="w-[18px] h-[18px] shrink-0" />
                  <span className="truncate flex-1 text-left">Cloud Lovable</span>
                </button>
                {renderItem({ path: '/debug', label: 'Debug', icon: Settings }, true)}
                {isRafael && renderItem({ path: '/admin/erros', label: 'Monitor de Erros', icon: Bug }, true)}
              </>,
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[#f3f4f6]">
        {user ? (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[14px] text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Sair
          </button>
        ) : (
          <NavLink
            to="/auth"
            onClick={onNavigate}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[14px] bg-[#4f46e5] text-white font-semibold hover:bg-[#4338ca]"
          >
            Entrar
          </NavLink>
        )}
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        style={{ width: 240, flexShrink: 0 }}
        className="hidden lg:block border-r border-[#e5e7eb] h-screen sticky top-0"
      >
        <SidebarContent />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-[#e5e7eb] flex items-center justify-between px-3 h-14">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[280px]">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <img src={cartzyLogo} alt="Cartzy" className="h-[3.4rem] w-auto object-contain" />
        <div className="w-9" />
      </div>
    </>
  );
}

export default AppSidebar;
