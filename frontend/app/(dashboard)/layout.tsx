export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-blue-600">OrderZap</h1>
            </div>
            <nav className="flex space-x-4">
              <a href="/dashboard" className="text-gray-700 hover:text-blue-600 px-3 py-2">
                Dashboard
              </a>
              <a href="/dashboard/whatsapp" className="text-gray-700 hover:text-blue-600 px-3 py-2">
                WhatsApp
              </a>
              <a href="/dashboard/orders" className="text-gray-700 hover:text-blue-600 px-3 py-2">
                Pedidos
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
