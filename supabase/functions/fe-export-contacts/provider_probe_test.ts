import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createUazapiMembers } from "./uazapi.ts";

Deno.test("diagnóstico real do grupo com falha, sem expor contatos", async () => {
  const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) { console.log("Diagnóstico real indisponível: credencial de servidor ausente neste executor."); return; }
  const sb = createClient(url, key);
  const { data, error } = await sb.from("integration_whatsapp").select("uazapi_url,uazapi_token").eq("tenant_id", "08f2b1b9-3988-489e-8186-c60f0c0b0622").eq("is_active", true).single();
  if (error || !data?.uazapi_url || !data?.uazapi_token) throw new Error("Configuração UazAPI indisponível");
  try {
    const members = await createUazapiMembers(data)("120363402240760846@g.us");
    console.log(`Grupo BLACK FRIDAY #5: consulta confirmada, ${members.length} participantes.`);
  } catch (error) { console.log(`Grupo BLACK FRIDAY #5: ${String(error)}`); }
});