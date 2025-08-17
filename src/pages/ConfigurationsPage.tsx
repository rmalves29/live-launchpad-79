import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Settings, Save, Edit, Database, Truck, Package } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface AppSettings {
  id: number;
  public_base_url: string;
  correios_origin_cep: string;
  correios_service_pac: string;
  correios_service_sedex: string;
  default_weight_kg: number;
  default_length_cm: number;
  default_height_cm: number;
  default_width_cm: number;
  default_diameter_cm: number;
}

const ConfigurationsPage = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings(data);
      } else {
        // Create default settings
        const defaultSettings = {
          id: 1,
          public_base_url: '',
          correios_origin_cep: '',
          correios_service_pac: '3298',
          correios_service_sedex: '3220',
          default_weight_kg: 0.3,
          default_length_cm: 20,
          default_height_cm: 2,
          default_width_cm: 16,
          default_diameter_cm: 0
        };
        setSettings(defaultSettings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar configurações',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert(settings, { onConflict: 'id' });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Configurações salvas com sucesso'
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configurações',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof AppSettings, value: string | number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto py-6 max-w-4xl">
        <div className="text-center">Carregando configurações...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center">
          <Settings className="h-8 w-8 mr-3" />
          Configurações do Sistema
        </h1>
        <div className="flex space-x-2">
          {isEditing ? (
            <>
              <Button onClick={() => setIsEditing(false)} variant="outline">
                Cancelar
              </Button>
              <Button onClick={saveSettings} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}
        </div>
      </div>

      {/* Base URL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Database className="h-5 w-5 mr-2" />
            URL Base
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="public_base_url">URL Base para Callbacks</Label>
              <Input
                id="public_base_url"
                value={settings?.public_base_url || ''}
                onChange={(e) => handleInputChange('public_base_url', e.target.value)}
                disabled={!isEditing}
                placeholder="https://seu-dominio.com"
              />
              <p className="text-sm text-muted-foreground mt-1">
                URL usada para callbacks do Mercado Pago
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Correios Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Truck className="h-5 w-5 mr-2" />
            Configurações dos Correios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="correios_origin_cep">CEP de Origem</Label>
              <Input
                id="correios_origin_cep"
                value={settings?.correios_origin_cep || ''}
                onChange={(e) => handleInputChange('correios_origin_cep', e.target.value)}
                disabled={!isEditing}
                placeholder="00000-000"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="correios_service_pac">Código Serviço PAC</Label>
                <Input
                  id="correios_service_pac"
                  value={settings?.correios_service_pac || ''}
                  onChange={(e) => handleInputChange('correios_service_pac', e.target.value)}
                  disabled={!isEditing}
                  placeholder="3298"
                />
              </div>
              <div>
                <Label htmlFor="correios_service_sedex">Código Serviço SEDEX</Label>
                <Input
                  id="correios_service_sedex"
                  value={settings?.correios_service_sedex || ''}
                  onChange={(e) => handleInputChange('correios_service_sedex', e.target.value)}
                  disabled={!isEditing}
                  placeholder="3220"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Package Dimensions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="h-5 w-5 mr-2" />
            Dimensões Padrão dos Produtos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="default_weight_kg">Peso Padrão (kg)</Label>
              <Input
                id="default_weight_kg"
                type="number"
                step="0.1"
                value={settings?.default_weight_kg || ''}
                onChange={(e) => handleInputChange('default_weight_kg', parseFloat(e.target.value) || 0)}
                disabled={!isEditing}
                placeholder="0.3"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_length_cm">Comprimento (cm)</Label>
                <Input
                  id="default_length_cm"
                  type="number"
                  value={settings?.default_length_cm || ''}
                  onChange={(e) => handleInputChange('default_length_cm', parseInt(e.target.value) || 0)}
                  disabled={!isEditing}
                  placeholder="20"
                />
              </div>
              <div>
                <Label htmlFor="default_height_cm">Altura (cm)</Label>
                <Input
                  id="default_height_cm"
                  type="number"
                  value={settings?.default_height_cm || ''}
                  onChange={(e) => handleInputChange('default_height_cm', parseInt(e.target.value) || 0)}
                  disabled={!isEditing}
                  placeholder="2"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_width_cm">Largura (cm)</Label>
                <Input
                  id="default_width_cm"
                  type="number"
                  value={settings?.default_width_cm || ''}
                  onChange={(e) => handleInputChange('default_width_cm', parseInt(e.target.value) || 0)}
                  disabled={!isEditing}
                  placeholder="16"
                />
              </div>
              <div>
                <Label htmlFor="default_diameter_cm">Diâmetro (cm)</Label>
                <Input
                  id="default_diameter_cm"
                  type="number"
                  value={settings?.default_diameter_cm || ''}
                  onChange={(e) => handleInputChange('default_diameter_cm', parseInt(e.target.value) || 0)}
                  disabled={!isEditing}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações Importantes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>URL Base:</strong> Deve ser configurada para o domínio de produção quando o app estiver em produção</p>
            <p><strong>CEP de Origem:</strong> CEP da sua empresa/loja para cálculo de frete</p>
            <p><strong>Códigos de Serviço:</strong> PAC (3298) e SEDEX (3220) são os códigos padrão dos Correios</p>
            <p><strong>Dimensões Padrão:</strong> Usadas quando o produto não tem dimensões específicas cadastradas</p>
            <Separator className="my-3" />
            <p className="text-xs"><strong>Nota:</strong> As credenciais dos Correios (código da empresa e senha) devem ser configuradas nos segredos do Supabase</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfigurationsPage;