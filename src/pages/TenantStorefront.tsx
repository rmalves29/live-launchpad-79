/**
 * Página Pública da Loja do Tenant
 * /t/:slug — vitrine com botão "Adicionar ao Carrinho"
 */

import { useParams, Link } from 'react-router-dom';
import { useTenantBySlug } from '@/hooks/useTenantBySlug';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ShoppingBag, Phone, Mail, MapPin, Store, XCircle, ExternalLink,
  Plus, Minus, ShoppingCart, Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import IdentifyCustomerDialog, { type StorefrontIdentity } from '@/components/storefront/IdentifyCustomerDialog';

interface Product {
  id: number;
  name: string;
  code: string | null;
  price: number;
  promotional_price: number | null;
  image_url: string | null;
  is_active: boolean;
  color: string | null;
  size: string | null;
  stock: number | null;
}

interface CompanyAddress {
  company_address: string | null;
  company_number: string | null;
  company_complement: string | null;
  company_district: string | null;
  company_city: string | null;
  company_state: string | null;
  company_cep: string | null;
}

const IDENTITY_KEY = (slug: string) => `storefront_identity_${slug}`;

export default function TenantStorefront() {
  const { slug } = useParams<{ slug: string }>();
  const { tenant, loading, error } = useTenantBySlug(slug);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [addingId, setAddingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Identidade do cliente
  const [identity, setIdentity] = useState<StorefrontIdentity | null>(null);
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const [identifyLoading, setIdentifyLoading] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<number | null>(null);

  // Endereço da empresa
  const [companyAddress, setCompanyAddress] = useState<CompanyAddress | null>(null);

  // Carregar produtos
  const loadProducts = useCallback(async (tenantId: string) => {
    setLoadingProducts(true);
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name, code, price, promotional_price, image_url, is_active, color, size, stock')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');
      if (data) setProducts(data as Product[]);
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    if (!tenant) return;
    loadProducts(tenant.id);
  }, [tenant, loadProducts]);

  // Carregar endereço da empresa
  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('tenants')
          .select('company_address, company_number, company_complement, company_district, company_city, company_state, company_cep')
          .eq('id', tenant.id)
          .maybeSingle();
        if (!cancelled && data) setCompanyAddress(data as CompanyAddress);
      } catch (err) {
        console.warn('Erro ao carregar endereço da empresa:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [tenant]);

  // Resolve identidade ao montar (localStorage → edge function por IP)
  useEffect(() => {
    if (!tenant || !slug) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = localStorage.getItem(IDENTITY_KEY(slug));
        if (stored) {
          const parsed = JSON.parse(stored) as StorefrontIdentity;
          if (parsed?.phone) { if (!cancelled) setIdentity(parsed); return; }
        }
        const { data } = await supabase.functions.invoke('storefront-resolve-visitor', {
          body: { tenant_slug: slug },
        });
        if (!cancelled && data?.identity?.phone) {
          const id: StorefrontIdentity = {
            phone: data.identity.phone,
            instagram: data.identity.instagram || '',
          };
          setIdentity(id);
          localStorage.setItem(IDENTITY_KEY(slug), JSON.stringify(id));
        }
      } catch (e) {
        console.warn('resolve-visitor falhou', e);
      }
    })();
    return () => { cancelled = true; };
  }, [tenant, slug]);

  const getQty = (id: number) => quantities[id] ?? 1;
  const setQty = (id: number, value: number, max: number) => {
    const clamped = Math.max(1, Math.min(value, Math.max(1, max)));
    setQuantities((prev) => ({ ...prev, [id]: clamped }));
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? products.filter((p) =>
        p.name.toLowerCase().includes(normalizedSearch) ||
        (p.code || '').toLowerCase().includes(normalizedSearch)
      )
    : products;

  const performAdd = useCallback(async (productId: number, currentIdentity: StorefrontIdentity) => {
    if (!slug) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const qty = quantities[productId] ?? 1;
    setAddingId(productId);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('storefront-add-to-cart', {
        body: {
          tenant_slug: slug,
          product_id: productId,
          qty,
          customer_phone: currentIdentity.phone,
          customer_instagram: currentIdentity.instagram,
        },
      });

      if (fnErr || (data && data.error)) {
        const msg = (data?.error as string) || (fnErr?.message as string) || 'Erro ao adicionar';
        toast({ title: 'Não foi possível adicionar', description: msg, variant: 'destructive' });
        if (data?.code === 'OUT_OF_STOCK' || data?.code === 'INSUFFICIENT_STOCK') {
          if (tenant) loadProducts(tenant.id);
        }
        return;
      }

      toast({
        title: 'Produto adicionado!',
        description: 'Confira no seu WhatsApp ✨',
      });
      // Atualiza estoque local
      if (typeof data?.remaining_stock === 'number') {
        setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, stock: data.remaining_stock } : p));
      }
      setQuantities((prev) => ({ ...prev, [productId]: 1 }));
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao adicionar', variant: 'destructive' });
    } finally {
      setAddingId(null);
    }
  }, [slug, products, tenant, loadProducts, quantities]);

  const handleAddClick = (productId: number) => {
    if (identity?.phone) {
      performAdd(productId, identity);
    } else {
      setPendingProductId(productId);
      setIdentifyOpen(true);
    }
  };

  const handleIdentityConfirm = async (newIdentity: StorefrontIdentity) => {
    if (!slug) return;
    setIdentifyLoading(true);
    try {
      setIdentity(newIdentity);
      localStorage.setItem(IDENTITY_KEY(slug), JSON.stringify(newIdentity));
      setIdentifyOpen(false);
      if (pendingProductId != null) {
        await performAdd(pendingProductId, newIdentity);
        setPendingProductId(null);
      }
    } finally {
      setIdentifyLoading(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-600">Carregando loja...</p>
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-6 w-6" />
              <CardTitle>Loja não encontrada</CardTitle>
            </div>
            <CardDescription>{error || 'Esta loja não existe ou está desativada'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>URL solicitada: <strong>/{slug}</strong></AlertDescription>
            </Alert>
            <Button asChild className="w-full mt-6">
              <Link to="/">Voltar para Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const storeUrl = `https://app.orderzaps.com/t/${tenant.slug}`;
  const checkoutUrl = `https://app.orderzaps.com/t/${tenant.slug}/checkout`;

  return (
    <div className="min-h-screen" style={{ backgroundColor: tenant.primary_color || '#f8fafc' }}>
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {tenant.logo_url && (
              <img src={tenant.logo_url} alt={tenant.name} className="h-16 w-16 object-contain rounded-lg" />
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{tenant.name}</h1>
              {tenant.description && <p className="text-gray-600 mt-1">{tenant.description}</p>}
            </div>
            {identity?.phone && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                @{identity.instagram || 'cliente'}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Banner compacto de boas-vindas com destaque para o CTA */}
        <Card className="mb-8 overflow-hidden border-green-200">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-green-600" />
                  Bem-vindo à {tenant.name}!
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Escolha os produtos abaixo e finalize seu pedido. Você recebe a confirmação no WhatsApp.
                </p>
              </div>
              <Button
                asChild
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white font-bold text-base px-8 py-6 shadow-lg hover:shadow-xl transition-all whitespace-nowrap shrink-0"
              >
                <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                  🛒 Finalizar pedido <ExternalLink className="h-5 w-5" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div id="produtos">
          <Card>
            <CardHeader>
              <CardTitle>Produtos em Destaque</CardTitle>
              <CardDescription>
                {products.length > 0 ? `${products.length} produto(s) disponível(is)` : 'Nenhum produto cadastrado ainda'}
              </CardDescription>
              <div className="relative mt-3 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar produto pelo nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              {loadingProducts ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>{searchTerm ? 'Nenhum produto encontrado para sua busca.' : 'Nenhum produto disponível no momento.'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {filteredProducts.map((product) => {
                    const hasPromo = product.promotional_price != null
                      && product.promotional_price > 0
                      && product.promotional_price < product.price;
                    const displayPrice = hasPromo ? product.promotional_price! : product.price;
                    const stock = product.stock ?? 0;
                    const isOutOfStock = stock <= 0;
                    const qty = getQty(product.id);
                    const isAdding = addingId === product.id;

                    return (
                      <div key={product.id} className="border rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow flex flex-col">
                        <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden relative">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className={`w-full h-full object-cover ${isOutOfStock ? 'opacity-60' : ''}`} loading="lazy" />
                          ) : (
                            <ShoppingBag className="h-12 w-12 text-gray-300" />
                          )}
                          {isOutOfStock ? (
                            <Badge className="absolute top-2 right-2 bg-gray-700 text-white text-xs">Esgotado</Badge>
                          ) : hasPromo ? (
                            <Badge className="absolute top-2 right-2 bg-red-500 text-white text-xs">Promoção</Badge>
                          ) : null}
                        </div>

                        <div className="p-3 flex flex-col flex-1">
                          {product.code && (
                            <Badge variant="outline" className="mb-2 self-start text-sm font-bold tracking-wide bg-blue-50 text-blue-700 border-blue-200">
                              {product.code}
                            </Badge>
                          )}
                          <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{product.name}</h3>
                          {(product.color || product.size) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {product.color && <Badge variant="secondary" className="text-xs font-normal">Cor: {product.color}</Badge>}
                              {product.size && <Badge variant="secondary" className="text-xs font-normal">Tam: {product.size}</Badge>}
                            </div>
                          )}
                          <div className="mt-2">
                            {hasPromo ? (
                              <div className="flex flex-col">
                                <span className="text-xs text-gray-400 line-through">{formatCurrency(product.price)}</span>
                                <span className="text-base font-bold text-red-600">{formatCurrency(displayPrice)}</span>
                              </div>
                            ) : (
                              <span className="text-base font-bold text-gray-900">{formatCurrency(product.price)}</span>
                            )}
                          </div>

                          <div className="mt-3 pt-3 border-t flex flex-col gap-2 mt-auto">
                            {!isOutOfStock && (
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  onClick={() => setQty(product.id, qty - 1, stock)}
                                  disabled={qty <= 1 || isAdding}
                                  aria-label="Diminuir quantidade"
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="min-w-[2rem] text-center text-sm font-semibold">{qty}</span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  onClick={() => setQty(product.id, qty + 1, stock)}
                                  disabled={qty >= stock || isAdding}
                                  aria-label="Aumentar quantidade"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            )}

                            {isOutOfStock ? (
                              <Button type="button" variant="secondary" disabled className="w-full">
                                Esgotado
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                onClick={() => handleAddClick(product.id)}
                                disabled={isAdding}
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                              >
                                {isAdding ? (
                                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adicionando...</>
                                ) : (
                                  <><ShoppingCart className="h-4 w-4 mr-2" />Adicionar ao carrinho</>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="bg-white border-t mt-12">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Store className="h-5 w-5" />Informações
              </h3>
              {tenant.whatsapp_number && (
                <div className="flex items-start gap-3 mb-2">
                  <Phone className="h-4 w-4 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">WhatsApp</p>
                    <a href={`https://wa.me/${tenant.whatsapp_number.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-green-600 hover:underline">
                      {tenant.whatsapp_number}
                    </a>
                  </div>
                </div>
              )}
              {tenant.email && (
                <div className="flex items-start gap-3 mb-2">
                  <Mail className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">E-mail</p>
                    <a href={`mailto:${tenant.email}`} className="text-sm text-blue-600 hover:underline">{tenant.email}</a>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <MapPin className="h-5 w-5" />URL da Loja
              </h3>
              <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                {storeUrl}
              </a>
            </div>

            {companyAddress && (companyAddress.company_address || companyAddress.company_city) && (
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                  <MapPin className="h-5 w-5" />Endereço
                </h3>
                <div className="text-sm text-gray-600 space-y-0.5">
                  <p>
                    {[companyAddress.company_address, companyAddress.company_number].filter(Boolean).join(', ')}
                    {companyAddress.company_complement ? ` — ${companyAddress.company_complement}` : ''}
                  </p>
                  {companyAddress.company_district && <p>{companyAddress.company_district}</p>}
                  <p>
                    {[companyAddress.company_city, companyAddress.company_state].filter(Boolean).join(' - ')}
                    {companyAddress.company_cep ? ` • CEP ${companyAddress.company_cep}` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-4 text-center text-sm text-gray-600">
            <p>© {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.</p>
            <p className="mt-1">Powered by <strong>OrderZap</strong> - Sistema Multi-Tenant</p>
          </div>
        </div>
      </footer>

      <IdentifyCustomerDialog
        open={identifyOpen}
        onOpenChange={(o) => { setIdentifyOpen(o); if (!o) setPendingProductId(null); }}
        onConfirm={handleIdentityConfirm}
        loading={identifyLoading}
      />
    </div>
  );
}
