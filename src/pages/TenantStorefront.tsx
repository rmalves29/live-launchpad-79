/**
 * Página Pública da Loja do Tenant
 * Acessível via: /loja-da-maria, /loja-do-joao, etc
 * Mostra produtos, informações e permite fazer pedidos
 */

import { useParams, Link } from 'react-router-dom';
import { useTenantBySlug } from '@/hooks/useTenantBySlug';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  ShoppingBag, 
  Phone, 
  Mail, 
  MapPin,
  Store,
  XCircle 
} from 'lucide-react';

export default function TenantStorefront() {
  const { slug } = useParams<{ slug: string }>();
  const { tenant, loading, error } = useTenantBySlug(slug);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-600">Carregando loja...</p>
        </div>
      </div>
    );
  }

  // Error ou loja não encontrada
  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-6 w-6" />
              <CardTitle>Loja não encontrada</CardTitle>
            </div>
            <CardDescription>
              {error || 'Esta loja não existe ou está desativada'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                URL solicitada: <strong>/{slug}</strong>
              </AlertDescription>
            </Alert>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-600">Verifique:</p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Se o nome da loja está correto</li>
                <li>Se a loja está ativa</li>
                <li>Se você tem permissão de acesso</li>
              </ul>
            </div>
            <Button asChild className="w-full mt-6">
              <Link to="/">Voltar para Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Página da loja
  return (
    <div 
      className="min-h-screen"
      style={{
        backgroundColor: tenant.primary_color || '#f8fafc',
      }}
    >
      {/* Header da Loja */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {tenant.logo_url && (
              <img 
                src={tenant.logo_url} 
                alt={tenant.name}
                className="h-16 w-16 object-contain rounded-lg"
              />
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{tenant.name}</h1>
              {tenant.description && (
                <p className="text-gray-600 mt-1">{tenant.description}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Informações de Contato */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Informações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tenant.whatsapp_number && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">WhatsApp</p>
                    <a 
                      href={`https://wa.me/${tenant.whatsapp_number.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-green-600 hover:underline"
                    >
                      {tenant.whatsapp_number}
                    </a>
                  </div>
                </div>
              )}
              
              {tenant.email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">E-mail</p>
                    <a 
                      href={`mailto:${tenant.email}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {tenant.email}
                    </a>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">URL da Loja</p>
                  <p className="text-sm text-gray-600 break-all">
                    /{tenant.slug}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de Boas-Vindas */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                Bem-vindo à {tenant.name}!
              </CardTitle>
              <CardDescription>
                Esta é a página pública da loja. Em breve você poderá ver produtos e fazer pedidos aqui.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-blue-800">
                  <strong>🎉 Novidade!</strong> Agora você pode acessar sua loja sem subdomínio!
                  <br />
                  <br />
                  Compartilhe este link: <strong className="font-mono">/{tenant.slug}</strong>
                </AlertDescription>
              </Alert>

              <div className="mt-6 space-y-3">
                <p className="text-sm text-gray-600">
                  <strong>Para o administrador:</strong> Faça login para gerenciar sua loja.
                </p>
                <div className="flex gap-3">
                  <Button asChild variant="default">
                    <Link to="/auth">Fazer Login</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={`/${tenant.slug}/produtos`}>Ver Produtos</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Área de Produtos (Preview) */}
        <Card>
          <CardHeader>
            <CardTitle>Produtos em Destaque</CardTitle>
            <CardDescription>
              Em breve: Catálogo completo de produtos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((item) => (
                <div 
                  key={item}
                  className="border rounded-lg p-4 bg-gray-50 hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                    <ShoppingBag className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="font-medium text-gray-900">Produto {item}</h3>
                  <p className="text-sm text-gray-600 mt-1">R$ 00,00</p>
                  <Button size="sm" className="w-full mt-3" disabled>
                    Em breve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-gray-600">
          <p>© 2024 {tenant.name}. Todos os direitos reservados.</p>
          <p className="mt-2">
            Powered by <strong>OrderZap</strong> - Sistema Multi-Tenant
          </p>
        </div>
      </footer>
    </div>
  );
}
