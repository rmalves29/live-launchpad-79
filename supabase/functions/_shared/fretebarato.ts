export const FRETEBARATO_PROVIDER = 'fretebarato';

export function normalizeQuoteConfiguration(platform: string, customerId: string) {
  platform = platform.trim(); customerId = customerId.trim();
  if (/^https:\/\//i.test(platform)) {
    const url = new URL(platform);
    const match = url.pathname.match(/^\/([a-zA-Z0-9_-]{1,80})\/price\/v1\/json\/([a-zA-Z0-9_-]{1,80})\/?$/);
    if (url.protocol !== 'https:' || url.hostname !== 'admin.fretebarato.com' || url.port || url.username || url.password || url.search || url.hash || !match) {
      throw new Error('Informe um link de cotação válido do domínio admin.fretebarato.com.');
    }
    if (customerId && customerId !== match[2]) throw new Error('Confira o Customer ID: ele está diferente do identificador no link de cotação.');
    platform = match[1]; customerId = match[2];
  }
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(platform) || !/^[a-zA-Z0-9_-]{1,80}$/.test(customerId)) {
    throw new Error('Informe a plataforma e o Customer ID fornecidos pelo Frete Barato.');
  }
  return { platform, customerId };
}

export function quoteEndpoint(platform: string, customerId: string): string {
  ({ platform, customerId } = normalizeQuoteConfiguration(platform, customerId));
  return `https://admin.fretebarato.com/${platform}/price/v1/json/${customerId}`;
}

export function buildQuotePayload(cep: unknown, products: unknown) {
  const zipcode = String(cep ?? '').replace(/\D/g, '');
  if (zipcode.length !== 8) throw new Error('Informe um CEP de destino com 8 dígitos.');
  if (!Array.isArray(products) || !products.length || products.length > 100) {
    throw new Error('Informe de 1 a 100 itens para calcular o frete.');
  }
  let amount = 0;
  const skus = products.map((p, i) => {
    const quantity = Number(p.quantity);
    const price = Number(p.insurance_value ?? p.price);
    const length = Number(p.length), width = Number(p.width), height = Number(p.height), weight = Number(p.weight);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || !Number.isFinite(price) || price < 0 || price > 1e8 ||
      ![length, width, height, weight].every(n => Number.isFinite(n) && n > 0) ||
      Math.max(length, width, height) > 10000 || weight > 10000) {
      throw new Error('Confira quantidade, valor, peso e dimensões dos produtos.');
    }
    amount += price * quantity;
    return { sku: String(p.sku ?? p.id ?? `item-${i + 1}`).slice(0, 100), price: Math.round(price * 100) / 100, quantity,
      length: Math.ceil(length), width: Math.ceil(width), height: Math.ceil(height), weight: Math.ceil(weight * 1000) / 1000 };
  });
  return { zipcode, amount: Math.round(amount * 100) / 100, skus };
}

// Nuvemshop's carrier callback uses grams and an items/destination envelope, not the generic API contract.
export function normalizeOriginPostalCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!/^\d{5}-?\d{3}$/.test(raw)) throw new Error('Informe o CEP de origem da loja com 8 dígitos.');
  return raw.replace('-', '');
}

export function buildNuvemshopQuotePayload(payload: ReturnType<typeof buildQuotePayload>, originPostalCode: unknown) {
  return {
    cart_id: 'cartzy-quote', currency: 'BRL', language: 'pt', total_price: payload.amount,
    origin: { country: 'BR', postal_code: normalizeOriginPostalCode(originPostalCode) },
    destination: { country: 'BR', postal_code: payload.zipcode },
    items: payload.skus.map((p, i) => ({ id: i + 1, product_id: i + 1, name: p.sku, sku: p.sku,
      quantity: p.quantity, free_shipping: false, grams: Math.round(p.weight * 1000), price: p.price, cost: p.price,
      dimensions: { width: p.width, height: p.height, depth: p.length } })),
  };
}

function normalizeNuvemshopRates(rates: any[]) {
  const seen = new Set<string>();
  return rates.flatMap((r: any) => {
    if (!r || r.type !== 'ship' || r.currency !== 'BRL' || !r.code || !r.name ||
      !['number', 'string'].includes(typeof r.price) || String(r.price).trim() === '') return [];
    const price = Number(r.price), code = String(r.code);
    if (!Number.isFinite(price) || price < 0 || seen.has(code)) return [];
    const date = String(r.max_delivery_date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
    if (!date) return [];
    const isoDay = `${date[1]}-${date[2]}-${date[3]}`;
    const timestamp = Date.parse(`${isoDay}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== isoDay) return [];
    seen.add(code);
    const name = String(r.name);
    return [{ id: `fretebarato_${code}`, service_id: code, quote_id: code, name, service_name: name,
      company: { name, picture: '' }, price, custom_price: price,
      delivery_time: `Entrega prevista até ${date[3]}/${date[2]}/${date[1]}`, delivery_date: isoDay,
      provider: FRETEBARATO_PROVIDER }];
  });
}

export function normalizeQuotes(data: unknown) {
  if (data && Array.isArray((data as any).rates)) return normalizeNuvemshopRates((data as any).rates);
  if (!data || !Array.isArray((data as any).quotes)) throw new Error('Resposta de cotação inválida do Frete Barato.');
  const seen = new Set<string>();
  return (data as any).quotes.flatMap((q: any) => {
    if (!q || q.price === null || q.price === undefined || q.price === '' || q.days === null || q.days === undefined || q.days === '') return [];
    const price = Number(q.price), days = Number(q.days);
    const id = String(q.quote_id ?? '');
    if (!id || seen.has(id) || !Number.isFinite(price) || price < 0 || !Number.isInteger(days) || days < 0 || !q.name || !q.service) return [];
    seen.add(id);
    const name = String(q.name) === String(q.service) ? String(q.name) : `${q.name} · ${q.service}`;
    return [{ id: `fretebarato_${id}`, service_id: id, quote_id: id, name, service_name: name,
      company: { name: String(q.name), picture: '' }, price, custom_price: price,
      delivery_time: `${days} ${days === 1 ? 'dia útil' : 'dias úteis'}`, custom_delivery_time: days, provider: FRETEBARATO_PROVIDER }];
  });
}
