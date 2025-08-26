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
import { Plus, Edit2, Package, Upload, X, Trash2 } from 'lucide-react';


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

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Seleção de produtos para exclusão em massa
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const toggleProductSelection = (id: number) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
      setUploadingImage(true);
      
      let imageUrl = formData.image_url;
      
      // If a new file is selected, upload it
      if (selectedFile) {
        try {
          imageUrl = await uploadImage(selectedFile);
        } catch (uploadError: any) {
          toast({
            title: "Erro no upload",
            description: uploadError.message || "Erro ao fazer upload da imagem",
            variant: "destructive",
          });
          setUploadingImage(false);
          return;
        }
      }

      const productData = {
        code: formData.code.toUpperCase().startsWith('C') ? formData.code.toUpperCase() : `C${formData.code}`,
        name: formData.name,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock) || 0,
        image_url: imageUrl || null,
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
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
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
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadingImage(false);
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

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Tem certeza que deseja excluir o produto "${product.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id);
      
      if (error) throw error;
      
      toast({
        title: "Produto excluído",
        description: `${product.code} foi excluído com sucesso`,
      });
      
      loadProducts();
    } catch (error) {
      toast({
        title: "Erro ao excluir produto",
        description: "Não foi possível excluir o produto",
        variant: "destructive",
      });
    }
  };

  const deleteSelectedProducts = async () => {
    if (selectedProducts.size === 0) {
      toast({ title: 'Aviso', description: 'Selecione ao menos um produto', variant: 'destructive' });
      return;
    }
    if (!confirm(`Excluir ${selectedProducts.size} produto(s) selecionado(s)? Essa ação não pode ser desfeita.`)) return;

    try {
      const ids = Array.from(selectedProducts);
      const { error } = await supabase
        .from('products')
        .delete()
        .in('id', ids);

      if (error) throw error;

      toast({ title: 'Sucesso', description: `${ids.length} produto(s) excluído(s).` });
      setSelectedProducts(new Set());
      loadProducts();
    } catch (error) {
      toast({ title: 'Erro ao excluir', description: 'Falha ao excluir os produtos selecionados', variant: 'destructive' });
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
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="container mx-auto max-w-7xl space-y-6">
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
                <Label>Imagem do Produto</Label>
                <div className="space-y-2">
                  {/* File input */}
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="image-upload"
                    />
                    <Label 
                      htmlFor="image-upload" 
                      className="flex items-center gap-2 cursor-pointer p-2 border border-input rounded-md hover:bg-accent"
                    >
                      <Upload className="h-4 w-4" />
                      Escolher imagem
                    </Label>
                    {selectedFile && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={removeSelectedFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  {/* Preview */}
                  {previewUrl && (
                    <div className="w-20 h-20 border rounded overflow-hidden">
                      <img 
                        src={previewUrl} 
                        alt="Preview" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  
                  {/* Show current image if editing and no new file selected */}
                  {editingProduct && !selectedFile && formData.image_url && (
                    <div className="w-20 h-20 border rounded overflow-hidden">
                      <img 
                        src={formData.image_url} 
                        alt="Imagem atual" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground">
                      Arquivo selecionado: {selectedFile.name}
                    </p>
                  )}
                </div>
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
                <Button type="submit" disabled={uploadingImage}>
                  {uploadingImage ? 'Salvando...' : (editingProduct ? 'Atualizar' : 'Cadastrar')}
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
            <Button
              variant="destructive"
              onClick={deleteSelectedProducts}
              disabled={selectedProducts.size === 0}
            >
              Excluir Selecionados ({selectedProducts.size})
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
                      } else {
                        setSelectedProducts(new Set());
                      }
                    }}
                    checked={selectedProducts.size > 0 && selectedProducts.size === filteredProducts.length}
                  />
                </TableHead>
                <TableHead>Foto</TableHead>
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
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedProducts.has(product.id)}
                      onChange={() => toggleProductSelection(product.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="w-12 h-12 border rounded overflow-hidden bg-muted">
                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </TableCell>
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
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(product)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteProduct(product)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
      </div>
    </div>
  );
};

export default Produtos;