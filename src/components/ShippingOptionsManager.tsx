import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, Truck, Package, Info, Loader2, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/utils';

// Tipos de cobertura geográfica
type CoverageType = 'national' | 'states' | 'city' | 'capital' | 'interior';

interface ShippingOption {
  id: string;
  name: string;
  description: string | null;
  delivery_days: number;
  price: number;
  is_active: boolean;
  carrier_service_id: number | null;
  carrier_service_name: string | null;
  coverage_type: CoverageType;
  coverage_states: string[] | null;
  coverage_city: string | null;
  coverage_state: string | null;
  free_shipping_min_order: number | null;
}

interface CarrierService {
  id: number;
  name: string;
  company: string;
}

// Lista de estados brasileiros
const BRAZILIAN_STATES = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
];

// Descrição dos tipos de cobertura
const COVERAGE_LABELS: Record<CoverageType, string> = {
  national: 'Nacional (Brasil)',
  states: 'Estados específicos',
  city: 'Cidade específica',
  capital: 'Capital do estado',
  interior: 'Interior do estado',
};

// Serviços de transportadora do Melhor Envio
const MELHOR_ENVIO_SERVICES: CarrierService[] = [
  { id: 1, name: 'PAC', company: 'Correios' },
  { id: 2, name: 'SEDEX', company: 'Correios' },
  { id: 3, name: '.Package', company: 'Jadlog' },
  { id: 4, name: '.Com', company: 'Jadlog' },
  { id: 17, name: 'Expresso', company: 'AZUL Cargo' },
];

// Serviços da Mandae
const MANDAE_SERVICES: CarrierService[] = [
  { id: 101, name: 'Econômico', company: 'Mandae' },
  { id: 102, name: 'Expresso', company: 'Mandae' },
];

