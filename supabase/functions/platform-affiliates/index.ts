// Programa de afiliados da plataforma Cartzy: clique, landing, lead, cadastro de afiliado e PIX do afiliado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { affiliateCodeFromName, normalizePhone, isValidEmail } from "./rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const s = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

async function sha256(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function approvedByCode(codigo: unknown) {
  const c = s(codigo, 30).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) return null;
  const { data } = await sb.from("platform_affiliates").select("id, nome, codigo").eq("codigo", c).eq("status", "aprovado").maybeSingle();
  return data;
}

async function whatsappNumber() {
  const { data } = await sb.from("platform_affiliate_settings").select("affiliate_whatsapp").eq("id", 1).maybeSingle();
  return (data?.affiliate_whatsapp || "").replace(/\D/g, "");
}

async function freeCode(nome: string) {
  const base = affiliateCodeFromName(nome);
  for (let i = 0; i < 50; i++) {
    const c = i === 0 ? base : `${base.slice(0, 26)}${i + 1}`;
    const { data } = await sb.from("platform_affiliates").select("id").eq("codigo", c).maybeSingle();
    if (!data) return c;
  }
  return `${base.slice(0, 22)}${Math.floor(Math.random() * 1e6)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = s(body?.action, 30);

    if (action === "click") {
      const a = await approvedByCode(body.codigo);
      if (!a) return json({ success: true, valid: false });
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
      await sb.from("platform_affiliate_clicks").insert({
        affiliate_id: a.id, landing_path: s(body.landing_path, 300) || null,
        utm_source: s(body.utm_source, 100) || null, utm_medium: s(body.utm_medium, 100) || null,
        utm_campaign: s(body.utm_campaign, 100) || null, referrer: s(body.referrer, 500) || null,
        ip_hash: ip ? await sha256(`cz-aff:${ip}`) : null, user_agent: s(req.headers.get("user-agent"), 300) || null,
      });
      return json({ success: true, valid: true, codigo: a.codigo, nome: a.nome });
    }

    if (action === "landing_info") {
      const a = await approvedByCode(body.codigo);
      return json({ success: true, whatsapp: await whatsappNumber(), affiliate: a ? { codigo: a.codigo, nome: a.nome } : null });
    }

    if (action === "lead") {
      const nome = s(body.nome, 120);
      const whatsapp = normalizePhone(s(body.whatsapp, 30));
      const instagram = s(body.instagram, 60).replace(/^@+/, "") || null;
      if (!nome || whatsapp.length < 10) return json({ success: false, error: "Informe nome e WhatsApp com DDD" });
      const a = await approvedByCode(body.ref);
      const { error } = await sb.from("platform_affiliate_leads").insert({ affiliate_id: a?.id ?? null, nome, whatsapp, instagram, origem: "landing" });
      if (error) return json({ success: false, error: "Não foi possível enviar agora" });
      return json({ success: true, whatsapp: await whatsappNumber(), affiliate: a ? { codigo: a.codigo, nome: a.nome } : null });
    }

    if (action === "signup") {
      const nome = s(body.nome, 120);
      const email = s(body.email, 200).toLowerCase();
      const telefone = normalizePhone(s(body.telefone, 30));
      const senha = String(body.senha ?? "");
      const pix = s(body.pix_key, 140);
      if (!nome || !isValidEmail(email)) return json({ success: false, error: "Nome e e-mail válidos são obrigatórios" });
      if (senha.length < 8) return json({ success: false, error: "A senha precisa ter pelo menos 8 caracteres" });
      const { data: exists } = await sb.from("platform_affiliates").select("id").eq("email", email).maybeSingle();
      if (exists) return json({ success: false, error: "Este e-mail já tem cadastro de afiliado" });
      const { data: created, error: cErr } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, affiliate: true } });
      if (cErr || !created?.user) {
        const msg = /registered|exists/i.test(cErr?.message || "") ? "Este e-mail já tem login no Cartzy. Use outro e-mail." : "Não foi possível criar o login";
        return json({ success: false, error: msg });
      }
      const uid = created.user.id;
      await sb.from("profiles").upsert({ id: uid, email, role: "affiliate", tenant_id: null }, { onConflict: "id" });
      const { data: s0 } = await sb.from("platform_affiliate_settings").select("default_percent, default_months").eq("id", 1).maybeSingle();
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) {
        const { error } = await sb.from("platform_affiliates").insert({
          user_id: uid, nome, email, telefone: telefone || null, pix_key: pix || null, codigo: await freeCode(nome),
          commission_percent: s0?.default_percent ?? 20, commission_months: s0?.default_months ?? null, status: "pendente",
        });
        if (!error) ok = true; else if (error.code !== "23505") break;
      }
      if (!ok) { await sb.auth.admin.deleteUser(uid); return json({ success: false, error: "Não foi possível concluir o cadastro" }); }
      return json({ success: true });
    }

    if (action === "update_pix") {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const { data: u } = await createClient(url, anonKey, { global: { headers: { Authorization: auth } } }).auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const pix = s(body.pix_key, 140);
      if (!pix) return json({ success: false, error: "Informe a chave PIX" });
      const { data, error } = await sb.from("platform_affiliates").update({ pix_key: pix }).eq("user_id", u.user.id).select("id").maybeSingle();
      if (error || !data) return json({ success: false, error: "Afiliado não encontrado" });
      return json({ success: true });
    }

    return json({ success: false, error: "ação inválida" }, 400);
  } catch (e) {
    console.error("[platform-affiliates]", e);
    return json({ success: false, error: "erro interno" });
  }
});
