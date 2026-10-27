import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  bestAutoCoupon, brl, calculateLiveShipping, cartOriginal, cartSubtotal, describeCoupon, formatCep, formatCpf, formatPhone,
  liveApi, normalizeLocalPhone, onlyDigits, previewCoupon, validCpf,
  type CartLine, type LiveCatalogMeta, type LiveCoupon, type LiveCustomer, type LiveProduct, type LiveVariant, type ShippingOption,
} from '@/lib/live-shop';
import './live-shop.css';

type Screen = 'shop' | 'cart' | 'checkout' | 'done';
type Modal =
  | null
  | { type: 'variant'; product: LiveProduct; mode: 'cart' | 'buy'; variantId: number | null; qty: number; color?: string | null; size?: string | null }
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

// Cache curto da vitrine no aparelho (10 min): abre instantâneo na segunda visita; o servidor sempre revalida o estoque.
const CATALOG_TTL_MS = 10 * 60 * 1000;
function readCatalogCache(slug: string): { meta: LiveCatalogMeta; items: LiveProduct[]; total: number } | null {
  try {
    const raw = sessionStorage.getItem(`live_catalog_${slug}`);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c?.ts || Date.now() - c.ts > CATALOG_TTL_MS) return null;
    // vitrine guardada de uma loja que já passou da hora de sair do ar: não mostra
    const closeAt = c?.meta?.settings?.close_at ? Date.parse(c.meta.settings.close_at) : NaN;
    if (Number.isFinite(closeAt) && Date.now() >= closeAt) return null;
    return c;
  } catch {
    return null;
  }
}
function writeCatalogCache(slug: string, data: { meta: LiveCatalogMeta; items: LiveProduct[]; total: number }) {
  try {
    sessionStorage.setItem(`live_catalog_${slug}`, JSON.stringify({ ...data, ts: Date.now() }));
  } catch {
    /* sem armazenamento: segue sem cache */
  }
}

