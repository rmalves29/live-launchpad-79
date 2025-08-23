import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Coupon {
  id: number;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  expires_at?: string;
  is_active: boolean;
  usage_limit?: number;
  used_count: number;
}

export const CouponsManager = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isAddingCoupon, setIsAddingCoupon] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 0,
    expires_at: '',
    usage_limit: '',
    is_active: true
  });

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCoupons((data || []) as Coupon[]);
    } catch (error) {
      console.error('Erro ao carregar cupons:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao carregar cupons"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveCoupon = async () => {
    if (!newCoupon.code || !newCoupon.discount_value) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Preencha todos os campos obrigatórios"
      });
      return;
    }

    try {
      const couponData = {
        code: newCoupon.code.toUpperCase(),
        discount_type: newCoupon.discount_type,
        discount_value: newCoupon.discount_value,
        expires_at: newCoupon.expires_at || null,
        usage_limit: newCoupon.usage_limit ? parseInt(newCoupon.usage_limit) : null,
        is_active: newCoupon.is_active
      };

      if (editingCoupon) {
        const { error } = await supabase
          .from('coupons')
          .update(couponData)
          .eq('id', editingCoupon.id);

        if (error) throw error;
        toast({
          title: "Sucesso",
          description: "Cupom atualizado com sucesso"
        });
      } else {
        const { error } = await supabase
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
      const { error } = await supabase
        .from('coupons')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Sucesso",
        description: "Cupom excluído com sucesso"
      });
      loadCoupons();
    } catch (error) {
      console.error('Erro ao excluir cupom:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao excluir cupom"
      });
    }
  };

  const resetForm = () => {
    setNewCoupon({
      code: '',
      discount_type: 'percentage',
      discount_value: 0,
      expires_at: '',
      usage_limit: '',
      is_active: true
    });
    setIsAddingCoupon(false);
    setEditingCoupon(null);
  };

  const startEditing = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setNewCoupon({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      expires_at: coupon.expires_at ? coupon.expires_at.split('T')[0] : '',
      usage_limit: coupon.usage_limit?.toString() || '',
      is_active: coupon.is_active
    });
    setIsAddingCoupon(true);
  };

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
                <Select value={newCoupon.discount_type} onValueChange={(value) => setNewCoupon({ ...newCoupon, discount_type: value as 'percentage' | 'fixed' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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

              <div>
                <Label htmlFor="expires_at">Data de Expiração (opcional)</Label>
                <Input
                  id="expires_at"
                  type="date"
                  value={newCoupon.expires_at}
                  onChange={(e) => setNewCoupon({ ...newCoupon, expires_at: e.target.value })}
                />
              </div>

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
                    <span className="font-medium">
                      {coupon.discount_type === 'percentage' 
                        ? `${coupon.discount_value}%` 
                        : `R$ ${coupon.discount_value.toFixed(2)}`} de desconto
                    </span>
                    {coupon.expires_at && (
                      <p className="text-sm text-muted-foreground">
                        Expira em: {new Date(coupon.expires_at).toLocaleDateString('pt-BR')}
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