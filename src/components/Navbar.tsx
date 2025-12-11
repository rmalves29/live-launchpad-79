import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu, MessageSquare, ChevronDown, Zap, LogOut, User } from 'lucide-react';
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

  const isSuperAdmin = user?.email === 'rmalves21@hotmail.com' || profile?.role === 'super_admin';

  const navItems = [
    { path: '/pedidos-manual', label: 'Manual' },
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
      { path: '/admin/tenants', label: 'Empresas' },
      { path: '/config', label: 'Config' }
    ] : [])
  ];

  return (
    <header className="sticky top-0 z-50">
      {/* Logo Section */}
      <div className="bg-card/90 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <NavLink to="/" className="flex items-center gap-3 group">
              <div className="flex items-center gap-3 bg-gradient-to-r from-primary/10 to-accent/10 px-4 py-2 rounded-2xl border border-primary/20 group-hover:border-primary/40 transition-all duration-300 group-hover:shadow-glow-sm">
                <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-xl shadow-lg">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-display font-bold text-gradient-primary">OrderZap</span>
                  <span className="text-[10px] text-muted-foreground -mt-1">Gestão Inteligente</span>
                </div>
              </div>
            </NavLink>

            {/* Right side - User & Tenant */}
            <div className="flex items-center gap-3">
              <TenantSwitcher />
              
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="flex items-center gap-2 h-10 px-3 rounded-xl border border-border/30 hover:border-primary/30 hover:bg-primary/5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-xs text-muted-foreground max-w-[120px] truncate hidden sm:inline">{user.email}</span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-popover/95 backdrop-blur-xl border-border/50">
                    <DropdownMenuItem onClick={() => supabase.auth.signOut()} className="cursor-pointer text-destructive">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <NavLink to="/auth">
                  <Button size="sm" className="h-10 px-5 rounded-xl btn-gradient-primary">
                    Entrar
                  </Button>
                </NavLink>
              )}

              {/* Mobile Menu */}
              <div className="lg:hidden">
                <Sheet open={open} onOpenChange={setOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm" className="rounded-xl h-10 w-10 p-0">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[300px] bg-card/95 backdrop-blur-xl border-border/50">
                    <div className="flex flex-col space-y-4 mt-6">
                      {user && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/30">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                            <User className="h-4 w-4 text-white" />
                          </div>
                          <span className="text-sm text-muted-foreground truncate flex-1">{user.email}</span>
                        </div>
                      )}
                      
                      <div className="space-y-1">
                        {navItems.map((item) => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setOpen(false)}
                            className={({ isActive }) =>
                              `px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 block ${
                                isActive
                                  ? 'bg-primary text-primary-foreground shadow-glow-sm'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                              }`
                            }
                          >
                            {item.label}
                          </NavLink>
                        ))}
                      </div>
                      
                      {/* WhatsApp Section Mobile */}
                      <div className="border-t border-border/30 pt-4">
                        <div className="flex items-center gap-2 px-4 py-2 text-sm font-display font-semibold text-foreground">
                          <MessageSquare className="h-4 w-4 text-primary" />
                          WhatsApp
                        </div>
                        {[
                          { path: '/whatsapp/zapi', label: 'Z-API' },
                          { path: '/whatsapp/templates', label: 'Templates' },
                          { path: '/whatsapp/cobranca', label: 'Cobrança' },
                        ].map((item) => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setOpen(false)}
                            className={({ isActive }) =>
                              `px-8 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 block ${
                                isActive
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                              }`
                            }
                          >
                            {item.label}
                          </NavLink>
                        ))}
                      </div>
                      
                      <div className="border-t border-border/30 pt-4">
                        {user ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10" 
                            onClick={() => { supabase.auth.signOut(); setOpen(false); }}
                          >
                            <LogOut className="h-4 w-4 mr-2" />
                            Sair
                          </Button>
                        ) : (
                          <NavLink to="/auth" onClick={() => setOpen(false)}>
                            <Button size="sm" className="w-full rounded-xl btn-gradient-primary">Entrar</Button>
                          </NavLink>
                        )}
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <nav className="bg-card/80 backdrop-blur-xl border-b border-border/50 shadow-sm hidden lg:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-12">
            <div className="flex items-center gap-0.5 bg-muted/50 backdrop-blur-sm rounded-xl p-1 border border-border/30">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-glow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
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
                    className={`flex items-center gap-1 h-7 px-3 text-xs rounded-lg ${
                      isWhatsappActive ? 'shadow-glow-sm' : ''
                    }`}
                  >
                    <MessageSquare className="h-3 w-3" />
                    WhatsApp
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-52 bg-popover/95 backdrop-blur-xl border-border/50">
                  <DropdownMenuItem onClick={() => navigate('/whatsapp/zapi')} className="cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-success rounded-full"></div>
                      Z-API (Recomendado)
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/whatsapp/templates')} className="cursor-pointer">
                    Templates
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/whatsapp/cobranca')} className="cursor-pointer">
                    Cobrança em Massa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;