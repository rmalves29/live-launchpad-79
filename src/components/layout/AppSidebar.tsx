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
  Bot,
  HeadphonesIcon,
  Settings,
  Tag,
  Plug,
  Building2,
  Trophy,
  PlusCircle,
  Radio,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ChevronDown,
  ShoppingCart,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { TenantSwitcher } from '@/components/TenantSwitcher';
import { supabase } from '@/integrations/supabase/client';
import cartzyLogo from '@/assets/cartzy-logo.png';

type NavItem = { path: string; label: string; icon: any };
type NavGroup = { label: string; items: NavItem[] };

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

  const groups: NavGroup[] = [
    {
      label: 'Principal',
      items: [
        { path: '/pedidos', label: 'Pedidos', icon: ShoppingBag },
        { path: '/pedidos-manual', label: 'Pedido Manual', icon: PlusCircle },
        ...(tenant?.slug ? [{ path: `/t/${tenant.slug}/checkout`, label: 'Checkout', icon: ShoppingCart }] : []),
        ...(enableLive ? [{ path: '/live', label: 'Live', icon: Radio }] : []),
        { path: '/sorteio', label: 'Sorteio', icon: Trophy },
      ],
    },
    {
      label: 'Gestão',
      items: [
        { path: '/produtos', label: 'Produtos', icon: Package },
        { path: '/clientes', label: 'Clientes', icon: Users },
        { path: '/relatorios', label: 'Relatórios', icon: BarChart3 },
      ],
    },
    {
      label: 'Comunicação',
      items: [
        ...(enableSendflow ? [{ path: '/sendflow', label: 'SendFlow', icon: Send }] : []),
        { path: '/fluxo-envio', label: 'Fluxo de Envio', icon: GitBranch },
        { path: '/whatsapp/zapi', label: 'WhatsApp Z-API', icon: MessageSquare },
        { path: '/whatsapp/templates', label: 'Templates', icon: MessageSquare },
        { path: '/whatsapp/cobranca', label: 'Cobrança', icon: MessageSquare },
      ],
    },
    {
      label: 'Sistema',
      items: [
        { path: '/integracoes', label: 'Integrações', icon: Plug },
        { path: '/etiquetas', label: 'Etiquetas', icon: Tag },
        { path: '/config', label: 'Configurações', icon: Settings },
        ...(isSuperAdmin ? [{ path: '/empresas', label: 'Empresas', icon: Building2 }] : []),
      ],
    },
  ];

  const isActive = (path: string) => {
    if (path === '/pedidos') return location.pathname === '/pedidos';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const initials =
    (profile?.full_name || user?.email || '?')
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onNavigate?.();
    navigate('/auth');
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
            {group.items.map((item) => {
              const active = isActive(item.path);
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[14px] transition-colors ${
                    active
                      ? 'bg-[#eef2ff] text-[#4f46e5] font-semibold'
                      : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}

        {isSuperAdmin && (
          <div className="mb-2">
            <div className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider px-3 pt-3 pb-1">
              Super admin
            </div>
            <button
              onClick={() => window.open(SUPABASE_DASHBOARD_URL, '_blank', 'noopener,noreferrer')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[14px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
            >
              <ExternalLink className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate flex-1 text-left">Métricas Supabase</span>
            </button>
            <button
              onClick={() => window.open(LOVABLE_CLOUD_URL, '_blank', 'noopener,noreferrer')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[14px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
            >
              <ExternalLink className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate flex-1 text-left">Cloud Lovable</span>
            </button>
            <NavLink
              to="/debug"
              onClick={onNavigate}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[14px] ${
                isActive('/debug')
                  ? 'bg-[#eef2ff] text-[#4f46e5] font-semibold'
                  : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]'
              }`}
            >
              <Settings className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate">Debug</span>
            </NavLink>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[#f3f4f6]">
        {user ? (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        ) : (
          <NavLink
            to="/auth"
            onClick={onNavigate}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] bg-[#4f46e5] text-white font-semibold hover:bg-[#4338ca]"
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
        style={{ width: 220, flexShrink: 0 }}
        className="hidden lg:block border-r border-[#e5e7eb] h-screen sticky top-0"
      >
        <SidebarContent />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-[#e5e7eb] flex items-center justify-between px-3 h-12">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[260px]">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <img src={cartzyLogo} alt="Cartzy" className="h-[2.625rem] w-auto object-contain" />
        <div className="w-9" />
      </div>
    </>
  );
}

export default AppSidebar;
