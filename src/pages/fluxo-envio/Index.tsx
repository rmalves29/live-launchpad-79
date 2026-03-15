import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Megaphone, Send, BarChart3 } from 'lucide-react';
import GroupsManager from '@/components/fluxo-envio/GroupsManager';
import CampaignsManager from '@/components/fluxo-envio/CampaignsManager';
import MessageComposer from '@/components/fluxo-envio/MessageComposer';
import ReportsPanel from '@/components/fluxo-envio/ReportsPanel';

export default function FluxoEnvioIndex() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Fluxo de Envio</h1>
        <p className="text-muted-foreground mt-1">Gerenciamento de grupos, campanhas e envio de mensagens no WhatsApp</p>
      </div>

      <Tabs defaultValue="grupos" className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex">
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
          <TabsTrigger value="relatorios" className="gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Relatórios</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grupos"><GroupsManager /></TabsContent>
        <TabsContent value="campanhas"><CampaignsManager /></TabsContent>
        <TabsContent value="envios"><MessageComposer /></TabsContent>
        <TabsContent value="relatorios"><ReportsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
