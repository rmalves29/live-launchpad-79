import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/pedidos-manual" element={
              <ProtectedRoute>
                <PedidosManual />
              </ProtectedRoute>
            } />
            <Route path="/checkout" element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            } />
            <Route path="/pedidos" element={
              <ProtectedRoute>
                <Pedidos />
              </ProtectedRoute>
            } />
            <Route path="/sorteio" element={
              <ProtectedRoute>
                <Sorteio />
              </ProtectedRoute>
            } />
            <Route path="/config" element={
              <ProtectedRoute>
                <Config />
              </ProtectedRoute>
            } />
            <Route path="/produtos" element={
              <ProtectedRoute>
                <Produtos />
              </ProtectedRoute>
            } />
            <Route path="/clientes" element={
              <ProtectedRoute>
                <Clientes />
              </ProtectedRoute>
            } />
            <Route path="/whatsapp" element={
              <ProtectedRoute>
                <WhatsApp />
              </ProtectedRoute>
            } />
            <Route path="/configuracoes" element={
              <ProtectedRoute>
                <ConfigurationsPage />
              </ProtectedRoute>
            } />
            <Route path="/whatsapp-templates" element={
              <ProtectedRoute>
                <WhatsAppTemplates />
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
