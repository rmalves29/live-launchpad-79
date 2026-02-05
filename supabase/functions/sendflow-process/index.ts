import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { simulateTyping, addMessageVariation } from "../_shared/anti-block-delay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface Product {
  id: number;
  code: string;
  name: string;
  color?: string;
  size?: string;
  price: number;
  image_url?: string;
}

interface SendFlowJobData {
  productIds: number[];
  groupIds: string[];
  messageTemplate: string;
  perGroupDelaySeconds: number;
  perProductDelayMinutes: number;
  useRandomDelay?: boolean;
  minGroupDelaySeconds?: number;
  maxGroupDelaySeconds?: number;
  currentProductIndex?: number;
  currentGroupIndex?: number;
  sentMessages?: number;
  errorMessages?: number;
  countdownSeconds?: number;
  isWaitingForNextProduct?: boolean;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(minSeconds: number, maxSeconds: number): number {
  return Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
}

function formatPrice(price: number): string {
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
}

function personalizeMessage(template: string, product: Product): string {
  let message = template;
  
  // Replace basic variables
  message = message
    .replace(/\{\{?codigo\}?\}/gi, product.code.trim())
    .replace(/\{\{?nome\}?\}/gi, product.name.trim())
    .replace(/\{\{?valor\}?\}/gi, formatPrice(product.price));
  
  // Handle color - remove entire line if empty
  if (product.color && product.color.trim()) {
    message = message.replace(/\{\{?cor\}?\}/gi, product.color.trim());
  } else {
    message = message.replace(/.*\{\{?cor\}?\}.*\n?/gi, '');
  }
  
  // Handle size - remove entire line if empty
  if (product.size && product.size.trim()) {
    message = message.replace(/\{\{?tamanho\}?\}/gi, product.size.trim());
  } else {
    message = message.replace(/.*\{\{?tamanho\}?\}.*\n?/gi, '');
  }
  
  // Clean up multiple consecutive line breaks
  message = message.replace(/\n{3,}/g, '\n\n');
  
  return message.trim();
}

async function getZAPICredentials(supabase: any, tenantId: string) {
  const { data: integration, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, is_active, provider")
    .eq("tenant_id", tenantId)
    .eq("provider", "zapi")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !integration || !integration.zapi_instance_id || !integration.zapi_token) {
    return null;
  }

  return {
    instanceId: integration.zapi_instance_id,
    token: integration.zapi_token,
    clientToken: integration.zapi_client_token
  };
}

async function sendGroupMessage(
  credentials: { instanceId: string; token: string; clientToken?: string },
  groupId: string,
  message: string,
  imageUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const { instanceId, token, clientToken } = credentials;
  
  try {
    // Simulate typing indicator before sending (3-5 seconds)
    await simulateTyping(instanceId, token, clientToken, groupId);

    // Add message variation
    const variedMessage = addMessageVariation(message);

    let url: string;
    let body: Record<string, unknown>;
    
    if (imageUrl) {
      // Send image with caption
      url = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-image`;
      body = {
        phone: groupId,
        image: imageUrl,
        caption: variedMessage
      };
    } else {
      // Send text only
      url = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-text`;
      body = {
        phone: groupId,
        message: variedMessage
      };
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    if (response.ok) {
      return { success: true };
    } else {
      const errorText = await response.text();
      return { success: false, error: errorText.substring(0, 100) };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { job_id, tenant_id, mode } = body;

    console.log(`[${timestamp}] [sendflow-process] Starting job ${job_id} for tenant ${tenant_id}`);

    if (!job_id || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "job_id e tenant_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar job antes de enfileirar
    const { data: job, error: jobError } = await supabase
      .from('sending_jobs')
      .select('*')
      .eq('id', job_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (jobError || !job) {
      console.log(`[${timestamp}] [sendflow-process] Job not found: ${job_id}`);
      return new Response(
        JSON.stringify({ error: "Job não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se mode=sync (debug), roda bloqueante
    if (mode === 'sync') {
      await processSendflowJob({ supabase, job, jobId: job_id, tenantId: tenant_id, timestamp });
      return new Response(
        JSON.stringify({ queued: false, mode: 'sync' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Background task: responde imediatamente e continua no servidor
    EdgeRuntime.waitUntil(
      processSendflowJob({ supabase, job, jobId: job_id, tenantId: tenant_id, timestamp })
        .catch((e) => console.error(`[${timestamp}] [sendflow-process] Background error:`, e?.message || e))
    );

    return new Response(
      JSON.stringify({ queued: true, job_id, tenant_id }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error(`[sendflow-process] Error:`, error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processSendflowJob({
  supabase,
  job,
  jobId,
  tenantId,
  timestamp,
}: {
  supabase: any;
  job: any;
  jobId: string;
  tenantId: string;
  timestamp: string;
}) {
  // Check if job is already completed or cancelled
  if (job.status === 'completed' || job.status === 'cancelled') {
    console.log(`[${timestamp}] [sendflow-process] Job ${jobId} already ${job.status}`);
    return;
  }

  // Mark job as running
  await supabase
    .from('sending_jobs')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', jobId);

  const jobData = job.job_data as SendFlowJobData;
  const {
    productIds,
    groupIds,
    messageTemplate,
    perGroupDelaySeconds = 5,
    perProductDelayMinutes = 1,
    useRandomDelay = true,
    minGroupDelaySeconds = 3,
    maxGroupDelaySeconds = 15,
  } = jobData;

  // Get Z-API credentials
  const credentials = await getZAPICredentials(supabase, tenantId);
  if (!credentials) {
    await supabase
      .from('sending_jobs')
      .update({
        status: 'error',
        error_message: 'Z-API não configurado',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    return;
  }

  // Get products
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, code, name, color, size, price, image_url')
    .eq('tenant_id', tenantId)
    .in('id', productIds);

  if (productsError || !products || products.length === 0) {
    await supabase
      .from('sending_jobs')
      .update({
        status: 'error',
        error_message: 'Produtos não encontrados',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    return;
  }

  // Create a map for product lookup preserving order
  const productsMap = new Map(products.map((p: any) => [p.id, p]));
  const orderedProducts = productIds
    .map((id) => productsMap.get(id))
    .filter((p): p is Product => p !== undefined);

  // Get starting position from job data
  let currentProductIndex = jobData.currentProductIndex || 0;
  let currentGroupIndex = jobData.currentGroupIndex || 0;
  let sentMessages = jobData.sentMessages || 0;
  let errorMessages = jobData.errorMessages || 0;

  console.log(`[${timestamp}] [sendflow-process] Processing ${orderedProducts.length} products x ${groupIds.length} groups`);
  console.log(`[${timestamp}] [sendflow-process] Starting from product ${currentProductIndex}, group ${currentGroupIndex}`);

  const updateProgress = async (productIdx: number, groupIdx: number, extra: Partial<SendFlowJobData> = {}) => {
    const newJobData = {
      ...jobData,
      currentProductIndex: productIdx,
      currentGroupIndex: groupIdx,
      sentMessages,
      errorMessages,
      ...extra,
    };

    await supabase
      .from('sending_jobs')
      .update({
        processed_items: sentMessages + errorMessages,
        current_index: productIdx,
        job_data: newJobData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  };

  const checkJobStatus = async (): Promise<'running' | 'paused' | 'cancelled'> => {
    const { data } = await supabase
      .from('sending_jobs')
      .select('status')
      .eq('id', jobId)
      .single();
    return data?.status || 'running';
  };

  for (let productIdx = currentProductIndex; productIdx < orderedProducts.length; productIdx++) {
    const status = await checkJobStatus();
    if (status === 'paused' || status === 'cancelled') {
      console.log(`[${timestamp}] [sendflow-process] Job ${jobId} ${status}, stopping`);
      return;
    }

    const product = orderedProducts[productIdx];
    const message = personalizeMessage(messageTemplate, product);

    console.log(`[${timestamp}] [sendflow-process] Product ${productIdx + 1}/${orderedProducts.length}: ${product.code}`);

    const groupStartIdx = productIdx === currentProductIndex ? currentGroupIndex : 0;

    for (let groupIdx = groupStartIdx; groupIdx < groupIds.length; groupIdx++) {
      const status = await checkJobStatus();
      if (status === 'paused' || status === 'cancelled') {
        await updateProgress(productIdx, groupIdx);
        console.log(`[${timestamp}] [sendflow-process] Job ${jobId} ${status}, stopping`);
        return;
      }

      const groupId = groupIds[groupIdx];
      const isLastGroup = groupIdx === groupIds.length - 1;

      const result = await sendGroupMessage(credentials, groupId, message, product.image_url || undefined);

      if (result.success) {
        sentMessages++;
      } else {
        errorMessages++;
        console.log(`[${timestamp}] [sendflow-process] Error sending to ${groupId}: ${result.error}`);
      }

      await updateProgress(productIdx, groupIdx + 1);

      if (!isLastGroup) {
        const delayMs = useRandomDelay
          ? getRandomDelay(minGroupDelaySeconds, maxGroupDelaySeconds)
          : perGroupDelaySeconds * 1000;

        if (delayMs > 0) await sleep(delayMs);
      }
    }

    console.log(`[${timestamp}] [sendflow-process] Completed product ${product.code}`);

    const isLastProduct = productIdx === orderedProducts.length - 1;
    if (!isLastProduct && perProductDelayMinutes > 0) {
      const delayMs = perProductDelayMinutes * 60 * 1000;
      const delayStep = 5000;
      let elapsed = 0;

      await updateProgress(productIdx + 1, 0, {
        countdownSeconds: Math.ceil(delayMs / 1000),
        isWaitingForNextProduct: true,
      });

      console.log(`[${timestamp}] [sendflow-process] Waiting ${perProductDelayMinutes}min before next product`);

      while (elapsed < delayMs) {
        const status = await checkJobStatus();
        if (status === 'paused' || status === 'cancelled') {
          await updateProgress(productIdx + 1, 0, {
            countdownSeconds: 0,
            isWaitingForNextProduct: false,
          });
          console.log(`[${timestamp}] [sendflow-process] Job ${jobId} ${status}, stopping`);
          return;
        }

        await sleep(Math.min(delayStep, delayMs - elapsed));
        elapsed += delayStep;

        const remainingSeconds = Math.ceil((delayMs - elapsed) / 1000);
        await updateProgress(productIdx + 1, 0, {
          countdownSeconds: Math.max(0, remainingSeconds),
          isWaitingForNextProduct: remainingSeconds > 0,
        });
      }

      await updateProgress(productIdx + 1, 0, {
        countdownSeconds: 0,
        isWaitingForNextProduct: false,
      });
    }
  }

  await supabase
    .from('sending_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      processed_items: sentMessages + errorMessages,
      job_data: {
        ...jobData,
        currentProductIndex: orderedProducts.length,
        currentGroupIndex: 0,
        sentMessages,
        errorMessages,
        countdownSeconds: 0,
        isWaitingForNextProduct: false,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  console.log(`[${timestamp}] [sendflow-process] Job ${jobId} completed: sent=${sentMessages}, errors=${errorMessages}`);
}
