import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { TenantProvider } from "./hooks/useTenant";
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
import WhatsAppIntegration from "./components/WhatsAppIntegration";
import MpReturn from "./pages/MpReturn";
import ConfigFrete from "./pages/ConfigFrete";
import CotacaoFrete from "./pages/CotacaoFrete";
import Etiquetas from "./pages/Etiquetas";
import Auth from "./pages/Auth";
import RequireAuth from "./components/RequireAuth";
import Integrations from "./pages/Integrations";
import Dashboard from "./pages/Dashboard";
import TenantLogin from "./pages/TenantLogin";
import TenantDashboard from "./pages/TenantDashboard";
import TenantSelector from "./pages/TenantSelector";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const showNavbar = location.pathname !== '/checkout' && 
                    !location.pathname.startsWith('/empresa/') &&
                    location.pathname !== '/';

  return (
    <>
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<TenantSelector />} />
        <Route path="/admin" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/empresa/:tenantSlug/login" element={<TenantLogin />} />
        <Route path="/empresa/:tenantSlug/dashboard" element={<TenantDashboard />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/mp/return" element={<MpReturn />} />
        <Route path="/pedidos-manual" element={<PedidosManual />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/sorteio" element={<Sorteio />} />
        <Route path="/config" element={<RequireAuth><Config /></RequireAuth>} />
        <Route path="/integrations" element={<RequireAuth><Integrations /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/whatsapp-templates" element={<WhatsAppTemplates />} />
        <Route path="/whatsapp-integration" element={<WhatsAppIntegration />} />
        <Route path="/config-frete" element={<ConfigFrete />} />
        <Route path="/cotacao-frete" element={<CotacaoFrete />} />
        <Route path="/etiquetas" element={<Etiquetas />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TenantProvider>
          <AppContent />
        </TenantProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;