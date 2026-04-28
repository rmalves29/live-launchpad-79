// One-shot: copia templates da Mania de Mulher para 3 tenants destino.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCE = "08f2b1b9-3988-489e-8186-c60f0c0b0622"; // Mania de Mulher
const SOURCE_LINK = "https://app.orderzaps.com/t/app/checkout";
const SOURCE_NAME = "Mania de Mulher";

const TARGETS = [
  { tenant_id: "88366b61-2998-4797-9c84-880083c14581", slug: "cabellomania", name: "Cabello Mania" },
  { tenant_id: "256dde7b-c0de-4068-8cc2-b9e27e4cc4dd", slug: "revelesemijoias", name: "Revele Semi Jóias" },
  { tenant_id: "b2ce8d61-248d-4500-b08f-e660d67eb2e3", slug: "lagrandame", name: "La Grandame" },
];

const TYPES = [
  "ITEM_ADDED",
  "PRODUCT_CANCELED",
  "PAID_ORDER",
  "MSG_MASSA",
  "SENDFLOW",
  "TRACKING",
  "BLOCKED_CUSTOMER",
  "DM_INSTAGRAM_CADASTRO",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: srcTemplates, error: srcErr } = await sb
      .from("whatsapp_templates")
      .select("type, title, content")
      .eq("tenant_id", SOURCE)
      .in("type", TYPES);
    if (srcErr) throw srcErr;
    if (!srcTemplates?.length) throw new Error("Nenhum template fonte encontrado");

    // Dedup por type, mantendo o primeiro
    const byType = new Map<string, { type: string; title: string | null; content: string }>();
    for (const t of srcTemplates) if (!byType.has(t.type)) byType.set(t.type, t as any);

    const report: any[] = [];
    const now = new Date().toISOString();

    for (const target of TARGETS) {
      const targetLink = `https://app.orderzaps.com/t/${target.slug}/checkout`;

      const { error: delErr } = await sb
        .from("whatsapp_templates")
        .delete()
        .eq("tenant_id", target.tenant_id)
        .in("type", TYPES);
      if (delErr) throw delErr;

      const rows = Array.from(byType.values()).map((t) => ({
        tenant_id: target.tenant_id,
        type: t.type,
        title: t.title,
        content: t.content
          .split(SOURCE_LINK).join(targetLink)
          .split(SOURCE_NAME).join(target.name),
        updated_at: now,
      }));

      const { error: insErr, data: ins } = await sb
        .from("whatsapp_templates")
        .insert(rows)
        .select("id, type");
      if (insErr) throw insErr;

      report.push({ tenant: target.name, inserted: ins?.length ?? 0 });
    }

    return new Response(JSON.stringify({ success: true, report }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
