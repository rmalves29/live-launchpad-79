export const FRETEBARATO_PROVIDER = 'fretebarato';

export function quoteEndpoint(platform: string, customerId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(platform) || !/^\d{1,30}$/.test(customerId)) {
    throw new Error('Informe a plataforma e o Customer ID fornecidos pelo Frete Barato.');
  }
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

export function normalizeQuotes(data: unknown) {
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
