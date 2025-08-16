import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit2, Package } from 'lucide-react';

interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
  stock: number;
  image_url?: string;
  is_active: boolean;
}

const Produtos = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    price: '',
    stock: '',
    image_url: '',
    is_active: true
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('code');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      toast({
        title: "Erro ao carregar produtos",
        description: "Não foi possível carregar a lista de produtos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.code || !formData.name || !formData.price) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha código, nome e preço",
        variant: "destructive",
      });
      return;
    }

    try {
      const productData = {
        code: formData.code.toUpperCase().startsWith('C') ? formData.code.toUpperCase() : `C${formData.code}`,
        name: formData.name,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock) || 0,
        image_url: formData.image_url || null,
        is_active: formData.is_active
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;

        toast({
          title: "Produto atualizado",
          description: `${productData.code} foi atualizado com sucesso`,
        });
      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData]);

        if (error) throw error;

        toast({
          title: "Produto cadastrado",
          description: `${productData.code} foi cadastrado com sucesso`,
        });
      }

      resetForm();
      setIsDialogOpen(false);
      loadProducts();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar produto",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      price: '',
      stock: '',
      image_url: '',
      is_active: true
    });
    setEditingProduct(null);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      code: product.code,
      name: product.name,
      price: product.price.toString(),
      stock: product.stock.toString(),
      image_url: product.image_url || '',
      is_active: product.is_active
    });
    setIsDialogOpen(true);
  };

  const toggleProductStatus = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: `${product.code} foi ${!product.is_active ? 'ativado' : 'desativado'}`,
      });

      loadProducts();
    } catch (error) {
      toast({
        title: "Erro ao atualizar status",
        description: "Não foi possível alterar o status do produto",
        variant: "destructive",
      });
    }
  };

  const filteredProducts = products.filter(product =>
    product.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">Carregando produtos...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-7xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center">
          <Package className="h-8 w-8 mr-3" />
          Gerenciar Produtos
        </h1>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </DialogTitle>
              <DialogDescription>
                {editingProduct ? 'Edite as informações do produto' : 'Preencha os dados do novo produto'}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  placeholder="Ex: C151 ou 151"
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Nome do produto"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Preço *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="stock">Estoque</Label>
                  <Input
                    id="stock"
                    type="number"
                    placeholder="0"
                    value={formData.stock}
                    onChange={(e) => setFormData(prev => ({ ...prev, stock: e.target.value }))}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="image_url">URL da Imagem</Label>
                <Input
                  id="image_url"
                  placeholder="https://..."
                  value={formData.image_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
                <Label htmlFor="is_active">Produto ativo</Label>
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingProduct ? 'Atualizar' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Produtos</CardTitle>
          <CardDescription>
            Gerencie todos os produtos do sistema
          </CardDescription>
          
          <div className="flex items-center space-x-4">
            <Input
              placeholder="Buscar por código ou nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Badge variant="outline">
              {filteredProducts.length} produto(s)
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono">{product.code}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>R$ {product.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={product.stock > 0 ? "default" : "destructive"}>
                      {product.stock}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={product.is_active}
                      onCheckedChange={() => toggleProductStatus(product)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(product)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {filteredProducts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Produtos;