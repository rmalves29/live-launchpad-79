import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Megaphone, Send, BarChart3, Bot } from 'lucide-react';
import GroupsManager from '@/components/fluxo-envio/GroupsManager';
import CampaignsManager from '@/components/fluxo-envio/CampaignsManager';
import MessageComposer from '@/components/fluxo-envio/MessageComposer';
import ReportsPanel from '@/components/fluxo-envio/ReportsPanel';
import AutoMessagesManager from '@/components/fluxo-envio/AutoMessagesManager';
import { useTenantContext } from '@/contexts/TenantContext';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function FluxoEnvioIndex() {
  const { tenant } = useTenantContext();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'super_admin';
  const isAllowed = tenant?.slug === 'app' || isSuperAdmin;

  if (!isAllowed) {
    return <Navigate to="/pedidos" replace />;
  }
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Fluxo de Envio</h1>
        <p className="text-muted-foreground mt-1">Gerenciamento de grupos, campanhas e envio de mensagens no WhatsApp</p>
      </div>

      <Tabs defaultValue="grupos" className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-5 sm:inline-flex">
          <TabsTrigger value="grupos" className="gap-1">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Grupos</span>
          </TabsTrigger>
          <TabsTrigger value="campanhas" className="gap-1">
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">Campanhas</span>
          </TabsTrigger>
          <TabsTrigger value="envios" className="gap-1">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Envios</span>
          </TabsTrigger>
          <TabsTrigger value="automacoes" className="gap-1">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Automações</span>
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Relatórios</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grupos"><GroupsManager /></TabsContent>
        <TabsContent value="campanhas"><CampaignsManager /></TabsContent>
        <TabsContent value="envios"><MessageComposer /></TabsContent>
        <TabsContent value="automacoes"><AutoMessagesManager /></TabsContent>
        <TabsContent value="relatorios"><ReportsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
