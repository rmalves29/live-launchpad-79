import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Loader2, Users, UserPlus, Edit, Trash2, Search, Eye, ShoppingBag, DollarSign, Calendar, ArrowLeft, BarChart3, TrendingUp, FileText, X, Download, FileSpreadsheet, Upload, ShieldBan, ShieldCheck } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatBrasiliaDate, formatBrasiliaDateTime, getBrasiliaDateISO } from '@/lib/date-utils';
import { supabase } from '@/integrations/supabase/client';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useAuth } from '@/hooks/useAuth';
import { useTenantContext } from '@/contexts/TenantContext';
import { normalizeForStorage, formatPhoneForDisplay } from '@/lib/phone-utils';
import * as XLSX from 'xlsx';
interface Customer {
  id: number;
  phone: string;
  name: string;
  email?: string;
  instagram?: string;
  cpf?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  is_blocked?: boolean;
  created_at: string;
  updated_at: string;
  total_orders: number;
  total_spent: number;
  paid_orders_count: number;
  last_order_date?: string;
  tags?: Array<{
    id: number;
    name: string;
    color: string;
  }>;
}

interface Order {
  id: number;
  tenant_order_number?: number;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
  created_at: string;
  customer_name?: string;
  customer_phone: string;
  customer_cpf?: string;
  customer_street?: string;
  customer_number?: string;
  customer_complement?: string;
  customer_city?: string;
  customer_state?: string;
  customer_cep?: string;
  cart_items: Array<{
    qty: number;
    unit_price: number;
    product: {
      name: string;
      code: string;
      image_url?: string;
    };
  }>;
}

interface OrderWithCustomer extends Order {
  customer: Customer;
}

