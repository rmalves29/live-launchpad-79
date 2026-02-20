import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { simulateTyping, addMessageVariation } from "../_shared/anti-block-delay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

// Max wall-clock time before self-reinvoking (leave margin for cleanup)
const MAX_EXECUTION_MS = 120_000; // 120s safe limit (Supabase max ~150s)

interface Product {
  id: number;
  code: string;
  name: string;
  color?: string;
  size?: string;
  price: number;
  image_url?: string;
}

interface SendFlowTask {
  id: string;
  product_id: number;
  group_id: string;
  sequence: number;
  status: string;
  product_code: string;
  group_name: string;
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
  
  message = message
    .replace(/\{\{?codigo\}?\}/gi, product.code.trim())
    .replace(/\{\{?nome\}?\}/gi, product.name.trim())
    .replace(/\{\{?valor\}?\}/gi, formatPrice(product.price));
  
  if (product.color && product.color.trim()) {
    message = message.replace(/\{\{?cor\}?\}/gi, product.color.trim());
  } else {
    message = message.replace(/.*\{\{?cor\}?\}.*\n?/gi, '');
  }
  
  if (product.size && product.size.trim()) {
    message = message.replace(/\{\{?tamanho\}?\}/gi, product.size.trim());
  } else {
    message = message.replace(/.*\{\{?tamanho\}?\}.*\n?/gi, '');
  }
  
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
    await simulateTyping(instanceId, token, clientToken, groupId);
    const variedMessage = addMessageVariation(message, false);

    let url: string;
    let body: Record<string, unknown>;
    
