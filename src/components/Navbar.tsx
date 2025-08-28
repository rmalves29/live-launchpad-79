import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu } from 'lucide-react';

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isWhatsAppActive = ['/whatsapp', '/whatsapp-templates', '/whatsapp-integration'].includes(location.pathname);

  const navItems = [
    { path: '/pedidos-manual', label: 'Pedidos Manual' },
    { path: '/checkout', label: 'Checkout' },
    { path: '/produtos', label: 'Produtos' },
    { path: '/clientes', label: 'Clientes' },
    { path: '/pedidos', label: 'Pedidos' },
    { path: '/relatorios', label: 'Relatórios' },
    { path: '/whatsapp', label: 'WhatsApp' },
    { path: '/whatsapp-templates', label: 'Templates WPP' },
    { path: '/whatsapp-integration', label: 'Integração WPP' },
    { path: '/sorteio', label: 'Sorteio' },
    { path: '/config', label: 'Configurações' }
  ];

  const whatsappItems = ['/whatsapp', '/whatsapp-templates', '/whatsapp-integration'];
  const filteredNavItems = navItems.filter((item) => !whatsappItems.includes(item.path));

  return (
    <nav className="bg-card border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <NavLink to="/" className="flex items-center">
              <img 
                src="/lovable-uploads/6cab2f0c-61fb-4bf3-a1d4-afffeafcefd9.png" 
                alt="Mania de Mulher" 
                className="h-[120px] w-[120px] object-contain"
              />
            </NavLink>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isWhatsAppActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  WhatsApp
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <NavLink to="/whatsapp">Monitor</NavLink>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <NavLink to="/whatsapp-templates">Templates WPP</NavLink>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <NavLink to="/whatsapp-integration">Integração WPP</NavLink>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px]">
                <div className="flex flex-col space-y-4 mt-8">
                  {filteredNavItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}

                  <div className="pt-2">
                    <div className="px-3 pb-1 text-xs uppercase text-muted-foreground">WhatsApp</div>
                    <div className="flex flex-col space-y-2">
                      <NavLink
                        to="/whatsapp"
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`
                        }
                      >
                        Monitor
                      </NavLink>
                      <NavLink
                        to="/whatsapp-templates"
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`
                        }
                      >
                        Templates WPP
                      </NavLink>
                      <NavLink
                        to="/whatsapp-integration"
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`
                        }
                      >
                        Integração WPP
                      </NavLink>
                    </div>
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