import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useTenantContext } from '@/contexts/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Edit, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatBrasiliaDate } from '@/lib/date-utils';

interface Coupon {
  id: number;
  code: string;
  discount_type: 'percentage' | 'fixed' | 'progressive';
  discount_value: number;
  expires_at?: string;
  starts_at?: string | null;
  is_active: boolean;
  usage_limit?: number;
  used_count: number;
  tenant_id?: string;
  min_purchase_amount?: number | null;
  min_items_quantity?: number | null;
  progressive_tiers?: Array<{
    min_value: number;
    max_value: number | null;
    discount: number;
  }>;
}

type MinConditionType = 'none' | 'amount' | 'quantity';

export const CouponsManager = () => {
  const { tenant } = useTenantContext();
  const tenantId = tenant?.id;
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isAddingCoupon, setIsAddingCoupon] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasTenantColumn, setHasTenantColumn] = useState(true);
  const { toast } = useToast();

  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed' | 'progressive',
    discount_value: 0,
    starts_at: '',
    expires_at: '',
    usage_limit: '',
    is_active: true,
    min_condition_type: 'none' as MinConditionType,
    min_purchase_amount: '' as string,
    min_items_quantity: '' as string,
    progressive_tiers: [{ min_value: 0, max_value: 100, discount: 5 }]
  });

  useEffect(() => {
    if (tenantId) {
      loadCoupons();
    }
  }, [tenantId]);

  const loadCoupons = async () => {
    if (!tenantId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabaseTenant
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message?.includes('tenant_id')) {
          setHasTenantColumn(false);
          const { data: allData, error: allError } = await supabaseTenant.raw
            .from('coupons')
            .select('*')
            .order('created_at', { ascending: false });
          
          if (allError) throw allError;
          setCoupons((allData || []).map(coupon => ({
            ...coupon,
            progressive_tiers: coupon.progressive_tiers as any || undefined
          })) as Coupon[]);
        } else {
          throw error;
        }
      } else {
        setCoupons((data || []).map(coupon => ({
          ...coupon,
          progressive_tiers: coupon.progressive_tiers as any || undefined
        })) as Coupon[]);
      }
    } catch (error: any) {
      console.error('Erro ao carregar cupons:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error?.message || "Erro ao carregar cupons"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveCoupon = async () => {
    if (!tenantId) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Tenant não identificado"
      });
      return;
    }

    if (!newCoupon.code) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Preencha o código do cupom"
      });
      return;
    }

    if (newCoupon.discount_type === 'progressive') {
      if (!newCoupon.progressive_tiers || newCoupon.progressive_tiers.length === 0) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Adicione pelo menos uma faixa de desconto"
        });
        return;
      }
    } else if (!newCoupon.discount_value) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Preencha o valor do desconto"
      });
      return;
    }

    try {
      // Construir datas explicitamente em fuso de Brasília (-03:00)
      const startsAtIso = newCoupon.starts_at
        ? `${newCoupon.starts_at}T00:00:00-03:00`
        : null;
      const expiresAtIso = newCoupon.expires_at
        ? `${newCoupon.expires_at}T23:59:59-03:00`
        : null;

      // Condição mínima (somente para % e valor fixo); progressivo ignora
      const isProgressive = newCoupon.discount_type === 'progressive';
      const minAmount =
        !isProgressive && newCoupon.min_condition_type === 'amount' && newCoupon.min_purchase_amount
          ? parseFloat(newCoupon.min_purchase_amount)
          : null;
      const minQty =
        !isProgressive && newCoupon.min_condition_type === 'quantity' && newCoupon.min_items_quantity
          ? parseInt(newCoupon.min_items_quantity, 10)
          : null;

      const couponData: any = {
        code: newCoupon.code.toUpperCase(),
        discount_type: newCoupon.discount_type,
        discount_value: isProgressive ? 0 : newCoupon.discount_value,
        starts_at: startsAtIso,
        expires_at: expiresAtIso,
        usage_limit: newCoupon.usage_limit ? parseInt(newCoupon.usage_limit) : null,
        is_active: newCoupon.is_active,
        min_purchase_amount: minAmount,
        min_items_quantity: minQty,
        progressive_tiers: isProgressive ? newCoupon.progressive_tiers : null
      };

      if (hasTenantColumn) {
        couponData.tenant_id = tenantId;
      }

      if (editingCoupon) {
        const { error } = await supabaseTenant
          .from('coupons')
          .update(couponData)
          .eq('id', editingCoupon.id);

        if (error) throw error;
        toast({
          title: "Sucesso",
          description: "Cupom atualizado com sucesso"
        });
      } else {
        const { error } = await supabaseTenant
          .from('coupons')
          .insert(couponData);

        if (error) throw error;
        toast({
          title: "Sucesso",
          description: "Cupom criado com sucesso"
        });
      }

      resetForm();
      loadCoupons();
    } catch (error: any) {
      console.error('Erro ao salvar cupom:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao salvar cupom"
      });
    }
  };

  const deleteCoupon = async (id: number) => {
    try {
      const { error } = await supabaseTenant
        .from('coupons')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Sucesso",
        description: "Cupom excluído com sucesso"
      });
      loadCoupons();
    } catch (error: any) {
      console.error('Erro ao excluir cupom:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error?.message || "Erro ao excluir cupom"
      });
    }
  };

  const resetForm = () => {
    setNewCoupon({
      code: '',
      discount_type: 'percentage',
      discount_value: 0,
      starts_at: '',
      expires_at: '',
      usage_limit: '',
      is_active: true,
      min_condition_type: 'none',
      min_purchase_amount: '',
      min_items_quantity: '',
      progressive_tiers: [{ min_value: 0, max_value: 100, discount: 5 }]
    });
    setIsAddingCoupon(false);
    setEditingCoupon(null);
  };

  const startEditing = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    // Extrai YYYY-MM-DD preservando o dia em Brasília (-03:00)
    const isoDateBR = (iso?: string | null) => {
      if (!iso) return '';
      // Se já vier "YYYY-MM-DD..." sem timezone, usa direto
      const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!m) return '';
      // Para timestamps com hora UTC armazenados como 23:59:59-03:00,
      // a parte de data já é o dia correto em Brasília.
      return m[1];
    };
    const minType: MinConditionType =
      coupon.min_purchase_amount != null && Number(coupon.min_purchase_amount) > 0
        ? 'amount'
        : coupon.min_items_quantity != null && Number(coupon.min_items_quantity) > 0
        ? 'quantity'
        : 'none';
    setNewCoupon({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      starts_at: isoDateBR(coupon.starts_at),
      expires_at: isoDateBR(coupon.expires_at),
      usage_limit: coupon.usage_limit?.toString() || '',
      is_active: coupon.is_active,
      min_condition_type: minType,
      min_purchase_amount: coupon.min_purchase_amount != null ? String(coupon.min_purchase_amount) : '',
      min_items_quantity: coupon.min_items_quantity != null ? String(coupon.min_items_quantity) : '',
      progressive_tiers: coupon.progressive_tiers || [{ min_value: 0, max_value: 100, discount: 5 }]
    });
    setIsAddingCoupon(true);
  };

  const addTier = () => {
    const lastTier = newCoupon.progressive_tiers[newCoupon.progressive_tiers.length - 1];
    const newMinValue = lastTier.max_value || 0;
    setNewCoupon({
      ...newCoupon,
      progressive_tiers: [
        ...newCoupon.progressive_tiers,
        { min_value: newMinValue, max_value: newMinValue + 100, discount: 5 }
      ]
    });
  };

  const removeTier = (index: number) => {
    if (newCoupon.progressive_tiers.length > 1) {
      const newTiers = newCoupon.progressive_tiers.filter((_, i) => i !== index);
      setNewCoupon({ ...newCoupon, progressive_tiers: newTiers });
    }
  };

  const updateTier = (index: number, field: 'min_value' | 'max_value' | 'discount', value: number | null) => {
    const newTiers = [...newCoupon.progressive_tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setNewCoupon({ ...newCoupon, progressive_tiers: newTiers });
  };

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Selecione uma empresa para gerenciar cupons
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Gerenciar Cupons de Desconto
          <Button onClick={() => setIsAddingCoupon(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Cupom
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasTenantColumn && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              A coluna tenant_id não existe na tabela coupons. Execute a migração SQL para corrigir o isolamento por tenant.
            </AlertDescription>
          </Alert>
        )}

        {isAddingCoupon && (
          <Card className="p-4 border-2 border-dashed">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="code">Código do Cupom</Label>
                <Input
                  id="code"
                  value={newCoupon.code}
                  onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })}
                  placeholder="DESCONTO10"
                />
              </div>
              
              <div>
                <Label htmlFor="discount_type">Tipo de Desconto</Label>
                <Select value={newCoupon.discount_type} onValueChange={(value) => setNewCoupon({ ...newCoupon, discount_type: value as 'percentage' | 'fixed' | 'progressive' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                    <SelectItem value="progressive">Desconto Progressivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newCoupon.discount_type !== 'progressive' && (
                <div>
                  <Label htmlFor="discount_value">
                    Valor do Desconto {newCoupon.discount_type === 'percentage' ? '(%)' : '(R$)'}
                  </Label>
                  <Input
                    id="discount_value"
                    type="number"
                    value={newCoupon.discount_value}
                    onChange={(e) => setNewCoupon({ ...newCoupon, discount_value: parseFloat(e.target.value) || 0 })}
                    placeholder={newCoupon.discount_type === 'percentage' ? '10' : '5.00'}
                    step={newCoupon.discount_type === 'percentage' ? '1' : '0.01'}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="starts_at">Data de Início (opcional)</Label>
                <Input
                  id="starts_at"
                  type="date"
                  value={newCoupon.starts_at}
                  onChange={(e) => setNewCoupon({ ...newCoupon, starts_at: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="expires_at">Data de Fim (opcional)</Label>
                <Input
                  id="expires_at"
                  type="date"
                  value={newCoupon.expires_at}
                  onChange={(e) => setNewCoupon({ ...newCoupon, expires_at: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Expira às 23:59:59 (horário de Brasília) do dia selecionado.
                </p>
              </div>

              {newCoupon.discount_type !== 'progressive' && (
                <>
                  <div>
                    <Label htmlFor="min_condition_type">Condição mínima (opcional)</Label>
                    <Select
                      value={newCoupon.min_condition_type}
                      onValueChange={(value) =>
                        setNewCoupon({
                          ...newCoupon,
                          min_condition_type: value as MinConditionType,
                          min_purchase_amount: value === 'amount' ? newCoupon.min_purchase_amount : '',
                          min_items_quantity: value === 'quantity' ? newCoupon.min_items_quantity : '',
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem mínimo</SelectItem>
                        <SelectItem value="amount">Valor mínimo do pedido (R$)</SelectItem>
                        <SelectItem value="quantity">Quantidade mínima de peças</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newCoupon.min_condition_type === 'amount' && (
                    <div>
                      <Label htmlFor="min_purchase_amount">Valor mínimo do pedido (R$)</Label>
                      <Input
                        id="min_purchase_amount"
                        type="number"
                        step="0.01"
                        value={newCoupon.min_purchase_amount}
                        onChange={(e) => setNewCoupon({ ...newCoupon, min_purchase_amount: e.target.value })}
                        placeholder="100.00"
                      />
                    </div>
                  )}

                  {newCoupon.min_condition_type === 'quantity' && (
                    <div>
                      <Label htmlFor="min_items_quantity">Quantidade mínima de peças</Label>
                      <Input
                        id="min_items_quantity"
                        type="number"
                        step="1"
                        min="1"
                        value={newCoupon.min_items_quantity}
                        onChange={(e) => setNewCoupon({ ...newCoupon, min_items_quantity: e.target.value })}
                        placeholder="10"
                      />
                    </div>
                  )}
                </>
              )}

              <div>
                <Label htmlFor="usage_limit">Limite de Uso (opcional)</Label>
                <Input
                  id="usage_limit"
                  type="number"
                  value={newCoupon.usage_limit}
                  onChange={(e) => setNewCoupon({ ...newCoupon, usage_limit: e.target.value })}
                  placeholder="100"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={newCoupon.is_active}
                  onCheckedChange={(checked) => setNewCoupon({ ...newCoupon, is_active: checked })}
                />
                <Label htmlFor="is_active">Cupom Ativo</Label>
              </div>
            </div>

            {newCoupon.discount_type === 'progressive' && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Faixas de Desconto</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addTier}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Faixa
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Quanto mais o cliente compra, maior o desconto aplicado
                </p>
                {newCoupon.progressive_tiers.map((tier, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 border rounded">
                    <div className="col-span-3">
                      <Label className="text-xs">Valor Mínimo (R$)</Label>
                      <Input
                        type="number"
                        value={tier.min_value}
                        onChange={(e) => updateTier(index, 'min_value', parseFloat(e.target.value) || 0)}
                        step="0.01"
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Valor Máximo (R$)</Label>
                      <Input
                        type="number"
                        value={tier.max_value || ''}
                        onChange={(e) => updateTier(index, 'max_value', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="Sem limite"
                        step="0.01"
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Desconto (%)</Label>
                      <Input
                        type="number"
                        value={tier.discount}
                        onChange={(e) => updateTier(index, 'discount', parseFloat(e.target.value) || 0)}
                        step="1"
                        max="100"
                      />
                    </div>
                    <div className="col-span-3">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeTier(index)}
                        disabled={newCoupon.progressive_tiers.length === 1}
                        className="w-full"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-3">
              O desconto incide somente sobre o valor dos produtos. O frete nunca é descontado.
            </p>

            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button onClick={saveCoupon}>
                {editingCoupon ? 'Atualizar' : 'Criar'} Cupom
              </Button>
            </div>
          </Card>
        )}

        <div className="space-y-2">
          {loading ? (
            <p>Carregando cupons...</p>
          ) : coupons.length === 0 ? (
            <p className="text-muted-foreground">Nenhum cupom cadastrado</p>
          ) : (
            coupons.map((coupon) => (
              <div key={coupon.id} className="flex items-center justify-between p-3 border rounded">
                <div className="flex items-center space-x-4">
                  <Badge variant={coupon.is_active ? "default" : "secondary"}>
                    {coupon.code}
                  </Badge>
                  <div>
                    {coupon.discount_type === 'progressive' ? (
                      <>
                        <span className="font-medium">Desconto Progressivo</span>
                        <div className="text-sm text-muted-foreground mt-1 space-y-1">
                          {coupon.progressive_tiers?.map((tier, idx) => (
                            <div key={idx}>
                              • {formatCurrency(tier.min_value)} 
                              {tier.max_value ? ` - ${formatCurrency(tier.max_value)}` : '+'}: 
                              <span className="font-semibold text-primary"> {tier.discount}% off</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <span className="font-medium">
                        {coupon.discount_type === 'percentage' 
                          ? `${coupon.discount_value}%` 
                          : formatCurrency(coupon.discount_value)} de desconto
                      </span>
                    )}
                    {coupon.starts_at && (
                      <p className="text-sm text-muted-foreground">
                        Início: {formatBrasiliaDate(coupon.starts_at)}
                      </p>
                    )}
                    {coupon.expires_at && (
                      <p className="text-sm text-muted-foreground">
                        Fim: {formatBrasiliaDate(coupon.expires_at)} (23:59 Brasília)
                      </p>
                    )}
                    {coupon.min_purchase_amount != null && Number(coupon.min_purchase_amount) > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Mínimo: {formatCurrency(Number(coupon.min_purchase_amount))} em produtos
                      </p>
                    )}
                    {coupon.min_items_quantity != null && Number(coupon.min_items_quantity) > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Mínimo: {coupon.min_items_quantity} peças
                      </p>
                    )}
                    {coupon.usage_limit && (
                      <p className="text-sm text-muted-foreground">
                        Usos: {coupon.used_count}/{coupon.usage_limit}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEditing(coupon)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteCoupon(coupon.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};