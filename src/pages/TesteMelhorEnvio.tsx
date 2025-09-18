import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const TesteMelhorEnvio = () => {
  const [environment, setEnvironment] = useState('production');
  
  const tenantIds = {
    production: '08f2b1b9-3988-489e-8186-c60f0c0b0622',
    sandbox: '3c92bf57-a114-4690-b4cf-642078fc9df9'
  };

  const startOAuthFlow = () => {
    const clientId = '19768';
    const redirectUri = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa?service=melhorenvio&action=oauth';
    const state = tenantIds[environment as keyof typeof tenantIds];
    
    const baseUrl = environment === 'production' 
      ? 'https://melhorenvio.com.br'
      : 'https://sandbox.melhorenvio.com.br';
    
    const oauthUrl = `${baseUrl}/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    
    console.log('Starting OAuth flow:', { environment, oauthUrl, state });
    window.location.href = oauthUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Teste Melhor Envio OAuth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Ambiente:</label>
            <select 
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="w-full p-2 border rounded-md"
            >
              <option value="production">Produção</option>
              <option value="sandbox">Sandbox</option>
            </select>
          </div>
          
          <div className="text-sm text-gray-600">
            <p><strong>Client ID:</strong> 19768</p>
            <p><strong>Tenant ID:</strong> {tenantIds[environment as keyof typeof tenantIds]}</p>
            <p><strong>Environment:</strong> {environment}</p>
          </div>
          
          <Button 
            onClick={startOAuthFlow}
            className="w-full"
            variant={environment === 'production' ? 'default' : 'secondary'}
          >
            Iniciar OAuth {environment === 'production' ? '(PRODUÇÃO)' : '(Sandbox)'}
          </Button>
          
          <div className="text-xs text-gray-500">
            <p>Redirect URI: https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TesteMelhorEnvio;