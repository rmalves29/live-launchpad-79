// Edge Function: bling-deposits
// Lista e cria depósitos de estoque no Bling da empresa (API v3: GET/POST /depositos).
// Ações: list | create (name). Só o usuário da própria empresa (ou super admin) pode chamar.
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BLING_API = "https://api.bling.com.br/Api/v3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PAGE_SIZE = 100; // máximo do Bling por página
const MAX_PAGES = 30; // trava de segurança (3.000 depósitos)

// O Bling entrega os depósitos em páginas de 100; percorre todas até acabar.
async function fetchAllDeposits(headers: Record<string, string>): Promise<{ ok: true; items: any[] } | { ok: false; status: number; data: any }> {
  const items: any[] = [];
  for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
    const res = await fetch(`${BLING_API}/depositos?limite=${PAGE_SIZE}&pagina=${pagina}`, { headers });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, data };
    const page: any[] = data?.data || [];
    items.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { ok: true, items };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body.tenant_id || "");
    const action = String(body.action || "list");
    if (!tenantId) return json({ error: "tenant_id obrigatório" }, 400);

    const guard = await authorizeTenantCaller(req, supabase, tenantId);
    if (!guard.ok) return guardResponse(guard, corsHeaders);

    const { data: integ } = await supabase
      .from("integration_bling")
      .select("access_token, is_active")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!integ?.access_token || !integ.is_active) return json({ error: "Bling não autorizado ou inativo para esta empresa." }, 400);

    const headers = { 'enable-jwt': '1', Authorization: `Bearer ${integ.access_token}`, Accept: "application/json", "Content-Type": "application/json" };

    if (action === "create") {
      const name = String(body.name || "").trim().slice(0, 100);
      if (name.length < 2) return json({ error: "Informe o nome do depósito." }, 400);

      // não cria duplicado: se já existe um depósito com esse nome, devolve ele
      const all = await fetchAllDeposits(headers);
      const existing = (all.ok ? all.items : []).find((d: any) => String(d.descricao || "").trim().toLowerCase() === name.toLowerCase());
      if (existing) return json({ ok: true, existed: true, deposit: { id: existing.id, descricao: existing.descricao } });

      // padrao=false: o depósito padrão do Bling não muda; desconsiderarSaldo=false: o saldo conta normalmente
      const res = await fetch(`${BLING_API}/depositos`, {
        method: "POST",
        headers,
        body: JSON.stringify({ descricao: name, situacao: 1, padrao: false, desconsiderarSaldo: false }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.description || data?.error?.message || `Erro ${res.status} ao criar o depósito`;
        return json({ error: msg, status: res.status }, res.status === 401 ? 401 : 400);
      }
      return json({ ok: true, existed: false, deposit: { id: data?.data?.id, descricao: name } });
    }

    // list
    const all = await fetchAllDeposits(headers);
    if (!all.ok) {
      const msg = all.status === 401 ? "Token do Bling expirado. Autorize o Bling novamente." : all.data?.error?.description || `Erro ${all.status} ao listar depósitos`;
      return json({ error: msg, status: all.status }, all.status === 401 ? 401 : 400);
    }
    const deposits = all.items
      .filter((d: any) => d.situacao === 1 || d.situacao === undefined)
      .map((d: any) => ({
        id: d.id,
        descricao: d.descricao,
        padrao: d.padrao === true,
        // "desconsiderar saldo": o Bling não conta o saldo desse depósito (ex.: Fulfillment); não serve para estoque do dia a dia
        desconsiderarSaldo: d.desconsiderarSaldo === true,
      }));
    return json({ ok: true, deposits });
  } catch (e) {
    console.error("[bling-deposits]", e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
