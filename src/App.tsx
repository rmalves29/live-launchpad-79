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
import PedidosManual from "./pages/PedidosManual";
import Checkout from "./pages/Checkout";
import Pedidos from "./pages/Pedidos";
import Sorteio from "./pages/Sorteio";
import Config from "./pages/Config";
import Produtos from "./pages/Produtos";
import Clientes from "./pages/Clientes";
import Relatorios from "./pages/Relatorios";
import WhatsAppTemplates from "./pages/WhatsAppTemplates";
import SendFlow from "./pages/SendFlow";
import WhatsAppIntegration from "./components/WhatsAppIntegration";
import MpReturn from "./pages/MpReturn";

import Auth from "./pages/Auth";
import TenantAuth from "./pages/TenantAuth";
import MercadoPagoCallback from "./pages/MercadoPagoCallback";
import RequireAuth from "./components/RequireAuth";
import RequireTenantAuth from "./components/RequireTenantAuth";
import { TenantProvider } from "@/contexts/TenantContext";
import { TenantLoader } from "@/components/TenantLoader";
import { useTenantContext } from "@/contexts/TenantContext";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const { tenant, isMainSite } = useTenantContext();
  const showNavbar = location.pathname !== '/checkout' && location.pathname !== '/mp/callback';

  // Se estamos em um subdomínio de tenant, usar autenticação específica
  const TenantAuthComponent = tenant ? TenantAuth : Auth;

  // Componente para restringir acesso apenas a super_admin
  const SuperAdminOnly = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth();
    
    if (user?.email !== 'rmalves21@hotmail.com') {
      return <Navigate to="/" replace />;
    }
    
    return <>{children}</>;
  };

  return (
    <>
      {showNavbar && <Navbar />}
      <Routes>
        {/* Rota principal - Index ou TenantAuth dependendo do contexto */}
        <Route path="/" element={
          tenant ? (
            // Se há tenant, sempre mostrar auth primeiro, Index será protegido
            <RequireTenantAuth><Index /></RequireTenantAuth>
          ) : (
            // Site principal
            <Index />
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
        <Route path="/pedidos" element={
          <RequireTenantAuth><Pedidos /></RequireTenantAuth>
        } />
        <Route path="/sorteio" element={
          <RequireTenantAuth><Sorteio /></RequireTenantAuth>
        } />
        
        {/* Configurações apenas para super_admin */}
        <Route path="/config" element={
          <RequireAuth>
            <SuperAdminOnly>
              <Config />
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
        <Route path="/whatsapp-templates" element={
          <RequireTenantAuth><WhatsAppTemplates /></RequireTenantAuth>
        } />
        <Route path="/sendflow" element={
          <RequireTenantAuth><SendFlow /></RequireTenantAuth>
        } />
        <Route path="/whatsapp-integration" element={
          <RequireTenantAuth><WhatsAppIntegration /></RequireTenantAuth>
        } />
        
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
            </BrowserRouter>
          </TooltipProvider>
        </TenantLoader>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;