import React from 'react';

const TesteBling = () => {
  React.useEffect(() => {
    // Redirecionar para o arquivo de teste HTML
    window.location.href = '/test-bling.html';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Redirecionando para teste do Bling...</h1>
        <p>Se não redirecionou automaticamente, <a href="/test-bling.html" className="text-blue-500 underline">clique aqui</a></p>
      </div>
    </div>
  );
};

export default TesteBling;