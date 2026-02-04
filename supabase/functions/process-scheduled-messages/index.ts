import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { 
  antiBlockDelay, 
  addMessageVariation, 
  checkTenantRateLimit 
} from "../_shared/anti-block-delay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://hxtbsieodbtzgcvvkeqx.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar jobs agendados que já passaram da hora de execução
    const now = new Date().toISOString();
    
    const { data: scheduledJobs, error: fetchError } = await supabase
      .from("sending_jobs")
      .select("*")
      .eq("status", "scheduled")
      .eq("job_type", "scheduled_mass_message")
      .lte("started_at", now)
      .order("started_at", { ascending: true });

    if (fetchError) {
      console.error("❌ Erro ao buscar jobs agendados:", fetchError);
      throw fetchError;
    }

    if (!scheduledJobs || scheduledJobs.length === 0) {
      console.log("ℹ️ Nenhum job agendado para processar");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum job para processar", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🚀 Encontrados ${scheduledJobs.length} job(s) para processar`);

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    for (const job of scheduledJobs) {
      console.log(`\n📋 Processando job ${job.id} para tenant ${job.tenant_id}`);
      
      // Atualizar status para running
      await supabase
        .from("sending_jobs")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", job.id);

      const jobData = job.job_data as {
        message_template: string;
        customers: Array<{ phone: string; name: string }>;
        tag_id?: string;
        delay_between_messages: number;
        messages_before_pause: number;
        pause_duration: number;
      };

      const { message_template, customers, tag_id, delay_between_messages, messages_before_pause, pause_duration } = jobData;

      let successCount = 0;
      let errorCount = 0;

      // Buscar configuração do WhatsApp do tenant
      const { data: whatsappConfig } = await supabase
        .from("integration_whatsapp")
        .select("zapi_instance_id, zapi_token, zapi_client_token, is_active")
        .eq("tenant_id", job.tenant_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!whatsappConfig || !whatsappConfig.zapi_instance_id || !whatsappConfig.zapi_token) {
        console.error(`❌ WhatsApp não configurado para tenant ${job.tenant_id}`);
        await supabase
          .from("sending_jobs")
          .update({ 
            status: "failed", 
            error_message: "WhatsApp não configurado",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);
        continue;
      }

      // Processar cada cliente
      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];
        
        // Personalizar mensagem
        let personalizedMessage = message_template;
        if (customer.name) {
          personalizedMessage = personalizedMessage.replace(/\{\{nome\}\}/g, customer.name);
        }

        // Normalizar telefone
        let phone = customer.phone.replace(/\D/g, "");
        if (phone.length === 11 && phone.startsWith("0")) {
          phone = phone.substring(1);
        }
        if (phone.length === 10 || phone.length === 11) {
          phone = "55" + phone;
        }

        // Check rate limit
        if (!checkTenantRateLimit(job.tenant_id)) {
          console.log(`⚠️ Rate limit atingido, pausando...`);
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 min
        }

        try {
          // Add message variation to avoid identical messages
          const variedMessage = addMessageVariation(personalizedMessage);
          
          // Enviar via Z-API
          const zapiUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/send-text`;
          
          const sendResponse = await fetch(zapiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Client-Token": whatsappConfig.zapi_client_token || ""
            },
            body: JSON.stringify({
              phone: phone,
              message: variedMessage
            })
          });

          if (sendResponse.ok) {
            console.log(`✅ Mensagem enviada para ${phone}`);
            successCount++;

            // Registrar mensagem
            await supabase.from("whatsapp_messages").insert({
              tenant_id: job.tenant_id,
              phone: phone,
              message: variedMessage,
              type: "bulk",
              sent_at: new Date().toISOString(),
              processed: true
            });
          } else {
            const errorText = await sendResponse.text();
            console.error(`❌ Erro ao enviar para ${phone}: ${errorText}`);
            errorCount++;
          }
        } catch (sendError) {
          console.error(`❌ Exceção ao enviar para ${phone}:`, sendError);
          errorCount++;
        }

        // Atualizar progresso
        await supabase
          .from("sending_jobs")
          .update({ 
            processed_items: i + 1,
            current_index: i,
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);

        // Delay entre mensagens (mínimo 5 segundos para anti-bloqueio)
        if (i < customers.length - 1) {
          const minDelay = Math.max(delay_between_messages, 5);
          // Add randomness to delay (5-15 seconds variation)
          const randomExtra = await antiBlockDelay(3000, 8000);
          await new Promise(resolve => setTimeout(resolve, (minDelay * 1000) + randomExtra));
          
          // Pausa maior a cada X mensagens
          if ((i + 1) % messages_before_pause === 0) {
            const pauseMs = Math.max(pause_duration * 1000, 30000); // Mínimo 30s
            console.log(`⏸️ Pausa de ${pauseMs / 1000}s após ${i + 1} mensagens`);
            await new Promise(resolve => setTimeout(resolve, pauseMs));
          }
        }
      }

      // Finalizar job
      await supabase
        .from("sending_jobs")
        .update({ 
          status: "completed",
          processed_items: customers.length,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          job_data: { ...jobData, result: { success: successCount, errors: errorCount } }
        })
        .eq("id", job.id);

      console.log(`✅ Job ${job.id} concluído: ${successCount} sucesso, ${errorCount} erros`);
      
      totalProcessed++;
      totalSuccess += successCount;
      totalErrors += errorCount;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: totalProcessed,
        total_success: totalSuccess,
        total_errors: totalErrors
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Erro geral:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
