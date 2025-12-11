import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl text-center">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-blue-600 mb-2">
            OrderZap
          </h1>
          <p className="text-xl text-gray-600">
            Sistema Multi-Tenant de Gestão de Pedidos
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-4xl mb-4">📱</div>
            <h3 className="font-bold text-lg mb-2">WhatsApp Integrado</h3>
            <p className="text-gray-600 text-sm">
              Envie mensagens e cobranças direto pelo WhatsApp
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-4xl mb-4">🏪</div>
            <h3 className="font-bold text-lg mb-2">Multi-Tenant</h3>
            <p className="text-gray-600 text-sm">
              Gerencie múltiplas lojas em um único sistema
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="font-bold text-lg mb-2">Relatórios</h3>
            <p className="text-gray-600 text-sm">
              Acompanhe vendas e métricas em tempo real
            </p>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex gap-4 justify-center">
          <Link
            href="/dashboard"
            className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
          >
            Acessar Dashboard
          </Link>
          <Link
            href="/dashboard/whatsapp"
            className="px-8 py-4 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors shadow-lg"
          >
            Conectar WhatsApp
          </Link>
        </div>

        {/* Info */}
        <div className="mt-12 text-sm text-gray-500">
          <p>✅ Sem mensalidade • ✅ WhatsApp gratuito • ✅ Setup em 5 minutos</p>
        </div>
      </div>
    </main>
  )
}
