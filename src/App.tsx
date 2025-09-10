import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
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
import { TenantProvider } from "@/contexts/TenantContext";
import { TenantLoader } from "@/components/TenantLoader";
import { TenantLinkHelper } from "@/components/TenantLinkHelper";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const showNavbar = location.pathname !== '/checkout';

  return (
    <>
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/mp/return" element={<MpReturn />} />
        <Route path="/pedidos-manual" element={<PedidosManual />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/sorteio" element={<Sorteio />} />
        <Route path="/config" element={<RequireAuth><Config /></RequireAuth>} />
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
    <AuthProvider>
      <TenantProvider>
        <TenantLoader>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <div className="min-h-screen">
                <TenantLinkHelper />
                <AppContent />
              </div>
            </BrowserRouter>
          </TooltipProvider>
        </TenantLoader>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;