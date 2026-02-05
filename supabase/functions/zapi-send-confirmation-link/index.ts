 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 import { 
   antiBlockDelayLive, 
   logAntiBlockDelay, 
   addMessageVariation,
   getTypingDelay
 } from "../_shared/anti-block-delay.ts";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 const ZAPI_BASE_URL = "https://api.z-api.io";
 
 interface ConfirmationLinkRequest {
   tenant_id: string;
   customer_phone: string;
   confirmation_id: string;
 }
 
 async function getZAPICredentials(supabase: any, tenantId: string) {
   const { data: integration, error } = await supabase
     .from("integration_whatsapp")
     .select("zapi_instance_id, zapi_token, zapi_client_token, is_active, item_added_confirmation_template")
     .eq("tenant_id", tenantId)
     .eq("is_active", true)
     .maybeSingle();
 
   if (error || !integration || !integration.zapi_instance_id || !integration.zapi_token) {
     return null;
   }
 
   return {
     instanceId: integration.zapi_instance_id,
     token: integration.zapi_token,
     clientToken: integration.zapi_client_token || '',
     confirmationTemplate: integration.item_added_confirmation_template || getDefaultConfirmationTemplate()
   };
 }
 
 function getDefaultConfirmationTemplate(): string {
   return `Perfeito! 🎉
 
 Aqui está o seu link exclusivo para finalizar a compra:
 
 👉 {{checkout_url}}
 
 Qualquer dúvida estou à disposição! ✨`;
 }
 
 function formatPhoneNumber(phone: string): string {
   let cleaned = phone.replace(/\D/g, '');
   cleaned = cleaned.replace(/^0+/, '');
   if (!cleaned.startsWith('55')) {
     cleaned = '55' + cleaned;
   }
   return cleaned;
 }
 
 async function simulateTyping(instanceId: string, token: string, clientToken: string, phone: string): Promise<void> {
   try {
     const typingUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/typing`;
     const headers: Record<string, string> = { 'Content-Type': 'application/json' };
     if (clientToken) headers['Client-Token'] = clientToken;
     
     await fetch(typingUrl, {
       method: 'POST',
       headers,
       body: JSON.stringify({ phone, duration: 3 })
     });
     
     // Wait 3-5 seconds to simulate typing
     const typingDelay = 3000 + Math.random() * 2000;
     await new Promise(resolve => setTimeout(resolve, typingDelay));
   } catch (e) {
     console.log('[zapi-send-confirmation-link] Typing simulation failed, continuing...');
   }
 }
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const body = await req.json();
     const { tenant_id, customer_phone, confirmation_id } = body as ConfirmationLinkRequest;
 
     if (!tenant_id || !customer_phone || !confirmation_id) {
       return new Response(
         JSON.stringify({ error: "Missing required fields" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     console.log(`[zapi-send-confirmation-link] Processing confirmation ${confirmation_id}`);
 
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const supabase = createClient(supabaseUrl, supabaseKey);
 
     // Get the pending confirmation
     const { data: confirmation, error: confError } = await supabase
       .from("pending_message_confirmations")
       .select("*")
       .eq("id", confirmation_id)
       .eq("status", "pending")
       .maybeSingle();
 
     if (confError || !confirmation) {
       console.log("[zapi-send-confirmation-link] Confirmation not found or already processed");
       return new Response(
         JSON.stringify({ error: "Confirmation not found or already processed", sent: false }),
         { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Check if expired
     if (new Date(confirmation.expires_at) < new Date()) {
       console.log("[zapi-send-confirmation-link] Confirmation expired");
       await supabase
         .from("pending_message_confirmations")
         .update({ status: "expired" })
         .eq("id", confirmation_id);
       return new Response(
         JSON.stringify({ error: "Confirmation expired", sent: false }),
         { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const credentials = await getZAPICredentials(supabase, tenant_id);
     if (!credentials) {
       console.log("[zapi-send-confirmation-link] Z-API not configured");
       return new Response(
         JSON.stringify({ error: "Z-API not configured", sent: false }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const { instanceId, token, clientToken, confirmationTemplate } = credentials;
     const formattedPhone = formatPhoneNumber(customer_phone);
 
     // Build message with checkout URL
     let message = confirmationTemplate
       .replace(/\{\{checkout_url\}\}/g, confirmation.checkout_url || '')
       .replace(/\{\{link\}\}/g, confirmation.checkout_url || '');
     
     // Add variation to avoid identical messages
     message = addMessageVariation(message);
 
     // Simulate typing before sending (3-5 seconds)
     console.log("[zapi-send-confirmation-link] Simulating typing...");
     await simulateTyping(instanceId, token, clientToken, formattedPhone);
 
     // Apply anti-block delay
     const delayMs = await antiBlockDelayLive();
     logAntiBlockDelay('zapi-send-confirmation-link', delayMs);
 
     // Send the message
     const sendUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-text`;
     const headers: Record<string, string> = { 'Content-Type': 'application/json' };
     if (clientToken) headers['Client-Token'] = clientToken;
 
     console.log(`[zapi-send-confirmation-link] Sending to ${formattedPhone}`);
 
     const response = await fetch(sendUrl, {
       method: 'POST',
       headers,
       body: JSON.stringify({ phone: formattedPhone, message })
     });
 
     const responseText = await response.text();
     console.log(`[zapi-send-confirmation-link] Response: ${response.status} - ${responseText.substring(0, 200)}`);
 
     // Parse message ID
     let zapiMessageId = null;
     try {
       const responseJson = JSON.parse(responseText);
       zapiMessageId = responseJson.messageId || responseJson.id || null;
     } catch (e) { }
 
     // Update confirmation status
     await supabase
       .from("pending_message_confirmations")
       .update({ 
         status: "confirmed",
         confirmed_at: new Date().toISOString()
       })
       .eq("id", confirmation_id);
 
     // Log the message
     await supabase.from('whatsapp_messages').insert({
       tenant_id,
       phone: formattedPhone,
       message: message.substring(0, 500),
       type: 'outgoing',
       sent_at: new Date().toISOString(),
       zapi_message_id: zapiMessageId,
       delivery_status: response.ok ? 'SENT' : 'FAILED'
     });
 
     return new Response(
       JSON.stringify({ sent: response.ok, status: response.status, messageId: zapiMessageId }),
       { headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
 
   } catch (error: any) {
     console.error(`[zapi-send-confirmation-link] Error:`, error.message);
     return new Response(
       JSON.stringify({ error: error.message, sent: false }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });