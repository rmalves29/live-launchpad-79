import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Redireciona para o painel principal
    navigate('/relatorios');
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Redirecionando...
        </h1>
        <p className="text-muted-foreground">veja o erro nos sql q vc me mandou</p>
      </div>
    </div>
  );
}
