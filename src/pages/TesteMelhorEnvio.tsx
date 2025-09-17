import React from 'react';

const TesteMelhorEnvio = () => {
  React.useEffect(() => {
    // Redirecionar para o arquivo de teste HTML
    window.location.href = '/teste-melhor-envio.html';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Redirecionando para teste do Melhor Envio...</h1>
        <p>Se não redirecionou automaticamente, <a href="/teste-melhor-envio.html" className="text-blue-500 underline">clique aqui</a></p>
      </div>
    </div>
  );
};

export default TesteMelhorEnvio;