import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppShell } from "./components/layout/AppShell";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import TenantAuth from "./pages/TenantAuth";
import ResetPassword from "./pages/ResetPassword";
import { usePageTitle } from "@/hooks/usePageTitle";

// Callbacks
import MercadoPagoCallback from "./pages/callbacks/MercadoPagoCallback";
import MpReturn from "./pages/callbacks/MpReturn";
import PagamentoRetorno from "./pages/pagamento/Retorno";

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
import FluxoEnvio from "./pages/fluxo-envio/Index";
import CampaignRedirect from "./pages/fluxo-envio/CampaignRedirect";
import PushPage from "./pages/comunicacao/push/Index";

import FilaEspera from "./pages/fila-espera/Index";
import TenantIntegrationsPage from "./components/TenantIntegrationsPage";
import TenantStorefront from "./pages/TenantStorefront";
import PushOptInPublic from "./pages/push/PushOptIn";
import CadastroInstagram from "./pages/tenant/CadastroInstagram";

import EmpresasIndex from "./pages/empresas/Index";
import Debug from "./pages/Debug";
import AdminErros from "./pages/admin/Erros";
import MonitoramentoMensagens from "./pages/admin/MonitoramentoMensagens";
import ArquivoHistorico from "./pages/admin/ArquivoHistorico";
import SaudeSistema from "./pages/admin/SaudeSistema";
import Comunicados from "./pages/admin/Comunicados";
import Tutoriais from "./pages/admin/Tutoriais";
import AdminLinks from "./pages/admin/Links";
import Ajuda from "./pages/ajuda/Index";
import { AnnouncementPopup } from "./components/AnnouncementPopup";
import LandingPage from "./pages/LandingPage";
import LandingFluxoEnvio from "./pages/LandingFluxoEnvio";
import FluxoEnvioAppLayout from "./pages/fluxo-envio/AppLayout";
import FluxoEnvioPagamento from "./pages/fluxo-envio/Pagamento";
import RequireFluxoScope from "./components/RequireFluxoScope";
import RenovarAssinatura from "./pages/RenovarAssinatura";

