// Edge Function: bling-resync-original-stock
// Reenvia para o Bling o estoque INICIAL de cada produto (quando foi cadastrado).
// Fonte do valor:
//   1) audit_logs.action='stock_changed' -> old_stock do PRIMEIRO registro (mais antigo)
//   2) Caso não tenha histórico, usa products.stock atual (nunca mudou)
// Escreve saldo no depósito PADRÃO do Bling via POST /Api/v3/estoques (operacao=B - balanço)

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BLING_API = 'https://api.bling.com.br/Api/v3';

interface CodeItem { code: string; qty: number }
interface ReqBody {
  tenant_id: string;
  product_ids?: number[]; // opcional: subset
  dry_run?: boolean;
  limit?: number;   // paginação (default 40)
  offset?: number;  // paginação (default 0)
  deposito_id?: number; // opcional: força depósito específico (senão usa o padrão)
  list_deposits?: boolean; // se true, só lista depósitos e retorna
  rebalance_codes?: CodeItem[]; // se preenchido, rebalanceia via código no Bling (produtos "órfãos")
}



Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.tenant_id) {
      return json({ success: false, error: 'tenant_id obrigatório' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Integração Bling
    const { data: integ, error: integErr } = await supabase
      .from('integration_bling')
      .select('access_token, is_active')
      .eq('tenant_id', body.tenant_id)
      .maybeSingle();
    if (integErr || !integ?.access_token || !integ.is_active) {
      return json({ success: false, error: 'Integração Bling inativa/sem token' }, 200);
    }
    const token = integ.access_token as string;

    // 2. Descobre depósito padrão no Bling
    const depRes = await fetch(`${BLING_API}/depositos?limite=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!depRes.ok) {
      const t = await depRes.text();
      return json({ success: false, error: `Falha ao buscar depósitos: ${depRes.status} ${t}` }, 200);
    }
    const depJson = await depRes.json();
    const depositos: any[] = depJson?.data || [];

    if (body.list_deposits) {
      return json({ success: true, depositos: depositos.map((d) => ({ id: d.id, nome: d.nome, descricao: d.descricao, padrao: d.padrao, situacao: d.situacao })) }, 200);
    }

    let padrao: any = null;
    if (body.deposito_id) {
      padrao = depositos.find((d) => Number(d.id) === Number(body.deposito_id)) || { id: body.deposito_id };
    } else {
      padrao = depositos.find((d) => d.padrao === true || d.situacao === 1) || depositos[0];
    }
    if (!padrao?.id) {
      return json({ success: false, error: 'Nenhum depósito encontrado no Bling' }, 200);
    }
    const depositoId = padrao.id;

    // MODO: rebalance_codes → busca produto no Bling por código e faz balanço
    if (body.rebalance_codes?.length) {
      const results: any[] = [];
      let ok = 0, fail = 0;
      for (const item of body.rebalance_codes) {
        try {
          const findRes = await fetch(`${BLING_API}/produtos?pagina=1&limite=5&codigo=${encodeURIComponent(item.code)}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          });
          const findJson = await findRes.json();
          const prod = findJson?.data?.[0];
          if (!prod?.id) {
            fail++;
            results.push({ code: item.code, success: false, error: 'produto não encontrado no Bling' });
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          let attempt = 0, done = false;
          while (!done && attempt < 4) {
            attempt++;
            const r = await fetch(`${BLING_API}/estoques`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({
                deposito: { id: depositoId },
                operacao: 'B',
                produto: { id: prod.id },
                quantidade: Math.max(1, Number(item.qty) || 1),
                custo: 0,
              }),
            });
            const txt = await r.text();
            if (r.ok) { ok++; results.push({ code: item.code, bling_id: prod.id, qty: item.qty, success: true }); done = true; }
            else if (r.status === 429 && attempt < 4) { await new Promise((res) => setTimeout(res, 1200 * attempt)); }
            else { fail++; results.push({ code: item.code, bling_id: prod.id, success: false, error: `${r.status} ${txt.slice(0, 200)}` }); done = true; }
          }
        } catch (e: any) {
          fail++;
          results.push({ code: item.code, success: false, error: e?.message });
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      return json({ success: true, mode: 'rebalance_codes', deposito_id: depositoId, ok, fail, details: results }, 200);
    }




    // 3. Produtos ativos do tenant com bling_product_id (com paginação)
    const limit = Math.max(1, Math.min(Number(body.limit) || 40, 200));
    const offset = Math.max(0, Number(body.offset) || 0);

    let countQ = supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', body.tenant_id)
      .eq('is_active', true)
      .not('bling_product_id', 'is', null);
    if (body.product_ids?.length) countQ = countQ.in('id', body.product_ids);
    const { count: totalCount } = await countQ;

    let q = supabase
      .from('products')
      .select('id, name, code, stock, bling_product_id')
      .eq('tenant_id', body.tenant_id)
      .eq('is_active', true)
      .not('bling_product_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
    if (body.product_ids?.length) q = q.in('id', body.product_ids);
    const { data: products, error: prodErr } = await q;
    if (prodErr) return json({ success: false, error: prodErr.message }, 200);
    if (!products?.length) {
      return json({ success: true, message: 'Nenhum produto elegível', total: totalCount || 0, processed: 0, has_more: false, next_offset: offset, details: [] }, 200);
    }

    // 4. Puxa audit_logs de stock_changed para todos de uma vez
    const idsStr = products.map((p) => String(p.id));
    const { data: audits } = await supabase
      .from('audit_logs')
      .select('entity_id, meta, created_at')
      .eq('tenant_id', body.tenant_id)
      .eq('entity', 'product')
      .eq('action', 'stock_changed')
      .in('entity_id', idsStr)
      .order('created_at', { ascending: true });

    const firstOldStock = new Map<string, number>();
    for (const a of audits || []) {
      if (!firstOldStock.has(a.entity_id)) {
        const v = Number(a.meta?.old_stock);
        if (Number.isFinite(v)) firstOldStock.set(a.entity_id, v);
      }
    }

    // 5. Para cada produto, envia balanço
    const details: any[] = [];
    let ok = 0, fail = 0;

    for (const p of products) {
      const original = firstOldStock.has(String(p.id))
        ? firstOldStock.get(String(p.id))!
        : Number(p.stock ?? 0);
      const source = firstOldStock.has(String(p.id)) ? 'audit' : 'current';

      if (body.dry_run) {
        details.push({ product_id: p.id, name: p.name, code: p.code, original_stock: original, source, dry_run: true });
        ok++;
        continue;
      }

      let attempt = 0;
      let done = false;
      while (!done && attempt < 4) {
        attempt++;
        try {
          const r = await fetch(`${BLING_API}/estoques`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              deposito: { id: depositoId },
              operacao: 'B',
              produto: { id: Number(p.bling_product_id) },
              quantidade: original,
              custo: 0,
            }),
          });
          const txt = await r.text();
          if (r.ok) {
            ok++;
            details.push({ product_id: p.id, name: p.name, code: p.code, original_stock: original, source, success: true });
            done = true;
          } else if (r.status === 429 && attempt < 4) {
            await new Promise((res) => setTimeout(res, 1200 * attempt));
            continue;
          } else {
            fail++;
            details.push({ product_id: p.id, name: p.name, code: p.code, original_stock: original, source, success: false, error: `${r.status} ${txt.slice(0, 300)}` });
            done = true;
          }
        } catch (e: any) {
          fail++;
          details.push({ product_id: p.id, name: p.name, code: p.code, original_stock: original, source, success: false, error: e?.message });
          done = true;
        }
      }

      // Rate limit Bling: 3 req/s
      await new Promise((res) => setTimeout(res, 400));
    }


    const nextOffset = offset + products.length;
    const hasMore = (totalCount ?? 0) > nextOffset;

    return json({
      success: true,
      message: `Lote processado - ok: ${ok}, falhas: ${fail}`,
      total: totalCount ?? products.length,
      processed_in_batch: products.length,
      ok, fail,
      offset,
      next_offset: nextOffset,
      has_more: hasMore,
      deposito_id: depositoId,
      dry_run: !!body.dry_run,
      details,
    }, 200);
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'erro desconhecido' }, 200);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