    if (imageUrl) {
      url = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-image`;
      body = { phone: groupId, image: imageUrl, caption: variedMessage };
    } else {
      url = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-text`;
      body = { phone: groupId, message: variedMessage };
    }
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (clientToken) headers['Client-Token'] = clientToken;
    
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    
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

/**
 * Self-reinvoke this edge function to continue processing after timeout-safe limit.
 * This prevents the function from being killed mid-execution.
 */
async function selfReinvoke(supabaseUrl: string, jobId: string, tenantId: string) {
  const functionUrl = `${supabaseUrl}/functions/v1/sendflow-process`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  console.log(`[sendflow-process] ♻️ Self-reinvoking for job ${jobId}`);

  try {
    const resp = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ job_id: jobId, tenant_id: tenantId }),
    });
    console.log(`[sendflow-process] ♻️ Reinvoke response status: ${resp.status}`);
    // Consume the body to prevent resource leak
    await resp.text();
  } catch (e: any) {
    console.error(`[sendflow-process] ♻️ Reinvoke failed:`, e?.message);
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

    const { data: job, error: jobError } = await supabase
      .from('sending_jobs')
      .select('*')
      .eq('id', job_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === 'sync') {
      await processTaskQueue({ supabase, supabaseUrl, job, jobId: job_id, tenantId: tenant_id, timestamp });
      return new Response(
        JSON.stringify({ queued: false, mode: 'sync' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    EdgeRuntime.waitUntil(
      processTaskQueue({ supabase, supabaseUrl, job, jobId: job_id, tenantId: tenant_id, timestamp })
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

async function processTaskQueue({
  supabase,
  supabaseUrl,
  job,
  jobId,
  tenantId,
  timestamp,
}: {
  supabase: any;
  supabaseUrl: string;
  job: any;
  jobId: string;
  tenantId: string;
  timestamp: string;
}) {
  const startTime = Date.now();

  /** Returns true if we're approaching the timeout limit */
  function isNearTimeout(): boolean {
    return (Date.now() - startTime) >= MAX_EXECUTION_MS;
  }

  if (job.status === 'completed' || job.status === 'cancelled') {
    console.log(`[${timestamp}] [sendflow-process] Job ${jobId} already ${job.status}`);
    return;
  }

  await supabase
    .from('sending_jobs')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', jobId);

  const jobData = job.job_data;
  const {
    messageTemplate,
    perGroupDelaySeconds = 5,
    perProductDelayMinutes = 3,
    useRandomDelay = true,
    minGroupDelaySeconds = 3,
    maxGroupDelaySeconds = 15,
  } = jobData;

  // Get Z-API credentials
  const credentials = await getZAPICredentials(supabase, tenantId);
  if (!credentials) {
    await supabase
      .from('sending_jobs')
      .update({ status: 'error', error_message: 'Z-API não configurado', updated_at: new Date().toISOString() })
      .eq('id', jobId);
    return;
  }

  // Fetch all pending/running tasks ordered by sequence
  const { data: tasks, error: tasksError } = await supabase
    .from('sendflow_tasks')
    .select('*')
    .eq('job_id', jobId)
    .in('status', ['pending', 'running'])
    .order('sequence', { ascending: true });

  if (tasksError || !tasks || tasks.length === 0) {
    console.log(`[${timestamp}] [sendflow-process] No pending tasks for job ${jobId}`);
    await supabase
      .from('sending_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', jobId);
    return;
  }

  // Get all unique product IDs from tasks
  const productIds = [...new Set(tasks.map((t: SendFlowTask) => t.product_id))];
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, code, name, color, size, price, image_url')
    .eq('tenant_id', tenantId)
    .in('id', productIds);

  if (productsError || !products || products.length === 0) {
    await supabase
      .from('sending_jobs')
      .update({ status: 'error', error_message: 'Produtos não encontrados', updated_at: new Date().toISOString() })
      .eq('id', jobId);
    return;
  }

  const productsMap = new Map(products.map((p: any) => [p.id, p]));

  let sentMessages = jobData.sentMessages || 0;
  let errorMessages = jobData.errorMessages || 0;

  // Determine the last completed product to detect product changes correctly
  let lastProductId: number | null = null;
  {
    const { data: lastCompleted } = await supabase
      .from('sendflow_tasks')
      .select('product_id')
      .eq('job_id', jobId)
      .in('status', ['completed', 'skipped', 'error'])
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastCompleted) {
      lastProductId = lastCompleted.product_id;
    }
  }

  console.log(`[${timestamp}] [sendflow-process] Processing ${tasks.length} pending tasks (lastProductId=${lastProductId})`);

  const checkJobStatus = async (): Promise<string> => {
    const { data } = await supabase
      .from('sending_jobs')
      .select('status')
      .eq('id', jobId)
      .single();
    return data?.status || 'running';
  };

  const updateJobProgress = async (extra: Record<string, any> = {}) => {
    const { count: completedCount } = await supabase
      .from('sendflow_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .in('status', ['completed', 'skipped', 'error']);

    const processed = completedCount || 0;

    await supabase
      .from('sending_jobs')
      .update({
        processed_items: processed,
        job_data: { ...jobData, sentMessages, errorMessages, ...extra },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  };

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i] as SendFlowTask;
    const product = productsMap.get(task.product_id);
    if (!product) {
      await supabase.from('sendflow_tasks').update({ status: 'error', error_message: 'Produto não encontrado', completed_at: new Date().toISOString() }).eq('id', task.id);
      errorMessages++;
      continue;
    }

    // ─── Timeout check: reinvoke before being killed ───
    if (isNearTimeout()) {
      console.log(`[${timestamp}] [sendflow-process] ⏱️ Near timeout after ${Math.round((Date.now() - startTime) / 1000)}s, reinvoking...`);
      await updateJobProgress({ countdownSeconds: 0, isWaitingForNextProduct: false });
      await selfReinvoke(supabaseUrl, jobId, tenantId);
      return;
    }

    // Check if job was paused/cancelled
    const status = await checkJobStatus();
    if (status === 'paused' || status === 'cancelled') {
      console.log(`[${timestamp}] [sendflow-process] Job ${jobId} ${status}, stopping`);
      await updateJobProgress();
      return;
    }

    // Delay between products (when product changes)
    if (lastProductId !== null && task.product_id !== lastProductId && perProductDelayMinutes > 0) {
      // Check if we're resuming a partial delay from a previous invocation that timed out
      let delayMs: number;
      if (jobData._pendingProductDelayMs && jobData._pendingProductId === task.product_id) {
        delayMs = jobData._pendingProductDelayMs;
        console.log(`[${timestamp}] [sendflow-process] Resuming partial product delay: ${Math.ceil(delayMs / 1000)}s remaining for ${product.code}`);
        // Clear the flag from jobData so it's not used again
        jobData._pendingProductDelayMs = null;
        jobData._pendingProductId = null;
      } else {
        delayMs = perProductDelayMinutes * 60 * 1000;
        console.log(`[${timestamp}] [sendflow-process] Waiting ${perProductDelayMinutes}min before next product (${product.code})`);
      }

      const delayStep = 5000;
      let elapsed = 0;

      await updateJobProgress({
        countdownSeconds: Math.ceil(delayMs / 1000),
        isWaitingForNextProduct: true,
        nextTaskId: task.id,
      });

      while (elapsed < delayMs) {
        // ─── Timeout check during product delay ───
        if (isNearTimeout()) {
          const remainingMs = delayMs - elapsed;
          console.log(`[${timestamp}] [sendflow-process] ⏱️ Near timeout during product delay, reinvoking with ${Math.ceil(remainingMs / 1000)}s remaining...`);
          await updateJobProgress({
            countdownSeconds: Math.ceil(remainingMs / 1000),
            isWaitingForNextProduct: true,
            nextTaskId: task.id,
            _pendingProductDelayMs: remainingMs,
            _pendingProductId: task.product_id,
          });
          await selfReinvoke(supabaseUrl, jobId, tenantId);
          return;
        }

        const status = await checkJobStatus();
        if (status === 'paused' || status === 'cancelled') {
          await updateJobProgress({ countdownSeconds: 0, isWaitingForNextProduct: false });
          console.log(`[${timestamp}] [sendflow-process] Job ${jobId} ${status} during delay`);
          return;
        }

        await sleep(Math.min(delayStep, delayMs - elapsed));
        elapsed += delayStep;

        const remainingSeconds = Math.ceil((delayMs - elapsed) / 1000);
        await updateJobProgress({
          countdownSeconds: Math.max(0, remainingSeconds),
          isWaitingForNextProduct: remainingSeconds > 0,
          nextTaskId: task.id,
        });
      }

      await updateJobProgress({ countdownSeconds: 0, isWaitingForNextProduct: false, _pendingProductDelayMs: null, _pendingProductId: null });
    }

    lastProductId = task.product_id;

    // Mark task as running
    await supabase.from('sendflow_tasks').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', task.id);

    // Idempotency check - 8 hour window
    const { data: alreadySent } = await supabase.rpc('is_product_recently_sent', {
      p_tenant_id: tenantId,
      p_product_id: task.product_id,
      p_group_id: task.group_id,
      p_hours: 8,
    });

    if (alreadySent) {
      console.log(`[${timestamp}] [sendflow-process] SKIP duplicate: ${product.code} -> ${task.group_id}`);
      await supabase.from('sendflow_tasks').update({ status: 'skipped', completed_at: new Date().toISOString(), error_message: 'Duplicata (8h)' }).eq('id', task.id);
      await updateJobProgress();

      // Still apply group delay even for skipped
      if (i < tasks.length - 1 && tasks[i + 1].product_id === task.product_id) {
        const delayMs = useRandomDelay
          ? getRandomDelay(minGroupDelaySeconds, maxGroupDelaySeconds)
          : perGroupDelaySeconds * 1000;
        if (delayMs > 0) await sleep(delayMs);
      }
      continue;
    }

    // Send the message
    const message = personalizeMessage(messageTemplate, product);
    const result = await sendGroupMessage(credentials, task.group_id, message, product.image_url || undefined);

    if (result.success) {
      sentMessages++;
      await supabase.from('sendflow_tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', task.id);

      // Record in sendflow_history
      await supabase.from('sendflow_history').insert({
        tenant_id: tenantId,
        product_id: task.product_id,
        group_id: task.group_id,
        job_id: jobId,
      });
    } else {
      errorMessages++;
      console.log(`[${timestamp}] [sendflow-process] Error: ${product.code} -> ${task.group_id}: ${result.error}`);
      await supabase.from('sendflow_tasks').update({ status: 'error', error_message: result.error || 'Unknown error', completed_at: new Date().toISOString() }).eq('id', task.id);
    }

    await updateJobProgress();

    // Delay between groups (same product)
    if (i < tasks.length - 1) {
      const nextTask = tasks[i + 1];
      const isProductChange = nextTask.product_id !== task.product_id;
      
      if (!isProductChange) {
        const delayMs = useRandomDelay
          ? getRandomDelay(minGroupDelaySeconds, maxGroupDelaySeconds)
          : perGroupDelaySeconds * 1000;
        
        if (delayMs > 0) {
          const delaySec = Math.ceil(delayMs / 1000);
          await updateJobProgress({
            countdownSeconds: delaySec,
            isWaitingForNextGroup: true,
            isWaitingForNextProduct: false,
            nextTaskId: nextTask.id,
          });

          const step = 2000;
          let elapsed = 0;
          while (elapsed < delayMs) {
            await sleep(Math.min(step, delayMs - elapsed));
            elapsed += step;
            const remaining = Math.max(0, Math.ceil((delayMs - elapsed) / 1000));
            await updateJobProgress({
              countdownSeconds: remaining,
              isWaitingForNextGroup: remaining > 0,
              isWaitingForNextProduct: false,
              nextTaskId: nextTask.id,
            });
          }
        }
      }
    }
  }

  // Job completed
  const { count: totalCompleted } = await supabase
    .from('sendflow_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .in('status', ['completed', 'skipped', 'error']);

  await supabase
    .from('sending_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      processed_items: totalCompleted || 0,
      job_data: {
        ...jobData,
        sentMessages,
        errorMessages,
        countdownSeconds: 0,
        isWaitingForNextProduct: false,
        _pendingProductDelayMs: null,
        _pendingProductId: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  console.log(`[${timestamp}] [sendflow-process] Job ${jobId} completed: sent=${sentMessages}, errors=${errorMessages}`);
}
