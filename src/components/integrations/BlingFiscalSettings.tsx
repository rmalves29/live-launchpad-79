import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  FileText, 
  Save, 
  Loader2,
  Info,
  Building2
} from 'lucide-react';

interface BlingFiscalSettingsProps {
  tenantId: string;
}

interface FiscalData {
  store_state: string | null;
  default_ncm: string | null;
  default_cfop_same_state: string | null;
  default_cfop_other_state: string | null;
  default_ipi: number | null;
  default_icms_situacao: string | null;
  default_icms_origem: string | null;
  default_pis_cofins: string | null;
}

const ESTADOS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const ICMS_SITUACOES = [
  { value: '102', label: '102 - Tributada sem permissão de crédito' },
  { value: '103', label: '103 - Isenção do ICMS para faixa de receita bruta' },
  { value: '300', label: '300 - Imune' },
  { value: '400', label: '400 - Não tributada' },
  { value: '500', label: '500 - ICMS cobrado anteriormente por ST' },
  { value: '900', label: '900 - Outros' },
];

const ICMS_ORIGENS = [
  { value: '0', label: '0 - Nacional' },
  { value: '1', label: '1 - Estrangeira - importação direta' },
  { value: '2', label: '2 - Estrangeira - adquirida no mercado interno' },
  { value: '3', label: '3 - Nacional com mais de 40% conteúdo estrangeiro' },
  { value: '4', label: '4 - Nacional (processos produtivos básicos)' },
  { value: '5', label: '5 - Nacional com menos de 40% conteúdo estrangeiro' },
  { value: '6', label: '6 - Estrangeira - importação direta, sem similar' },
  { value: '7', label: '7 - Estrangeira - mercado interno, sem similar' },
  { value: '8', label: '8 - Nacional, Conteúdo Importação > 70%' },
];

const PIS_COFINS_SITUACOES = [
  { value: '01', label: '01 - Tributável - Base = Valor da Operação' },
  { value: '04', label: '04 - Monofásica - Revenda Alíquota Zero' },
  { value: '06', label: '06 - Tributável Alíquota Zero' },
  { value: '07', label: '07 - Isenta da Contribuição' },
  { value: '08', label: '08 - Sem Incidência da Contribuição' },
  { value: '49', label: '49 - Outras Operações de Saída' },
  { value: '99', label: '99 - Outras Operações' },
];

