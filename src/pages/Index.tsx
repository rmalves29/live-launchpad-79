import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

const Index = () => {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border p-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">MM Live Commerce</h1>
          <Button variant="outline" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </header>
      <main className="flex items-center justify-center min-h-[calc(100vh-80px)]">
        <div className="text-center">
          <h2 className="text-4xl font-bold mb-4">Sistema de Vendas</h2>
          <p className="text-xl text-muted-foreground">Sistema operacional para lançamento de pedidos</p>
        </div>
      </main>
    </div>
  );
};

export default Index;
