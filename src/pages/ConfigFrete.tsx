import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Link, Save, Unlink } from "lucide-react";

interface FreteConfig {
  id?: number;
  api_base_url: string;
  localidade_retirada_url: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  cep_origem: string;
  remetente_nome: string;
  remetente_documento: string;
  remetente_endereco_rua: string;
  remetente_endereco_numero: string;
  remetente_endereco_comp: string;
  remetente_bairro: string;
  remetente_cidade: string;
  remetente_uf: string;
  access_token: string;
}

export default function ConfigFrete() {
  const [config, setConfig] = useState<FreteConfig>({
    api_base_url: "https://melhorenvio.com.br/api",
    localidade_retirada_url: "",
    client_id: "",
    client_secret: "",
    redirect_uri: "",
    cep_origem: "31575060",
    remetente_nome: "",
    remetente_documento: "",
    remetente_endereco_rua: "",
    remetente_endereco_numero: "",
    remetente_endereco_comp: "",
    remetente_bairro: "",
    remetente_cidade: "",
    remetente_uf: "",
    access_token: "",
  });
  
  const [loading, setLoading] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('frete_config')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setConfig(data);
      }
    } catch (error) {
      console.error('Error loading config:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar configurações",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('frete_config')
        .upsert(config, { onConflict: 'id' });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Configurações salvas com sucesso",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Erro",
        description: "Erro ao salvar configurações",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleOAuth = async () => {
    try {
      if (!config.client_id || !config.redirect_uri) {
        toast({
          title: "Erro",
          description: "Configure CLIENT_ID e REDIRECT_URI primeiro",
          variant: "destructive",
        });
        return;
      }

      // Construct OAuth URL
      const oauthUrl = `${config.api_base_url}/oauth/authorize?client_id=${config.client_id}&redirect_uri=${encodeURIComponent(config.redirect_uri)}&response_type=code&scope=shipping-calculate shipping-cancel shipping-tracking shipping-companies`;
      
      window.open(oauthUrl, '_blank');
      
      toast({
        title: "Redirecionando",
        description: "Você será redirecionado para autorização",
      });
    } catch (error) {
      console.error('Error starting OAuth:', error);
      toast({
        title: "Erro",
        description: "Erro ao iniciar OAuth",
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      const updatedConfig = { 
        ...config, 
        access_token: "",
        refresh_token: "",
        token_expires_at: null 
      };
      
      const { error } = await supabase
        .from('frete_config')
        .upsert(updatedConfig, { onConflict: 'id' });

      if (error) throw error;

      setConfig(updatedConfig);
      
      toast({
        title: "Sucesso",
        description: "Desconectado do Melhor Envio",
      });
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast({
        title: "Erro",
        description: "Erro ao desconectar",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Configuração de Frete - Melhor Envio</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configurações da API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="api_base_url">URL do WebService</Label>
              <Input
                id="api_base_url"
                value={config.api_base_url}
                onChange={(e) => setConfig({...config, api_base_url: e.target.value})}
                placeholder="https://melhorenvio.com.br/api"
              />
            </div>

            <div>
              <Label htmlFor="access_token">Token (Somente Leitura)</Label>
              <Input
                id="access_token"
                value={config.access_token ? "•••••••••••••••••••••••••••••••••••••••••••••••••••••••••••" : ""}
                readOnly
                placeholder="Token será preenchido após OAuth"
                className="bg-muted"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="localidade_retirada_url">URL de Localidade para Frete com Retirada</Label>
            <Textarea
              id="localidade_retirada_url"
              value={config.localidade_retirada_url}
              onChange={(e) => setConfig({...config, localidade_retirada_url: e.target.value})}
              placeholder="URL ou política de retirada"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="client_id">CLIENT_ID</Label>
              <Input
                id="client_id"
                value={config.client_id}
                onChange={(e) => setConfig({...config, client_id: e.target.value})}
                placeholder="Client ID do Melhor Envio"
              />
            </div>

            <div>
              <Label htmlFor="client_secret">CLIENT_SECRET</Label>
              <div className="relative">
                <Input
                  id="client_secret"
                  type={showClientSecret ? "text" : "password"}
                  value={config.client_secret}
                  onChange={(e) => setConfig({...config, client_secret: e.target.value})}
                  placeholder="Client Secret do Melhor Envio"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                >
                  {showClientSecret ? "Ocultar" : "Mostrar"}
                </Button>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="redirect_uri">REDIRECT_URI</Label>
            <Input
              id="redirect_uri"
              value={config.redirect_uri}
              onChange={(e) => setConfig({...config, redirect_uri: e.target.value})}
              placeholder="URL de callback após OAuth"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Dados do Remetente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cep_origem">CEP de Origem</Label>
              <Input
                id="cep_origem"
                value={config.cep_origem}
                onChange={(e) => setConfig({...config, cep_origem: e.target.value})}
                placeholder="31575060"
                maxLength={8}
              />
            </div>

            <div>
              <Label htmlFor="remetente_nome">Nome/Razão Social</Label>
              <Input
                id="remetente_nome"
                value={config.remetente_nome}
                onChange={(e) => setConfig({...config, remetente_nome: e.target.value})}
                placeholder="Nome do remetente"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="remetente_documento">CNPJ/CPF</Label>
              <Input
                id="remetente_documento"
                value={config.remetente_documento}
                onChange={(e) => setConfig({...config, remetente_documento: e.target.value})}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
              />
            </div>

            <div>
              <Label htmlFor="remetente_endereco_rua">Endereço - Rua</Label>
              <Input
                id="remetente_endereco_rua"
                value={config.remetente_endereco_rua}
                onChange={(e) => setConfig({...config, remetente_endereco_rua: e.target.value})}
                placeholder="Rua, Avenida, etc"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="remetente_endereco_numero">Número</Label>
              <Input
                id="remetente_endereco_numero"
                value={config.remetente_endereco_numero}
                onChange={(e) => setConfig({...config, remetente_endereco_numero: e.target.value})}
                placeholder="123"
              />
            </div>

            <div>
              <Label htmlFor="remetente_endereco_comp">Complemento</Label>
              <Input
                id="remetente_endereco_comp"
                value={config.remetente_endereco_comp}
                onChange={(e) => setConfig({...config, remetente_endereco_comp: e.target.value})}
                placeholder="Apto, Sala, etc"
              />
            </div>

            <div>
              <Label htmlFor="remetente_bairro">Bairro</Label>
              <Input
                id="remetente_bairro"
                value={config.remetente_bairro}
                onChange={(e) => setConfig({...config, remetente_bairro: e.target.value})}
                placeholder="Centro"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="remetente_cidade">Cidade</Label>
              <Input
                id="remetente_cidade"
                value={config.remetente_cidade}
                onChange={(e) => setConfig({...config, remetente_cidade: e.target.value})}
                placeholder="São Paulo"
              />
            </div>

            <div>
              <Label htmlFor="remetente_uf">UF</Label>
              <Input
                id="remetente_uf"
                value={config.remetente_uf}
                onChange={(e) => setConfig({...config, remetente_uf: e.target.value})}
                placeholder="SP"
                maxLength={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4 mt-6">
        <Button onClick={handleSave} disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          Salvar Configurações
        </Button>

        <Button 
          onClick={handleOAuth} 
          variant="outline"
          disabled={!config.client_id || !config.redirect_uri}
        >
          <Link className="w-4 h-4 mr-2" />
          Conectar ao Melhor Envio
        </Button>

        {config.access_token && (
          <Button onClick={handleDisconnect} variant="destructive">
            <Unlink className="w-4 h-4 mr-2" />
            Desconectar
          </Button>
        )}
      </div>
    </div>
  );
}