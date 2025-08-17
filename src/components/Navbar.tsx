import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, LogOut } from 'lucide-react';

const Navbar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/pedidos-manual', label: 'Pedidos Manual' },
    { path: '/checkout', label: 'Checkout' },
    { path: '/produtos', label: 'Produtos' },
    { path: '/clientes', label: 'Clientes' },
    { path: '/pedidos', label: 'Pedidos' },
    { path: '/whatsapp', label: 'WhatsApp' },
    { path: '/whatsapp-templates', label: 'Templates WPP' },
    { path: '/sorteio', label: 'Sorteio' },
    { path: '/configuracoes', label: 'Configurações' },
    { path: '/config', label: 'Config' }
  ];

  return (
    <nav className="bg-card border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <NavLink to="/" className="text-xl font-bold text-primary">
              MM Live Commerce
            </NavLink>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {navItems.map((item) => (
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
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
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
                  {navItems.map((item) => (
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
                  <Button variant="outline" onClick={handleLogout} className="mt-4">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair
                  </Button>
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