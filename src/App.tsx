import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Navbar from "./components/Navbar";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import TenantAuth from "./pages/TenantAuth";
import { usePageTitle } from "@/hooks/usePageTitle";

// Callbacks
import MercadoPagoCallback from "./pages/callbacks/MercadoPagoCallback";
import MpReturn from "./pages/callbacks/MpReturn";

// Pedidos
import PedidosManual from "./pages/pedidos/Manual";
import Live from "./pages/pedidos/Live";
import Checkout from "./pages/pedidos/Checkout";
import PublicCheckout from "./pages/pedidos/PublicCheckout";
import Pedidos from "./pages/pedidos/Index";

// Módulos
import Sorteio from "./pages/sorteio/Index";
import Config from "./pages/config/Index";
import Produtos from "./pages/produtos/Index";
import Clientes from "./pages/clientes/Index";
import Relatorios from "./pages/relatorios/Index";
import SendFlow from "./pages/sendflow/Index";
import Etiquetas from "./pages/etiquetas/Index";
import TenantIntegrationsPage from "./components/TenantIntegrationsPage";
import TenantStorefront from "./pages/TenantStorefront";

import EmpresasIndex from "./pages/empresas/Index";
import Debug from "./pages/Debug";
import LandingPage from "./pages/LandingPage";
import RenovarAssinatura from "./pages/RenovarAssinatura";

// WhatsApp
import WhatsappTemplates from "./pages/whatsapp/Templates";
import Cobranca from "./pages/whatsapp/Cobranca";
import ConexaoZAPI from "./pages/whatsapp/ConexaoZAPI";
import AgenteIA from "./pages/agente-ia/Index";
import RequireAuth from "./components/RequireAuth";
import RequireTenantAuth from "./components/RequireTenantAuth";
import { TenantProvider } from "@/contexts/TenantContext";
import { TenantLoader } from "@/components/TenantLoader";
import { useTenantContext } from "@/contexts/TenantContext";
import { WhatsAppSupportButton } from "@/components/WhatsAppSupportButton";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // 5 minutos
    },
  },
});