export const ShippingOptionsManager = () => {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [orderMergeDays, setOrderMergeDays] = useState<number>(3);
  const [savingMergeDays, setSavingMergeDays] = useState(false);
  const [tableExists, setTableExists] = useState(false);
  const [activeIntegration, setActiveIntegration] = useState<string | null>(null);
  const [availableCarriers, setAvailableCarriers] = useState<CarrierService[]>([]);
  
  // Form state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<ShippingOption | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    delivery_days: 5,
    price: 0,
    is_active: true,
    carrier_service_id: null as number | null,
    carrier_service_name: null as string | null,
    coverage_type: 'national' as CoverageType,
    coverage_states: [] as string[],
    coverage_city: '',
    coverage_state: '',
    free_shipping_min_order: null as number | null
  });

  const loadConfig = async () => {
    if (!tenantId) return;
    
    setLoading(true);
    try {
      // Buscar integração de frete ativa
      const { data: integrations, error: intError } = await supabase
        .from('shipping_integrations')
        .select('provider, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (!intError && integrations && integrations.length > 0) {
        // Priorizar Mandae se estiver ativo
        const mandae = integrations.find(i => i.provider === 'mandae');
        const melhorEnvio = integrations.find(i => i.provider === 'melhor_envio');
        
        if (mandae) {
          setActiveIntegration('mandae');
          setAvailableCarriers(MANDAE_SERVICES);
        } else if (melhorEnvio) {
          setActiveIntegration('melhor_envio');
          setAvailableCarriers(MELHOR_ENVIO_SERVICES);
        }
      }

      // Tentar carregar opções de frete do banco
      const { data: shippingOptions, error: shippingError } = await supabase
        .from('custom_shipping_options' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });

      if (!shippingError && shippingOptions) {
        setTableExists(true);
        setOptions(shippingOptions.map((opt: any) => ({
          id: opt.id,
          name: opt.name,
          description: opt.description || null,
          delivery_days: opt.delivery_days,
          price: Number(opt.price),
          is_active: opt.is_active,
          carrier_service_id: opt.carrier_service_id || null,
          carrier_service_name: opt.carrier_service_name || null,
          coverage_type: opt.coverage_type || 'national',
          coverage_states: opt.coverage_states || null,
          coverage_city: opt.coverage_city || null,
          coverage_state: opt.coverage_state || null,
          free_shipping_min_order: opt.free_shipping_min_order != null ? Number(opt.free_shipping_min_order) : null
        })));
      } else {
        console.log('Tabela custom_shipping_options não existe ou erro:', shippingError);
        setTableExists(false);
      }

      // Carregar order_merge_days do tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (!tenantError && tenantData) {
        // Verificar se a coluna existe
        if ('order_merge_days' in tenantData) {
          setOrderMergeDays((tenantData as any).order_merge_days ?? 3);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configurações de frete:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [tenantId]);

  const handleOpenDialog = (option?: ShippingOption) => {
    if (option) {
      setEditingOption(option);
      setFormData({
        name: option.name,
        description: option.description || '',
        delivery_days: option.delivery_days,
        price: option.price,
        is_active: option.is_active,
        carrier_service_id: option.carrier_service_id,
        carrier_service_name: option.carrier_service_name,
        coverage_type: option.coverage_type || 'national',
        coverage_states: option.coverage_states || [],
        coverage_city: option.coverage_city || '',
        coverage_state: option.coverage_state || '',
        free_shipping_min_order: option.free_shipping_min_order ?? null
      });
    } else {
      setEditingOption(null);
      setFormData({
        name: '',
        description: '',
        delivery_days: 5,
        price: 0,
        is_active: true,
        carrier_service_id: null,
        carrier_service_name: null,
        coverage_type: 'national',
        coverage_states: [],
        coverage_city: '',
        coverage_state: '',
        free_shipping_min_order: null
      });
    }
    setIsDialogOpen(true);
  };

  const handleCarrierChange = (value: string) => {
    if (value === 'none') {
      setFormData(prev => ({ 
        ...prev, 
        carrier_service_id: null, 
        carrier_service_name: null 
      }));
    } else {
      const carrier = availableCarriers.find(c => c.id === parseInt(value));
      if (carrier) {
        setFormData(prev => ({ 
          ...prev, 
          carrier_service_id: carrier.id, 
          carrier_service_name: `${carrier.company} - ${carrier.name}` 
        }));
      }
    }
  };

  const handleSave = async () => {
    if (!tenantId) return;
    if (!formData.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Informe o nome da opção de frete',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      if (editingOption) {
        // Atualizar no banco
        const { error } = await supabase
          .from('custom_shipping_options' as any)
          .update({
            name: formData.name,
            description: formData.description || null,
            delivery_days: formData.delivery_days,
            price: formData.price,
            is_active: formData.is_active,
            carrier_service_id: formData.carrier_service_id,
            carrier_service_name: formData.carrier_service_name,
            coverage_type: formData.coverage_type,
            coverage_states: formData.coverage_states.length > 0 ? formData.coverage_states : null,
            coverage_city: formData.coverage_city || null,
            coverage_state: formData.coverage_state || null,
            free_shipping_min_order: formData.price === 0 ? (formData.free_shipping_min_order || null) : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingOption.id)
          .eq('tenant_id', tenantId);

        if (error) throw error;
        
        setOptions(prev => prev.map(opt => 
          opt.id === editingOption.id 
            ? { ...opt, ...formData, coverage_states: formData.coverage_states.length > 0 ? formData.coverage_states : null }
            : opt
        ));
        toast({ title: 'Sucesso', description: 'Opção de frete atualizada' });
      } else {
        // Criar no banco
        const { data, error } = await supabase
          .from('custom_shipping_options' as any)
          .insert({
            tenant_id: tenantId,
            name: formData.name,
            description: formData.description || null,
            delivery_days: formData.delivery_days,
            price: formData.price,
            is_active: formData.is_active,
            carrier_service_id: formData.carrier_service_id,
            carrier_service_name: formData.carrier_service_name,
            coverage_type: formData.coverage_type,
            coverage_states: formData.coverage_states.length > 0 ? formData.coverage_states : null,
            coverage_city: formData.coverage_city || null,
            coverage_state: formData.coverage_state || null,
            free_shipping_min_order: formData.price === 0 ? (formData.free_shipping_min_order || null) : null
          })
          .select()
          .single();

        if (error) throw error;
        
        const newOption: ShippingOption = {
          id: data.id,
          name: data.name,
          description: data.description || null,
          delivery_days: data.delivery_days,
          price: Number(data.price),
          is_active: data.is_active,
          carrier_service_id: data.carrier_service_id || null,
          carrier_service_name: data.carrier_service_name || null,
          coverage_type: data.coverage_type || 'national',
          coverage_states: data.coverage_states || null,
          coverage_city: data.coverage_city || null,
          coverage_state: data.coverage_state || null,
          free_shipping_min_order: data.free_shipping_min_order != null ? Number(data.free_shipping_min_order) : null
        };
        setOptions(prev => [...prev, newOption]);
        toast({ title: 'Sucesso', description: 'Opção de frete criada' });
      }

      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('Erro ao salvar opção de frete:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao salvar opção de frete. Verifique se a tabela foi criada no banco.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (option: ShippingOption) => {
    if (!confirm(`Deseja realmente excluir a opção "${option.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('custom_shipping_options' as any)
        .delete()
        .eq('id', option.id)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      setOptions(prev => prev.filter(opt => opt.id !== option.id));
      toast({ title: 'Sucesso', description: 'Opção de frete excluída' });
    } catch (error: any) {
      console.error('Erro ao excluir opção de frete:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao excluir opção de frete',
        variant: 'destructive'
      });
    }
  };

  const handleToggleActive = async (option: ShippingOption) => {
    try {
      const { error } = await supabase
        .from('custom_shipping_options' as any)
        .update({ 
          is_active: !option.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', option.id)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      setOptions(prev => prev.map(opt => 
        opt.id === option.id 
          ? { ...opt, is_active: !opt.is_active }
          : opt
      ));
    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao atualizar status',
        variant: 'destructive'
      });
    }
  };

  const handleSaveMergeDays = async () => {
    if (!tenantId) return;
    
    setSavingMergeDays(true);
    try {
      // Tentar atualizar no banco
      const { error } = await supabase
        .from('tenants')
        .update({ 
          order_merge_days: orderMergeDays,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', tenantId);

      if (error) {
        // Se a coluna não existe, mostrar erro amigável
        if (error.message.includes('order_merge_days')) {
          throw new Error('Coluna order_merge_days ainda não existe no banco. Execute a migração SQL.');
        }
        throw error;
      }

      toast({ title: 'Sucesso', description: 'Configuração de juntar pedidos atualizada' });
    } catch (error: any) {
      console.error('Erro ao salvar configuração:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao salvar configuração',
        variant: 'destructive'
      });
    } finally {
      setSavingMergeDays(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Carregando...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerta se tabela não existe */}
      {!tableExists && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Tabela não encontrada:</strong> A tabela <code>custom_shipping_options</code> precisa ser criada no banco de dados. 
            Execute a migração SQL no Supabase para habilitar esta funcionalidade.
          </AlertDescription>
        </Alert>
      )}

      {/* Card: Opções de Frete Customizadas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Opções de Frete Customizadas
              </CardTitle>
              <CardDescription>
                Crie opções de frete que aparecerão no checkout junto com as opções da integração Melhor Envio
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} disabled={!tableExists}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Opção
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingOption ? 'Editar Opção de Frete' : 'Nova Opção de Frete'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome da Opção</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Frete Expresso, Entrega Local..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição (exibida abaixo do nome no checkout)</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Ex: Envio - 2 dias para postagem + 3 dias úteis"
                    />
                    <p className="text-xs text-muted-foreground">
                      Se vazio, será gerado automaticamente com base no prazo de dias.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="delivery_days">Prazo (dias)</Label>
                      <Input
                        id="delivery_days"
                        type="number"
                        min={0}
                        value={formData.delivery_days}
                        onChange={(e) => setFormData(prev => ({ ...prev, delivery_days: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="price">Valor (R$)</Label>
                      <Input
                        id="price"
                        type="number"
                        min={0}
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>

                  {/* Campo de pedido mínimo para frete grátis */}
                  <div className="space-y-2">
                    <Label htmlFor="free_shipping_min_order">
                      Pedido mínimo para liberar frete grátis (R$)
                    </Label>
                    <Input
                      id="free_shipping_min_order"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Ex: 99.00 — deixe em branco para sempre disponível"
                      disabled={formData.price > 0}
                      value={formData.free_shipping_min_order ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => ({
                          ...prev,
                          free_shipping_min_order: val === '' ? null : parseFloat(val) || null
                        }));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.price > 0
                        ? 'Disponível somente quando o Valor estiver em R$ 0,00 (frete grátis).'
                        : 'Se preenchido, este frete grátis só aparecerá no checkout quando o pedido atingir este valor (ex.: 99,00).'}
                    </p>
                  </div>
                  
                  {/* Carrier selection */}
                  <div className="space-y-2">
                    <Label htmlFor="carrier">Transportadora para Etiqueta</Label>
                    {activeIntegration ? (
                      <Select 
                        value={formData.carrier_service_id?.toString() || 'none'} 
                        onValueChange={handleCarrierChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a transportadora" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma (retirada local)</SelectItem>
                          {availableCarriers.map((carrier) => (
                            <SelectItem key={carrier.id} value={carrier.id.toString()}>
                              {carrier.company} - {carrier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          Configure uma integração de frete (Melhor Envio ou Mandae) para vincular transportadoras.
                        </AlertDescription>
                      </Alert>
                    )}
                    <p className="text-xs text-muted-foreground">
                      A transportadora vinculada será usada automaticamente na geração de etiquetas.
                    </p>
                  </div>

                  {/* Cobertura geográfica */}
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Cobertura Geográfica
                    </Label>
                    <Select 
                      value={formData.coverage_type} 
                      onValueChange={(value: CoverageType) => setFormData(prev => ({ 
                        ...prev, 
                        coverage_type: value,
                        coverage_states: value === 'states' ? prev.coverage_states : [],
                        coverage_city: value === 'city' ? prev.coverage_city : '',
                        coverage_state: ['city', 'capital', 'interior'].includes(value) ? prev.coverage_state : ''
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a cobertura" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="national">🇧🇷 Nacional (Brasil)</SelectItem>
                        <SelectItem value="states">📍 Estados específicos</SelectItem>
                        <SelectItem value="city">🏙️ Cidade específica</SelectItem>
                        <SelectItem value="capital">🏛️ Capital do estado</SelectItem>
                        <SelectItem value="interior">🌾 Interior do estado</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Seleção de estados */}
                    {formData.coverage_type === 'states' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Selecione os estados:</Label>
                        <div className="grid grid-cols-4 gap-1 max-h-40 overflow-y-auto border rounded p-2">
                          {BRAZILIAN_STATES.map((state) => (
                            <label key={state.uf} className="flex items-center gap-1 text-xs cursor-pointer hover:bg-muted p-1 rounded">
                              <input
                                type="checkbox"
                                checked={formData.coverage_states.includes(state.uf)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData(prev => ({ ...prev, coverage_states: [...prev.coverage_states, state.uf] }));
                                  } else {
                                    setFormData(prev => ({ ...prev, coverage_states: prev.coverage_states.filter(s => s !== state.uf) }));
                                  }
                                }}
                                className="w-3 h-3"
                              />
                              {state.uf}
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formData.coverage_states.length} estado(s) selecionado(s)
                        </p>
                      </div>
                    )}

                    {/* Cidade específica */}
                    {formData.coverage_type === 'city' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Estado:</Label>
                          <Select 
                            value={formData.coverage_state} 
                            onValueChange={(value) => setFormData(prev => ({ ...prev, coverage_state: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="UF" />
                            </SelectTrigger>
                            <SelectContent>
                              {BRAZILIAN_STATES.map((state) => (
                                <SelectItem key={state.uf} value={state.uf}>{state.uf}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Cidade:</Label>
                          <Input
                            value={formData.coverage_city}
                            onChange={(e) => setFormData(prev => ({ ...prev, coverage_city: e.target.value }))}
                            placeholder="Nome da cidade"
                          />
                        </div>
                      </div>
                    )}

                    {/* Capital ou Interior */}
                    {(formData.coverage_type === 'capital' || formData.coverage_type === 'interior') && (
                      <div className="space-y-1">
                        <Label className="text-xs">Estado:</Label>
                        <Select 
                          value={formData.coverage_state} 
                          onValueChange={(value) => setFormData(prev => ({ ...prev, coverage_state: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o estado" />
                          </SelectTrigger>
                          <SelectContent>
                            {BRAZILIAN_STATES.map((state) => (
                              <SelectItem key={state.uf} value={state.uf}>{state.name} ({state.uf})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {formData.coverage_type === 'capital' 
                            ? 'Apenas clientes da capital serão elegíveis' 
                            : 'Apenas clientes de cidades do interior serão elegíveis'}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                    />
                    <Label htmlFor="is_active">Ativo</Label>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingOption ? 'Salvar' : 'Criar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {options.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Nenhuma opção de frete customizada cadastrada. Crie uma nova opção para que apareça no checkout.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Cobertura</TableHead>
                  <TableHead>Transportadora</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {options.map((option) => (
                  <TableRow key={option.id}>
                    <TableCell className="font-medium">{option.name}</TableCell>
                    <TableCell>{option.delivery_days} {option.delivery_days === 1 ? 'dia' : 'dias'}</TableCell>
                    <TableCell>{formatCurrency(option.price)}</TableCell>
                    <TableCell>
                      <span className="text-xs">
                        {option.coverage_type === 'national' && '🇧🇷 Nacional'}
                        {option.coverage_type === 'states' && `📍 ${option.coverage_states?.join(', ') || 'Estados'}`}
                        {option.coverage_type === 'city' && `🏙️ ${option.coverage_city || 'Cidade'}-${option.coverage_state || ''}`}
                        {option.coverage_type === 'capital' && `🏛️ Capital ${option.coverage_state || ''}`}
                        {option.coverage_type === 'interior' && `🌾 Interior ${option.coverage_state || ''}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      {option.carrier_service_name ? (
                        <span className="text-sm text-primary">{option.carrier_service_name}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Nenhuma</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={option.is_active}
                        onCheckedChange={() => handleToggleActive(option)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(option)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(option)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Card: Configuração Juntar Pedidos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Juntar Pedidos no Mesmo Frete
          </CardTitle>
          <CardDescription>
            Configure o prazo máximo para que clientes possam juntar pedidos em um único frete.
            Quando um cliente já tem um pedido <strong>pago</strong> recente, ao fazer um novo pedido aparecerá a opção de enviar tudo junto (frete grátis no novo pedido).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Como funciona:</strong> Se um cliente tem um pedido <strong>pago</strong> dentro do prazo configurado, 
                ao finalizar um novo pedido aparecerá a opção "Juntar com pedido anterior" que isenta o frete 
                e adiciona automaticamente a observação "Cliente Possui outro Pedido".
              </AlertDescription>
            </Alert>
            
            <div className="flex items-center gap-4">
              <div className="space-y-2 flex-1 max-w-xs">
                <Label htmlFor="merge_days">Prazo máximo entre pedidos</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="merge_days"
                    type="number"
                    min={0}
                    max={30}
                    value={orderMergeDays}
                    onChange={(e) => setOrderMergeDays(parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">dias</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  0 = desabilitado. Pedidos feitos com até {orderMergeDays} dias de diferença podem ser juntados.
                </p>
              </div>
              <Button onClick={handleSaveMergeDays} disabled={savingMergeDays}>
                {savingMergeDays && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ShippingOptionsManager;
