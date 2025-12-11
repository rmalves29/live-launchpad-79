import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu, MessageSquare, ChevronDown, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { TenantSwitcher } from '@/components/TenantSwitcher';

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { user, profile } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const enableLive = tenant?.enable_live ?? true;
  const enableSendflow = tenant?.enable_sendflow ?? true;
  
  const isWhatsappActive = location.pathname.startsWith('/whatsapp');

  // Verificar se é super admin
  const isSuperAdmin = user?.email === 'rmalves21@hotmail.com' || profile?.role === 'super_admin';

  const navItems = [
    { path: '/pedidos-manual', label: 'Pedidos Manual' },
    ...(enableLive ? [{ path: '/live', label: 'Live' }] : []),
    { path: '/checkout', label: 'Checkout' },
    { path: '/produtos', label: 'Produtos' },
    { path: '/clientes', label: 'Clientes' },
    { path: '/pedidos', label: 'Pedidos' },
    ...(enableSendflow ? [{ path: '/sendflow', label: 'SendFlow' }] : []),
    { path: '/relatorios', label: 'Relatórios' },
    { path: '/sorteio', label: 'Sorteio' },
    { path: '/etiquetas', label: 'Etiquetas' },
    { path: '/integracoes', label: 'Integrações' },
    ...(isSuperAdmin ? [
      { path: '/admin/tenants', label: 'Gerenciar Empresas' },
      { path: '/config', label: 'Configurações' }
    ] : [])
  ];

  return (
    <nav className="bg-card border-b shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <NavLink to="/" className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-lg">
                <Zap className="h-6 w-6 text-primary" />
                <span className="text-lg font-bold text-primary">OrderZap</span>
              </div>
            </NavLink>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1 flex-1 justify-center max-w-4xl mx-4">
            <div className="flex flex-wrap items-center justify-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              
              {/* WhatsApp Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant={isWhatsappActive ? "default" : "ghost"} 
                    size="sm"
                    className="flex items-center gap-1 h-7 px-2 text-xs"
                  >
                    <MessageSquare className="h-3 w-3" />
                    WhatsApp
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-popover">
                  <DropdownMenuItem onClick={() => navigate('/whatsapp/zapi')}>
                    Z-API (Recomendado)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/whatsapp/conexao')}>
                    Baileys (Self-hosted)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/whatsapp/templates')}>
                    Templates
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/whatsapp/cobranca')}>
                    Cobrança em Massa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Right side actions */}
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            <TenantSwitcher />

            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden xl:inline max-w-[120px] truncate">{user.email}</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => supabase.auth.signOut()}>Sair</Button>
              </div>
            ) : (
              <NavLink to="/auth">
                <Button size="sm" className="h-7 text-xs">Entrar</Button>
              </NavLink>
            )}
          </div>

          {/* Mobile Navigation */}
          <div className="lg:hidden flex items-center">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                <div className="flex flex-col space-y-3 mt-6">
                  <TenantSwitcher />
                  
                  {user && (
                    <div className="text-xs text-muted-foreground px-3 truncate">
                      {user.email}
                    </div>
                  )}
                  
                  <div className="border-t pt-3">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          `px-3 py-2 rounded-md text-sm font-medium transition-colors block ${
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                  
                  {/* WhatsApp Section */}
                  <div className="border-t pt-3">
                    <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground">
                      <MessageSquare className="h-4 w-4" />
                      WhatsApp
                    </div>
                    <NavLink
                      to="/whatsapp/zapi"
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `px-6 py-2 rounded-md text-sm font-medium transition-colors block ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`
                      }
                    >
                      Z-API
                    </NavLink>
                    <NavLink
                      to="/whatsapp/conexao"
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `px-6 py-2 rounded-md text-sm font-medium transition-colors block ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`
                      }
                    >
                      Baileys
                    </NavLink>
                    <NavLink
                      to="/whatsapp/templates"
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `px-6 py-2 rounded-md text-sm font-medium transition-colors block ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`
                      }
                    >
                      Templates
                    </NavLink>
                    <NavLink
                      to="/whatsapp/cobranca"
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `px-6 py-2 rounded-md text-sm font-medium transition-colors block ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`
                      }
                    >
                      Cobrança em Massa
                    </NavLink>
                  </div>
                  
                  <div className="border-t pt-3">
                    {user ? (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => { supabase.auth.signOut(); setOpen(false); }}>
                        Sair
                      </Button>
                    ) : (
                      <NavLink to="/auth" onClick={() => setOpen(false)}>
                        <Button size="sm" className="w-full">Entrar</Button>
                      </NavLink>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