// WhatsApp
import WhatsappTemplates from "./pages/whatsapp/Templates";
import Cobranca from "./pages/whatsapp/Cobranca";
import ConexaoZAPI from "./pages/whatsapp/ConexaoZAPI";
import WhatsAppOfficialPage from "./pages/whatsapp/Oficial";
import EnviosAtivos from "./pages/EnviosAtivos";
import AgenteIA from "./pages/agente-ia/Index";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import SuporteIA from "./pages/suporte-ia/Index";
import RequireAuth from "./components/RequireAuth";
import DesignPreview from "./pages/design-preview/Index";
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
  const showShell = location.pathname !== '/checkout' && location.pathname !== '/mp/callback' && location.pathname !== '/auth' && location.pathname !== '/landing' && location.pathname !== '/renovar-assinatura' && location.pathname !== '/politica-de-privacidade' && location.pathname !== '/termos-de-uso' && location.pathname !== '/design-preview' && !location.pathname.startsWith('/t/') && !location.pathname.startsWith('/fluxo/') && location.pathname !== '/fluxo-envio' && !location.pathname.startsWith('/fluxo-envio/app') && location.pathname !== '/fluxo-envio/pagamento';
  
  // Atualiza o título da aba do navegador baseado na página atual
  usePageTitle();

  // Se estamos em um subdomínio de tenant, usar autenticação específica
  const TenantAuthComponent = tenant ? TenantAuth : Auth;

  // Componente para restringir acesso apenas a super_admin
  const SuperAdminOnly = ({ children }: { children: ReactNode }) => {
    const { profile, isLoading } = useAuth();
    
    // Aguardar carregamento do perfil
    if (isLoading) {
      return <div className="flex items-center justify-center h-screen">Carregando...</div>;
    }
    
    // Verifica role super_admin no perfil
    if (profile?.role !== 'super_admin') {
      return <Navigate to="/" replace />;
    }
    
    return <>{children}</>;
  };

  // Componente para restringir acesso apenas ao usuário rafael@maniadmulher.com
  const RafaelOnly = ({ children }: { children: ReactNode }) => {
    const { user, isLoading } = useAuth();

    if (user?.email === 'rafael@maniadmulher.com') {
      return <>{children}</>;
    }
    
    if (isLoading) {
      return <div className="flex items-center justify-center min-h-[60vh]">Carregando...</div>;
    }

    if (!user) {
      return <Navigate to="/auth" replace />;
    }
    
    if (user.email !== 'rafael@maniadmulher.com') {
      return <Navigate to="/" replace />;
    }
    
    return <>{children}</>;
  };

  const routes = (
    <Routes>
      {/* Landing page pública institucional */}
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/fluxo-envio" element={<LandingFluxoEnvio />} />

        
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
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Callback do Mercado Pago */}
        <Route path="/mp/callback" element={<MercadoPagoCallback />} />
        <Route path="/mp/return" element={<Navigate to={`/pagamento/retorno${window.location.search}`} replace />} />
        
        {/* Página universal de retorno de pagamento */}
        <Route path="/pagamento/retorno" element={<PagamentoRetorno />} />
        
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
        <Route path="/fila-espera" element={
          <RequireTenantAuth><FilaEspera /></RequireTenantAuth>
        } />
        <Route path="/sendflow" element={
          <RequireTenantAuth><SendFlow /></RequireTenantAuth>
        } />
        
        {/* Rota para etiquetas */}
        <Route path="/etiquetas" element={
          <RequireTenantAuth><Etiquetas /></RequireTenantAuth>
        } />
        
        {/* Fluxo de Envio - app público para usuários da landing (sem sidebar) */}
        <Route path="/fluxo-envio/app" element={
          <RequireFluxoScope><FluxoEnvioAppLayout /></RequireFluxoScope>
        } />
        <Route path="/fluxo-envio/pagamento" element={<FluxoEnvioPagamento />} />
        {/* Fluxo de Envio - dentro do sistema completo (com sidebar) */}
        <Route path="/fluxo-envio/painel" element={
          <RequireTenantAuth><FluxoEnvio /></RequireTenantAuth>
        } />
        <Route path="/comunicacao/push" element={
          <RequireTenantAuth><PushPage /></RequireTenantAuth>
        } />


        
        {/* Rota para templates de WhatsApp */}
        <Route path="/whatsapp/templates" element={
          <RequireTenantAuth><WhatsappTemplates /></RequireTenantAuth>
        } />
        
        {/* Rota para cobrança em massa */}
        <Route path="/whatsapp/cobranca" element={
          <RequireTenantAuth><Cobranca /></RequireTenantAuth>
        } />

        {/* Painel de envios ativos */}
        <Route path="/envios-ativos" element={
          <RequireTenantAuth><EnviosAtivos /></RequireTenantAuth>
        } />
        <Route path="/whatsapp/envios-ativos" element={
          <RequireTenantAuth><EnviosAtivos /></RequireTenantAuth>
        } />
        
        {/* Rota para conexão WhatsApp Z-API */}
        <Route path="/whatsapp/conexao" element={
          <RequireTenantAuth><ConexaoZAPI /></RequireTenantAuth>
        } />
        <Route path="/whatsapp/zapi" element={
          <RequireTenantAuth><ConexaoZAPI /></RequireTenantAuth>
        } />
        <Route path="/whatsapp/oficial" element={
          <RequireAuth><SuperAdminOnly><WhatsAppOfficialPage /></SuperAdminOnly></RequireAuth>
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
        
        {/* Rota para Suporte IA - Base de Conhecimento */}
        <Route
          path="/suporte-ia"
          element={
            <RequireTenantAuth>
              <SuporteIA />
            </RequireTenantAuth>
          }
        />
        
        {/* Rota para renovação de assinatura */}
        <Route path="/renovar-assinatura" element={
          <RequireAuth><RenovarAssinatura /></RequireAuth>
        } />
        
        {/* Rota de debug - apenas super_admin autenticado */}
        <Route path="/debug" element={
          <RequireAuth>
            <SuperAdminOnly>
              <Debug />
            </SuperAdminOnly>
          </RequireAuth>
        } />

        {/* Painel de erros do Sentry - apenas rafael@maniadmulher.com */}
        <Route path="/admin/erros" element={
          <RequireAuth>
            <RafaelOnly>
              <AdminErros />
            </RafaelOnly>
          </RequireAuth>
        } />
        <Route path="/admin/monitoramento-mensagens" element={
          <RequireAuth>
            <SuperAdminOnly>
              <MonitoramentoMensagens />
            </SuperAdminOnly>
          </RequireAuth>
        } />
        <Route path="/admin/arquivo-historico" element={
          <RequireAuth>
            <SuperAdminOnly>
              <ArquivoHistorico />
            </SuperAdminOnly>
          </RequireAuth>
        } />
        <Route path="/admin/saude" element={
          <RequireAuth>
            <SuperAdminOnly>
              <SaudeSistema />
            </SuperAdminOnly>
          </RequireAuth>
        } />
        <Route path="/admin/comunicados" element={
          <RequireAuth>
            <SuperAdminOnly>
              <Comunicados />
            </SuperAdminOnly>
          </RequireAuth>
        } />
        <Route path="/admin/tutoriais" element={
          <RequireAuth>
            <SuperAdminOnly>
              <Tutoriais />
            </SuperAdminOnly>
          </RequireAuth>
        } />
        <Route path="/ajuda" element={
          <RequireAuth>
            <SuperAdminOnly>
              <Ajuda />
            </SuperAdminOnly>
          </RequireAuth>
        } />
        <Route path="/design-preview" element={
          <RequireAuth><DesignPreview /></RequireAuth>
        } />

        {/* Páginas públicas legais */}
        <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
        <Route path="/termos-de-uso" element={<TermsOfUse />} />
        
        {/* Redirect público de campanha do Fluxo de Envio */}
        <Route path="/fluxo/:tenantSlug/:campaignSlug" element={<CampaignRedirect />} />
        
        {/* Cadastro público Instagram */}
        <Route path="/t/:slug/cadastro-instagram" element={<CadastroInstagram />} />

        {/* Opt-in público de notificações push */}
        <Route path="/t/:slug/push" element={<PushOptInPublic />} />

        {/* Rotas públicas da loja por slug (path-based) - prefixo /t/ para evitar conflitos */}
        <Route path="/t/:slug" element={<TenantStorefront />} />
        <Route path="/t/:slug/checkout" element={<PublicCheckout />} />
        <Route path="/t/:slug/*" element={<TenantStorefront />} />
        
        <Route path="*" element={<NotFound />} />
      </Routes>
  );

  return showShell ? <AppShell>{routes}</AppShell> : routes;
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
