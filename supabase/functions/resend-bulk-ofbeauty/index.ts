import { createClient } from "npm:@supabase/supabase-js@2";
import { addMessageVariation, antiBlockDelay } from "../_shared/anti-block-delay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TENANT_ID = "4247aa21-4a46-4988-8845-fa15aa202310";
const MESSAGE = `Vi que fez um pedido no grupo ontem, mais ainda não finalizou o pagamento. Para finalizar e bem fácil, basta acessar o link abaixo ⤵️

https://app.orderzaps.com/t/ofbeauty/checkout

Em caso de dúvidas, estou a disposição!`;

const PHONES = [
  "5511941583406","5511944614154","5511952341917","5511952906523","5511962065349",
  "5511964309701","5511965808180","5511976166370","5511979613858","5511985506829",
  "5511991665174","5511998552746","5513981444140","5515996076160","5516997518367",
  "5518996711035","5518997411500","5519982869375","5519989521951","5519992353861",
  "5521968243553","5521968987644","5521970009640","5524974027880","5531985192296",
  "5531988317847","5534991320303","5534991343161","5534991427620","5534992037518",
  "5534992532919","5534996324873","5534996546610","5534998861981","5534999250853",
  "5534999798886","5535997542574","5538988454670","5561999260601","5562981489747",
  "5562993938441","5562996653984","5571988066753","5575983383517","5584998913337",
  "5588981703325","5588993101411","5592981959044"
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Z-API credentials
    const { data: config } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token")
      .eq("tenant_id", TENANT_ID)
      .eq("is_active", true)
      .maybeSingle();

    if (!config?.zapi_instance_id || !config?.zapi_token) {
      return new Response(JSON.stringify({ error: "Z-API not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const sendUrl = `https://api.z-api.io/instances/${config.zapi_instance_id}/token/${config.zapi_token}/send-text`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.zapi_client_token) headers["Client-Token"] = config.zapi_client_token;

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < PHONES.length; i++) {
      const phone = PHONES[i];
      const variedMessage = addMessageVariation(MESSAGE, true);

      try {
        const response = await fetch(sendUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ phone, message: variedMessage }),
        });

        if (response.ok) {
          sent++;
          console.log(`✅ [${i+1}/${PHONES.length}] Sent to ${phone} - Greeting: ${variedMessage.split('\n')[0]}`);
          
          await supabase.from("whatsapp_messages").insert({
            tenant_id: TENANT_ID,
            phone,
            message: variedMessage.substring(0, 500),
            type: "bulk",
            sent_at: new Date().toISOString(),
          });
        } else {
          failed++;
          console.error(`❌ [${i+1}/${PHONES.length}] Failed ${phone}: ${await response.text()}`);
        }
      } catch (e) {
        failed++;
        console.error(`❌ [${i+1}/${PHONES.length}] Error ${phone}: ${e.message}`);
      }

      // Anti-block delay between messages (8-15 seconds)
      if (i < PHONES.length - 1) {
        const delay = await antiBlockDelay(8000, 15000);
        console.log(`⏱️ Delay: ${(delay/1000).toFixed(1)}s`);
      }
    }

    console.log(`🏁 Done: ${sent} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({ sent, failed, total: PHONES.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
