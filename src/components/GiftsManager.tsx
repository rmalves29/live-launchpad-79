import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Edit, Gift } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

interface Gift {
  id: number;
  name: string;
  description?: string;
  minimum_purchase_amount: number;
  is_active: boolean;
}

export const GiftsManager = () => {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [isAddingGift, setIsAddingGift] = useState(false);
  const [editingGift, setEditingGift] = useState<Gift | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [newGift, setNewGift] = useState({
    name: '',
    description: '',
    minimum_purchase_amount: 0,
    is_active: true
  });

  useEffect(() => {
    loadGifts();
  }, []);

  const loadGifts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('gifts')
        .select('*')
        .order('minimum_purchase_amount', { ascending: true });

      if (error) throw error;
      setGifts((data || []) as Gift[]);
    } catch (error: any) {
      console.error('Erro ao carregar brindes:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error?.message || "Erro ao carregar brindes"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveGift = async () => {
    if (!newGift.name || !newGift.minimum_purchase_amount) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Preencha todos os campos obrigatórios"
      });
      return;
    }

    try {
      const giftData = {
        name: newGift.name,
        description: newGift.description || null,
        minimum_purchase_amount: newGift.minimum_purchase_amount,
        is_active: newGift.is_active
      };

      if (editingGift) {
        const { error } = await supabase
          .from('gifts')
          .update(giftData)
          .eq('id', editingGift.id);

        if (error) throw error;
        toast({
          title: "Sucesso",
          description: "Brinde atualizado com sucesso"
        });
      } else {
        const { error } = await supabase
          .from('gifts')
          .insert(giftData);

        if (error) throw error;
        toast({
          title: "Sucesso",
          description: "Brinde criado com sucesso"
        });
      }

      resetForm();
      loadGifts();
    } catch (error: any) {
      console.error('Erro ao salvar brinde:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao salvar brinde"
      });
    }
  };

  const deleteGift = async (id: number) => {
    try {
      const { error } = await supabase
        .from('gifts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Sucesso",
        description: "Brinde excluído com sucesso"
      });
      loadGifts();
    } catch (error: any) {
      console.error('Erro ao excluir brinde:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error?.message || "Erro ao excluir brinde"
      });
    }
  };

  const resetForm = () => {
    setNewGift({
      name: '',
      description: '',
      minimum_purchase_amount: 0,
      is_active: true
    });
    setIsAddingGift(false);
    setEditingGift(null);
  };

  const startEditing = (gift: Gift) => {
    setEditingGift(gift);
    setNewGift({
      name: gift.name,
      description: gift.description || '',
      minimum_purchase_amount: gift.minimum_purchase_amount,
      is_active: gift.is_active
    });
    setIsAddingGift(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Gift className="h-5 w-5 mr-2" />
            Gerenciar Brindes por Valor de Compra
          </div>
          <Button onClick={() => setIsAddingGift(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Brinde
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAddingGift && (
          <Card className="p-4 border-2 border-dashed">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nome do Brinde</Label>
                <Input
                  id="name"
                  value={newGift.name}
                  onChange={(e) => setNewGift({ ...newGift, name: e.target.value })}
                  placeholder="Chaveiro personalizado"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  value={newGift.description}
                  onChange={(e) => setNewGift({ ...newGift, description: e.target.value })}
                  placeholder="Descrição detalhada do brinde..."
                />
              </div>

              <div>
                <Label htmlFor="minimum_purchase_amount">Valor Mínimo de Compra (R$)</Label>
                <Input
                  id="minimum_purchase_amount"
                  type="number"
                  value={newGift.minimum_purchase_amount}
                  onChange={(e) => setNewGift({ ...newGift, minimum_purchase_amount: parseFloat(e.target.value) || 0 })}
                  placeholder="100.00"
                  step="0.01"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={newGift.is_active}
                  onCheckedChange={(checked) => setNewGift({ ...newGift, is_active: checked })}
                />
                <Label htmlFor="is_active">Brinde Ativo</Label>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button onClick={saveGift}>
                {editingGift ? 'Atualizar' : 'Criar'} Brinde
              </Button>
            </div>
          </Card>
        )}

        <div className="space-y-2">
          {loading ? (
            <p>Carregando brindes...</p>
          ) : gifts.length === 0 ? (
            <p className="text-muted-foreground">Nenhum brinde cadastrado</p>
          ) : (
            gifts.map((gift) => (
              <div key={gift.id} className="flex items-center justify-between p-3 border rounded">
                <div className="flex items-center space-x-4">
                  <Gift className="h-5 w-5 text-primary" />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{gift.name}</span>
                      <Badge variant={gift.is_active ? "default" : "secondary"}>
                        {gift.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Compras acima de {formatCurrency(gift.minimum_purchase_amount)}
                    </p>
                    {gift.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {gift.description}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEditing(gift)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteGift(gift.id)}
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