import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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
import WhatsApp from "./pages/WhatsApp";
import WhatsAppTemplates from "./pages/WhatsAppTemplates";
import WhatsAppConnection from "./pages/WhatsAppConnection";
import WhatsAppIntegration from "./pages/WhatsAppIntegration";
import MpReturn from "./pages/MpReturn";
import ConfigFrete from "./pages/ConfigFrete";
import CotacaoFrete from "./pages/CotacaoFrete";
import Etiquetas from "./pages/Etiquetas";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const showNavbar = location.pathname !== '/checkout';

  return (
    <>
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/mp/return" element={<MpReturn />} />
        <Route path="/pedidos-manual" element={<PedidosManual />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/sorteio" element={<Sorteio />} />
        <Route path="/config" element={<Config />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/whatsapp" element={<WhatsApp />} />
        <Route path="/whatsapp-templates" element={<WhatsAppTemplates />} />
        <Route path="/whatsapp-connection" element={<WhatsAppConnection />} />
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
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
