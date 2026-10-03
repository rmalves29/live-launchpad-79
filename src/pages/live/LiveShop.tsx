import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  brl, calculateLiveShipping, cartOriginal, cartSubtotal, describeCoupon, formatCep, formatCpf, formatPhone,
  liveApi, normalizeLocalPhone, onlyDigits, previewCoupon, validCpf,
  type CartLine, type LiveCatalogMeta, type LiveCoupon, type LiveCustomer, type LiveProduct, type LiveVariant, type ShippingOption,
} from '@/lib/live-shop';
import './live-shop.css';

type Screen = 'shop' | 'cart' | 'checkout' | 'done';
type Modal =
  | null
  | { type: 'variant'; product: LiveProduct; mode: 'cart' | 'buy'; variantId: number | null; qty: number }
  | { type: 'phone' }
  | { type: 'signup' }
  | { type: 'note' };

const EMPTY_CUSTOMER: LiveCustomer = {
  name: '', phone: '', cpf: '', email: '', cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '',
};

const mmss = (s: number) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* navegação privada: segue sem persistir */
  }
}

const CartIcon = ({ plus = false }: { plus?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
    <path d="M2.5 3.5h2.7l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.2a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.2" />
    {plus && <path d="M13 5v5M10.5 7.5h5" />}
  </svg>
);
const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export default function LiveShop() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = useMemo(() => decodeURIComponent(slugParam || '').replace(/[​-‍﻿]/g, '').trim().toLowerCase(), [slugParam]);

  const [meta, setMeta] = useState<LiveCatalogMeta | null>(null);
  const [products, setProducts] = useState<LiveProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [screen, setScreen] = useState<Screen>('shop');
  const [modal, setModal] = useState<Modal>(null);
  const [cart, setCart] = useState<CartLine[]>(() => readLS<CartLine[]>(`live_cart_${slug}`, []));
  const [direct, setDirect] = useState<CartLine[] | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [customer, setCustomer] = useState<LiveCustomer | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [form, setForm] = useState<LiveCustomer>(EMPTY_CUSTOMER);
  const [formError, setFormError] = useState('');

  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [note, setNote] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  const [shipOptions, setShipOptions] = useState<ShippingOption[]>([]);
  const [shipId, setShipId] = useState<string>('');
  const [shipLoading, setShipLoading] = useState(false);
  const [shipNotice, setShipNotice] = useState('');
  const [pay, setPay] = useState<'pix' | 'card'>('pix');

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingNext = useRef<'checkout' | null>(null);

  const sessionId = useMemo(() => {
    let id = readLS<string | null>(`live_session_${slug}`, null);
    if (!id) {
      id = (crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).slice(0, 60);
      writeLS(`live_session_${slug}`, id);
    }
    return id;
  }, [slug]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  useEffect(() => { writeLS(`live_cart_${slug}`, cart); }, [cart, slug]);
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    document.title = meta?.tenant?.name ? `Vitrine da live · ${meta.tenant.name}` : 'Loja da Live';
  }, [meta]);

  // ------------------------------------------------ carga inicial
  const loadCatalog = useCallback(async (opts: { offset?: number; q?: string; append?: boolean } = {}) => {
    const offset = opts.offset ?? 0;
    try {
      const res: any = await liveApi('catalog', slug, { offset, limit: 40, q: opts.q ?? '' });
      if (!res?.ok) { setError(res?.error || 'Loja não encontrada.'); return; }
      setError(null);
      if (res.tenant) {
        setMeta({ tenant: res.tenant, coupons: res.coupons || [], gifts: res.gifts || [], shipping_hints: res.shipping_hints || [], payment: res.payment, settings: res.settings });
        if (!res.payment.pix && res.payment.card) setPay('card');
      }
      setTotal(res.total || 0);
      setProducts((prev) => {
        if (!opts.append) return res.items;
        const map = new Map(prev.map((p) => [p.key, p]));
        for (const it of res.items as LiveProduct[]) map.set(it.key, it);
        return Array.from(map.values());
      });
    } catch {
      setError('Não foi possível carregar a vitrine. Verifique sua conexão.');
    }
  }, [slug]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await loadCatalog();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [loadCatalog]);

  // reconhece o aparelho: se já comprou aqui, lembra o telefone (nunca por IP)
  useEffect(() => {
    const saved = readLS<string | null>(`live_phone_${slug}`, null);
    if (!saved) return;
    (async () => {
      try {
        const r: any = await liveApi('customer_lookup', slug, { phone: saved });
        if (r?.ok && r.found && r.complete) setCustomer({ ...EMPTY_CUSTOMER, ...r.customer });
      } catch { /* segue sem reconhecer */ }
    })();
  }, [slug]);

  // ------------------------------------------------ cálculos
  const lines = direct ?? cart;
  const cartCount = cart.reduce((n, l) => n + l.qty, 0);
  const subtotal = cartSubtotal(lines);
  const original = cartOriginal(lines);
  const coupon: LiveCoupon | undefined = meta?.coupons.find((c) => c.code === couponCode);
  const couponCalc = couponCode ? previewCoupon(coupon, lines) : { ok: false, discount: 0 };
  const couponOff = couponCalc.ok ? couponCalc.discount : 0;
  const gift = useMemo(() => {
    const eligible = (meta?.gifts || []).filter((g) => subtotal >= g.minimum_purchase_amount);
    return eligible.sort((a, b) => b.minimum_purchase_amount - a.minimum_purchase_amount)[0] || null;
  }, [meta, subtotal]);
  const freeMin = useMemo(() => {
    const mins = (meta?.shipping_hints || []).filter((h) => h.free_min != null).map((h) => h.free_min as number);
    return mins.length ? Math.min(...mins) : null;
  }, [meta]);
  const selectedShip = shipOptions.find((o) => o.id === shipId) || null;
  const shipPrice = selectedShip ? selectedShip.price : 0;
  const pixPct = pay === 'pix' ? meta?.payment.pix_discount_percent || 0 : 0;
  const pixOff = pixPct > 0 ? Math.round((Math.max(0, subtotal - couponOff) * pixPct) / 100 * 100) / 100 : 0;
  const totalFinal = Math.max(0, subtotal - couponOff - pixOff) + shipPrice;
  const reserveLeft = expiresAt ? Math.max(0, Math.round((expiresAt - tick) / 1000)) : null;

  // ------------------------------------------------ carrinho
  const makeLine = (p: LiveProduct, v: LiveVariant | null, qty: number): CartLine => ({
    product_id: v ? v.id : p.id, qty, code: p.code, name: p.name, label: v ? v.label : '',
    image_url: v?.image_url || p.image_url, price: v ? v.price : p.price, was: v ? v.was : p.was, stock: v ? v.stock : p.stock,
  });

  async function syncReserve(productId: number, qty: number): Promise<boolean> {
    if (meta?.settings.reserve_mode !== 'cart') return true;
    try {
      const r: any = await liveApi('reserve', slug, { session_id: sessionId, product_id: productId, qty });
      if (!r?.ok) { toast(r?.error || 'Estoque insuficiente.'); return false; }
      if (r.expires_at) setExpiresAt(new Date(r.expires_at).getTime());
      return true;
    } catch {
      toast('Sem conexão. Tente novamente.');
      return false;
    }
  }

  async function addLine(p: LiveProduct, v: LiveVariant | null, qty: number) {
    const id = v ? v.id : p.id;
    const stock = v ? v.stock : p.stock;
    const current = cart.find((l) => l.product_id === id)?.qty || 0;
    if (current + qty > stock) { toast(`Só temos ${stock} em estoque.`); return false; }
    if (!(await syncReserve(id, current + qty))) return false;
    setCart((prev) => {
      const found = prev.find((l) => l.product_id === id);
      return found ? prev.map((l) => (l.product_id === id ? { ...l, qty: l.qty + qty } : l)) : [...prev, makeLine(p, v, qty)];
    });
    return true;
  }

  async function changeQty(productId: number, qty: number) {
    const line = cart.find((l) => l.product_id === productId);
    if (!line) return;
    if (qty > line.stock) { toast(`Só temos ${line.stock} em estoque.`); return; }
    if (!(await syncReserve(productId, Math.max(0, qty)))) return;
    setCart((prev) => (qty <= 0 ? prev.filter((l) => l.product_id !== productId) : prev.map((l) => (l.product_id === productId ? { ...l, qty } : l))));
  }

  function onAdd(p: LiveProduct, mode: 'cart' | 'buy') {
    if (p.variants.length > 0) {
      setModal({ type: 'variant', product: p, mode, variantId: null, qty: 1 });
      return;
    }
    if (mode === 'cart') {
      addLine(p, null, 1).then((ok) => ok && toast('Adicionado ao carrinho'));
    } else {
      startCheckout([makeLine(p, null, 1)]);
    }
  }

  async function confirmVariant() {
    if (!modal || modal.type !== 'variant') return;
    const v = modal.product.variants.find((x) => x.id === modal.variantId);
    if (!v) { toast('Escolha uma opção'); return; }
    const { product, mode, qty } = modal;
    if (qty > v.stock) { toast(`Só temos ${v.stock} em estoque.`); return; }
    setModal(null);
    if (mode === 'cart') {
      if (await addLine(product, v, qty)) toast('Adicionado ao carrinho');
    } else {
      startCheckout([makeLine(product, v, qty)]);
    }
  }

  // ------------------------------------------------ identificação
  function startCheckout(directLines: CartLine[] | null) {
    setDirect(directLines);
    if (customer) { goCheckout(); return; }
    pendingNext.current = 'checkout';
    setPhoneInput('');
    setModal({ type: 'phone' });
  }

  function goCheckout() {
    setScreen('checkout');
    window.scrollTo(0, 0);
  }

  async function submitPhone() {
    const phone = normalizeLocalPhone(phoneInput);
    if (phone.length < 10) { toast('Informe o celular com DDD'); return; }
    setBusy(true);
    try {
      const r: any = await liveApi('customer_lookup', slug, { phone });
      if (!r?.ok) { toast(r?.error || 'Não foi possível continuar.'); return; }
      writeLS(`live_phone_${slug}`, phone);
      if (r.found && r.complete) {
        setCustomer({ ...EMPTY_CUSTOMER, ...r.customer });
        setModal(null);
        toast('Encontramos seu cadastro');
        if (pendingNext.current === 'checkout') goCheckout();
        return;
      }
      setForm({ ...EMPTY_CUSTOMER, ...(r.found ? r.customer : {}), phone });
      setFormError('');
      setModal({ type: 'signup' });
    } catch {
      toast('Sem conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function fillCep(cepValue: string) {
    const cep = onlyDigits(cepValue);
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setForm((f) => ({ ...f, street: d.logradouro || f.street, neighborhood: d.bairro || f.neighborhood, city: d.localidade || f.city, state: d.uf || f.state }));
      }
    } catch { /* o cliente digita manualmente */ }
  }

  async function submitSignup() {
    setFormError('');
    if (form.name.trim().length < 2) { setFormError('Digite seu nome completo.'); return; }
    if (!validCpf(form.cpf)) { setFormError('CPF inválido. Confira os números.'); return; }
    if (onlyDigits(form.cep).length !== 8 || !form.street || !form.number || !form.neighborhood || !form.city || form.state.length !== 2) {
      setFormError('Preencha CEP, rua, número, bairro, cidade e estado.');
      return;
    }
    if (meta?.payment.requires_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError('Informe um e-mail válido para o pagamento.');
      return;
    }
    setBusy(true);
    try {
      const r: any = await liveApi('customer_save', slug, { customer: { ...form, phone: normalizeLocalPhone(form.phone) } });
      if (!r?.ok) { setFormError(r?.error || 'Não foi possível salvar seus dados.'); return; }
      writeLS(`live_phone_${slug}`, r.phone);
      setCustomer({ ...form, phone: r.phone });
      setModal(null);
      setShipOptions([]);
      setShipId('');
      if (pendingNext.current === 'checkout' || screen === 'checkout') goCheckout();
    } catch {
      setFormError('Sem conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------ cupom e frete
  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) { setCouponMsg('Digite o código do cupom.'); return; }
    setBusy(true);
    try {
      const r: any = await liveApi('coupon_check', slug, { code, items: lines.map((l) => ({ product_id: l.product_id, qty: l.qty })) });
      if (r?.ok && r.valid) {
        // o servidor valida; guardamos o cupom (e, se ele não veio na vitrine, montamos a prévia pelo valor)
        if (!meta?.coupons.some((c) => c.code === code)) {
          setMeta((m) => m && ({ ...m, coupons: [...m.coupons, { code, discount_type: 'fixed', discount_value: r.discount, min_purchase_amount: 0, min_items_quantity: 0, progressive_tiers: null, apply_to_promotional: true, expires_at: null }] }));
        }
        setCouponCode(code);
        setCouponMsg('');
      } else {
        setCouponCode(null);
        setCouponMsg(r?.message || 'Cupom inválido ou expirado.');
      }
    } catch {
      setCouponMsg('Sem conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  const cepForShipping = customer?.cep || '';
  useEffect(() => {
    if (screen !== 'checkout' || !meta || !cepForShipping || lines.length === 0) return;
    let alive = true;
    (async () => {
      setShipLoading(true);
      const res = await calculateLiveShipping({ tenantId: meta.tenant.id, cep: cepForShipping, lines, cartTotal: cartSubtotal(lines) });
      if (!alive) return;
      setShipOptions(res.options);
      setShipNotice(res.notice || '');
      setShipId((prev) => (res.options.some((o) => o.id === prev) ? prev : res.options.slice().sort((a, b) => a.price - b.price)[0]?.id || ''));
      setShipLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, meta?.tenant.id, cepForShipping, JSON.stringify(lines.map((l) => [l.product_id, l.qty]))]);

  // ------------------------------------------------ pedido e pagamento
  async function placeOrder() {
    if (!meta || !customer) return;
    if (!selectedShip) { toast('Escolha uma opção de frete'); return; }
    if (!validCpf(customer.cpf)) { setForm({ ...EMPTY_CUSTOMER, ...customer }); setFormError('Confirme seu CPF para continuar.'); setModal({ type: 'signup' }); return; }
    setBusy(true);
    const phone = normalizeLocalPhone(customer.phone);
    try {
      const prevOrder = readLS<number | null>(`live_order_${slug}`, null);
      const order: any = await liveApi('create_order', slug, {
        phone, session_id: sessionId, items: lines.map((l) => ({ product_id: l.product_id, qty: l.qty })),
        coupon_code: couponCode, note, replace_order_id: prevOrder,
      });
      if (!order?.ok) {
        toast(order?.error || 'Não foi possível criar o pedido.');
        if (order?.code === 'INSUFFICIENT_STOCK' || order?.code === 'NOT_AVAILABLE') {
          const pid = Number(order.product_id);
          const stock = Number(order.stock ?? 0);
          const fix = (arr: CartLine[]) => arr.flatMap((l) => (l.product_id !== pid ? [l] : stock > 0 ? [{ ...l, qty: Math.min(l.qty, stock), stock }] : []));
          setCart(fix);
          setDirect((d) => (d ? fix(d) : d));
          loadCatalog({ q: query });
        }
        return;
      }
      writeLS(`live_order_${slug}`, order.order_id);

      const shippingData = {
        service_id: selectedShip.id, service_name: selectedShip.name, company_name: selectedShip.company,
        price: selectedShip.price, delivery_time: selectedShip.delivery_time,
      };
      const payTotal = Math.max(0, order.total - pixOff) + selectedShip.price;
      const { data, error: payErr } = await supabase.functions.invoke('create-payment', {
        body: {
          order_ids: [order.order_id], order_id: order.order_id, cartItems: order.items,
          customerData: { name: customer.name, phone, cpf: customer.cpf, email: customer.email },
          addressData: {
            cep: customer.cep, street: customer.street, number: customer.number, complement: customer.complement,
            neighborhood: customer.neighborhood, city: customer.city, state: customer.state,
          },
          shippingCost: selectedShip.price, shippingData, total: payTotal.toString(),
          coupon_discount: order.coupon_discount || 0, coupon_code: order.coupon_code || null,
          tenant_id: meta.tenant.id, tenant_slug: meta.tenant.slug, merge_observation: null,
          payment_method: pay, pix_discount: pixOff,
        },
      });

      const fail = async (msg: string) => {
        await liveApi('cancel_order', slug, { order_id: order.order_id, phone }).catch(() => null);
        writeLS(`live_order_${slug}`, null);
        toast(msg);
      };
      if (payErr) { await fail('Não foi possível iniciar o pagamento. Tente novamente.'); return; }
      if (data?.success === false && data?.error) { await fail(String(data.error)); return; }

      const url = data?.init_point || data?.sandbox_init_point;
      if (url) {
        if (!direct) { setCart([]); writeLS(`live_cart_${slug}`, []); }
        window.location.href = url;
        return;
      }
      if (data?.free_order) {
        if (!direct) setCart([]);
        setScreen('done');
        return;
      }
      await fail('Resposta inválida do pagamento. Tente novamente.');
    } catch {
      toast('Sem conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------ vistas
  const accent = meta?.tenant.primary_color && /^#[0-9a-f]{6}$/i.test(meta.tenant.primary_color) ? meta.tenant.primary_color : null;
  const rootStyle = accent ? ({ '--accent': accent, '--accent-soft': `color-mix(in srgb, ${accent} 12%, white)` } as React.CSSProperties) : undefined;

  const pct = (price: number, was: number | null) => (was ? Math.round((1 - price / was) * 100) : 0);

  const shopView = () => (
    <div className="panel" style={{ marginTop: 0, borderRadius: 0 }}>
      <div className="phead">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {meta?.tenant.logo_url ? (
            <img src={meta.tenant.logo_url} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div className="av">{(meta?.tenant.name || 'L').slice(0, 1)}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1>Vitrine da {meta?.tenant.name || 'loja'}</h1>
            <small>{total} peça(s) na live</small>
          </div>
        </div>
        <button className="cartbtn" onClick={() => setScreen('cart')} aria-label="Abrir carrinho" type="button">
          <CartIcon />
          {cartCount > 0 && <span className="badge">{cartCount}</span>}
        </button>
      </div>

      {meta && (meta.coupons.length > 0 || meta.shipping_hints.length > 0 || meta.gifts.length > 0) && (
        <div className="chips">
          {meta.shipping_hints.filter((h) => h.free_min != null).slice(0, 1).map((h) => (
            <div className="cp ship" key={'fs' + h.name}><b>Frete grátis</b><small>em pedidos acima de {brl(h.free_min as number)}</small></div>
          ))}
          {meta.shipping_hints.filter((h) => h.free_min == null && !h.pickup && h.price > 0).slice(0, 1).map((h) => (
            <div className="cp ship" key={'ff' + h.name}><b>Frete fixo {brl(h.price)}</b><small>{h.name}</small></div>
          ))}
          {meta.coupons.slice(0, 6).map((c) => {
            const d = describeCoupon(c);
            return <div className="cp off" key={c.code}><b>{d.title} · cupom {c.code}</b><small>{d.rule}. Digite no fechamento</small></div>;
          })}
          {meta.gifts.slice(0, 3).map((g) => (
            <div className="cp gift" key={g.name}><b>Brinde: {g.name}</b><small>em compras acima de {brl(g.minimum_purchase_amount)}</small></div>
          ))}
        </div>
      )}

      {total > 12 || query ? (
        <div style={{ padding: '4px 16px 8px' }}>
          <input
            type="text" value={query} placeholder="Buscar por código ou nome" aria-label="Buscar peça"
            onChange={(e) => { setQuery(e.target.value); loadCatalog({ q: e.target.value }); }}
          />
        </div>
      ) : null}

      <div className="list">
        {products.map((p, i) => {
          const off = pct(p.price, p.was);
          return (
            <div className="item it" key={p.key}>
              <div className="ph">
                {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" /> : null}
                <span className="n">{i + 1}</span>
                {p.is_live && <span className="live">Em LIVE agora</span>}
              </div>
              <div>
                <div className="t">{p.name}</div>
                <div className="tags">
                  {freeMin != null && p.price >= freeMin && <span className="tag ship">Frete grátis</span>}
                  {p.stock > 0 && p.stock <= 5 && <span className="tag stock">Restam {p.stock}</span>}
                </div>
                <div className="bot">
                  <div className="pr">
                    {p.was ? <s>{brl(p.was)}</s> : null}
                    <strong>{p.price_from ? 'a partir de ' : ''}{brl(p.price)}</strong>
                    {off > 0 ? <span className="pc">-{off}%</span> : null}
                  </div>
                  <div className="acts">
                    <button className="sq" onClick={() => onAdd(p, 'cart')} aria-label="Adicionar ao carrinho" type="button"><CartIcon plus /></button>
                    <button className="buy" onClick={() => onAdd(p, 'buy')} type="button">Comprar</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!loading && products.length === 0 && (
          <div className="center" style={{ padding: '40px 0' }}>
            <h3>Nenhuma peça disponível agora</h3>
            <p className="note">Assim que o lojista liberar peças para a live, elas aparecem aqui.</p>
          </div>
        )}
      </div>

      {products.length < total && (
        <div style={{ padding: '14px 16px' }}>
          <button
            className="cta block" type="button" disabled={loadingMore}
            onClick={async () => { setLoadingMore(true); await loadCatalog({ offset: products.length, q: query, append: true }); setLoadingMore(false); }}
          >
            {loadingMore ? 'Carregando…' : 'Ver mais peças'}
          </button>
        </div>
      )}
    </div>
  );

  const lineRow = (l: CartLine, editable: boolean) => {
    const off = pct(l.price, l.was);
    return (
      <div className="ci" key={l.product_id}>
        <div className="ph">{l.image_url ? <img src={l.image_url} alt="" /> : null}</div>
        <div>
          <div className="t" style={{ fontSize: 14 }}>{l.name}</div>
          {l.label ? <div className="var">{l.label}</div> : null}
          <div className="bot" style={{ marginTop: 4 }}>
            <div className="pr">
              <strong>{brl(l.price)}</strong>
              {l.was ? <s>{brl(l.was)}</s> : null}
              {off > 0 ? <span className="pc">-{off}%</span> : null}
            </div>
            {editable ? (
              <div className="qty">
                <button onClick={() => changeQty(l.product_id, l.qty - 1)} aria-label="Diminuir" type="button">−</button>
                <span>{l.qty}</span>
                <button onClick={() => changeQty(l.product_id, l.qty + 1)} aria-label="Aumentar" type="button">+</button>
              </div>
            ) : <span className="note">x{l.qty}</span>}
          </div>
        </div>
      </div>
    );
  };

  const giftRow = gift ? (
    <div className="gift-row">
      <div className="ph" style={{ display: 'grid', placeItems: 'center', fontSize: 28 }}>🎁</div>
      <div>
        <div className="t" style={{ fontSize: 14 }}><span className="brinde">Brinde</span>{gift.name}</div>
        <div className="note" style={{ marginTop: 6 }}>R$ 0,00 · x1</div>
      </div>
    </div>
  ) : null;

  const couponBlock = () => {
    if (couponCode && couponCalc.ok) {
      return (
        <div className="line">
          <span>🏷 Cupom {couponCode} aplicado</span>
          <span className="v">-{brl(couponOff)}</span>
        </div>
      );
    }
    return (
      <div className="line" style={{ display: 'block' }}>
        <span>Cupom de desconto</span>
        <div className="cupom-in">
          <input id="ls-cupom" type="text" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Digite o código" autoCapitalize="characters" aria-label="Código do cupom" />
          <button className="mini" onClick={applyCoupon} disabled={busy} type="button">Aplicar</button>
        </div>
        {(couponMsg || (couponCode && !couponCalc.ok)) && <div className="msg bad">{couponMsg || couponCalc.message}</div>}
      </div>
    );
  };

  const cartView = () => (
    <>
      <div className="hdr">
        <button onClick={() => { setDirect(null); setScreen('shop'); }} aria-label="Voltar" type="button"><BackIcon /></button>
        <div className="c">Carrinho ({cartCount})<small>{customer ? `Entrega em ${customer.city}` : 'Endereço será pedido ao finalizar'}</small></div>
        <span />
      </div>
      <div className="full">
        {cart.length === 0 ? (
          <div className="sec center" style={{ marginTop: 40, padding: '40px 16px' }}>
            <div style={{ fontSize: 40 }}>🛍</div>
            <h3 style={{ marginTop: 8 }}>Seu carrinho está vazio</h3>
            <p className="note">Toque no carrinho com + em qualquer peça da vitrine.</p>
            <button className="cta" onClick={() => setScreen('shop')} type="button" style={{ marginTop: 14 }}>Ver a vitrine</button>
          </div>
        ) : (
          <div className="sec">
            <div className="store">{meta?.tenant.name}</div>
            {reserveLeft !== null && reserveLeft > 0 && meta?.settings.reserve_mode === 'cart' && (
              <div className="bene gift" style={{ marginTop: 10 }}>⏱ Peças reservadas por {mmss(reserveLeft)}</div>
            )}
            {freeMin != null && (subtotal - couponOff >= freeMin
              ? <div className="bene ship">🚚 Você ganhou frete grátis!</div>
              : <div className="bene ship" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>🚚 Faltam {brl(freeMin - (subtotal - couponOff))} para o frete grátis</div>)}
            {gift && <div className="bene gift">🎁 Você ganhou um brinde</div>}
            {cart.map((l) => lineRow(l, true))}
            {giftRow}
            {couponBlock()}
          </div>
        )}
      </div>
      {cart.length > 0 && (
        <div className="foot"><div className="in">
          {(original - subtotal + couponOff) > 0 && <div className="save">Você está economizando {brl(original - subtotal + couponOff)}</div>}
          <div className="row">
            <div><div className="tot">{brl(subtotal - couponOff)}</div>{freeMin != null && subtotal - couponOff >= freeMin && <div className="sub">Frete grátis</div>}</div>
            <button className="cta" onClick={() => startCheckout(null)} type="button">Finalizar compra ({cartCount})</button>
          </div>
        </div></div>
      )}
    </>
  );

  const checkoutView = () => {
    if (!customer) return null;
    return (
      <>
        <div className="hdr">
          <button onClick={() => { setScreen(direct ? 'shop' : 'cart'); }} aria-label="Voltar" type="button"><BackIcon /></button>
          <div className="c">Finalizar pedido</div>
          <span />
        </div>
        <div className="full">
          {reserveLeft !== null && reserveLeft > 0 && meta?.settings.reserve_mode === 'cart' && !direct && (
            <div className="hold" style={{ margin: '8px 16px 0' }}>⏱ Peças reservadas por <b>{mmss(reserveLeft)}</b></div>
          )}
          <div className="sec">
            <div className="addr-top">
              <div>
                <h3 style={{ marginBottom: 6 }}>Endereço de entrega</h3>
                <div className="addr">
                  <b>{customer.name}</b> · {formatPhone(customer.phone)}<br />
                  {customer.street}, {customer.number}{customer.complement ? ` · ${customer.complement}` : ''} · {customer.neighborhood}<br />
                  <small>{customer.city} - {customer.state} · {formatCep(customer.cep)}</small>
                </div>
              </div>
              <button className="link" onClick={() => { setForm({ ...EMPTY_CUSTOMER, ...customer }); setFormError(''); pendingNext.current = null; setModal({ type: 'signup' }); }} type="button">Atualizar</button>
            </div>
          </div>

          <div className="sec">
            <div className="addr-top">
              <div className="store">{meta?.tenant.name}</div>
              <button className="link" style={{ color: 'var(--muted)' }} onClick={() => { setNoteDraft(note); setModal({ type: 'note' }); }} type="button">{note ? 'Editar nota' : 'Adicionar nota'} ›</button>
            </div>
            {note && <div className="note" style={{ marginTop: 6 }}>Nota: {note}</div>}
            {lines.map((l) => lineRow(l, false))}
            {giftRow}
            {couponBlock()}
          </div>

          <div className="sec">
            <h3>Forma de pagamento</h3>
            {meta?.payment.pix && (
              <button className="opt" role="radio" aria-checked={pay === 'pix'} onClick={() => setPay('pix')} type="button">
                <span className="dot" /><span className="t"><b>Pix</b><small>Aprovação na hora{(meta?.payment.pix_discount_percent || 0) > 0 ? ` · ${meta?.payment.pix_discount_percent}% de desconto` : ''}</small></span>
              </button>
            )}
            {meta?.payment.card && (
              <button className="opt" role="radio" aria-checked={pay === 'card'} onClick={() => setPay('card')} type="button">
                <span className="dot" /><span className="t"><b>Cartão de crédito</b><small>Parcele no pagamento</small></span>
              </button>
            )}
          </div>

          <div className="sec">
            <h3>Frete</h3>
            {shipLoading && <p className="note">Calculando frete…</p>}
            {!shipLoading && shipOptions.length === 0 && <p className="note">Nenhuma opção de frete disponível para este CEP. Fale com a loja.</p>}
            {shipNotice && <p className="note" style={{ marginBottom: 8 }}>{shipNotice}</p>}
            {shipOptions.map((o) => (
              <button className="opt" key={o.id} role="radio" aria-checked={shipId === o.id} onClick={() => setShipId(o.id)} type="button">
                <span className="dot" />
                <span className="t"><b>{o.name}</b><small>{o.company} · {o.delivery_time}</small></span>
                <span className={'r ' + (o.price === 0 ? 'free' : '')}>{o.price === 0 ? 'Grátis' : brl(o.price)}</span>
              </button>
            ))}
          </div>

          <div className="sec">
            <h3>Resumo do pedido</h3>
            <div className="sum">
              <div className="r"><span>Subtotal do produto</span><span>{brl(subtotal)}</span></div>
              {original > subtotal && <div className="r sb"><span>Preço original</span><span>{brl(original)}</span></div>}
              {original > subtotal && <div className="r sb"><span>Desconto no produto</span><span className="neg">- {brl(original - subtotal)}</span></div>}
              {couponOff > 0 && <div className="r"><span>Cupom {couponCode}</span><span className="neg">- {brl(couponOff)}</span></div>}
              {pixOff > 0 && <div className="r"><span>Desconto Pix ({pixPct}%)</span><span className="neg">- {brl(pixOff)}</span></div>}
              <div className="r"><span>Frete</span><span>{selectedShip ? (shipPrice ? brl(shipPrice) : 'Grátis') : '—'}</span></div>
              <div className="r tot"><span>Total</span><span>{brl(totalFinal)}</span></div>
            </div>
          </div>
        </div>
        <div className="foot"><div className="in">
          {(original - subtotal + couponOff + pixOff) > 0 && <div className="save">Você está economizando {brl(original - subtotal + couponOff + pixOff)} neste pedido</div>}
          <button className="cta block" onClick={placeOrder} disabled={busy || !selectedShip} type="button">
            {busy ? 'Criando seu pedido…' : `Fazer pedido · ${brl(totalFinal)}`}
          </button>
        </div></div>
      </>
    );
  };

  const doneView = () => (
    <div className="center" style={{ padding: '0 16px' }}>
      <div className="ok-badge">✓</div>
      <h2 style={{ fontSize: 24 }}>Pedido confirmado!</h2>
      <p style={{ color: 'var(--muted)', margin: '8px 0 22px' }}>Enviaremos os detalhes no seu WhatsApp. Pode voltar para a live.</p>
      <button className="cta block" onClick={() => { setDirect(null); setScreen('shop'); }} type="button">Voltar para a live</button>
    </div>
  );

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, extra: Record<string, unknown> = {}) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} {...extra} />
    </div>
  );

  const sheets = () => {
    if (!modal) return null;
    const close = () => setModal(null);
    if (modal.type === 'variant') {
      const p = modal.product;
      const v = p.variants.find((x) => x.id === modal.variantId);
      const price = v ? v.price : p.price;
      const was = v ? v.was : p.was;
      return (
        <>
          <div className="scrim" onClick={close} />
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="top">
              <div className="ph">{(v?.image_url || p.image_url) ? <img src={(v?.image_url || p.image_url) as string} alt="" /> : null}</div>
              <div style={{ minWidth: 0 }}>
                <div className="pr"><strong>{brl(price)}</strong>{was ? <s style={{ display: 'inline', marginLeft: 6 }}>{brl(was)}</s> : null}{pct(price, was) > 0 ? <span className="pc">-{pct(price, was)}%</span> : null}</div>
                <div className="note" style={{ marginTop: 6 }}>{p.name}</div>
              </div>
              <button className="x" onClick={close} aria-label="Fechar" type="button">×</button>
            </div>
            <h3 style={{ fontSize: 15 }}>Escolha uma opção ({p.variants.length})</h3>
            <div className="vgrid">
              {p.variants.map((x) => (
                <button className="vt" key={x.id} aria-pressed={modal.variantId === x.id} disabled={x.stock <= 0} onClick={() => setModal({ ...modal, variantId: x.id })} type="button">
                  {x.label}{x.stock <= 0 ? <><br /><small>esgotado</small></> : null}
                </button>
              ))}
            </div>
            <div className="qrow">
              <span>Quantidade</span>
              <div className="qty">
                <button onClick={() => setModal({ ...modal, qty: Math.max(1, modal.qty - 1) })} aria-label="Diminuir" type="button">−</button>
                <span>{modal.qty}</span>
                <button onClick={() => setModal({ ...modal, qty: Math.min(9, modal.qty + 1) })} aria-label="Aumentar" type="button">+</button>
              </div>
            </div>
            <button className="cta block" onClick={confirmVariant} type="button">{modal.mode === 'buy' ? 'Comprar agora' : 'Adicionar ao carrinho'}</button>
          </div>
        </>
      );
    }
    if (modal.type === 'phone') {
      return (
        <>
          <div className="scrim" onClick={close} />
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="top">
              <div><h3>Qual é o seu celular?</h3><p className="note">Se você já comprou com a gente, trazemos seu endereço. Só pedimos uma vez.</p></div>
              <button className="x" onClick={close} aria-label="Fechar" type="button">×</button>
            </div>
            <div className="field">
              <label htmlFor="ls-phone">Celular (WhatsApp)</label>
              <input id="ls-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" value={phoneInput} onChange={(e) => setPhoneInput(formatPhone(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && submitPhone()} autoFocus />
            </div>
            <button className="cta block" onClick={submitPhone} disabled={busy} type="button">{busy ? 'Buscando…' : 'Continuar'}</button>
          </div>
        </>
      );
    }
    if (modal.type === 'signup') {
      const set = (k: keyof LiveCustomer) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
      return (
        <>
          <div className="scrim" onClick={close} />
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="top">
              <div><h3>Seus dados de entrega</h3><p className="note">Salvamos para as próximas compras. Você não precisa digitar de novo.</p></div>
              <button className="x" onClick={close} aria-label="Fechar" type="button">×</button>
            </div>
            <div className="field"><label htmlFor="ls-s-tel">Celular</label><input id="ls-s-tel" type="tel" value={formatPhone(form.phone)} readOnly /></div>
            {field('ls-s-nome', 'Nome completo', form.name, set('name'), { autoComplete: 'name' })}
            {field('ls-s-cpf', 'CPF', formatCpf(form.cpf), (v) => set('cpf')(onlyDigits(v)), { inputMode: 'numeric', placeholder: '000.000.000-00' })}
            {meta?.payment.requires_email && field('ls-s-email', 'E-mail', form.email, set('email'), { type: 'email', autoComplete: 'email' })}
            <div className="g2">
              {field('ls-s-cep', 'CEP', formatCep(form.cep), (v) => { set('cep')(onlyDigits(v)); if (onlyDigits(v).length === 8) fillCep(v); }, { inputMode: 'numeric', placeholder: '00000-000', autoComplete: 'postal-code' })}
              {field('ls-s-num', 'Número', form.number, set('number'), { inputMode: 'numeric' })}
            </div>
            {field('ls-s-rua', 'Rua', form.street, set('street'))}
            <div className="g31">
              {field('ls-s-bairro', 'Bairro', form.neighborhood, set('neighborhood'))}
              {field('ls-s-comp', 'Complemento', form.complement, set('complement'))}
            </div>
            <div className="g31">
              {field('ls-s-cid', 'Cidade', form.city, set('city'))}
              {field('ls-s-uf', 'UF', form.state, (v) => set('state')(v.toUpperCase().slice(0, 2)), { maxLength: 2 })}
            </div>
            {formError && <div className="msg bad" style={{ marginBottom: 10 }}>{formError}</div>}
            <button className="cta block" onClick={submitSignup} disabled={busy} type="button">{busy ? 'Salvando…' : 'Salvar e continuar'}</button>
          </div>
        </>
      );
    }
    return (
      <>
        <div className="scrim" onClick={close} />
        <div className="sheet" role="dialog" aria-modal="true">
          <div className="top"><h3>Nota para a loja</h3><button className="x" onClick={close} aria-label="Fechar" type="button">×</button></div>
          <div className="field"><textarea value={noteDraft} maxLength={300} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Ex.: presente, embrulhar para presente" aria-label="Nota" /></div>
          <button className="cta block" onClick={() => { setNote(noteDraft.trim()); close(); }} type="button">Salvar nota</button>
        </div>
      </>
    );
  };

  return (
    <div className="ls-root" style={rootStyle}>
      <div className="wrap" style={{ minHeight: '100vh' }}>
        {loading ? (
          <div className="center" style={{ padding: '80px 16px' }}><span className="spin" />Carregando a vitrine…</div>
        ) : error ? (
          <div className="center" style={{ padding: '80px 16px' }}><h3>Ops</h3><p className="note" style={{ marginTop: 6 }}>{error}</p></div>
        ) : screen === 'shop' ? shopView()
          : screen === 'cart' ? cartView()
          : screen === 'checkout' ? checkoutView()
          : doneView()}
      </div>
      {sheets()}
      {cartCount > 0 && screen === 'shop' && !loading && !error && (
        <div className="foot"><div className="in">
          <button className="cta block" onClick={() => setScreen('cart')} type="button" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Ver carrinho · {cartCount} {cartCount > 1 ? 'peças' : 'peça'}</span><span>{brl(cartSubtotal(cart))}</span>
          </button>
        </div></div>
      )}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
