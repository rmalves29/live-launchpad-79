import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
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
import { Progress } from '@/components/ui/progress';
import { Loader2, Plus, Edit, Trash2, Upload, X, Search, Package, Download, FileSpreadsheet } from 'lucide-react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useAuth } from '@/hooks/useAuth';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import { formatCurrency } from '@/lib/utils';
import * as XLSX from 'xlsx';

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
  sale_type: 'LIVE' | 'BAZAR' | 'AMBOS';
}

interface ImportRow {
  codigo: string;
  nome: string;
  preco: number;
  estoque?: number;
  cor?: string;
  tamanho?: string;
  tipo_venda?: string;
  imagem_url?: string;
}

const Produtos = () => {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [saleTypeFilter, setSaleTypeFilter] = useState<'ALL' | 'LIVE' | 'BAZAR'>('ALL');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] } | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    price: '',
    stock: '',
    color: '',
    size: '',
    image_url: '',
    is_active: true,
    sale_type_bazar: true,
    sale_type_live: false
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

    if (!formData.sale_type_bazar && !formData.sale_type_live) {
      toast({
        title: 'Erro',
        description: 'Selecione pelo menos um tipo de venda',
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

      // Determinar sale_type baseado nos checkboxes
      let saleType: 'BAZAR' | 'LIVE' | 'AMBOS' = 'BAZAR';
      if (formData.sale_type_bazar && formData.sale_type_live) {
        saleType = 'AMBOS';
      } else if (formData.sale_type_live) {
        saleType = 'LIVE';
      } else {
        saleType = 'BAZAR';
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
        sale_type: saleType
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
        sale_type_bazar: true,
        sale_type_live: false
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
    const saleType = product.sale_type || 'BAZAR';
    setFormData({
        code: product.code,
        name: product.name,
        price: product.price.toString(),
        stock: product.stock.toString(),
        color: product.color || '',
        size: product.size || '',
        image_url: product.image_url || '',
        is_active: product.is_active,
        sale_type_bazar: saleType === 'BAZAR' || saleType === 'AMBOS',
        sale_type_live: saleType === 'LIVE' || saleType === 'AMBOS'
    });
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      description: 'Deseja excluir este produto?',
      confirmText: 'Excluir',
      variant: 'destructive',
    });
    if (!confirmed) return;

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

    const confirmed = await confirm({
      description: `Deseja excluir ${selectedProducts.length} produto(s)?`,
      confirmText: 'Excluir',
      variant: 'destructive',
    });
    if (!confirmed) return;

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
    const matchesType = saleTypeFilter === 'ALL' || 
      product.sale_type === saleTypeFilter || 
      (product.sale_type === 'AMBOS' && (saleTypeFilter === 'BAZAR' || saleTypeFilter === 'LIVE'));
    return matchesSearch && matchesType;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Download template Excel
  const downloadTemplate = () => {
    const templateData = [
      {
        codigo: 'C001',
        nome: 'Produto Exemplo 1',
        preco: 99.90,
        estoque: 10,
        cor: 'Azul',
        tamanho: 'M',
        tipo_venda: 'BAZAR',
        imagem_url: ''
      },
      {
        codigo: 'C002',
        nome: 'Produto Exemplo 2',
        preco: 149.90,
        estoque: 5,
        cor: 'Vermelho',
        tamanho: 'G',
        tipo_venda: 'LIVE',
        imagem_url: ''
      },
      {
        codigo: 'C003',
        nome: 'Produto Exemplo 3',
        preco: 199.90,
        estoque: 15,
        cor: 'Preto',
        tamanho: 'P',
        tipo_venda: 'AMBOS',
        imagem_url: ''
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // codigo
      { wch: 30 }, // nome
      { wch: 10 }, // preco
      { wch: 10 }, // estoque
      { wch: 15 }, // cor
      { wch: 12 }, // tamanho
      { wch: 12 }, // tipo_venda
      { wch: 50 }  // imagem_url
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    XLSX.writeFile(wb, 'modelo_importacao_produtos.xlsx');

    toast({
      title: 'Modelo baixado',
      description: 'Preencha a planilha e importe os produtos'
    });
  };

  // Import products from Excel
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const currentTenantId = (supabaseTenant as any).getTenantId?.();
    if (!currentTenantId) {
      toast({
        title: 'Erro',
        description: 'Tenant não definido',
        variant: 'destructive'
      });
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setImportResults(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<ImportRow>(worksheet);

      if (jsonData.length === 0) {
        toast({
          title: 'Erro',
          description: 'Planilha vazia ou formato inválido',
          variant: 'destructive'
        });
        setImporting(false);
        return;
      }

      const errors: string[] = [];
      let successCount = 0;

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        setImportProgress(Math.round(((i + 1) / jsonData.length) * 100));

        // Validate required fields
        if (!row.codigo || !row.nome || row.preco === undefined) {
          errors.push(`Linha ${i + 2}: Campos obrigatórios (codigo, nome, preco) faltando`);
          continue;
        }

        // Parse sale type
        let saleType: 'BAZAR' | 'LIVE' | 'AMBOS' = 'BAZAR';
        const tipoVenda = (row.tipo_venda || '').toString().toUpperCase().trim();
        if (tipoVenda === 'LIVE') {
          saleType = 'LIVE';
        } else if (tipoVenda === 'AMBOS') {
          saleType = 'AMBOS';
        }

        const productData = {
          code: String(row.codigo).trim(),
          name: String(row.nome).trim(),
          price: typeof row.preco === 'number' ? row.preco : parseFloat(String(row.preco).replace(',', '.')),
          stock: row.estoque ? parseInt(String(row.estoque)) : 0,
          color: row.cor ? String(row.cor).trim() : null,
          size: row.tamanho ? String(row.tamanho).trim() : null,
          image_url: row.imagem_url ? String(row.imagem_url).trim() : null,
          is_active: true,
          sale_type: saleType
        };

        // Check if product with same code exists
        const { data: existing } = await supabaseTenant
          .from('products')
          .select('id')
          .eq('code', productData.code)
          .maybeSingle();

        if (existing) {
          // Update existing product
          const { error } = await supabaseTenant
            .from('products')
            .update(productData)
            .eq('id', existing.id);

          if (error) {
            errors.push(`Linha ${i + 2}: Erro ao atualizar ${productData.code} - ${error.message}`);
          } else {
            successCount++;
          }
        } else {
          // Insert new product
          const { error } = await supabaseTenant
            .from('products')
            .insert([productData]);

          if (error) {
            errors.push(`Linha ${i + 2}: Erro ao inserir ${productData.code} - ${error.message}`);
          } else {
            successCount++;
          }
        }
      }

      setImportResults({ success: successCount, errors });

      if (errors.length === 0) {
        toast({
          title: 'Importação concluída',
          description: `${successCount} produto(s) importado(s) com sucesso`
        });
      } else {
        toast({
          title: 'Importação parcial',
          description: `${successCount} sucesso(s), ${errors.length} erro(s)`,
          variant: 'destructive'
        });
      }

      loadProducts();
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: 'Erro na importação',
        description: error.message || 'Erro ao processar arquivo',
        variant: 'destructive'
      });
    } finally {
      setImporting(false);
      // Reset file input
      e.target.value = '';
    }
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

          <div className="flex items-center gap-2">
            {/* Import Dialog */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Importar
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Importar Produtos</DialogTitle>
                  <DialogDescription>
                    Importe produtos em massa usando uma planilha Excel
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2">Passo 1: Baixe o modelo</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Baixe a planilha modelo, preencha com seus produtos e importe.
                    </p>
                    <Button variant="outline" onClick={downloadTemplate} className="w-full">
                      <Download className="h-4 w-4 mr-2" />
                      Baixar Planilha Modelo
                    </Button>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2">Passo 2: Importe a planilha</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Selecione o arquivo Excel (.xlsx) preenchido com seus produtos.
                    </p>
                    <div className="space-y-2">
                      <Input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleImportFile}
                        disabled={importing}
                        className="cursor-pointer"
                      />
                      {importing && (
                        <div className="space-y-2">
                          <Progress value={importProgress} className="h-2" />
                          <p className="text-sm text-center text-muted-foreground">
                            Importando... {importProgress}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {importResults && (
                    <div className="p-4 rounded-lg border">
                      <h4 className="font-medium mb-2">Resultado da Importação</h4>
                      <div className="space-y-2">
                        <p className="text-sm text-green-600">
                          ✓ {importResults.success} produto(s) importado(s)
                        </p>
                        {importResults.errors.length > 0 && (
                          <div className="max-h-32 overflow-y-auto">
                            {importResults.errors.map((error, idx) => (
                              <p key={idx} className="text-sm text-destructive">
                                ✗ {error}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="text-sm text-muted-foreground">
                    <p><strong>Colunas obrigatórias:</strong> codigo, nome, preco</p>
                    <p><strong>Colunas opcionais:</strong> estoque, cor, tamanho, tipo_venda, imagem_url</p>
                    <p><strong>Tipos de venda:</strong> BAZAR, LIVE, AMBOS</p>
                    <p className="mt-2 text-xs">
                      * Produtos com mesmo código serão atualizados
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* New Product Dialog */}
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
                  <Label>Tipo de Venda *</Label>
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sale_type_bazar"
                        checked={formData.sale_type_bazar}
                        onCheckedChange={(checked) => setFormData({ ...formData, sale_type_bazar: checked as boolean })}
                      />
                      <Label htmlFor="sale_type_bazar" className="font-normal cursor-pointer">
                        BAZAR (Pedidos Manual)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sale_type_live"
                        checked={formData.sale_type_live}
                        onCheckedChange={(checked) => setFormData({ ...formData, sale_type_live: checked as boolean })}
                      />
                      <Label htmlFor="sale_type_live" className="font-normal cursor-pointer">
                        LIVE
                      </Label>
                    </div>
                  </div>
                  {!formData.sale_type_bazar && !formData.sale_type_live && (
                    <p className="text-xs text-destructive mt-1">Selecione pelo menos um tipo</p>
                  )}
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
                            <ZoomableImage
                              src={product.image_url || ''}
                              alt={product.name}
                              className="h-12 w-12"
                              containerClassName="h-12 w-12 rounded"
                              fallback={
                                <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                                  <Package className="h-6 w-6 text-muted-foreground" />
                                </div>
                              }
                            />
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
                            {product.sale_type === 'AMBOS' ? (
                              <div className="flex gap-1">
                                <Badge variant="outline">BAZAR</Badge>
                                <Badge variant="destructive">LIVE</Badge>
                              </div>
                            ) : (
                              <Badge variant={product.sale_type === 'LIVE' ? 'destructive' : 'outline'}>
                                {product.sale_type}
                              </Badge>
                            )}
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
      <ConfirmDialog />
    </div>
  );
};

export default Produtos;
