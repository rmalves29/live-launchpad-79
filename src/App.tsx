import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Navbar from "./components/Navbar";
import Index from "./pages/Index";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import TenantAuth from "./pages/TenantAuth";

// Callbacks
import MercadoPagoCallback from "./pages/callbacks/MercadoPagoCallback";
import MpReturn from "./pages/callbacks/MpReturn";

// Pedidos
import PedidosManual from "./pages/pedidos/Manual";
import Live from "./pages/pedidos/Live";
import Checkout from "./pages/pedidos/Checkout";
import Pedidos from "./pages/pedidos/Index";

// Módulos
import Sorteio from "./pages/sorteio/Index";
import Config from "./pages/config/Index";
import Produtos from "./pages/produtos/Index";
import Clientes from "./pages/clientes/Index";
import Relatorios from "./pages/relatorios/Index";
import SendFlow from "./pages/sendflow/Index";
import Etiquetas from "./pages/etiquetas/Index";

// WhatsApp
import WhatsappTemplates from "./pages/whatsapp/Templates";
import Cobranca from "./pages/whatsapp/Cobranca";
import RequireAuth from "./components/RequireAuth";
import RequireTenantAuth from "./components/RequireTenantAuth";
import { TenantProvider } from "@/contexts/TenantContext";
import { TenantLoader } from "@/components/TenantLoader";
import { useTenantContext } from "@/contexts/TenantContext";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const { tenant, isMainSite } = useTenantContext();
  const showNavbar = location.pathname !== '/checkout' && location.pathname !== '/mp/callback' && location.pathname !== '/';

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
        {/* Rota principal - Home pública */}
        <Route path="/" element={<Home />} />
        
        {/* Dashboard após login */}
        <Route path="/dashboard" element={
          tenant ? (
            <RequireTenantAuth><Index /></RequireTenantAuth>
          ) : (
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