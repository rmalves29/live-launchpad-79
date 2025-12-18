import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Edit, Trash2, Package } from 'lucide-react';

interface Product {
  id: number;
  tenant_id: string;
  code: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

interface ProductForm {
  code: string;
  name: string;
  price: string;
  stock: string;
  is_active: boolean;
}

export default function TenantProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductForm>({
    code: '',
    name: '',
    price: '',
    stock: '0',
    is_active: true
  });
  const [searchTerm, setSearchTerm] = useState('');
  const { profile } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (profile?.tenant_id) {
      loadProducts();
    }
  }, [profile?.tenant_id]);

  const loadProducts = async () => {
    if (!profile?.tenant_id) return;

    try {
      const { data, error } = await supabaseTenant
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar produtos',
        variant: 'destructive'
      });
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      price: '',
      stock: '0',
      is_active: true
    });
    setEditingProduct(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setFormData({
      code: product.code,
      name: product.name,
      price: product.price.toString(),
      stock: product.stock.toString(),
      is_active: product.is_active
    });
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  const saveProduct = async () => {
    if (!profile?.tenant_id || !formData.code || !formData.name || !formData.price) return;

    try {
      const productData = {
        code: formData.code.toUpperCase(),
        name: formData.name,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock) || 0,
        is_active: formData.is_active
      };

      if (editingProduct) {
        const { error } = await supabaseTenant
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        
        toast({
          title: 'Sucesso',
          description: 'Produto atualizado com sucesso!'
        });
      } else {
        const { error } = await supabaseTenant
          .from('products')
          .insert([productData]);

        if (error) throw error;
        
        toast({
          title: 'Sucesso',
          description: 'Produto criado com sucesso!'
        });
      }

      setIsDialogOpen(false);
      resetForm();
      loadProducts();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar produto',
        variant: 'destructive'
      });
    }
  };

  const deleteProduct = async (productId: number) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
      const { error } = await supabaseTenant
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Produto excluído com sucesso!'
      });

      loadProducts();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao excluir produto',
        variant: 'destructive'
      });
    }
  };

  const toggleProductActive = async (productId: number, isActive: boolean) => {
    try {
      const { error } = await supabaseTenant
        .from('products')
        .update({ is_active: isActive })
        .eq('id', productId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: `Produto ${isActive ? 'ativado' : 'desativado'} com sucesso!`
      });

      loadProducts();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao atualizar produto',
        variant: 'destructive'
      });
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Produtos
            </CardTitle>
            <CardDescription>
              Gerencie o catálogo de produtos da sua empresa
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </div>
        <div className="mt-4">
          <Input
            placeholder="Buscar produtos por nome ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum produto encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'Tente ajustar os termos da busca.' : 'Comece criando seu primeiro produto.'}
              </p>
              {!searchTerm && (
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeiro Produto
                </Button>
              )}
            </div>
          ) : (
            filteredProducts.map((product) => (
              <div key={product.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold">{product.name}</h4>
                      <Badge variant="secondary">{product.code}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • 
                      Estoque: {product.stock}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={product.is_active ? 'default' : 'secondary'}>
                    {product.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Switch
                    checked={product.is_active}
                    onCheckedChange={(checked) => toggleProductActive(product.id, checked)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(product)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteProduct(product.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </DialogTitle>
              <DialogDescription>
                {editingProduct ? 'Atualize os dados do produto' : 'Adicione um novo produto ao catálogo'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código do Produto</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Ex: C001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Produto</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Produto Demo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Preço (R$)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock">Estoque</Label>
                  <Input
                    id="stock"
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Produto ativo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveProduct}>
                {editingProduct ? 'Atualizar' : 'Criar'} Produto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}