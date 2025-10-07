import { useState, useEffect } from 'react';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Building2, Save, Loader2 } from 'lucide-react';

interface CompanyData {
  company_name: string;
  company_document: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  company_number: string;
  company_complement: string;
  company_district: string;
  company_city: string;
  company_state: string;
  company_cep: string;
}

export const CompanySettings = () => {
  const { tenantId } = useTenantContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CompanyData>({
    company_name: '',
    company_document: '',
    company_email: '',
    company_phone: '',
    company_address: '',
    company_number: '',
    company_complement: '',
    company_district: '',
    company_city: '',
    company_state: '',
    company_cep: '',
  });

  useEffect(() => {
    if (tenantId) {
      loadCompanyData();
    }
  }, [tenantId]);

  const loadCompanyData = async () => {
    try {
      const { data, error } = await supabaseTenant.raw
        .from('tenants')
        .select('company_name, company_document, company_email, company_phone, company_address, company_number, company_complement, company_district, company_city, company_state, company_cep')
        .eq('id', tenantId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          company_name: data.company_name || '',
          company_document: data.company_document || '',
          company_email: data.company_email || '',
          company_phone: data.company_phone || '',
          company_address: data.company_address || '',
          company_number: data.company_number || '',
          company_complement: data.company_complement || '',
          company_district: data.company_district || '',
          company_city: data.company_city || '',
          company_state: data.company_state || '',
          company_cep: data.company_cep || '',
        });
      }
    } catch (error) {
      console.error('Erro ao carregar dados da empresa:', error);
      toast.error('Erro ao carregar dados da empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenantId) return;

    setSaving(true);
    try {
      const { error } = await supabaseTenant.raw
        .from('tenants')
        .update(formData)
        .eq('id', tenantId);

      if (error) throw error;

      toast.success('Dados da empresa salvos com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar dados da empresa:', error);
      toast.error('Erro ao salvar dados da empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof CompanyData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Dados da Empresa
        </CardTitle>
        <CardDescription>
          Configure os dados da sua empresa. Estes dados serão automaticamente sincronizados com todas as integrações (Melhor Envio, Mercado Pago, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company_name">Nome da Empresa *</Label>
            <Input
              id="company_name"
              value={formData.company_name}
              onChange={(e) => handleInputChange('company_name', e.target.value)}
              placeholder="Ex: Minha Empresa LTDA"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="company_document">CNPJ *</Label>
            <Input
              id="company_document"
              value={formData.company_document}
              onChange={(e) => handleInputChange('company_document', e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company_email">E-mail *</Label>
            <Input
              id="company_email"
              type="email"
              value={formData.company_email}
              onChange={(e) => handleInputChange('company_email', e.target.value)}
              placeholder="contato@empresa.com"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="company_phone">Telefone *</Label>
            <Input
              id="company_phone"
              value={formData.company_phone}
              onChange={(e) => handleInputChange('company_phone', e.target.value)}
              placeholder="(31) 99999-9999"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-lg font-medium">Endereço</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="company_address">Logradouro *</Label>
              <Input
                id="company_address"
                value={formData.company_address}
                onChange={(e) => handleInputChange('company_address', e.target.value)}
                placeholder="Rua das Flores"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_number">Número *</Label>
              <Input
                id="company_number"
                value={formData.company_number}
                onChange={(e) => handleInputChange('company_number', e.target.value)}
                placeholder="123"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_complement">Complemento</Label>
              <Input
                id="company_complement"
                value={formData.company_complement}
                onChange={(e) => handleInputChange('company_complement', e.target.value)}
                placeholder="Sala 101"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_district">Bairro *</Label>
              <Input
                id="company_district"
                value={formData.company_district}
                onChange={(e) => handleInputChange('company_district', e.target.value)}
                placeholder="Centro"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_city">Cidade *</Label>
              <Input
                id="company_city"
                value={formData.company_city}
                onChange={(e) => handleInputChange('company_city', e.target.value)}
                placeholder="Belo Horizonte"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_state">Estado *</Label>
              <Input
                id="company_state"
                value={formData.company_state}
                onChange={(e) => handleInputChange('company_state', e.target.value)}
                placeholder="MG"
                maxLength={2}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_cep">CEP *</Label>
              <Input
                id="company_cep"
                value={formData.company_cep}
                onChange={(e) => handleInputChange('company_cep', e.target.value)}
                placeholder="00000-000"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Dados da Empresa
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};