const AppContent = () => {
  const location = useLocation();
  const { tenant, isMainSite } = useTenantContext();
  const showNavbar = location.pathname !== '/checkout' && location.pathname !== '/mp/callback' && location.pathname !== '/auth' && location.pathname !== '/landing' && location.pathname !== '/renovar-assinatura' && !location.pathname.startsWith('/t/');
  
  // Atualiza o título da aba do navegador baseado na página atual
  usePageTitle();

  // Se estamos em um subdomínio de tenant, usar autenticação específica
  const TenantAuthComponent = tenant ? TenantAuth : Auth;

  // Componente para restringir acesso apenas a super_admin
  const SuperAdminOnly = ({ children }: { children: ReactNode }) => {
    const { profile, loading } = useAuth();
    
    // Aguardar carregamento do perfil
    if (loading) {
      return <div className="flex items-center justify-center h-screen">Carregando...</div>;
    }
    
    // Verifica role super_admin no perfil
    if (profile?.role !== 'super_admin') {
      return <Navigate to="/" replace />;
    }
    
    return <>{children}</>;
  };

  return (
    <>
      {showNavbar && <Navbar />}
      <Routes>
        {/* Landing page pública institucional */}
        <Route path="/landing" element={<LandingPage />} />
        
        {/* Rota principal - Index ou TenantAuth dependendo do contexto */}
        <Route path="/" element={
          tenant ? (
            // Se há tenant, sempre mostrar auth primeiro, Index será protegido
            <RequireTenantAuth><Index /></RequireTenantAuth>
          ) : (
            // Site principal - também requer autenticação
            <RequireAuth><Index /></RequireAuth>
          )
        } />
        
        {/* Auth genérico para site principal */}
        <Route path="/auth" element={<TenantAuthComponent />} />
        
        {/* Callback do Mercado Pago */}
        <Route path="/mp/callback" element={<MercadoPagoCallback />} />
        <Route path="/mp/return" element={<MpReturn />} />
        
        {/* Rotas protegidas */}
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/pedidos-manual" element={
          <RequireTenantAuth><PedidosManual /></RequireTenantAuth>
        } />
        <Route path="/live" element={
          <RequireTenantAuth><Live /></RequireTenantAuth>
        } />
        <Route path="/pedidos" element={
          <RequireTenantAuth><Pedidos /></RequireTenantAuth>
        } />
        <Route path="/sorteio" element={
          <RequireTenantAuth><Sorteio /></RequireTenantAuth>
        } />
        
        {/* Configurações - tenant_admin e super_admin podem acessar */}
        <Route path="/config" element={
          <RequireTenantAuth>
            <Config />
          </RequireTenantAuth>
        } />
        
        
        {/* Dashboard de Empresas (apenas super_admin) */}
        <Route path="/empresas" element={
          <RequireAuth>
            <SuperAdminOnly>
              <EmpresasIndex />
            </SuperAdminOnly>
          </RequireAuth>
        } />
        
        <Route path="/produtos" element={
          <RequireTenantAuth><Produtos /></RequireTenantAuth>
        } />
        <Route path="/clientes" element={
          <RequireTenantAuth><Clientes /></RequireTenantAuth>
        } />
        <Route path="/relatorios" element={
          <RequireTenantAuth><Relatorios /></RequireTenantAuth>
        } />
        <Route path="/sendflow" element={
          <RequireTenantAuth><SendFlow /></RequireTenantAuth>
        } />
        
        {/* Rota para etiquetas */}
        <Route path="/etiquetas" element={
          <RequireTenantAuth><Etiquetas /></RequireTenantAuth>
        } />
        
        {/* Rota para templates de WhatsApp */}
        <Route path="/whatsapp/templates" element={
          <RequireTenantAuth><WhatsappTemplates /></RequireTenantAuth>
        } />
        
        {/* Rota para cobrança em massa */}
        <Route path="/whatsapp/cobranca" element={
          <RequireTenantAuth><Cobranca /></RequireTenantAuth>
        } />
        
        {/* Rota para conexão WhatsApp Z-API */}
        <Route path="/whatsapp/conexao" element={
          <RequireTenantAuth><ConexaoZAPI /></RequireTenantAuth>
        } />
        <Route path="/whatsapp/zapi" element={
          <RequireTenantAuth><ConexaoZAPI /></RequireTenantAuth>
        } />
        
        {/* Rota para integrações (Mercado Pago, Melhor Envio) */}
        <Route path="/integracoes" element={
          <RequireTenantAuth>
            <TenantIntegrationsPage />
          </RequireTenantAuth>
        } />
        
        {/* Rota para Agente de IA */}
        <Route
          path="/agente-ia"
          element={
            <RequireTenantAuth>
              <AgenteIA />
            </RequireTenantAuth>
          }
        />
        
        {/* Rota para renovação de assinatura */}
        <Route path="/renovar-assinatura" element={
          <RequireAuth><RenovarAssinatura /></RequireAuth>
        } />
        
        {/* Rota de debug */}
        <Route path="/debug" element={<Debug />} />
        
        {/* Rotas públicas da loja por slug (path-based) - prefixo /t/ para evitar conflitos */}
        <Route path="/t/:slug" element={<TenantStorefront />} />
        <Route path="/t/:slug/checkout" element={<PublicCheckout />} />
        <Route path="/t/:slug/*" element={<TenantStorefront />} />
        
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};


const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantProvider>
        <TenantLoader>
          <TooltipProvider>
            <Toaster />
            <Sonner />
          <BrowserRouter>
              <AppContent />
              <WhatsAppSupportButton />
            </BrowserRouter>
          </TooltipProvider>
        </TenantLoader>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
