import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Truck, Package, Info, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/utils';

interface ShippingOption {
  id: string;
  name: string;
  delivery_days: number;
  price: number;
  is_active: boolean;
}

export const ShippingOptionsManager = () => {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [orderMergeDays, setOrderMergeDays] = useState<number>(3);
  const [savingMergeDays, setSavingMergeDays] = useState(false);
  const [tableExists, setTableExists] = useState(false);
  
  // Form state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<ShippingOption | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    delivery_days: 5,
    price: 0,
    is_active: true
  });

  const loadConfig = async () => {
    if (!tenantId) return;
    
    setLoading(true);
    try {
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
          delivery_days: opt.delivery_days,
          price: Number(opt.price),
          is_active: opt.is_active
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
        delivery_days: option.delivery_days,
        price: option.price,
        is_active: option.is_active
      });
    } else {
      setEditingOption(null);
      setFormData({
        name: '',
        delivery_days: 5,
        price: 0,
        is_active: true
      });
    }
    setIsDialogOpen(true);
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
            delivery_days: formData.delivery_days,
            price: formData.price,
            is_active: formData.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingOption.id)
          .eq('tenant_id', tenantId);

        if (error) throw error;
        
        setOptions(prev => prev.map(opt => 
          opt.id === editingOption.id 
            ? { ...opt, ...formData }
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
            delivery_days: formData.delivery_days,
            price: formData.price,
            is_active: formData.is_active
          })
          .select()
          .single();

        if (error) throw error;
        
        const newOption: ShippingOption = {
          id: data.id,
          name: data.name,
          delivery_days: data.delivery_days,
          price: Number(data.price),
          is_active: data.is_active
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
