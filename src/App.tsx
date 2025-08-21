import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PedidosManual from "./pages/PedidosManual";
import Checkout from "./pages/Checkout";
import Pedidos from "./pages/Pedidos";
import Sorteio from "./pages/Sorteio";
import Config from "./pages/Config";
import Produtos from "./pages/Produtos";
import Clientes from "./pages/Clientes";
import WhatsApp from "./pages/WhatsApp";
import ConfigurationsPage from "./pages/ConfigurationsPage";
import WhatsAppTemplates from "./pages/WhatsAppTemplates";
import WhatsAppConnection from "./pages/WhatsAppConnection";
import MpReturn from "./pages/MpReturn";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/configuracoes" element={<ConfigurationsPage />} />
          <Route path="/whatsapp-templates" element={<WhatsAppTemplates />} />
          <Route path="/whatsapp-connection" element={<WhatsAppConnection />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
