import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Edit, Trash2, Upload, X, Search, Package } from 'lucide-react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useAuth } from '@/hooks/useAuth';

interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
  stock: number;
  color?: string;
  size?: string;
  image_url?: string;
  is_active: boolean;
  sale_type: 'LIVE' | 'BAZAR';
}

const Produtos = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [saleTypeFilter, setSaleTypeFilter] = useState<'ALL' | 'LIVE' | 'BAZAR'>('ALL');

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    price: '',
    stock: '',
    color: '',
    size: '',
    image_url: '',
    is_active: true,
    sale_type: 'BAZAR' as 'LIVE' | 'BAZAR'
  });
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseTenant
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar produtos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name || !formData.price) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    // Garantir que um tenant esteja definido no cliente multi-tenant
    const currentTenantId = (supabaseTenant as any).getTenantId?.();
    if (!currentTenantId) {
      toast({
        title: 'Defina a empresa',
        description: 'Acesse pelo subdomínio da empresa ou selecione um tenant no simulador.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setUploading(true);
      
      let imageUrl = formData.image_url || null;
      
      // Upload new image if selected
      if (selectedFile) {
        imageUrl = await uploadImage(selectedFile);
      }

      const productData = {
        code: formData.code,
        name: formData.name,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock) || 0,
        color: formData.color || null,
        size: formData.size || null,
        image_url: imageUrl,
        is_active: formData.is_active,
        sale_type: formData.sale_type
      };

      if (editingProduct) {
        const { error } = await supabaseTenant
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;

        toast({
          title: "Produto atualizado",
          description: `${productData.code} foi atualizado com sucesso`,
        });
      } else {
        const { error } = await supabaseTenant
          .from('products')
          .insert([productData]);

        if (error) throw error;

        toast({
          title: "Produto cadastrado",
          description: `${productData.code} foi cadastrado com sucesso`,
        });
      }

      setIsDialogOpen(false);
      setEditingProduct(null);
      setFormData({
        code: '',
        name: '',
        price: '',
        stock: '',
        color: '',
        size: '',
        image_url: '',
        is_active: true,
        sale_type: 'BAZAR'
      });
      setSelectedFile(null);
      loadProducts();
    } catch (error: any) {
      console.error('Error saving product:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar produto',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'Erro',
          description: 'Arquivo muito grande. Máximo 5MB.',
          variant: 'destructive'
        });
        return;
      }
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Erro',
          description: 'Selecione apenas arquivos de imagem.',
          variant: 'destructive'
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { data, error } = await supabaseTenant.storage
        .from('product-images')
        .upload(filePath, file);

      if (error) throw error;

      const { data: urlData } = supabaseTenant.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
        code: product.code,
        name: product.name,
        price: product.price.toString(),
        stock: product.stock.toString(),
        color: product.color || '',
        size: product.size || '',
        image_url: product.image_url || '',
        is_active: product.is_active,
        sale_type: product.sale_type || 'BAZAR'
    });
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
      const { error } = await supabaseTenant
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Produto excluído',
        description: 'Produto removido com sucesso'
      });
      
      loadProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao excluir produto',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedProducts.length === 0) {
      toast({
        title: 'Nenhum produto selecionado',
        description: 'Selecione pelo menos um produto para deletar',
        variant: 'destructive'
      });
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir ${selectedProducts.length} produto(s)?`)) return;

    try {
      const { error } = await supabaseTenant
        .from('products')
        .delete()
        .in('id', selectedProducts);

      if (error) throw error;

      toast({
        title: 'Produtos excluídos',
        description: `${selectedProducts.length} produto(s) removido(s) com sucesso`
      });
      
      setSelectedProducts([]);
      loadProducts();
    } catch (error) {
      console.error('Error deleting products:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao excluir produtos',
        variant: 'destructive'
      });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(filteredProducts.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleSelectProduct = (productId: number, checked: boolean) => {
    if (checked) {
      setSelectedProducts([...selectedProducts, productId]);
    } else {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = saleTypeFilter === 'ALL' || product.sale_type === saleTypeFilter;
    return matchesSearch && matchesType;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              <Package className="h-8 w-8 mr-3 text-primary" />
              Produtos
            </h1>
            <p className="text-muted-foreground mt-2">
              Gerencie o catálogo de produtos
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                </DialogTitle>
                <DialogDescription>
                  Preencha as informações do produto
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="code">Código *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="Ex: C001"
                  />
                </div>
                
                <div>
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome do produto"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">Preço *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
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

                <div>
                  <Label htmlFor="sale_type">Tipo de Venda *</Label>
                  <Select
                    value={formData.sale_type}
                    onValueChange={(value: 'LIVE' | 'BAZAR') => setFormData({ ...formData, sale_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BAZAR">BAZAR (Pedidos Manual)</SelectItem>
                      <SelectItem value="LIVE">LIVE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="color">Variação 1 (Cor)</Label>
                    <Input
                      id="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      placeholder="Ex: Azul"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="size">Variação 2 (Tamanho)</Label>
                    <Input
                      id="size"
                      value={formData.size}
                      onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                      placeholder="Ex: M"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="image">Imagem do Produto</Label>
                  <div className="space-y-2">
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="cursor-pointer"
                    />
                    {selectedFile && (
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Upload className="h-4 w-4" />
                        <span>{selectedFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedFile(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {formData.image_url && !selectedFile && (
                      <div className="flex items-center space-x-2">
                        <img 
                          src={formData.image_url} 
                          alt="Preview" 
                          className="h-10 w-10 object-cover rounded"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span className="text-sm text-muted-foreground">Imagem atual</span>
                      </div>
                    )}
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

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {selectedFile ? 'Enviando...' : 'Salvando...'}
                      </>
                    ) : (
                      editingProduct ? 'Atualizar' : 'Cadastrar'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span>Lista de Produtos ({filteredProducts.length})</span>
                {selectedProducts.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Deletar Selecionados ({selectedProducts.length})
                  </Button>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <Select value={saleTypeFilter} onValueChange={(value: 'ALL' | 'LIVE' | 'BAZAR') => setSaleTypeFilter(value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os Tipos</SelectItem>
                    <SelectItem value="BAZAR">Bazar</SelectItem>
                    <SelectItem value="LIVE">Live</SelectItem>
                  </SelectContent>
                </Select>
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produtos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Carregando produtos...</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum produto encontrado
              </div>
            ) : (
              <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <Checkbox
                            checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Imagem</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Variações</TableHead>
                        <TableHead>Preço</TableHead>
                        <TableHead>Estoque</TableHead>
                        <TableHead>Tipo de Evento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedProducts.includes(product.id)}
                              onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell>
                            {product.image_url ? (
                              <img 
                                src={product.image_url} 
                                alt={product.name}
                                className="h-12 w-12 object-cover rounded"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                                <Package className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono">{product.code}</TableCell>
                          <TableCell>{product.name}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {product.color && <div>Cor: {product.color}</div>}
                              {product.size && <div>Tam: {product.size}</div>}
                              {!product.color && !product.size && <div className="text-muted-foreground">-</div>}
                            </div>
                          </TableCell>
                          <TableCell>{formatCurrency(product.price)}</TableCell>
                          <TableCell>{product.stock}</TableCell>
                          <TableCell>
                            <Badge variant={product.sale_type === 'LIVE' ? 'destructive' : 'outline'}>
                              {product.sale_type === 'LIVE' ? 'LIVE' : 'BAZAR'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={product.is_active ? 'default' : 'secondary'}>
                              {product.is_active ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(product)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(product.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Produtos;