export default function BlingFiscalSettings({ tenantId }: BlingFiscalSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fiscalData, setFiscalData] = useState<FiscalData>({
    store_state: null,
    default_ncm: null,
    default_cfop_same_state: null,
    default_cfop_other_state: null,
    default_ipi: null,
    default_icms_situacao: null,
    default_icms_origem: null,
    default_pis_cofins: null,
  });

  useEffect(() => {
    loadFiscalData();
  }, [tenantId]);

  const loadFiscalData = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('integration_bling')
        .select('store_state, default_ncm, default_cfop_same_state, default_cfop_other_state, default_ipi, default_icms_situacao, default_icms_origem, default_pis_cofins')
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No data found - columns might not exist yet
          console.log('[BlingFiscalSettings] No data found, using defaults');
        } else {
          throw error;
        }
      }

      if (data) {
        setFiscalData({
          store_state: data.store_state || null,
          default_ncm: data.default_ncm || null,
          default_cfop_same_state: data.default_cfop_same_state || null,
          default_cfop_other_state: data.default_cfop_other_state || null,
          default_ipi: data.default_ipi || null,
          default_icms_situacao: data.default_icms_situacao || null,
          default_icms_origem: data.default_icms_origem || null,
          default_pis_cofins: data.default_pis_cofins || null,
        });
      }
    } catch (error) {
      console.error('[BlingFiscalSettings] Error loading fiscal data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('integration_bling')
        .update({
          store_state: fiscalData.store_state,
          default_ncm: fiscalData.default_ncm,
          default_cfop_same_state: fiscalData.default_cfop_same_state,
          default_cfop_other_state: fiscalData.default_cfop_other_state,
          default_ipi: fiscalData.default_ipi,
          default_icms_situacao: fiscalData.default_icms_situacao,
          default_icms_origem: fiscalData.default_icms_origem,
          default_pis_cofins: fiscalData.default_pis_cofins,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId);

      if (error) throw error;

      toast.success('Dados fiscais salvos com sucesso!');
    } catch (error: any) {
      console.error('[BlingFiscalSettings] Error saving:', error);
      toast.error(error.message || 'Erro ao salvar dados fiscais');
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof FiscalData, value: string | number | null) => {
    setFiscalData(prev => ({
      ...prev,
      [field]: value === '' ? null : value
    }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando dados fiscais...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Dados Fiscais
        </CardTitle>
        <CardDescription>
          Configure os dados fiscais padrão que serão enviados com os pedidos para o Bling
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Estado da Loja */}
        <div className="p-4 border rounded-lg space-y-4 bg-muted/30">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h4 className="font-medium">Estado da Loja</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Usado para determinar automaticamente o CFOP correto (mesmo estado ou outro estado)
          </p>
          <div className="w-[200px]">
            <Label htmlFor="store_state">UF da Loja</Label>
            <Select
              value={fiscalData.store_state || ''}
              onValueChange={(value) => updateField('store_state', value)}
            >
              <SelectTrigger id="store_state">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_BRASIL.map(uf => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* NCM e CFOP */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="default_ncm">NCM Padrão</Label>
            <Input
              id="default_ncm"
              placeholder="Ex: 62052000"
              value={fiscalData.default_ncm || ''}
              onChange={(e) => updateField('default_ncm', e.target.value)}
              maxLength={8}
            />
            <p className="text-xs text-muted-foreground">8 dígitos</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_cfop_same_state">CFOP Mesmo Estado</Label>
            <Input
              id="default_cfop_same_state"
              placeholder="Ex: 5102"
              value={fiscalData.default_cfop_same_state || ''}
              onChange={(e) => updateField('default_cfop_same_state', e.target.value)}
              maxLength={4}
            />
            <p className="text-xs text-muted-foreground">5xxx</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_cfop_other_state">CFOP Outro Estado</Label>
            <Input
              id="default_cfop_other_state"
              placeholder="Ex: 6102"
              value={fiscalData.default_cfop_other_state || ''}
              onChange={(e) => updateField('default_cfop_other_state', e.target.value)}
              maxLength={4}
            />
            <p className="text-xs text-muted-foreground">6xxx</p>
          </div>
        </div>

        {/* IPI */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="default_ipi">Alíquota IPI (%)</Label>
            <Input
              id="default_ipi"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="Ex: 0.00"
              value={fiscalData.default_ipi ?? ''}
              onChange={(e) => updateField('default_ipi', e.target.value ? parseFloat(e.target.value) : null)}
            />
          </div>
        </div>

        {/* ICMS */}
        <div className="p-4 border rounded-lg space-y-4">
          <h4 className="font-medium">ICMS</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="default_icms_situacao">Situação Tributária</Label>
              <Select
                value={fiscalData.default_icms_situacao || ''}
                onValueChange={(value) => updateField('default_icms_situacao', value)}
              >
                <SelectTrigger id="default_icms_situacao">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {ICMS_SITUACOES.map(item => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_icms_origem">Origem da Mercadoria</Label>
              <Select
                value={fiscalData.default_icms_origem || ''}
                onValueChange={(value) => updateField('default_icms_origem', value)}
              >
                <SelectTrigger id="default_icms_origem">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {ICMS_ORIGENS.map(item => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* PIS/COFINS */}
        <div className="space-y-2">
          <Label htmlFor="default_pis_cofins">Situação Tributária PIS/COFINS</Label>
          <Select
            value={fiscalData.default_pis_cofins || ''}
            onValueChange={(value) => updateField('default_pis_cofins', value)}
          >
            <SelectTrigger id="default_pis_cofins" className="w-full md:w-[400px]">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {PIS_COFINS_SITUACOES.map(item => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>CFOP Automático:</strong> O sistema compara o estado do cliente com o estado da loja.
            Se forem iguais, usa o CFOP de "mesmo estado" (5xxx). Se diferentes, usa o CFOP de "outro estado" (6xxx).
          </AlertDescription>
        </Alert>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Dados Fiscais
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
