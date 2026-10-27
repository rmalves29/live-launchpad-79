// Gera o próximo SKU do sistema (C001, C002, ...) olhando o maior código C### já usado no tenant.
// Códigos com 6+ dígitos (ex.: C7634106, vindos de código de barras/Bling) não entram na contagem do maior,
// mas nunca são repetidos: se o número já existir, pula para o próximo livre.
// O código do Bling fica em sku_erp; o `code` do produto é sempre da sequência do sistema.

export const formatProductCode = (n: number) => `C${n < 1000 ? String(n).padStart(3, "0") : String(n)}`;

export async function loadProductCodes(supabase: any, tenantId: string): Promise<{ max: number; taken: Set<string> }> {
  let max = 0;
  const taken = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("code")
      .eq("tenant_id", tenantId)
      .ilike("code", "C%")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data || []) {
      const c = String(r.code || "").trim();
      taken.add(c.toUpperCase());
      const m = /^C(\d{1,5})$/i.exec(c);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    if (!data || data.length < 1000) break;
  }
  return { max, taken };
}

// Devolve uma função que entrega o próximo código a cada chamada (sequencial na mesma execução).
export async function makeProductCodeAllocator(supabase: any, tenantId: string): Promise<() => string> {
  const { max, taken } = await loadProductCodes(supabase, tenantId);
  let n = max;
  return () => {
    let c: string;
    do { c = formatProductCode(++n); } while (taken.has(c));
    taken.add(c);
    return c;
  };
}