const ShopSkeleton = () => (
  <div className="panel" style={{ marginTop: 0, borderRadius: 0 }} aria-busy="true" aria-label="Carregando a vitrine">
    <div className="phead">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
        <div className="skel" style={{ width: 38, height: 38, borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <div className="skel" style={{ height: 16, width: '60%', marginBottom: 6 }} />
          <div className="skel" style={{ height: 11, width: '35%' }} />
        </div>
      </div>
    </div>
    <div className="list" style={{ paddingTop: 16 }}>
      {[0, 1, 2].map((i) => (
        <div className="item" key={i}>
          <div className="skel" style={{ width: 92, height: 92 }} />
          <div>
            <div className="skel" style={{ height: 14, width: '80%', marginBottom: 8 }} />
            <div className="skel" style={{ height: 22, width: '40%' }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

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
  const [recognizedBy, setRecognizedBy] = useState<'device' | 'ip' | null>(null);
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
  // Pedido aberto (carrinho = pedido pendente): ações que esperam a identificação, fila de sincronismo e carrinho já confirmado
  const pendingAction = useRef<(() => void) | null>(null);
  const customerRef = useRef<LiveCustomer | null>(null);
  const couponRef = useRef<string | null>(null);
  const cartTouched = useRef(false);
  const hydratedFor = useRef<string | null>(null);
  const syncRef = useRef<{ running: Promise<boolean> | null; queued: CartLine[] | null; confirmed: CartLine[] }>({ running: null, queued: null, confirmed: [] });

  const sessionId = useMemo(() => {
    let id = readLS<string | null>(`live_session_${slug}`, null);
    if (!id) {
      id = (crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).slice(0, 60);
      writeLS(`live_session_${slug}`, id);
    }
    return id;
  }, [slug]);

  // Pedido aberto (carrinho = pedido pendente). Precisa existir ANTES dos efeitos que o usam: usar um const antes da
  // linha em que ele e declarado derruba a pagina inteira (tela branca).
  const openOrder = meta?.settings.open_order === true;

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

  // Fontes carregam em segundo plano (não seguram a primeira pintura)
  useEffect(() => {
    if (document.getElementById('ls-fonts')) return;
    const link = document.createElement('link');
    link.id = 'ls-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Figtree:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  // ------------------------------------------------ carga inicial
  const versionRef = useRef<string | null>(null);
  const clockOffset = useRef(0);
  const loadCatalog = useCallback(async (opts: { offset?: number; q?: string; append?: boolean } = {}) => {
    const offset = opts.offset ?? 0;
    try {
      // Primeira abertura: se o cliente já viu a vitrine há pouco, mostra a versão guardada e atualiza em seguida.
      if (offset === 0 && !opts.q && !opts.append) {
        const cached = readCatalogCache(slug);
        if (cached) {
          setMeta(cached.meta);
          setProducts(cached.items);
          setTotal(cached.total);
          if (!cached.meta.payment.pix && cached.meta.payment.card) setPay('card');
          setLoading(false);
        }
      }
      const res: any = await liveApi('catalog', slug, { offset, limit: 40, q: opts.q ?? '' });
      if (!res?.ok) { setError(res?.error || 'Loja não encontrada.'); return; }
      setError(null);
      if (res.version) versionRef.current = res.version;
      if (res.tenant) {
        setMeta({ tenant: res.tenant, coupons: res.coupons || [], gifts: res.gifts || [], shipping_hints: res.shipping_hints || [], payment: res.payment, settings: res.settings, flash: res.flash || null });
        // diferença entre o relógio do servidor e o do aparelho (a contagem da oferta usa o do servidor)
        if (res.flash?.now) clockOffset.current = new Date(res.flash.now).getTime() - Date.now();
        if (!res.payment.pix && res.payment.card) setPay('card');
      }
      setTotal(res.total || 0);
      if (offset === 0 && !opts.q && res.tenant) {
        writeCatalogCache(slug, { meta: { tenant: res.tenant, coupons: res.coupons || [], gifts: res.gifts || [], shipping_hints: res.shipping_hints || [], payment: res.payment, settings: res.settings }, items: res.items, total: res.total || 0 });
      }
      setProducts((prev) => {
        if (!opts.append) return res.items;
        const map = new Map(prev.map((p) => [p.key, p]));
        for (const it of res.items as LiveProduct[]) {
          const before = map.get(it.key);
          if (before && before.variants.length && it.variants.length) {
            // Variações do mesmo produto caíram em páginas diferentes: junta as duas listas em vez de perder as da página anterior.
            const byId = new Map(before.variants.map((v) => [v.id, v]));
            for (const v of it.variants) byId.set(v.id, v);
            const variants = Array.from(byId.values());
            const prices = variants.map((v) => v.price);
            const low = Math.min(...prices);
            map.set(it.key, {
              ...it,
              variants,
              stock: variants.reduce((s, v) => s + v.stock, 0),
              price: low,
              price_from: low !== Math.max(...prices),
              was: variants.find((v) => v.price === low)?.was ?? null,
            });
          } else {
            map.set(it.key, it);
          }
        }
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

  // Vitrine "ao vivo": a cada 8 s (e ao voltar para a aba) confere se a lista de produtos da live mudou
  // (produto marcado/desmarcado, estoque, loja desativada) e recarrega sozinha, sem o cliente precisar atualizar a página.
  const queryRef = useRef(query);
  queryRef.current = query;
  const errorRef = useRef(error);
  errorRef.current = error;
  useEffect(() => {
    let busyCheck = false;
    const check = async () => {
      if (busyCheck || document.visibilityState !== 'visible') return;
      busyCheck = true;
      try {
        const r: any = await liveApi('catalog_version', slug);
        if (!r?.ok) {
          if (r?.code === 'LIVE_DISABLED') setError(r.error || 'A vitrine da live está indisponível no momento.');
          return;
        }
        if (errorRef.current || (versionRef.current && r.version !== versionRef.current)) {
          versionRef.current = r.version;
          await loadCatalog({ q: queryRef.current });
        } else if (!versionRef.current) {
          versionRef.current = r.version;
        }
      } catch {
        /* sem conexão: tenta de novo no próximo ciclo */
      } finally {
        busyCheck = false;
      }
    };
    const t = setInterval(check, 8000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [slug, loadCatalog]);

  // Oferta relâmpago: contagem pelo relógio do servidor; ao zerar, recarrega a vitrine (o preço volta ao normal).
  const flash = meta?.flash || null;
  const flashLeft = flash ? Math.floor((Date.parse(flash.ends_at) - (tick + clockOffset.current)) / 1000) : 0;
  const flashEndedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!flash || flashLeft > 0 || flashEndedFor.current === flash.ends_at) return;
    flashEndedFor.current = flash.ends_at;
    loadCatalog({ q: queryRef.current });
  }, [flash, flashLeft, loadCatalog]);

  // Preço do carrinho acompanha a vitrine: quando a oferta acaba (ou começa), as peças dela voltam/passam ao preço certo.
  useEffect(() => {
    if (!products.length) return;
    setCart((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        let price: number | null = null;
        let was: number | null = null;
        for (const p of products) {
          if (p.variants.length) {
            const v = p.variants.find((x) => x.id === l.product_id);
            if (v) { price = v.price; was = v.was; break; }
          } else if (p.id === l.product_id) { price = p.price; was = p.was; break; }
        }
        if (price === null || (price === l.price && was === l.was)) return l;
        changed = true;
        return { ...l, price, was };
      });
      return changed ? next : prev;
    });
  }, [products]);

  // reconhece o aparelho: se já comprou aqui, lembra o telefone (nunca por IP)
  useEffect(() => {
    // 1) aparelho: telefone que o cliente já informou aqui; 2) IP: mesma lógica da vitrine antiga.
    // "Não sou eu" desliga o reconhecimento automático nesta sessão.
    let skip = false;
    try { skip = sessionStorage.getItem(`live_norecognize_${slug}`) === '1'; } catch { /* ignora */ }
    if (skip) return;
    (async () => {
      try {
        const saved = readLS<string | null>(`live_phone_${slug}`, null);
        if (saved) {
          const r: any = await liveApi('customer_lookup', slug, { phone: saved });
          if (r?.ok && r.found && r.complete) { setCustomer({ ...EMPTY_CUSTOMER, ...r.customer }); setRecognizedBy('device'); return; }
        }
        const rec: any = await liveApi('recognize', slug);
        if (rec?.ok && rec.found && rec.complete) { setCustomer({ ...EMPTY_CUSTOMER, ...rec.customer }); setRecognizedBy('ip'); }
      } catch { /* segue sem reconhecer */ }
    })();
  }, [slug]);

  // Pedido aberto: o servidor é a fonte do carrinho. Ao identificar a cliente, traz o que já está no pedido dela
  // (e limpa o que já foi pago ou cancelado). Só aplica se ela ainda não mexeu no carrinho nesta visita.
  useEffect(() => {
    const phone = customer ? normalizeLocalPhone(customer.phone) : '';
    if (!openOrder || !phone || hydratedFor.current === phone) return;
    hydratedFor.current = phone;
    (async () => {
      try {
        const r: any = await liveApi('cart_state', slug, { phone });
        if (!r?.ok || cartTouched.current || syncRef.current.running || syncRef.current.queued) return;
        const lines2: CartLine[] = Array.isArray(r.lines) ? r.lines : [];
        syncRef.current.confirmed = lines2;
        setCart(lines2);
        writeLS(`live_order_${slug}`, r.order_id ?? null);
        if (r.coupon_code && !couponCode) setCouponCode(r.coupon_code);
      } catch { /* mantém o carrinho local */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrder, customer?.phone]);

  function notMe() {
    try { sessionStorage.setItem(`live_norecognize_${slug}`, '1'); } catch { /* ignora */ }
    writeLS(`live_phone_${slug}`, null);
    setCustomer(null);
    setRecognizedBy(null);
    setShipOptions([]);
    setShipId('');
    if (screen === 'checkout') {
      pendingNext.current = 'checkout';
      setPhoneInput('');
      setModal({ type: 'phone' });
    } else {
      toast('Tudo certo. Vamos pedir seu celular na hora de comprar.');
    }
  }

  // ------------------------------------------------ cálculos
  const lines = direct ?? cart;
  const cartCount = cart.reduce((n, l) => n + l.qty, 0);
  const subtotal = cartSubtotal(lines);
  const original = cartOriginal(lines);
  const coupon: LiveCoupon | undefined = meta?.coupons.find((c) => c.code === couponCode);
  const couponCalc = couponCode ? previewCoupon(coupon, lines) : { ok: false, discount: 0 };
  // Cupom digitado vale primeiro; se não houver, entra sozinho o cupom "automático" de maior desconto.
  const autoCoupon = !couponCalc.ok ? bestAutoCoupon(meta?.coupons, lines) : null;
  const couponIsAuto = !couponCalc.ok && !!autoCoupon;
  const effectiveCode = couponCalc.ok ? couponCode : autoCoupon?.coupon.code || null;
  const couponOff = couponCalc.ok ? couponCalc.discount : autoCoupon?.discount || 0;
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
  const cardInfoText = useMemo(() => {
    const ci = meta?.payment.card_installments;
    if (!ci || ci.max <= 1) return 'Pagamento no cartão de crédito';
    const free = Math.min(ci.max_without_interest, ci.max);
    const base = free > 1 ? `Até ${free}x sem juros` : `Até ${ci.max}x`;
    const withInterest = free > 1 && ci.max > free ? ` · até ${ci.max}x com juros` : '';
    const min = ci.min_value > 0 ? ` · parcela mínima R$ ${ci.min_value.toFixed(2).replace('.', ',')}` : '';
    return base + withInterest + min;
  }, [meta]);
  const pixPct = pay === 'pix' ?meta?.payment.pix_discount_percent || 0 : 0;
  const pixOff = pixPct > 0 ? Math.round((Math.max(0, subtotal - couponOff) * pixPct) / 100 * 100) / 100 : 0;
  const totalFinal = Math.max(0, subtotal - couponOff - pixOff) + shipPrice;
  // Tela de finalizar: o total base (sem desconto Pix) e quanto o Pix abate; cada botão de pagar mostra o seu valor.
  const pixPctMeta = meta?.payment.pix_discount_percent || 0;
  const pixDiscountOnBase = Math.round((Math.max(0, subtotal - couponOff) * pixPctMeta) / 100 * 100) / 100;
  const baseTotal = Math.max(0, subtotal - couponOff) + shipPrice;
  const reserveLeft = expiresAt ? Math.max(0, Math.round((expiresAt - tick) / 1000)) : null;

  // ------------------------------------------------ carrinho
  const makeLine = (p: LiveProduct, v: LiveVariant | null, qty: number): CartLine => ({
    product_id: v ? v.id : p.id, qty, code: p.code, name: p.name, label: v ? v.label : '',
    image_url: v?.image_url || p.image_url, price: v ? v.price : p.price, was: v ? v.was : p.was, stock: v ? v.stock : p.stock,
  });

  customerRef.current = customer;
  couponRef.current = couponCode;

  // Manda o carrinho inteiro para o servidor (ele cria, atualiza ou apaga o pedido aberto). Uma chamada por vez; se a cliente
  // mexer de novo enquanto uma vai, só a última versão é enviada em seguida.
  function queueSync(next: CartLine[]): Promise<boolean> {
    const st = syncRef.current;
    st.queued = next;
    if (st.running) return st.running;
    st.running = (async () => {
      let ok = true;
      try {
        while (st.queued) {
          const items = st.queued;
          st.queued = null;
          const phone = customerRef.current ? normalizeLocalPhone(customerRef.current.phone) : '';
          if (!phone) { ok = false; break; }
          let r: any;
          try {
            r = await liveApi('cart_sync', slug, {
              phone, session_id: sessionId, coupon_code: couponRef.current,
              items: items.map((l) => ({ product_id: l.product_id, qty: l.qty })),
            });
          } catch {
            toast('Sem conexão. Seu carrinho não foi salvo.');
            setCart(st.confirmed);
            ok = false;
            continue;
          }
          if (r?.ok) {
            st.confirmed = items;
            ok = true;
            writeLS(`live_order_${slug}`, r.order_id ?? null);
            continue;
          }
          ok = false;
          toast(r?.error || 'Não foi possível atualizar seu carrinho.');
          if (Array.isArray(r?.items_state)) {
            // o servidor diz o que ficou no pedido: o carrinho local passa a espelhar isso
            const qtyOf = new Map<number, number>(r.items_state.map((x: any) => [Number(x.product_id), Number(x.qty)]));
            const fixed = items.flatMap((l) => (qtyOf.get(l.product_id) ? [{ ...l, qty: qtyOf.get(l.product_id) as number }] : []));
            st.confirmed = fixed;
            setCart(fixed);
          } else if (r?.code === 'NOT_AVAILABLE' && r?.product_id) {
            const fixed = st.confirmed.filter((l) => l.product_id !== Number(r.product_id));
            st.confirmed = fixed;
            setCart(fixed);
            loadCatalog({ q: query });
          } else {
            setCart(st.confirmed);
          }
        }
      } finally {
        st.running = null;
      }
      return ok;
    })();
    return st.running;
  }

  // Ação que precisa do celular da cliente (pedido aberto): pede a identificação e retoma logo depois
  function withCustomer(action: () => void) {
    if (customerRef.current) { action(); return; }
    pendingAction.current = action;
    pendingNext.current = null;
    setPhoneInput('');
    setModal({ type: 'phone' });
  }
  function resumePending() {
    const next = pendingAction.current;
    if (!next) return;
    pendingAction.current = null;
    setTimeout(next, 0);
  }

  async function syncReserve(productId: number, qty: number): Promise<boolean> {
    if (openOrder) return true; // o próprio pedido aberto segura a peça
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
    if (openOrder) {
      cartTouched.current = true;
      const found = cart.find((l) => l.product_id === id);
      const next = found ? cart.map((l) => (l.product_id === id ? { ...l, qty: l.qty + qty } : l)) : [...cart, makeLine(p, v, qty)];
      setCart(next);
      return await queueSync(next);
    }
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
    if (openOrder) {
      cartTouched.current = true;
      const next = qty <= 0 ? cart.filter((l) => l.product_id !== productId) : cart.map((l) => (l.product_id === productId ? { ...l, qty } : l));
      setCart(next);
      queueSync(next);
      return;
    }
    if (!(await syncReserve(productId, Math.max(0, qty)))) return;
    setCart((prev) => (qty <= 0 ? prev.filter((l) => l.product_id !== productId) : prev.map((l) => (l.product_id === productId ? { ...l, qty } : l))));
  }

  function onAdd(p: LiveProduct, mode: 'cart' | 'buy') {
    if (p.variants.length > 0) {
      setModal({ type: 'variant', product: p, mode, variantId: null, qty: 1 });
      return;
    }
    if (openOrder) {
      withCustomer(() => { addLine(p, null, 1).then((ok) => { if (ok) { if (mode === 'cart') toast('Adicionado ao carrinho'); else startCheckout(null); } }); });
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
    if (openOrder) {
      withCustomer(() => { addLine(product, v, qty).then((ok) => { if (ok) { if (mode === 'cart') toast('Adicionado ao carrinho'); else startCheckout(null); } }); });
      return;
    }
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
        customerRef.current = { ...EMPTY_CUSTOMER, ...r.customer };
        setCustomer({ ...EMPTY_CUSTOMER, ...r.customer });
        setModal(null);
        toast('Encontramos seu cadastro');
        if (pendingNext.current === 'checkout') goCheckout();
        resumePending();
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
      customerRef.current = { ...form, phone: r.phone };
      setCustomer({ ...form, phone: r.phone });
      setModal(null);
      setShipOptions([]);
      setShipId('');
      if (pendingNext.current === 'checkout' || screen === 'checkout') goCheckout();
      resumePending();
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
      const apply = (options: ShippingOption[]) => {
        if (!alive) return;
        setShipOptions(options);
        setShipId((prev) => (options.some((o) => o.id === prev) ? prev : options.slice().sort((a, b) => a.price - b.price)[0]?.id || ''));
      };
      // As opções da própria loja (frete fixo, grátis, retirada) aparecem na hora; as das transportadoras entram quando chegam.
      const res = await calculateLiveShipping({ tenantId: meta.tenant.id, cep: cepForShipping, lines, cartTotal: cartSubtotal(lines), onPartial: apply });
      if (!alive) return;
      apply(res.options);
      setShipNotice(res.notice || '');
      setShipLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, meta?.tenant.id, cepForShipping, JSON.stringify(lines.map((l) => [l.product_id, l.qty]))]);

  // Aquece o frete enquanto a cliente ainda está na vitrine/carrinho: ao abrir "Finalizar pedido" o valor já está em cache.
  useEffect(() => {
    if (screen === 'checkout' || !meta || !cepForShipping || cart.length === 0) return;
    calculateLiveShipping({ tenantId: meta.tenant.id, cep: cepForShipping, lines: cart, cartTotal: cartSubtotal(cart) }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, meta?.tenant.id, cepForShipping, JSON.stringify(cart.map((l) => [l.product_id, l.qty]))]);

  // ------------------------------------------------ pedido e pagamento
  async function placeOrder(method: 'pix' | 'card' = pay) {
    if (!meta || !customer) return;
    setPay(method);
    // o desconto Pix depende da forma escolhida agora (o estado `pay` só atualiza no próximo render)
    const pixOff = method === 'pix' ? Math.round((Math.max(0, subtotal - couponOff) * (meta.payment.pix_discount_percent || 0)) / 100 * 100) / 100 : 0;
    if (!selectedShip) { toast('Escolha uma opção de frete'); return; }
    if (!validCpf(customer.cpf)) { setForm({ ...EMPTY_CUSTOMER, ...customer }); setFormError('Confirme seu CPF para continuar.'); setModal({ type: 'signup' }); return; }
    setBusy(true);
    const phone = normalizeLocalPhone(customer.phone);
    try {
      const prevOrder = openOrder ? null : readLS<number | null>(`live_order_${slug}`, null);
      const order: any = await liveApi('create_order', slug, {
        phone, session_id: sessionId, items: lines.map((l) => ({ product_id: l.product_id, qty: l.qty })),
        coupon_code: couponCode, note, replace_order_id: prevOrder,
      });
      if (!order?.ok) {
        toast(order?.error || 'Não foi possível criar o pedido.');
        if (order?.code === 'INSUFFICIENT_STOCK' || order?.code === 'NOT_AVAILABLE') {
          const pid = Number(order.product_id);
          const stock = Number(order.max_qty ?? order.stock ?? 0);
          const fix = (arr: CartLine[]) => arr.flatMap((l) => (l.product_id !== pid ? [l] : stock > 0 ? [{ ...l, qty: Math.min(l.qty, stock), stock }] : []));
          setCart(fix);
          setDirect((d) => (d ? fix(d) : d));
          loadCatalog({ q: query });
        }
        return;
      }
      writeLS(`live_order_${slug}`, order.order_id);

      const shippingData = {
        service_id: selectedShip.raw_id ?? selectedShip.id, service_name: selectedShip.name, company_name: selectedShip.company,
        provider: selectedShip.provider ?? null,
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
          payment_method: method, pix_discount: pixOff,
        },
      });

      const fail = async (msg: string) => {
        // Pedido aberto: o carrinho continua no pedido (a cliente pode tentar pagar de novo). Fora disso, desfaz o pedido criado.
        if (!openOrder) {
          await liveApi('cancel_order', slug, { order_id: order.order_id, phone }).catch(() => null);
          writeLS(`live_order_${slug}`, null);
        }
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

      {customer && (
        <div className="bene ship" style={{ margin: '10px 16px 0', justifyContent: 'space-between' }}>
          <span>Olá, <b>{customer.name.split(' ')[0]}</b>! Já temos seus dados.</span>
          <button className="link" onClick={notMe} type="button" style={{ fontSize: 13 }}>Não sou eu</button>
        </div>
      )}

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
            // 2 linhas: título + descrição (editável pelo lojista; sem descrição usa a regra do cupom)
            return (
              <div className="cp off" key={c.code}>
                <b>{d.title} · {c.auto_apply ? 'automático' : `cupom ${c.code}`}</b>
                <small>{c.description || d.rule}</small>
              </div>
            );
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

      {flash && flashLeft > 0 && !query && (() => {
        const f = flash.item;
        const off = pct(f.price, f.was);
        const hh = String(Math.floor(flashLeft / 3600)).padStart(2, '0');
        const mm = String(Math.floor((flashLeft % 3600) / 60)).padStart(2, '0');
        const ss = String(flashLeft % 60).padStart(2, '0');
        return (
          <div className={`flash${flashLeft <= 60 ? ' urgent' : ''}`}>
            <div className="fh">
              <span>Oferta relâmpago{flashLeft <= 60 ? <em>Acaba já!</em> : null}</span>
              <div className="clk" role="timer" aria-label="Tempo restante da oferta">
                <div className="u"><b>{hh}</b><i>h</i></div>
                <div className="u"><b>{mm}</b><i>min</i></div>
                <div className="u sec"><b>{ss}</b><i>seg</i></div>
              </div>
            </div>
            <div className="fb">
              {f.image_url ? <img src={f.image_url} alt={f.name} width={46} height={46} /> : <div className="fi" />}
              <div className="ft">
                <div className="t">{f.name}</div>
                {f.was ? <s>{brl(f.was)}</s> : null}
                <strong>{f.price_from ? 'a partir de ' : ''}{brl(f.price)}</strong>
                {off > 0 ? <span className="pc">-{off}%</span> : null}
              </div>
              <button className="buy" onClick={() => onAdd(f, 'buy')} type="button">Comprar</button>
            </div>
          </div>
        );
      })()}

      <div className="list">
        {products.map((p, i) => {
          const off = pct(p.price, p.was);
          return (
            <div className="item it" key={p.key}>
              <div className="ph">
                {p.image_url ? <img src={p.image_url} alt={p.name} loading={i < 4 ? 'eager' : 'lazy'} decoding="async" width={92} height={92} /> : null}
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
    if (couponOff > 0 && effectiveCode) {
      return (
        <div className="line">
          <span>🏷 Cupom {effectiveCode} {couponIsAuto ? 'aplicado automaticamente' : 'aplicado'}</span>
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
              <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                <button className="link" onClick={() => { setForm({ ...EMPTY_CUSTOMER, ...customer }); setFormError(''); pendingNext.current = null; setModal({ type: 'signup' }); }} type="button">Atualizar</button>
                {recognizedBy && <button className="link" style={{ color: 'var(--muted)', fontSize: 12 }} onClick={notMe} type="button">Não sou eu</button>}
              </div>
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
              {couponOff > 0 && <div className="r"><span>Cupom {effectiveCode}</span><span className="neg">- {brl(couponOff)}</span></div>}
              <div className="r"><span>Frete</span><span>{selectedShip ? (shipPrice ? brl(shipPrice) : 'Grátis') : '—'}</span></div>
              <div className="r tot"><span>Total</span><span>{brl(baseTotal)}</span></div>
              {meta?.payment.pix && pixPctMeta > 0 && <div className="r sb"><span>Pagando no Pix: {pixPctMeta}% de desconto</span><span className="neg">{brl(baseTotal - pixDiscountOnBase)}</span></div>}
            </div>
          </div>
        </div>
        <div className="foot"><div className="in">
          {(original - subtotal + couponOff) > 0 && <div className="save">Você está economizando {brl(original - subtotal + couponOff)} neste pedido</div>}
          {/* Um toque na forma de pagamento já cria o pedido e abre a página de pagamento (sem botão "Fazer pedido") */}
          {meta?.payment.pix && (
            <button className="cta block" onClick={() => placeOrder('pix')} disabled={busy || !selectedShip} type="button">
              {busy ? 'Abrindo o pagamento…' : `Pagar com Pix · ${brl(baseTotal - pixDiscountOnBase)}${pixPctMeta > 0 ? ` (${pixPctMeta}% off)` : ''}`}
            </button>
          )}
          {meta?.payment.card && (
            <button className={meta?.payment.pix ? 'cta block alt' : 'cta block'} style={meta?.payment.pix ? { marginTop: 8, background: 'transparent', color: 'var(--accent)', border: '1.5px solid var(--accent)' } : undefined} onClick={() => placeOrder('card')} disabled={busy || !selectedShip} type="button">
              {busy ? 'Abrindo o pagamento…' : `Pagar com cartão · ${brl(baseTotal)}`}
            </button>
          )}
          {meta?.payment.card && <div className="note" style={{ textAlign: 'center', marginTop: 6 }}>{cardInfoText}</div>}
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
    const close = () => { if (modal.type === 'phone' || modal.type === 'signup') pendingAction.current = null; setModal(null); };
    if (modal.type === 'variant') {
      const p = modal.product;
      const vs = p.variants;
      const colors = Array.from(new Set(vs.map((x) => x.color).filter(Boolean))) as string[];
      const sizes = Array.from(new Set(vs.map((x) => x.size).filter(Boolean))) as string[];
      const needC = colors.length > 0;
      const needS = sizes.length > 0;
      const grouped = needC || needS;
      // dimensão com uma única opção já vem escolhida
      const selColor = needC ? (modal.color ?? (colors.length === 1 ? colors[0] : null)) : null;
      const selSize = needS ? (modal.size ?? (sizes.length === 1 ? sizes[0] : null)) : null;
      const v = grouped
        ? ((!needC || selColor) && (!needS || selSize)
            ? vs.find((x) => (!needC || x.color === selColor) && (!needS || x.size === selSize)) || null
            : null)
        : vs.find((x) => x.id === modal.variantId) || null;
      const price = v ? v.price : p.price;
      const was = v ? v.was : p.was;
      const colorImg = (col: string) => vs.find((x) => x.color === col && x.image_url)?.image_url || p.image_url;
      const headImg = v?.image_url || (selColor ? colorImg(selColor) : null) || p.image_url;
      const maxQty = Math.min(9, Math.max(1, v?.stock ?? 9));

      const pick = (color: string | null, size: string | null) => {
        const c = needC ? color : null;
        let s2 = needS ? size : null;
        // se o tamanho já escolhido não existe (ou está esgotado) na nova cor, limpa o tamanho
        if (needC && needS && c && s2 && !vs.some((x) => x.color === c && x.size === s2 && x.stock > 0)) s2 = null;
        const done = (!needC || c) && (!needS || s2);
        const found = done ? vs.find((x) => (!needC || x.color === c) && (!needS || x.size === s2)) : null;
        setModal({ ...modal, color: c, size: s2, variantId: found?.id ?? null, qty: Math.min(modal.qty, Math.max(1, found?.stock ?? 9)) });
      };
      const colorOk = (col: string) => vs.some((x) => x.color === col && x.stock > 0 && (!selSize || x.size === selSize));
      const sizeOk = (sz: string) => vs.some((x) => x.size === sz && x.stock > 0 && (!selColor || x.color === selColor));
      const missing = [!selColor && needC ? 'a cor' : '', !selSize && needS ? 'o tamanho' : ''].filter(Boolean).join(' e ');

      return (
        <>
          <div className="scrim" onClick={close} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Escolha a opção do produto">
            <div className="top">
              <div className="ph">{headImg ? <img src={headImg} alt="" /> : null}</div>
              <div style={{ minWidth: 0 }}>
                <div className="pr">
                  {!v && p.price_from ? <small style={{ marginRight: 4 }}>a partir de</small> : null}
                  <strong>{brl(price)}</strong>{was ? <s style={{ display: 'inline', marginLeft: 6 }}>{brl(was)}</s> : null}{pct(price, was) > 0 ? <span className="pc">-{pct(price, was)}%</span> : null}
                </div>
                <div className="note" style={{ marginTop: 6 }}>{p.name}</div>
                {v && v.stock > 0 && v.stock <= 5 ? <div className="stock-hint">Restam {v.stock}</div> : null}
              </div>
              <button className="x" onClick={close} aria-label="Fechar" type="button">×</button>
            </div>

            {grouped ? (
              <>
                {needC && (
                  <>
                    <h3 className="og-title">Cor ({colors.length})</h3>
                    <div className="cgrid">
                      {colors.map((col) => (
                        <button className="ct" key={col} aria-pressed={selColor === col} disabled={!colorOk(col)} onClick={() => pick(col, selSize)} type="button">
                          <span className="im">{colorImg(col) ? <img src={colorImg(col) as string} alt="" decoding="async" /> : null}</span>
                          <span className="nm">{col}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {needS && (
                  <>
                    <h3 className="og-title">Tamanho</h3>
                    <div className="sgrid">
                      {sizes.map((sz) => (
                        <button className="st" key={sz} aria-pressed={selSize === sz} disabled={!sizeOk(sz)} onClick={() => pick(selColor, sz)} type="button">{sz}</button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <h3 className="og-title">Escolha uma opção ({vs.length})</h3>
                <div className="vgrid">
                  {vs.map((x) => (
                    <button className="vt" key={x.id} aria-pressed={modal.variantId === x.id} disabled={x.stock <= 0} onClick={() => setModal({ ...modal, variantId: x.id })} type="button">
                      {x.label}{x.stock <= 0 ? <><br /><small>esgotado</small></> : null}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="qrow" style={{ marginTop: 16 }}>
              <span>Quantidade</span>
              <div className="qty">
                <button onClick={() => setModal({ ...modal, qty: Math.max(1, modal.qty - 1) })} aria-label="Diminuir" type="button">−</button>
                <span>{modal.qty}</span>
                <button onClick={() => setModal({ ...modal, qty: Math.min(maxQty, modal.qty + 1) })} aria-label="Aumentar" type="button">+</button>
              </div>
            </div>
            <button className="cta block" onClick={confirmVariant} disabled={!v || v.stock <= 0} type="button">
              {!v ? (grouped && missing ? `Escolha ${missing}` : 'Escolha uma opção') : modal.mode === 'buy' ? 'Comprar agora' : 'Adicionar ao carrinho'}
            </button>
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
      <div className="wrap" style={{ minHeight: '100vh', paddingBottom: cartCount > 0 && screen === 'shop' ? 'calc(110px + env(safe-area-inset-bottom, 0px))' : undefined }}>
        {loading ? (
          <ShopSkeleton />
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
