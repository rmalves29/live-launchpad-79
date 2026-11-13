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
      .order("id", { ascending: true }) // sem ordem fixa a paginação pula/repete linhas e um código já usado parece livre
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

/** O banco recusou por código repetido (unique products_tenant_id_code_key). */
export function isDuplicateCodeError(err: any): boolean {
  const m = String(err?.message || "");
  return err?.code === "23505" || m.includes("products_tenant_id_code_key") || m.includes("duplicate key");
}

/**
 * Insere um produto com o próximo código livre. Se o banco disser que o código já existe
 * (outra importação rodando ao mesmo tempo, ou código que a leitura não pegou), tenta o seguinte.
 */
export async function insertWithFreshCode(
  supabase: any, nextCode: () => string, row: Record<string, unknown>, select = "id", tries = 25,
): Promise<{ data: any; error: any }> {
  let last: any = null;
  for (let i = 0; i < tries; i++) {
    const res = await supabase.from("products").insert({ ...row, code: nextCode() }).select(select).single();
    if (!res.error) return res;
    last = res.error;
    if (!isDuplicateCodeError(res.error)) break;
  }
  return { data: null, error: last };
}