const Clientes = () => {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { tenantId } = useTenantContext();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newCustomer, setNewCustomer] = useState({ phone: '', name: '', instagram: '' });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'management' | 'orderHistory'>('dashboard');
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [allOrders, setAllOrders] = useState<OrderWithCustomer[]>([]);
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  const [showOrderDetailsDialog, setShowOrderDetailsDialog] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [blockingCustomer, setBlockingCustomer] = useState<Customer | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] } | null>(null);

  const searchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      toast({
        title: 'CEP inválido',
        description: 'O CEP deve ter 8 dígitos',
        variant: 'destructive'
      });
      return;
    }

    setSearchingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast({
          title: 'CEP não encontrado',
          description: 'Verifique o CEP informado',
          variant: 'destructive'
        });
        return;
      }

      setEditingCustomer(prev => prev ? {
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state
      } : null);

      toast({
        title: 'Endereço encontrado',
        description: 'Campos preenchidos automaticamente'
      });
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao buscar CEP. Tente novamente.',
        variant: 'destructive'
      });
    } finally {
      setSearchingCep(false);
    }
  };

  const normalizePhone = (phone: string): string => {
    return normalizeForStorage(phone);
  };

  const formatPhone = (phone: string): string => {
    return formatPhoneForDisplay(phone);
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data: customersData, error: customersError } = await supabaseTenant
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (customersError) throw customersError;

      // Get order statistics and tags for each customer
      const customersWithStats = await Promise.all(
        (customersData || []).map(async (customer) => {
          // Load orders
            const { data: orders, error: ordersError } = await supabaseTenant
              .from('orders')
              .select('total_amount, is_paid, created_at')
              .eq('customer_phone', customer.phone);

          // Load customer tags - temporarily disabled due to TypeScript complexity
          // TODO: Re-implement tags loading with simpler approach
          const customerTags: any[] = [];
          const tagsError = null;

          if (ordersError) {
            console.error('Error loading orders for customer:', customer.phone, ordersError);
          }

          if (tagsError) {
            console.error('Error loading tags for customer:', customer.id, tagsError);
          }

          const totalOrders = orders?.length || 0;
          // Only sum paid orders for total_spent
          const paidOrders = orders?.filter(order => order.is_paid) || [];
          const totalSpent = paidOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
          const paidOrdersCount = paidOrders.length;
          const lastOrderDate = orders?.length > 0 
            ? orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
            : undefined;

          const tags = customerTags?.map(ct => ct.customer_tags).filter(Boolean) || [];

          return {
            ...customer,
            total_orders: totalOrders,
            total_spent: totalSpent,
            paid_orders_count: paidOrdersCount,
            last_order_date: lastOrderDate,
            tags
          };
        })
      );

      setCustomers(customersWithStats);
    } catch (error) {
      console.error('Error loading customers:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar clientes',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createCustomer = async () => {
    if (!newCustomer.phone || !newCustomer.name) {
      toast({
        title: 'Erro',
        description: 'Informe telefone e nome completo',
        variant: 'destructive'
      });
      return;
    }

    const normalizedPhone = normalizePhone(newCustomer.phone);
    if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
      toast({
        title: 'Erro',
        description: 'Telefone deve ter 10 ou 11 dígitos (DDD + número)',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      // Verificar se cliente já existe
      const { data: existingCustomer } = await supabaseTenant
        .from('customers')
        .select('*')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (existingCustomer) {
        // Cliente existe - atualizar dados incluindo Instagram
        const updateData: any = {
          name: newCustomer.name,
        };

        // Adicionar Instagram se fornecido (remove espaços e @)
        if (newCustomer.instagram) {
          updateData.instagram = newCustomer.instagram.trim().replace('@', '');
        }

        const { error: updateError } = await supabaseTenant
          .from('customers')
          .update(updateData)
          .eq('phone', normalizedPhone);

        if (updateError) throw updateError;

        toast({
          title: 'Sucesso',
          description: newCustomer.instagram 
            ? 'Cliente atualizado com sucesso (Instagram adicionado)'
            : 'Cliente atualizado com sucesso',
        });
      } else {
        // Cliente não existe - criar novo
        const { error } = await supabaseTenant
          .from('customers')
          .insert({
            phone: normalizedPhone,
            name: newCustomer.name,
            instagram: newCustomer.instagram?.trim().replace('@', '') || null
          });

        if (error) throw error;

        toast({
          title: 'Sucesso',
          description: 'Cliente cadastrado com sucesso'
        });
      }
      
      setNewCustomer({ phone: '', name: '', instagram: '' });
      loadCustomers();
    } catch (error: any) {
      console.error('Error creating/updating customer:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar cliente',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomer = async (id: number) => {
    const confirmed = await confirm({
      title: 'Excluir Cliente',
      description: 'Deseja excluir este cliente? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      const { error } = await supabaseTenant
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Cliente excluído com sucesso'
      });
      
      loadCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao excluir cliente',
        variant: 'destructive'
      });
    }
  };

  const updateCustomer = async () => {
    if (!editingCustomer || !editingCustomer.name || !editingCustomer.phone) {
      toast({
        title: 'Erro',
        description: 'Nome e telefone são obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabaseTenant
        .from('customers')
        .update({
          name: editingCustomer.name,
          instagram: editingCustomer.instagram?.trim().replace('@', '') || null,
          cpf: editingCustomer.cpf || null,
          street: editingCustomer.street || null,
          number: editingCustomer.number || null,
          complement: editingCustomer.complement || null,
          neighborhood: editingCustomer.neighborhood || null,
          city: editingCustomer.city || null,
          state: editingCustomer.state || null,
          cep: editingCustomer.cep || null,
        })
        .eq('id', editingCustomer.id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Cliente atualizado com sucesso'
      });
      
      setEditingCustomer(null);
      loadCustomers();
    } catch (error) {
      console.error('Error updating customer:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar cliente',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const loadAllOrdersWithCustomers = async () => {
    setLoading(true);
    try {
      // Load all orders
      const { data: ordersData, error: ordersError } = await supabaseTenant
        .from('orders')
        .select(`
          id,
          cart_id,
          event_type,
          event_date,
          total_amount,
          is_paid,
          created_at,
          customer_name,
          customer_phone,
          customer_cep,
          customer_street,
          customer_number,
          customer_complement,
          customer_city,
          customer_state
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Get cart items for each order
      const ordersWithItems = await Promise.all(
        (ordersData || []).map(async (order) => {
          const { data: cartItems, error: itemsError } = await supabaseTenant
            .from('cart_items')
            .select(`
              qty,
              unit_price,
              products(name, code, image_url)
            `)
            .eq('cart_id', order.cart_id || 0);

          // Find customer info
          const customer = customers.find(c => c.phone === order.customer_phone) || {
            id: 0,
            phone: order.customer_phone,
            name: order.customer_name || 'Cliente',
            created_at: order.created_at,
            updated_at: order.created_at,
            total_orders: 0,
            total_spent: 0,
            paid_orders_count: 0,
          };

          if (itemsError) {
            console.error('Error loading cart items:', itemsError);
            return {
              ...order,
              customer,
              cart_items: []
            } as OrderWithCustomer;
          }

          return {
            ...order,
            customer,
            cart_items: (cartItems || []).map(item => ({
              qty: item.qty,
              unit_price: item.unit_price,
              product: {
                name: item.products?.name || 'Produto removido',
                code: item.products?.code || 'N/A',
                image_url: item.products?.image_url || undefined
              }
            }))
          } as OrderWithCustomer;
        })
      );

      setAllOrders(ordersWithItems);
    } catch (error) {
      console.error('Error loading all orders:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pedidos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadCustomers();
    }
  }, [tenantId]);

  useEffect(() => {
    if (activeView === 'orderHistory' && customers.length > 0) {
      loadAllOrdersWithCustomers();
    }
  }, [activeView, customers.length]);

  const filteredCustomers = customers.filter(customer => {
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) return true;
    
    // Search by name
    if (customer.name.toLowerCase().includes(searchLower)) return true;
    
    // Search by phone (normalized and raw)
    const normalizedSearch = normalizeForStorage(searchTerm);
    const normalizedCustomerPhone = normalizeForStorage(customer.phone);
    if (normalizedSearch && normalizedCustomerPhone.includes(normalizedSearch)) return true;
    if (customer.phone.includes(searchTerm)) return true;
    
    // Search by CPF
    if (customer.cpf && customer.cpf.includes(searchTerm)) return true;
    
    // Search by Instagram
    if (customer.instagram && customer.instagram.toLowerCase().includes(searchLower)) return true;
    
    return false;
  });

  const filteredOrders = allOrders.filter(order => {
    const normalizedSearch = normalizeForStorage(orderSearchTerm);
    const normalizedOrderPhone = normalizeForStorage(order.customer.phone);
    return order.customer.name.toLowerCase().includes(orderSearchTerm.toLowerCase()) ||
      normalizedOrderPhone.includes(normalizedSearch) ||
      order.customer.phone.includes(orderSearchTerm) ||
      order.id.toString().includes(orderSearchTerm);
  });

  const formatDate = (dateString: string) => {
    return formatBrasiliaDate(dateString);
  };

  const formatDateTime = (dateString: string) => {
    return formatBrasiliaDateTime(dateString);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const exportToCSV = () => {
    if (filteredCustomers.length === 0) {
      toast({
        title: 'Nenhum cliente para exportar',
        description: 'A lista de clientes está vazia',
        variant: 'destructive'
      });
      return;
    }

    const headers = [
      'Nome',
      'Telefone',
      'Email',
      'Instagram',
      'CPF',
      'CEP',
      'Rua',
      'Número',
      'Complemento',
      'Bairro',
      'Cidade',
      'Estado',
      'Total Pedidos',
      'Pedidos Pagos',
      'Total Gasto',
      'Último Pedido',
      'Criado em'
    ];

    const rows = filteredCustomers.map(customer => [
      customer.name,
      formatPhone(customer.phone),
      customer.email || '',
      customer.instagram || '',
      customer.cpf || '',
      customer.cep || '',
      customer.street || '',
      customer.number || '',
      customer.complement || '',
      customer.neighborhood || '',
      customer.city || '',
      customer.state || '',
      customer.total_orders.toString(),
      customer.paid_orders_count.toString(),
      formatCurrency(customer.total_spent),
      customer.last_order_date ? formatDate(customer.last_order_date) : '',
      formatDate(customer.created_at)
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes_${getBrasiliaDateISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Exportação concluída',
      description: `${filteredCustomers.length} clientes exportados para CSV`
    });
  };

  // Download template Excel para importação de clientes
  const downloadCustomerTemplate = () => {
    const templateData = [
      {
        nome: 'Maria Silva',
        telefone: '11987654321',
        email: 'maria@email.com',
        instagram: 'mariasilva',
        cpf: '123.456.789-00',
        cep: '01234-567',
        rua: 'Rua das Flores',
        numero: '123',
        complemento: 'Apto 45',
        bairro: 'Centro',
        cidade: 'São Paulo',
        estado: 'SP'
      },
      {
        nome: 'João Santos',
        telefone: '21912345678',
        email: '',
        instagram: 'joaosantos',
        cpf: '',
        cep: '',
        rua: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: 'Rio de Janeiro',
        estado: 'RJ'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 25 }, // nome
      { wch: 15 }, // telefone
      { wch: 25 }, // email
      { wch: 20 }, // instagram
      { wch: 18 }, // cpf
      { wch: 12 }, // cep
      { wch: 30 }, // rua
      { wch: 10 }, // numero
      { wch: 20 }, // complemento
      { wch: 20 }, // bairro
      { wch: 20 }, // cidade
      { wch: 5 },  // estado
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, 'modelo_importacao_clientes.xlsx');

    toast({
      title: 'Modelo baixado',
      description: 'Preencha a planilha e importe os clientes'
    });
  };

  // Import customers from Excel
  const handleImportCustomers = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportProgress(0);
    setImportResults(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

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

        const nome = row.nome ? String(row.nome).trim() : '';
        const telefone = row.telefone ? String(row.telefone).trim() : '';

        if (!nome || !telefone) {
          errors.push(`Linha ${i + 2}: Campos obrigatórios (nome, telefone) faltando`);
          continue;
        }

        const normalizedPhone = normalizeForStorage(telefone);
        if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
          errors.push(`Linha ${i + 2}: Telefone inválido "${telefone}"`);
          continue;
        }

        const customerData: Record<string, any> = {
          name: nome,
          phone: normalizedPhone,
          email: row.email ? String(row.email).trim() || null : null,
          instagram: row.instagram ? String(row.instagram).trim().replace('@', '') || null : null,
          cpf: row.cpf ? String(row.cpf).trim() || null : null,
          cep: row.cep ? String(row.cep).trim() || null : null,
          street: row.rua ? String(row.rua).trim() || null : null,
          number: row.numero ? String(row.numero).trim() || null : null,
          complement: row.complemento ? String(row.complemento).trim() || null : null,
          neighborhood: row.bairro ? String(row.bairro).trim() || null : null,
          city: row.cidade ? String(row.cidade).trim() || null : null,
          state: row.estado ? String(row.estado).trim() || null : null,
        };

        // Check if customer with same phone exists
        const { data: existing } = await supabaseTenant
          .from('customers')
          .select('id')
          .eq('phone', normalizedPhone)
          .maybeSingle();

        if (existing) {
          const { error } = await supabaseTenant
            .from('customers')
            .update(customerData)
            .eq('id', existing.id);

          if (error) {
            errors.push(`Linha ${i + 2}: Erro ao atualizar "${nome}" - ${error.message}`);
          } else {
            successCount++;
          }
        } else {
          const { error } = await supabaseTenant
            .from('customers')
            .insert([customerData]);

          if (error) {
            errors.push(`Linha ${i + 2}: Erro ao inserir "${nome}" - ${error.message}`);
          } else {
            successCount++;
          }
        }
      }

      setImportResults({ success: successCount, errors });

      if (errors.length === 0) {
        toast({
          title: 'Importação concluída',
          description: `${successCount} cliente(s) importado(s) com sucesso`
        });
      } else {
        toast({
          title: 'Importação parcial',
          description: `${successCount} sucesso(s), ${errors.length} erro(s)`,
          variant: 'destructive'
        });
      }

      loadCustomers();
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: 'Erro na importação',
        description: error.message || 'Erro ao processar arquivo',
        variant: 'destructive'
      });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const toggleBlockCustomer = async (customer: Customer) => {
    try {
      const newStatus = !customer.is_blocked;
      const { error } = await supabaseTenant
        .from('customers')
        .update({ is_blocked: newStatus })
        .eq('id', customer.id);

      if (error) throw error;

      toast({
        title: newStatus ? '🚫 Cliente Bloqueado' : '✅ Cliente Desbloqueado',
        description: newStatus 
          ? `${customer.name} foi bloqueado e não poderá realizar novas compras.`
          : `${customer.name} foi desbloqueado e pode realizar compras normalmente.`,
      });
      
      setBlockingCustomer(null);
      loadCustomers();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao alterar status do cliente',
        variant: 'destructive'
      });
    }
  };

  const openOrderDetails = (order: OrderWithCustomer) => {
    setSelectedOrderForDetails(order);
    setShowOrderDetailsDialog(true);
  };

  const loadCustomerOrders = async (customer: Customer) => {
    setLoadingOrders(true);
    setSelectedCustomer(customer);
    
    try {
      const { data, error } = await supabaseTenant
        .from('orders')
        .select(`
          id,
          cart_id,
          event_type,
          event_date,
          total_amount,
          is_paid,
          created_at
        `)
        .eq('customer_phone', customer.phone)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get cart items for each order
      const ordersWithItems = await Promise.all(
        (data || []).map(async (order) => {
          const { data: cartItems, error: itemsError } = await supabaseTenant
            .from('cart_items')
            .select(`
              qty,
              unit_price,
              products(name, code)
            `)
            .eq('cart_id', order.cart_id || 0);

          if (itemsError) {
            console.error('Error loading cart items:', itemsError);
            return {
              ...order,
              cart_items: []
            };
          }

          return {
            ...order,
            cart_items: (cartItems || []).map(item => ({
              qty: item.qty,
              unit_price: item.unit_price,
              product: {
                name: item.products?.name || 'Produto removido',
                code: item.products?.code || 'N/A'
              }
            }))
          };
        })
      );

      setCustomerOrders(ordersWithItems);
    } catch (error) {
      console.error('Error loading customer orders:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pedidos do cliente',
        variant: 'destructive'
      });
    } finally {
      setLoadingOrders(false);
    }
  };

  if (activeView === 'management') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <Users className="h-8 w-8 mr-3 text-primary" />
                Gerenciar Clientes
              </h1>
              <p className="text-muted-foreground mt-2">
                Cadastre, edite e visualize informações dos clientes
              </p>
            </div>
            <Button 
              onClick={() => setActiveView('dashboard')} 
              variant="outline"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Dashboard
            </Button>
          </div>

          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'list' | 'create')} className="space-y-6">
        <TabsList>
          <TabsTrigger value="list" className="flex items-center">
            <Users className="h-4 w-4 mr-2" />
            Lista de Clientes
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center">
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar Cliente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <UserPlus className="h-5 w-5 mr-2" />
                Cadastrar Novo Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Telefone (obrigatório)"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                />
                <Input
                  placeholder="Nome completo (obrigatório)"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                />
                <Input
                  placeholder="@usuario (Instagram)"
                  value={newCustomer.instagram}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, instagram: e.target.value }))}
                />
              </div>
              
              <div className="flex justify-end mt-4">
                <Button onClick={createCustomer} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-2" />
                  )}
                  Cadastrar Cliente
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Lista de Clientes ({filteredCustomers.length})
                </span>
                <div className="flex items-center gap-2">
                  <Dialog open={isImportDialogOpen} onOpenChange={(open) => { setIsImportDialogOpen(open); if (!open) setImportResults(null); }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Importar
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Importar Clientes</DialogTitle>
                        <DialogDescription>
                          Importe clientes em massa usando uma planilha Excel
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="p-4 bg-muted rounded-lg">
                          <h4 className="font-medium mb-2">Passo 1: Baixe o modelo</h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            Baixe a planilha modelo, preencha com seus clientes e importe. Campos obrigatórios: <strong>nome</strong> e <strong>telefone</strong>.
                          </p>
                          <Button variant="outline" onClick={downloadCustomerTemplate} className="w-full">
                            <Download className="h-4 w-4 mr-2" />
                            Baixar Planilha Modelo
                          </Button>
                        </div>

                        <div className="p-4 bg-muted rounded-lg">
                          <h4 className="font-medium mb-2">Passo 2: Importe a planilha</h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            Selecione o arquivo Excel (.xlsx) preenchido. Clientes com telefone já cadastrado serão atualizados.
                          </p>
                          <div className="space-y-2">
                            <Input
                              type="file"
                              accept=".xlsx,.xls"
                              onChange={handleImportCustomers}
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
                              <p className="text-sm text-primary">
                                ✓ {importResults.success} cliente(s) importado(s)
                              </p>
                              {importResults.errors.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-sm text-destructive font-medium">
                                    ✗ {importResults.errors.length} erro(s):
                                  </p>
                                  <div className="max-h-32 overflow-y-auto">
                                    {importResults.errors.map((err, idx) => (
                                      <p key={idx} className="text-xs text-destructive">{err}</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button onClick={exportToCSV} disabled={loading || filteredCustomers.length === 0} size="sm" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Exportar CSV
                  </Button>
                  <Button onClick={loadCustomers} disabled={loading} size="sm" variant="outline">
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Atualizar
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, telefone ou CPF..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>

                <Separator />

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>Carregando clientes...</span>
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'Nenhum cliente encontrado com os critérios de busca.' : 'Nenhum cliente cadastrado.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                       <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Instagram</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                       </TableHeader>
                       <TableBody>
                          {filteredCustomers.map((customer) => (
                             <TableRow key={customer.id}>
                               <TableCell className="font-medium">
                                 <div className="flex flex-col space-y-1">
                                   <div className="flex items-center gap-2">
                                     <span>{customer.name}</span>
                                     {customer.is_blocked && (
                                       <Badge variant="destructive" className="text-xs">BLOQUEADO</Badge>
                                     )}
                                   </div>
                                   {customer.tags && customer.tags.length > 0 && (
                                     <div className="flex flex-wrap gap-1">
                                       {customer.tags.map((tag) => (
                                         <Badge 
                                           key={tag.id} 
                                           variant="outline" 
                                           className="text-xs"
                                           style={{ 
                                             borderColor: tag.color, 
                                             color: tag.color 
                                           }}
                                         >
                                           {tag.name}
                                         </Badge>
                                       ))}
                                     </div>
                                   )}
                                 </div>
                               </TableCell>
                                <TableCell className="font-mono">
                                  {formatPhone(customer.phone)}
                                </TableCell>
                                <TableCell>
                                  {customer.instagram ? `@${customer.instagram.replace('@', '')}` : '-'}
                                </TableCell>
                               <TableCell className="text-right">
                                <div className="flex justify-end space-x-2">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        onClick={() => loadCustomerOrders(customer)}
                                        size="sm"
                                        variant="outline"
                                        title="Ver dados"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                                      <DialogHeader>
                                        <DialogTitle>
                                          Dados de {selectedCustomer?.name}
                                        </DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <Card>
                                          <CardHeader>
                                            <CardTitle>Informações Pessoais</CardTitle>
                                          </CardHeader>
                                           <CardContent className="grid grid-cols-2 gap-4">
                                             <div>
                                               <Label className="text-sm font-medium">Nome</Label>
                                               <p className="text-sm">{selectedCustomer?.name}</p>
                                             </div>
                                             <div>
                                               <Label className="text-sm font-medium">Telefone</Label>
                                                <p className="text-sm font-mono">{selectedCustomer ? formatPhone(selectedCustomer.phone) : ''}</p>
                                             </div>
                                              <div>
                                                <Label className="text-sm font-medium">Instagram</Label>
                                                <p className="text-sm">{selectedCustomer?.instagram ? `@${selectedCustomer.instagram.replace('@', '')}` : '-'}</p>
                                              </div>
                                              <div>
                                                <Label className="text-sm font-medium">E-mail</Label>
                                                <p className="text-sm">{selectedCustomer?.email || '-'}</p>
                                              </div>
                                              <div>
                                                <Label className="text-sm font-medium">CPF</Label>
                                                <p className="text-sm">{selectedCustomer?.cpf || '-'}</p>
                                              </div>
                                             <div>
                                               <Label className="text-sm font-medium">Cadastrado em</Label>
                                               <p className="text-sm">{selectedCustomer ? formatDate(selectedCustomer.created_at) : ''}</p>
                                             </div>
                                           </CardContent>
                                        </Card>

                                        <Card>
                                          <CardHeader>
                                            <CardTitle>Endereço</CardTitle>
                                          </CardHeader>
                                          <CardContent className="grid grid-cols-2 gap-4">
                                            <div>
                                              <Label className="text-sm font-medium">Rua</Label>
                                              <p className="text-sm">{selectedCustomer?.street || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">Número</Label>
                                              <p className="text-sm">{selectedCustomer?.number || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">Complemento</Label>
                                              <p className="text-sm">{selectedCustomer?.complement || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">Bairro</Label>
                                              <p className="text-sm">{selectedCustomer?.neighborhood || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">Cidade</Label>
                                              <p className="text-sm">{selectedCustomer?.city || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">Estado</Label>
                                              <p className="text-sm">{selectedCustomer?.state || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">CEP</Label>
                                              <p className="text-sm">{selectedCustomer?.cep || '-'}</p>
                                            </div>
                                          </CardContent>
                                        </Card>

                                        <Card>
                                          <CardHeader>
                                            <CardTitle>Histórico de Pedidos</CardTitle>
                                          </CardHeader>
                                          <CardContent>
                                            {loadingOrders ? (
                                              <div className="flex items-center justify-center py-8">
                                                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                                <span>Carregando pedidos...</span>
                                              </div>
                                            ) : customerOrders.length === 0 ? (
                                              <div className="text-center py-8 text-muted-foreground">
                                                Nenhum pedido encontrado para este cliente.
                                              </div>
                                            ) : (
                                              <div className="space-y-4">
                                                {customerOrders.map((order) => (
                                                  <Card key={order.id}>
                                                    <CardHeader className="pb-3">
                                                      <div className="flex justify-between items-start">
                                                        <div>
                                                          <CardTitle className="text-lg">
                                                            Pedido #{order.tenant_order_number || order.id}
                                                          </CardTitle>
                                                          <p className="text-sm text-muted-foreground">
                                                            {order.event_type} - {formatDate(order.event_date)}
                                                          </p>
                                                        </div>
                                                        <div className="text-right">
                                                          <div className="text-lg font-bold text-green-600">
                                                            {formatCurrency(order.total_amount)}
                                                          </div>
                                                          <Badge variant={order.is_paid ? "default" : "secondary"}>
                                                            {order.is_paid ? "Pago" : "Pendente"}
                                                          </Badge>
                                                        </div>
                                                      </div>
                                                    </CardHeader>
                                                    <CardContent>
                                                      <div className="space-y-2">
                                                        <h4 className="font-semibold">Itens:</h4>
                                                        {order.cart_items.map((item, index) => (
                                                          <div key={index} className="flex justify-between items-center py-2 border-b last:border-b-0">
                                                            <div>
                                                              <span className="font-medium">{item.product.name}</span>
                                                              <span className="text-sm text-muted-foreground ml-2">
                                                                ({item.product.code})
                                                              </span>
                                                            </div>
                                                            <div className="text-right">
                                                              <div>{item.qty}x {formatCurrency(item.unit_price)}</div>
                                                              <div className="font-semibold">
                                                                {formatCurrency(item.qty * item.unit_price)}
                                                              </div>
                                                            </div>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </CardContent>
                                                  </Card>
                                                ))}
                                              </div>
                                            )}
                                          </CardContent>
                                        </Card>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                  
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        onClick={() => setEditingCustomer(customer)}
                                        size="sm"
                                        variant="outline"
                                        title="Editar cliente"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl">
                                      <DialogHeader>
                                        <DialogTitle>
                                          Editar Cliente
                                        </DialogTitle>
                                      </DialogHeader>
                                      {editingCustomer && (
                                        <div className="space-y-4">
                                          <div className="grid grid-cols-2 gap-4">
                                            <div>
                                              <Label htmlFor="name">Nome *</Label>
                                              <Input
                                                id="name"
                                                value={editingCustomer.name}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, name: e.target.value} : null)}
                                              />
                                            </div>
                                             <div>
                                               <Label htmlFor="phone">Telefone *</Label>
                                               <Input
                                                 id="phone"
                                                 value={editingCustomer.phone}
                                                 onChange={(e) => setEditingCustomer(prev => prev ? {...prev, phone: e.target.value} : null)}
                                                 disabled
                                                 className="bg-muted"
                                               />
                                             </div>
                                             <div>
                                               <Label htmlFor="instagram">Instagram</Label>
                                               <Input
                                                 id="instagram"
                                                 placeholder="@usuario"
                                                 value={editingCustomer.instagram || ''}
                                                 onChange={(e) => setEditingCustomer(prev => prev ? {...prev, instagram: e.target.value} : null)}
                                               />
                                             </div>
                                             <div>
                                               <Label htmlFor="cpf">CPF</Label>
                                               <Input
                                                 id="cpf"
                                                 value={editingCustomer.cpf || ''}
                                                 onChange={(e) => setEditingCustomer(prev => prev ? {...prev, cpf: e.target.value} : null)}
                                               />
                                             </div>
                                            <div>
                                              <Label htmlFor="cep">CEP</Label>
                                              <div className="flex gap-2">
                                                <Input
                                                  id="cep"
                                                  value={editingCustomer.cep || ''}
                                                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, cep: e.target.value} : null)}
                                                  placeholder="00000-000"
                                                />
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => searchCep(editingCustomer.cep || '')}
                                                  disabled={searchingCep || !editingCustomer.cep}
                                                >
                                                  {searchingCep ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                  ) : (
                                                    <Search className="h-4 w-4" />
                                                  )}
                                                </Button>
                                              </div>
                                            </div>
                                            <div className="col-span-2">
                                              <Label htmlFor="street">Rua/Avenida</Label>
                                              <Input
                                                id="street"
                                                value={editingCustomer.street || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, street: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="number">Número</Label>
                                              <Input
                                                id="number"
                                                value={editingCustomer.number || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, number: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="complement">Complemento</Label>
                                              <Input
                                                id="complement"
                                                value={editingCustomer.complement || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, complement: e.target.value} : null)}
                                              />
                                            </div>
                                            <div className="col-span-2">
                                              <Label htmlFor="neighborhood">Bairro</Label>
                                              <Input
                                                id="neighborhood"
                                                value={editingCustomer.neighborhood || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, neighborhood: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="city">Cidade</Label>
                                              <Input
                                                id="city"
                                                value={editingCustomer.city || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, city: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="state">Estado</Label>
                                              <Input
                                                id="state"
                                                value={editingCustomer.state || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, state: e.target.value} : null)}
                                              />
                                            </div>
                                          </div>
                                          
                                          <div className="flex justify-end space-x-2">
                                            <Button 
                                              variant="outline" 
                                              onClick={() => setEditingCustomer(null)}
                                            >
                                              Cancelar
                                            </Button>
                                            <Button 
                                              onClick={updateCustomer} 
                                              disabled={saving}
                                            >
                                              {saving ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                              ) : (
                                                <Edit className="h-4 w-4 mr-2" />
                                              )}
                                              Salvar
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </DialogContent>
                                  </Dialog>

                                  <Button
                                    onClick={() => setBlockingCustomer(customer)}
                                    size="sm"
                                    variant={customer.is_blocked ? "outline" : "ghost"}
                                    title={customer.is_blocked ? 'Desbloquear cliente' : 'Bloquear cliente'}
                                    className={customer.is_blocked ? 'text-green-600 hover:text-green-700 border-green-300' : 'text-destructive hover:text-destructive'}
                                  >
                                    {customer.is_blocked ? <ShieldCheck className="h-4 w-4" /> : <ShieldBan className="h-4 w-4" />}
                                  </Button>
                                  <Button
                                    onClick={() => deleteCustomer(customer.id)}
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive hover:text-destructive"
                                    title="Excluir cliente"
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
              </div>
            </CardContent>
          </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Block/Unblock Confirmation Dialog */}
          <AlertDialog open={!!blockingCustomer} onOpenChange={(open) => !open && setBlockingCustomer(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {blockingCustomer?.is_blocked ? '✅ Desbloquear Cliente' : '🚫 Bloquear Cliente'}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-base">
                  {blockingCustomer?.is_blocked 
                    ? `Deseja desbloquear ${blockingCustomer?.name}? O cliente poderá realizar novas compras normalmente.`
                    : `Deseja bloquear ${blockingCustomer?.name}? O cliente não poderá mais adicionar itens ao carrinho e receberá uma mensagem automática de restrição.`
                  }
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => blockingCustomer && toggleBlockCustomer(blockingCustomer)}
                  className={blockingCustomer?.is_blocked ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
                >
                  {blockingCustomer?.is_blocked ? 'Desbloquear' : 'Bloquear'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  // Order History View
  if (activeView === 'orderHistory') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <ShoppingBag className="h-8 w-8 mr-3 text-primary" />
                Histórico de Pedidos
              </h1>
              <p className="text-muted-foreground mt-2">
                Visualize todos os pedidos dos clientes
              </p>
            </div>
            <Button 
              onClick={() => setActiveView('dashboard')} 
              variant="outline"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Dashboard
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Pedidos ({filteredOrders.length})
                </span>
                <Button onClick={loadAllOrdersWithCustomers} disabled={loading} size="sm" variant="outline">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Atualizar
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, telefone ou ID do pedido..."
                    value={orderSearchTerm}
                    onChange={(e) => setOrderSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>

                <Separator />

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>Carregando pedidos...</span>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {orderSearchTerm ? 'Nenhum pedido encontrado com os critérios de busca.' : 'Nenhum pedido encontrado.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pedido</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-medium">
                              #{order.id}
                            </TableCell>
                            <TableCell>
                              {order.customer_name || order.customer.name}
                            </TableCell>
                            <TableCell className="font-mono">
                              {formatPhone(order.customer_phone)}
                            </TableCell>
                            <TableCell>
                              {formatDate(order.created_at)}
                            </TableCell>
                            <TableCell className="font-semibold text-green-600">
                              {formatCurrency(order.total_amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={order.is_paid ? "default" : "secondary"}>
                                {order.is_paid ? "Pago" : "Pendente"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                onClick={() => openOrderDetails(order)}
                                size="sm"
                                variant="outline"
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Order Details Dialog */}
        <Dialog open={showOrderDetailsDialog} onOpenChange={setShowOrderDetailsDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">
                Detalhes do Pedido #{selectedOrderForDetails?.tenant_order_number || selectedOrderForDetails?.id}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Visualize todos os produtos e informações do pedido.
              </p>
            </DialogHeader>
            
            {selectedOrderForDetails && (
              <div className="space-y-4">
                {/* Customer Information */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Informações do Cliente</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-semibold">Nome:</span>{' '}
                      {selectedOrderForDetails.customer_name || 'N/A'}
                    </div>
                    <div>
                      <span className="font-semibold">Telefone:</span>{' '}
                      {formatPhone(selectedOrderForDetails.customer_phone)}
                    </div>
                    <div>
                      <span className="font-semibold">CPF:</span>{' '}
                      {selectedOrderForDetails.customer_cpf || 'N/A'}
                    </div>
                    <div className="col-span-2">
                      <span className="font-semibold">Endereço:</span>{' '}
                      {selectedOrderForDetails.customer_street ? (
                        `${selectedOrderForDetails.customer_street}, ${selectedOrderForDetails.customer_number || 'S/N'}${selectedOrderForDetails.customer_complement ? `, ${selectedOrderForDetails.customer_complement}` : ''}, ${(selectedOrderForDetails as any).customer_neighborhood || ''} - ${selectedOrderForDetails.customer_city || ''} - ${selectedOrderForDetails.customer_state || ''}, CEP: ${selectedOrderForDetails.customer_cep || 'N/A'}`
                      ) : 'N/A'}
                    </div>
                  </CardContent>
                </Card>

                {/* Order Summary */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Resumo do Pedido</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-6 text-sm">
                    <div>
                      <span className="font-semibold">Total:</span>{' '}
                      <span className="text-green-600 font-bold">{formatCurrency(selectedOrderForDetails.total_amount)}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Status:</span>{' '}
                      <Badge variant={selectedOrderForDetails.is_paid ? "default" : "secondary"}>
                        {selectedOrderForDetails.is_paid ? "Pago" : "Pendente"}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-semibold">Data:</span>{' '}
                      {formatDate(selectedOrderForDetails.event_date)}
                    </div>
                  </CardContent>
                </Card>

                {/* Shipping Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Informações de Frete</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {selectedOrderForDetails.customer_cep || '00'}
                  </CardContent>
                </Card>

                {/* Products */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      Produtos do Pedido
                      <Badge variant="outline">
                        {selectedOrderForDetails.cart_items.reduce((sum, item) => sum + item.qty, 0)} itens
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedOrderForDetails.cart_items.map((item, index) => (
                      <div key={index} className="flex items-start gap-4 p-4 border rounded-lg">
                        {item.product.image_url ? (
                          <img 
                            src={item.product.image_url} 
                            alt={item.product.name}
                            className="w-16 h-16 object-cover rounded-lg border"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                            <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1">
                          <h4 className="font-semibold">{item.product.name}</h4>
                          <p className="text-sm text-muted-foreground">Código: {item.product.code}</p>
                          <div className="flex gap-4 mt-1 text-sm">
                            <span><span className="font-medium text-primary">Preço unitário:</span> {formatCurrency(item.unit_price)}</span>
                            <span><span className="font-medium text-primary">Quantidade:</span> {item.qty}</span>
                            <span><span className="font-medium">Subtotal:</span> {formatCurrency(item.qty * item.unit_price)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Additional Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Informações Adicionais</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <span className="font-semibold">Pedido criado em:</span>{' '}
                    {formatDateTime(selectedOrderForDetails.created_at)}
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Calculate statistics from paid orders only
  const totalPaidRevenue = customers.reduce((sum, c) => sum + c.total_spent, 0);
  const totalPaidOrdersCount = customers.reduce((sum, c) => sum + c.paid_orders_count, 0);
  const averageTicket = totalPaidOrdersCount > 0 ? totalPaidRevenue / totalPaidOrdersCount : 0;

  const statisticsCards = [
    {
      title: 'Total de Clientes',
      value: customers.length.toString(),
      description: 'Clientes cadastrados',
      icon: Users,
      color: 'text-blue-600'
    },
    {
      title: 'Clientes Ativos',
      value: customers.filter(c => c.total_orders > 0).length.toString(),
      description: 'Com pedidos realizados',
      icon: TrendingUp,
      color: 'text-green-600'
    },
    {
      title: 'Receita Total',
      value: formatCurrency(totalPaidRevenue),
      description: 'Faturamento dos clientes',
      icon: DollarSign,
      color: 'text-purple-600'
    },
    {
      title: 'Ticket Médio',
      value: formatCurrency(averageTicket),
      description: 'Valor médio por cliente',
      icon: BarChart3,
      color: 'text-orange-600'
    }
  ];

  const dashboardItems = [
    {
      title: 'Gerenciar Clientes',
      description: 'Visualizar, cadastrar e editar informações dos clientes',
      icon: Users,
      action: () => setActiveView('management'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      title: 'Cadastrar Cliente',
      description: 'Adicionar novo cliente ao sistema',
      icon: UserPlus,
      action: () => {
        setActiveView('management');
        // Usar setTimeout para garantir que a view mude primeiro, depois a tab
        setTimeout(() => setActiveTab('create'), 0);
      },
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      title: 'Relatórios',
      description: 'Análises e estatísticas dos clientes',
      icon: BarChart3,
      action: () => navigate('/relatorios?tab=customers'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    },
    {
      title: 'Histórico de Pedidos',
      description: 'Visualizar pedidos por cliente',
      icon: ShoppingBag,
      action: () => setActiveView('orderHistory'),
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center">
            <Users className="h-10 w-10 mr-3 text-primary" />
            Centro de Controle - Clientes
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Gerencie todos os clientes e suas informações
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statisticsCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Main Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {dashboardItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card 
                key={item.title} 
                className={`cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 ${item.borderColor} ${item.bgColor} border-2`}
                onClick={item.action}
              >
                <CardHeader>
                  <CardTitle className="flex items-center text-xl">
                    <div className={`p-3 rounded-lg ${item.bgColor} mr-4`}>
                      <Icon className={`h-8 w-8 ${item.color}`} />
                    </div>
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-base">
                    {item.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">
                    Acessar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
};

export default Clientes;