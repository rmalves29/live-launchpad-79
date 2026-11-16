/** Same package in both checkouts: transport prices must not depend on the page used. */
export function buildFreteBaratoCheckoutPackage(
  items: Array<{ qty: number; unit_price: number }>,
  settings: { default_weight_kg?: unknown; default_width_cm?: unknown; default_height_cm?: unknown; default_length_cm?: unknown } | null,
) {
  const positive = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  let quantity = 0, value = 0;
  for (const item of items) {
    const qty = Number(item.qty), price = Number(item.unit_price);
    if (!Number.isSafeInteger(qty) || qty < 1 || !Number.isFinite(price) || price < 0) throw new Error('Confira os itens para calcular o frete.');
    quantity += qty; value += qty * price;
  }
  if (!quantity) throw new Error('Informe os itens para calcular o frete.');
  return [{ id: 'consolidated', quantity: 1,
    width: positive(settings?.default_width_cm, 13), height: positive(settings?.default_height_cm, 6), length: positive(settings?.default_length_cm, 16),
    weight: Math.max(0.01, quantity * positive(settings?.default_weight_kg, 0.01)), insurance_value: Math.round(value * 100) / 100,
  }];
}
