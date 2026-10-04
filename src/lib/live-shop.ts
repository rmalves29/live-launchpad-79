import { supabase } from '@/integrations/supabase/client';
import { fetchCustomShippingOptions } from '@/hooks/useCustomShippingOptions';
import { getActiveShippingIntegration, type ShippingProvider } from '@/lib/shipping-utils';

// ---------------------------------------------------------------- tipos
export interface LiveVariant {
  id: number;
  label: string;
  stock: number;
  price: number;
  was: number | null;
  image_url: string | null;
}

export interface LiveProduct {
  key: string;
  id: number;
  code: string;
  name: string;
  image_url: string | null;
  is_live: boolean;
  price: number;
  was: number | null;
  price_from?: boolean;
  stock: number;
  variants: LiveVariant[];
}

export interface LiveCoupon {
  code: string;
  discount_type: string;
  discount_value: number;
  min_purchase_amount: number;
  min_items_quantity: number;
  progressive_tiers: Array<{ min_value: number; max_value: number | null; discount: number }> | null;
  apply_to_promotional: boolean;
  expires_at: string | null;
}

export interface LiveCatalogMeta {
  tenant: { id: string; name: string; slug: string; logo_url: string | null; primary_color: string | null };
  coupons: LiveCoupon[];
  gifts: Array<{ name: string; minimum_purchase_amount: number }>;
  shipping_hints: Array<{ name: string; price: number; free_min: number | null; pickup: boolean }>;
  payment: { pix: boolean; card: boolean; pix_discount_percent: number; requires_email?: boolean };
  settings: { reserve_mode: 'order' | 'cart'; cart_minutes: number };
}

export interface LiveCustomer {
  name: string;
  phone: string;
  cpf: string;
  email: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface CartLine {
  product_id: number;
  qty: number;
  // Snapshot para exibir o carrinho sem refazer consultas
  code: string;
  name: string;
  label: string;
  image_url: string | null;
  price: number;
  was: number | null;
  stock: number;
}

export interface ShippingOption {
  id: string;
  name: string;
  company: string;
  price: number;
  delivery_time: string;
}

// Endereço público que o cliente usa (independe do domínio em que o lojista está logado).
export const LIVE_SHOP_PUBLIC_BASE = 'https://app.orderzaps.com';
export const liveShopUrl = (slug: string) => `${LIVE_SHOP_PUBLIC_BASE}/t/${slug}/live`;

// ---------------------------------------------------------------- utilidades
export const brl = (v: number) => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');

export function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '');
}

