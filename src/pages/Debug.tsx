import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';

const Debug = () => {
  const location = useLocation();
  const { user, profile } = useAuth();
  const { tenant } = useTenant();

  const showNavbar = location.pathname !== '/checkout' && 
                     location.pathname !== '/mp/callback' && 
                     location.pathname !== '/auth';

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">🔍 Página de Debug</h1>
      
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded">
          <h2 className="font-bold text-lg mb-2">📍 Location</h2>
          <p><strong>pathname:</strong> {location.pathname}</p>
          <p><strong>search:</strong> {location.search}</p>
          <p><strong>hash:</strong> {location.hash}</p>
        </div>

        <div className="bg-green-50 p-4 rounded">
          <h2 className="font-bold text-lg mb-2">👤 User</h2>
          <p><strong>Email:</strong> {user?.email || 'Não logado'}</p>
          <p><strong>ID:</strong> {user?.id || 'N/A'}</p>
        </div>

        <div className="bg-purple-50 p-4 rounded">
          <h2 className="font-bold text-lg mb-2">👤 Profile</h2>
          <p><strong>Role:</strong> {profile?.role || 'N/A'}</p>
          <p><strong>Tenant ID:</strong> {profile?.tenant_id || 'N/A'}</p>
        </div>

        <div className="bg-orange-50 p-4 rounded">
          <h2 className="font-bold text-lg mb-2">🏢 Tenant</h2>
          <p><strong>ID:</strong> {tenant?.id || 'N/A'}</p>
          <p><strong>Name:</strong> {tenant?.name || 'N/A'}</p>
          <p><strong>Email:</strong> {tenant?.email || 'N/A'}</p>
        </div>

        <div className={`p-4 rounded ${showNavbar ? 'bg-green-100' : 'bg-red-100'}`}>
          <h2 className="font-bold text-lg mb-2">🎯 showNavbar</h2>
          <p className="text-2xl font-bold">
            {showNavbar ? '✅ TRUE (Navbar DEVE aparecer)' : '❌ FALSE (Navbar NÃO deve aparecer)'}
          </p>
          <p className="mt-2 text-sm">
            <strong>Lógica:</strong><br/>
            pathname !== '/checkout' AND<br/>
            pathname !== '/mp/callback' AND<br/>
            pathname !== '/auth'
          </p>
          <p className="mt-2 text-sm">
            <strong>Resultado:</strong><br/>
            {location.pathname} !== '/checkout' → {location.pathname !== '/checkout' ? '✅' : '❌'}<br/>
            {location.pathname} !== '/mp/callback' → {location.pathname !== '/mp/callback' ? '✅' : '❌'}<br/>
            {location.pathname} !== '/auth' → {location.pathname !== '/auth' ? '✅' : '❌'}
          </p>
        </div>

        <div className="bg-yellow-50 p-4 rounded">
          <h2 className="font-bold text-lg mb-2">📊 Versão do Deploy</h2>
          <p><strong>Timestamp:</strong> {new Date().toISOString()}</p>
          <p><strong>Commit esperado:</strong> 46624c7 (fix: Remove Navbar da página de login)</p>
          <p className="mt-2 text-sm text-gray-600">
            Se você está vendo esta página, o deploy mais recente funcionou!
          </p>
        </div>

        <div className="bg-gray-50 p-4 rounded">
          <h2 className="font-bold text-lg mb-2">🧪 Teste Manual</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>Acesse <a href="/auth" className="text-blue-600 underline">/auth</a> → Navbar NÃO deve aparecer</li>
            <li>Acesse <a href="/" className="text-blue-600 underline">/</a> → Navbar DEVE aparecer</li>
            <li>Acesse <a href="/produtos" className="text-blue-600 underline">/produtos</a> → Navbar DEVE aparecer</li>
            <li>Acesse <a href="/integracoes" className="text-blue-600 underline">/integracoes</a> → Navbar DEVE aparecer</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Debug;
