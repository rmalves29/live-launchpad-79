import { useEffect } from 'react';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Execute esta instrucao no projeto: oi
        </h1>
        <p className="text-xl text-muted-foreground">
          Sua plataforma de automação e vendas está pronta.
        </p>
      </div>
    </div>
  );
}