export function formatPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function normalizeLocalPhone(v: string) {
  let d = onlyDigits(v).replace(/^0+/, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}

// ---------------------------------------------------------------- API
export async function liveApi<T = any>(action: string, tenantSlug: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('live-shop', {
    body: { action, tenant_slug: tenantSlug, ...payload },
  });
  if (error) throw new Error(error.message || 'Falha de conexão');
  return data as T;
}

// ---------------------------------------------------------------- cálculos (espelham o servidor; o servidor recalcula)
export function lineTotal(l: CartLine) {
  return l.price * l.qty;
}

export function cartSubtotal(lines: CartLine[]) {
  return Math.round(lines.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;
}

export function cartOriginal(lines: CartLine[]) {
  return Math.round(lines.reduce((s, l) => s + (l.was || l.price) * l.qty, 0) * 100) / 100;
}

export function previewCoupon(coupon: LiveCoupon | undefined, lines: CartLine[]): { ok: boolean; discount: number; message?: string } {
  if (!coupon) return { ok: false, discount: 0, message: 'Cupom inválido ou expirado.' };
  const eligible = coupon.apply_to_promotional === false ? lines.filter((l) => !l.was) : lines;
  const base = eligible.reduce((s, l) => s + l.price * l.qty, 0);
  const qty = eligible.reduce((s, l) => s + l.qty, 0);
  if (base <= 0) return { ok: false, discount: 0, message: 'Este cupom não vale para produtos em promoção.' };
  if (coupon.discount_type !== 'progressive') {
    if (coupon.min_purchase_amount > 0 && base < coupon.min_purchase_amount) {
      return { ok: false, discount: 0, message: `Este cupom vale em compras acima de ${brl(coupon.min_purchase_amount)}.` };
    }
    if (coupon.min_items_quantity > 0 && qty < coupon.min_items_quantity) {
      return { ok: false, discount: 0, message: `Este cupom vale a partir de ${coupon.min_items_quantity} item(ns).` };
    }
  }
  let discount = 0;
  if (coupon.discount_type === 'percentage') discount = (base * coupon.discount_value) / 100;
  else if (coupon.discount_type === 'fixed') discount = Math.min(coupon.discount_value, base);
  else if (coupon.discount_type === 'progressive') {
    const tier = (coupon.progressive_tiers || []).find((t) => base >= t.min_value && (t.max_value == null || base <= t.max_value));
    if (!tier) return { ok: false, discount: 0, message: 'Seu pedido ainda não atingiu a faixa de desconto deste cupom.' };
    discount = (base * tier.discount) / 100;
  }
  discount = Math.round(Math.min(discount, base) * 100) / 100;
  return discount > 0 ? { ok: true, discount } : { ok: false, discount: 0, message: 'Cupom sem desconto para este pedido.' };
}

export function describeCoupon(c: LiveCoupon) {
  let title = '';
  if (c.discount_type === 'percentage') title = `${c.discount_value}% OFF`;
  else if (c.discount_type === 'fixed') title = `${brl(c.discount_value)} OFF`;
  else title = 'Desconto progressivo';
  const rules: string[] = [];
  if (c.discount_type === 'progressive' && c.progressive_tiers?.length) {
    rules.push(c.progressive_tiers.map((t) => `${t.discount}% a partir de ${brl(t.min_value)}`).join(' · '));
  } else {
    if (c.min_purchase_amount > 0) rules.push(`em compras acima de ${brl(c.min_purchase_amount)}`);
    if (c.min_items_quantity > 0) rules.push(`a partir de ${c.min_items_quantity} item(ns)`);
  }
  if (c.apply_to_promotional === false) rules.push('não vale em produtos promocionais');
  return { title, rule: rules.join(' · ') || 'sem valor mínimo' };
}

export function validCpf(cpf: string) {
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(d[10]);
}

// ---------------------------------------------------------------- frete (mesma lógica do checkout público)
function filterCarrierOptions(options: any[], provider: ShippingProvider) {
  const norm = (v: unknown) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return options.filter((o) => {
    const company = norm(o.company);
    const service = norm(o.name);
    if (provider === 'melhor_envio') return true;
    if (provider === 'meuscorreios' || provider === 'correios' || provider === 'mandabem') {
      return company.includes('correios') || service.includes('pac') || service.includes('sedex') || service.includes('mini');
    }
    if (provider === 'superfrete') {
      return (
        company.includes('superfrete') || company.includes('correios') || company.includes('jadlog') ||
        service.includes('pac') || service.includes('sedex') || service.includes('mini') || service.includes('jadlog') || service.includes('package')
      );
    }
    const isMandae = company.includes('mandae') || service.includes('economico') || service.includes('rapido');
    if (isMandae) return provider === 'mandae';
    return company.includes('j&t') || company.includes('correios') || service.includes('pac') || service.includes('sedex') || service.includes('j&t');
  });
}

export async function calculateLiveShipping(params: {
  tenantId: string;
  cep: string;
  lines: CartLine[];
  cartTotal: number;
}): Promise<{ options: ShippingOption[]; notice?: string }> {
  const cep = onlyDigits(params.cep);
  if (cep.length !== 8) return { options: [] };

  let state = '';
  let city = '';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (!d.erro) {
      state = d.uf || '';
      city = d.localidade || '';
    }
  } catch {
    /* sem ViaCEP: segue só com o que já temos */
  }

  const custom = await fetchCustomShippingOptions(params.tenantId, state, city, params.cartTotal, 'live');
  const options: ShippingOption[] = custom.map((o) => ({
    id: o.id,
    name: o.name,
    company: o.company,
    price: parseFloat(o.custom_price || o.price) || 0,
    delivery_time: o.delivery_time,
  }));

  const active = await getActiveShippingIntegration(params.tenantId);
  if (!active.provider) return { options };

  try {
    if (active.testFunctionName) {
      const t = await supabase.functions.invoke(active.testFunctionName, { body: { tenant_id: params.tenantId } });
      if (t.error || !t.data?.valid) return { options, notice: 'A transportadora não respondeu agora. Mostrando apenas as opções da loja.' };
    }

    const { data: app } = await supabase
      .from('app_settings')
      .select('default_weight_kg, default_width_cm, default_height_cm, default_length_cm')
      .limit(1)
      .single();
    const weight = app?.default_weight_kg ?? 0.01;
    const qty = params.lines.reduce((s, l) => s + l.qty, 0);
    const insurance = params.lines.reduce((s, l) => s + l.price * l.qty, 0);

    const res = await supabase.functions.invoke(active.functionName, {
      body: {
        to_postal_code: cep,
        tenant_id: params.tenantId,
        products: [{
          id: 'consolidated',
          width: app?.default_width_cm ?? 13,
          height: app?.default_height_cm ?? 6,
          length: app?.default_length_cm ?? 16,
          weight: Math.max(0.01, qty * weight),
          insurance_value: insurance,
          quantity: 1,
        }],
      },
    });

    const data: any = res.data;
    if (res.error || data?.success === false || !Array.isArray(data?.shipping_options)) {
      return { options, notice: 'Não foi possível consultar a transportadora. Mostrando as opções da loja.' };
    }

    const display =
      active.provider === 'mandae' ? 'Mandae' : active.provider === 'mandabem' ? 'Manda Bem' :
      active.provider === 'superfrete' ? 'SuperFrete' : active.provider === 'frenet' ? 'Frenet' :
      active.provider === 'meuscorreios' || active.provider === 'correios' ? 'Correios' : 'Melhor Envio';

    const carrier = data.shipping_options
      .filter((o: any) => o && !o.error && o.price)
      .map((o: any) => ({
        id: String(o.service_id || o.id || Math.random()),
        name: String(o.service_name || o.name || 'Transportadora'),
        company: display,
        price: parseFloat(o.custom_price || o.price || 0) || 0,
        delivery_time: String(o.delivery_time || '5-10 dias'),
      }));
    return { options: [...options, ...filterCarrierOptions(carrier, active.provider)] };
  } catch {
    return { options, notice: 'Não foi possível consultar a transportadora. Mostrando as opções da loja.' };
  }
}
