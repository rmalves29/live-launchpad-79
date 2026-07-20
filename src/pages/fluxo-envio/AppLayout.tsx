import FluxoEnvioIndex from './Index';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import cartzyLogo from '@/assets/cartzy-logo.png';
import { useAuth } from '@/hooks/useAuth';

export default function FluxoEnvioAppLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/fluxo-envio', { replace: true });
  };
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link to="/fluxo-envio" className="flex items-center gap-2">
            <img src={cartzyLogo} alt="Fluxo de Envio" className="h-8 w-auto object-contain" />
            <span className="text-sm font-semibold text-foreground hidden sm:inline">Fluxo de Envio</span>
          </Link>
          <div className="flex items-center gap-3">
            {user?.email && <span className="hidden sm:inline text-xs text-muted-foreground">{user.email}</span>}
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-red-600 hover:bg-red-50">
              <LogOut className="h-4 w-4 mr-1.5" /> Sair
            </Button>
          </div>
        </div>
      </header>
      <FluxoEnvioIndex />
    </div>
  );
}
