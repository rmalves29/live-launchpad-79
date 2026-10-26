// Sincronização Bling → Cartzy disparada pelos avisos (webhooks) de produto e de estoque.
// Regras:
//  - Só mexe em produto que já está vinculado (products.bling_product_id). Nunca cria produto solto nem apaga nada.
//  - Estoque: sempre lê o saldo ATUAL do depósito escolhido na API (não confia no corpo do aviso, que pode chegar repetido/fora de ordem).
//  - Produto: atualiza nome, ativo/inativo e SKU ERP. NÃO mexe em código "C", preço, preço promocional, foto nem tipo de venda.
//  - Variações: nova variação no Bling vira filho no Cartzy; variação removida no Bling é só desativada no Cartzy.
// deno-lint-ignore-file no-explicit-any

const BLING = "https://api.bling.com.br/Api/v3";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- assinatura ----------
async function hmacHex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// O Bling assina o corpo com o client secret do aplicativo da empresa (header X-Bling-Signature-256: sha256=<hmac>).
// A empresa é a única cujo secret reproduz a assinatura.
export async function findIntegrationBySignature(supabase: any, raw: string, header: string | null): Promise<any | null> {
  const sig = String(header || "").replace(/^sha256=/i, "").trim().toLowerCase();
  if (!sig) return null;
  const { data: list } = await supabase.from("integration_bling").select("*").eq("is_active", true).not("client_secret", "is", null);
  for (const integ of list || []) {
    if (sameString(await hmacHex(String(integ.client_secret), raw), sig)) return integ;
  }
  return null;
}

