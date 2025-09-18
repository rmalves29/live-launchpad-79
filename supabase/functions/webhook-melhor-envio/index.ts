import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  id: string;
  status: string;
  service_id: number;
  tracking: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Webhook Melhor Envio recebido:', req.method);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
      const payload: WebhookPayload = await req.json();
      console.log('Payload recebido:', JSON.stringify(payload, null, 2));

      // Log the webhook in the database
      const { error: logError } = await supabase
        .from('webhook_logs')
        .insert({
          webhook_type: 'melhor_envio',
          payload: payload,
          status_code: 200,
          response: 'Webhook processado com sucesso',
          created_at: new Date().toISOString()
        });

      if (logError) {
        console.error('Erro ao salvar log do webhook:', logError);
      }

      // Here you can add your business logic to handle the webhook
      // For example, update order status, send notifications, etc.
      
      console.log('Webhook processado com sucesso');

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Webhook processado com sucesso' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Método não permitido' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      }
    );

  } catch (error) {
    console.error('Erro no webhook:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno do servidor',
        details: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});