// ---------- token + chamadas ----------
async function refreshToken(supabase: any, integ: any): Promise<string | null> {
  if (!integ.refresh_token || !integ.client_id || !integ.client_secret) return null;
  try {
    const res = await fetch(`${BLING}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", 'enable-jwt': '1', Authorization: `Basic ${btoa(`${integ.client_id}:${integ.client_secret}`)}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: integ.refresh_token }),
    });
    if (!res.ok) return null;
    const t = await res.json();
    await supabase.from("integration_bling").update({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", integ.tenant_id);
    return t.access_token;
  } catch {
    return null;
  }
}
export async function validToken(supabase: any, integ: any): Promise<string | null> {
  if (integ.token_expires_at && new Date(integ.token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    return (await refreshToken(supabase, integ)) || integ.access_token;
  }
  return integ.access_token;
}

async function blingGet(token: string, path: string): Promise<{ ok: boolean; status: number; data: any }> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await sleep(380);
    const res = await fetch(`${BLING}${path}`, { headers: { 'enable-jwt': '1', Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (res.status === 429 && attempt < 4) { await sleep(1200 * attempt); continue; }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }
  return { ok: false, status: 429, data: {} };
}

async function depositBalances(token: string, depositId: number, ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!ids.length) return out;
  const r = await blingGet(token, `/estoques/saldos?${ids.map((i) => `idsProdutos[]=${i}`).join("&")}`);
  if (!r.ok) return out;
  for (const s of r.data?.data || []) {
    const dep = (s.depositos || []).find((d: any) => String(d.id) === String(depositId));
    out.set(Number(s.produto?.id), Number(dep ? dep.saldoVirtual : 0) || 0);
  }
  return out;
}

function parseVariation(raw: string) {
  const attrs: Record<string, string> = {};
  for (const part of String(raw || "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) attrs[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  const color = attrs["cor"] || attrs["color"] || null;
  const size = attrs["tamanho"] || attrs["size"] || attrs["numero"] || attrs["número"] || null;
  const values = Object.values(attrs).filter(Boolean);
  return { color, size, label: values.length ? values.join(" / ") : String(raw || "").trim() };
}

// Produto excluído no Bling: no Cartzy fica desativado (pedidos antigos continuam mostrando) e com estoque zerado.
// Se for o produto pai, as variações (filhos) também são desativadas e zeradas.
async function retireLinkedProducts(supabase: any, tenantId: string, blingIds: number[]): Promise<number> {
  const now = new Date().toISOString();
  const patch = { is_active: false, stock: 0, updated_at: now };
  const { data: rows } = await supabase.from("products").update(patch).eq("tenant_id", tenantId).in("bling_product_id", blingIds).select("id");
  const ids = (rows || []).map((r: any) => r.id);
  if (ids.length) await supabase.from("products").update(patch).eq("tenant_id", tenantId).in("parent_product_id", ids);
  return ids.length;
}

// Varredura: pede ao Bling a lista de produtos EXCLUÍDOS (criterio=4) e desativa/zera no Cartzy os que estão ligados.
// Cobre exclusões cujo aviso (product.deleted) não chegou. Percorre a lista inteira, não só uma amostra.
export async function sweepDeletedProducts(supabase: any, integ: any, token: string, maxPages = 40): Promise<{ excluidos_no_bling: number; retired: number }> {
  const tenantId = integ.tenant_id;
  const deleted: number[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await blingGet(token, `/produtos?limit=100&pagina=${page}&criterio=4&tipo=T`);
    if (!r.ok) break;
    const rows: any[] = r.data?.data || [];
    for (const p of rows) deleted.push(Number(p.id));
    if (rows.length < 100) break;
  }
  let retired = 0;
  for (let i = 0; i < deleted.length; i += 200) {
    const chunk = deleted.slice(i, i + 200);
    // só mexe no que ainda está ativo ou com estoque (evita regravar tudo a cada hora)
    const { data: pend } = await supabase.from("products").select("bling_product_id").eq("tenant_id", tenantId).in("bling_product_id", chunk).or("is_active.eq.true,stock.gt.0");
    const ids = [...new Set<number>((pend || []).map((p: any) => Number(p.bling_product_id)))];
    if (ids.length) retired += await retireLinkedProducts(supabase, tenantId, ids);
  }
  return { excluidos_no_bling: deleted.length, retired };
}

// ---------- aviso de ESTOQUE ----------
export async function syncStockEvent(supabase: any, integ: any, token: string, data: any): Promise<string> {
  const blingId = Number(data?.produto?.id ?? data?.idProduto ?? data?.id);
  if (!blingId) return "sem_id_do_produto";
  const depositId = Number(integ.bling_deposit_id) || 0;
  if (!depositId) return "sem_deposito_escolhido";
  const evDep = Number(data?.deposito?.id) || 0;
  if (evDep && evDep !== depositId) return "outro_deposito";

  const { data: p } = await supabase.from("products").select("id, stock").eq("tenant_id", integ.tenant_id).eq("bling_product_id", blingId).maybeSingle();
  if (!p) return "produto_nao_vinculado";

  const bal = await depositBalances(token, depositId, [blingId]);
  if (!bal.has(blingId)) return "saldo_nao_encontrado";
  const novo = Math.max(0, Math.floor(bal.get(blingId) as number));
  if (novo === Number(p.stock)) return "estoque_ja_igual";
  const { error } = await supabase.from("products").update({ stock: novo, updated_at: new Date().toISOString() }).eq("id", p.id);
  return error ? `erro:${error.message}` : `estoque ${p.stock} -> ${novo}`;
}

// ---------- aviso de PRODUTO ----------
export async function syncProductEvent(supabase: any, integ: any, token: string, eventName: string, data: any): Promise<string> {
  const tenantId = integ.tenant_id;
  const evId = Number(data?.id ?? data?.produto?.id);
  if (!evId) return "sem_id_do_produto";
  const now = new Date().toISOString();

  if (eventName.endsWith(".deleted")) {
    const n = await retireLinkedProducts(supabase, tenantId, [evId]);
    return n ? `produto_desativado_estoque_zerado (${n})` : "produto_nao_vinculado";
  }

  const det = await blingGet(token, `/produtos/${evId}`);
  if (!det.ok) return `erro_ao_ler_produto_${det.status}`;
  let root = det.data?.data || {};
  // aviso de uma variação: trabalha a partir do produto pai
  const parentBlingId = Number(root?.variacao?.produtoPai?.id) || 0;
  if (parentBlingId) {
    const pr = await blingGet(token, `/produtos/${parentBlingId}`);
    if (!pr.ok) return `erro_ao_ler_pai_${pr.status}`;
    root = pr.data?.data || {};
  }
  const rootId = Number(root?.id) || evId;

  const { data: localRoot } = await supabase.from("products").select("id, name, is_active, sku_erp, sale_type, image_url").eq("tenant_id", tenantId).eq("bling_product_id", rootId).maybeSingle();
  if (!localRoot) return "produto_nao_vinculado";

  const changes: string[] = [];
  const nome = String(root.nome || "").trim();
  const codigo = String(root.codigo || "").trim();
  const active = root.situacao !== "I";
  const patch: Record<string, any> = {};
  if (nome && nome !== localRoot.name) { patch.name = nome.slice(0, 200); changes.push("nome"); }
  if (active !== localRoot.is_active) { patch.is_active = active; changes.push(active ? "ativado" : "desativado"); }
  if (codigo && codigo !== localRoot.sku_erp) { patch.sku_erp = codigo; changes.push("sku_erp"); }
  if (Object.keys(patch).length) await supabase.from("products").update({ ...patch, updated_at: now }).eq("id", localRoot.id);

  // variações: nova entra, mudança de nome/atributo atualiza, removida é desativada
  const blingKids: any[] = root.formato === "V" && Array.isArray(root.variacoes) ? root.variacoes : [];
  if (blingKids.length) {
    const { data: kids } = await supabase.from("products").select("id, bling_product_id, name, size, color, is_active, sku_erp").eq("tenant_id", tenantId).eq("parent_product_id", localRoot.id);
    const byBling = new Map<number, any>((kids || []).filter((k: any) => k.bling_product_id).map((k: any) => [Number(k.bling_product_id), k]));
    const depositId = Number(integ.bling_deposit_id) || 0;
    const baseName = nome || localRoot.name;

    const missing = blingKids.filter((k) => !byBling.has(Number(k.id)));
    const balances = missing.length && depositId ? await depositBalances(token, depositId, missing.map((k) => Number(k.id))) : new Map<number, number>();

    for (const k of blingKids) {
      const kid = Number(k.id);
      const v = parseVariation(k.variacao?.nome || "");
      const kname = `${baseName} - ${v.label || k.codigo}`.slice(0, 200);
      const kcode = String(k.codigo || "").trim();
      const local = byBling.get(kid);
      if (local) {
        const kpatch: Record<string, any> = {};
        if (kname !== local.name) kpatch.name = kname;
        if ((v.size || null) !== (local.size || null)) kpatch.size = v.size;
        if ((v.color || null) !== (local.color || null)) kpatch.color = v.color;
        const kActive = k.situacao !== "I";
        if (kActive && !local.is_active) kpatch.is_active = true;
        if (!kActive && local.is_active) kpatch.is_active = false;
        if (kcode && kcode !== local.sku_erp) kpatch.sku_erp = kcode;
        if (Object.keys(kpatch).length) {
          await supabase.from("products").update({ ...kpatch, updated_at: now }).eq("id", local.id);
          changes.push(`variacao ${kcode || kid} atualizada`);
        }
      } else {
        // variação nova no Bling: cria o filho (código provisório igual ao do Bling; sufixo se já existir)
        let code = (kcode || `${codigo}-${kid}`).slice(0, 40);
        const { data: taken } = await supabase.from("products").select("id").eq("tenant_id", tenantId).eq("code", code).maybeSingle();
        if (taken) code = `${code.slice(0, 32)}-BL${String(kid).slice(-5)}`;
        const { error } = await supabase.from("products").insert({
          tenant_id: tenantId,
          code,
          name: kname,
          price: Number(k.preco) || Number(root.preco) || 0,
          stock: Math.max(0, Math.floor(balances.get(kid) ?? 0)),
          is_active: k.situacao !== "I",
          image_url: k.midia?.imagens?.externas?.[0]?.link || localRoot.image_url || null,
          sale_type: localRoot.sale_type,
          color: v.color,
          size: v.size,
          parent_product_id: localRoot.id,
          bling_product_id: kid,
          sku_erp: kcode || null,
        });
        if (!error) changes.push(`variacao ${kcode || kid} criada`);
      }
    }
    // variação que saiu do Bling: só desativa (pedidos antigos podem usar o produto)
    const blingIds = new Set(blingKids.map((k) => Number(k.id)));
    for (const [bid, local] of byBling) {
      if (!blingIds.has(bid) && local.is_active) {
        await supabase.from("products").update({ is_active: false, stock: 0, updated_at: now }).eq("id", local.id);
        changes.push(`variacao ${local.sku_erp || bid} desativada`);
      }
    }
  }
  return changes.length ? changes.join("; ") : "sem_mudancas";
}
