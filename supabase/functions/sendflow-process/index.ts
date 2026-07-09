import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { simulateTyping, addMessageVariation } from "../_shared/anti-block-delay.ts";
import {
  sendText as evoSendText,
  sendImage as evoSendImage,
  sendImageByUrl as evoSendImageByUrl,
  sendPresenceAvailable as evoSendPresenceAvailable,
  sendPresenceComposing as evoSendPresenceComposing,
  calcTypingDuration as evoCalcTypingDuration,
  sendReaction as evoSendReaction,
  getRandomReactionEmoji as evoGetRandomReactionEmoji,
} from "../_shared/evolution-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

const MAX_EXECUTION_MS = 120_000;

interface Product {
  id: number;
  code: string;
  name: string;
  color?: string;
  size?: string;
  price: number;
  promotional_price?: number | null;
  observation?: string | null;
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
  return "R$ " + price.toFixed(2).replace(".", ",");
}

function removePromotionalSegment(line: string): string {
  return line
    .replace(
      /(\s*[,;|/\\-]\s*)?(?:🤑|💸)?\s*\*?\s*(por|promo(?:cional)?|valor\s+promo(?:cional)?)\s*\*?\s*:?\s*\*?\s*\{\{?\s*valor_promo\s*\}?\}\*?/giu,
      ""
    )
    .replace(/(?:🤑|💸)/gu, "")
    .replace(/\{\{?\s*valor_promo\s*\}?\}/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/[|,;:–—-]\s*$/g, "")
    .trim();
}

function applyPromotionalPriceFallback(template: string, product: Product): string {
  const promoRegex = /\{\{?\s*valor_promo\s*\}?\}/gi;
  const hasPromotionalPrice = !!(product.promotional_price && product.promotional_price > 0);

  return template
    .split("\n")
    .map((line): string | null => {
      if (!promoRegex.test(line)) {
        return line;
      }
      promoRegex.lastIndex = 0;
      if (hasPromotionalPrice) {
        return line.replace(promoRegex, formatPrice(product.promotional_price!));
      }
      const hasBasePriceOnSameLine = /\{\{?\s*(valor|valor_original)\s*\}?\}/i.test(line);
      if (!hasBasePriceOnSameLine) {
        return null;
      }
      return removePromotionalSegment(line);
    })
    .filter((line): line is string => line !== null)
    .join("\n");
}

function removeLineWithVariable(message: string, variableName: string): string {
  const re = new RegExp("^[^\\n]*\\{\\{?\\s*" + variableName + "\\s*\\}?\\}[^\\n]*\\n?", "gim");
  return message.replace(re, "");
}

function preserveBlankLines(message: string): string {
  return message
    .split("\n")
    .map((line) => (line.length === 0 ? "​" : line))
    .join("\n");
}

function personalizeMessage(template: string, product: Product): string {
  let message = applyPromotionalPriceFallback(template, product);

  message = message
    .replace(/\{\{?\s*codigo\s*\}?\}/gi, product.code.trim())
    .replace(/\{\{?\s*nome\s*\}?\}/gi, product.name.trim())
    .replace(/\{\{?\s*valor\s*\}?\}/gi, formatPrice(product.price));

  message = message.replace(/\{\{?\s*valor_original\s*\}?\}/gi, formatPrice(product.price));

  if (product.promotional_price && product.promotional_price > 0) {
    message = message.replace(/\{\{?\s*valor_promo\s*\}?\}/gi, formatPrice(product.promotional_price));
  }

  if (product.color && product.color.trim()) {
    message = message.replace(/\{\{?\s*cor\s*\}?\}/gi, product.color.trim());
  } else {
    message = removeLineWithVariable(message, "cor");
  }

  if (product.size && product.size.trim()) {
    message = message.replace(/\{\{?\s*tamanho\s*\}?\}/gi, product.size.trim());
  } else {
    message = removeLineWithVariable(message, "tamanho");
  }

  if (product.observation && product.observation.trim()) {
    message = message.replace(/\{\{?\s*observacao\s*\}?\}/gi, product.observation.trim());
  } else {
    message = removeLineWithVariable(message, "observacao");
  }

  message = message
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\s+$/g, "");

  message = preserveBlankLines(message);

  return message;
}

async function getCredentials(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, uazapi_url, uazapi_token, provider")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  const provider = data.provider || "zapi";

  if (provider === "uazapi") {
    if (!((data.uazapi_url && data.uazapi_token) ? (data.uazapi_url + "|" + data.uazapi_token) : null)) return null;
    return { provider: "uazapi" as const, instanceName: ((data.uazapi_url && data.uazapi_token) ? (data.uazapi_url + "|" + data.uazapi_token) : null) };
  }

  if (!data.zapi_instance_id || !data.zapi_token) return null;
  return {
    provider: "zapi" as const,
    instanceId: data.zapi_instance_id,
    token: data.zapi_token,
    clientToken: data.zapi_client_token || "",
  };
}

async function sendGroupMessageZapi(
  credentials: { instanceId: string; token: string; clientToken?: string },
  groupId: string,
  message: string,
  imageUrl?: string,
): Promise<{ success: boolean; error?: string }> {
  const { instanceId, token, clientToken } = credentials;

  try {
    await simulateTyping(instanceId, token, clientToken, groupId);
    const variedMessage = addMessageVariation(message, false, {
      prependGreeting: false,
      swapEmojis: false,
      invisibleVariation: true,
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clientToken) headers["Client-Token"] = clientToken;

    const base = ZAPI_BASE_URL + "/instances/" + instanceId + "/token/" + token;

    if (imageUrl) {
      const imgRes = await fetch(base + "/send-image", {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: groupId, image: imageUrl }),
      });
      if (!imgRes.ok) {
        return { success: false, error: (await imgRes.text()).substring(0, 100) };
      }
      await sleep(1500 + Math.random() * 1000);
      const txtRes = await fetch(base + "/send-text", {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: groupId, message: variedMessage }),
      });
      if (txtRes.ok) return { success: true };
      return { success: false, error: (await txtRes.text()).substring(0, 100) };
    }

    const response = await fetch(base + "/send-text", {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: groupId, message: variedMessage }),
    });
    if (response.ok) return { success: true };
    return { success: false, error: (await response.text()).substring(0, 100) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function sendGroupMessageUazapi(
  instanceName: string,
  groupId: string,
  message: string,
  imageUrl?: string,
  lastMessageId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoGroupId = groupId.includes("@g.us")
      ? groupId
      : groupId.replace(/-group$/i, "") + "@g.us";

    await evoSendPresenceAvailable(instanceName, evoGroupId);
    await sleep(1500 + Math.random() * 1500);

    if (lastMessageId) {
      try {
        await evoSendReaction(instanceName, evoGroupId, lastMessageId, evoGetRandomReactionEmoji());
        await sleep(600 + Math.random() * 600);
      } catch (reactionError: any) {
        console.warn(`[sendflow-process] uazapi reaction skipped for ${evoGroupId}: ${reactionError?.message || reactionError}`);
      }
    }

    await (await import("../_shared/evolution-api.ts")).runTypingSegments(instanceName, evoGroupId, message.length);

    if (imageUrl) {
      // width sozinho faz o Supabase CORTAR as laterais (mantém a altura original).
      // width+height com resize=contain redimensiona proporcionalmente sem cortar.
      const optimizedImageUrl = imageUrl
        .replace("/storage/v1/object/public/product-images/", "/storage/v1/render/image/public/product-images/")
        .replace(/\?.*$/, "") + "?width=800&height=800&resize=contain&quality=75";

      // Prefer URL mode for SendFlow groups: it keeps the Edge Function payload tiny and avoids base64 upload timeouts.
      let imgResult = await evoSendImageByUrl(instanceName, evoGroupId, optimizedImageUrl, message);
      if (imgResult.success) return imgResult;

      console.warn(`[sendflow-process] Evolution sendImageByUrl failed for ${evoGroupId}: ${imgResult.error}. Trying original URL.`);
      imgResult = await evoSendImageByUrl(instanceName, evoGroupId, imageUrl, message);
      if (imgResult.success) return imgResult;

      console.warn(`[sendflow-process] Evolution media failed for ${evoGroupId}; falling back to text-only. Error: ${imgResult.error}`);
      const textResult = await evoSendText(instanceName, evoGroupId, message);
      if (textResult.success) return textResult;
      return { success: false, error: imgResult.error || textResult.error };
    }

    return await evoSendText(instanceName, evoGroupId, message);
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function selfReinvoke(supabaseUrl: string, jobId: string, tenantId: string) {
  const functionUrl = supabaseUrl + "/functions/v1/sendflow-process";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const resp = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + serviceKey },
      body: JSON.stringify({ job_id: jobId, tenant_id: tenantId }),
    });
    await resp.text();
  } catch (e: any) {
    console.error("[sendflow-process] Reinvoke failed:", e?.message);
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

    if (!job_id || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "job_id e tenant_id sao obrigatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("sending_jobs")
      .select("*")
      .eq("id", job_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job nao encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "sync") {
      await processTaskQueue({ supabase, supabaseUrl, job, jobId: job_id, tenantId: tenant_id, timestamp });
      return new Response(
        JSON.stringify({ queued: false, mode: "sync" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    EdgeRuntime.waitUntil(
      processTaskQueue({ supabase, supabaseUrl, job, jobId: job_id, tenantId: tenant_id, timestamp })
        .catch((e) => console.error("[sendflow-process] Background error:", e?.message || e))
    );

    return new Response(
      JSON.stringify({ queued: true, job_id, tenant_id }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[sendflow-process] Error:", error.message);
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

  function isNearTimeout(): boolean {
    return (Date.now() - startTime) >= MAX_EXECUTION_MS;
  }

  if (job.status === "completed" || job.status === "cancelled") {
    return;
  }

  await supabase
    .from("sending_jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  const jobData = job.job_data;
  const {
    messageTemplate,
    perGroupDelaySeconds = 5,
    perProductDelayMinutes = 3,
    useRandomDelay = true,
    minGroupDelaySeconds = 3,
    maxGroupDelaySeconds = 15,
  } = jobData;

  const credentials = await getCredentials(supabase, tenantId);
  if (!credentials) {
    await supabase
      .from("sending_jobs")
      .update({ status: "error", error_message: "WhatsApp nao configurado", updated_at: new Date().toISOString() })
      .eq("id", jobId);
    return;
  }

  console.log("[sendflow-process] Job " + jobId + " | provider: " + credentials.provider);

  const { data: tasks, error: tasksError } = await supabase
    .from("sendflow_tasks")
    .select("*")
    .eq("job_id", jobId)
    .in("status", ["pending", "running"])
    .order("sequence", { ascending: true });

  if (tasksError || !tasks || tasks.length === 0) {
    await supabase
      .from("sending_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", jobId);
    return;
  }

  const productIds = [...new Set(tasks.map((t: SendFlowTask) => t.product_id))];
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, code, name, color, size, price, promotional_price, observation, image_url")
    .eq("tenant_id", tenantId)
    .in("id", productIds);

  if (productsError || !products || products.length === 0) {
    await supabase
      .from("sending_jobs")
      .update({ status: "error", error_message: "Produtos nao encontrados", updated_at: new Date().toISOString() })
      .eq("id", jobId);
    return;
  }

  const productsMap = new Map(products.map((p: any) => [p.id, p]));

  let sentMessages = jobData.sentMessages || 0;
  let errorMessages = jobData.errorMessages || 0;

  const getLatestGroupMessageId = async (groupName: string, groupId: string): Promise<string | null> => {
    const filters: string[] = [];
    if (groupName) filters.push(`whatsapp_group_name.eq.${groupName.replace(/[,()]/g, "")}`);
    if (groupId) filters.push(`message.ilike.%${groupId.replace(/[%_,()]/g, "")}%`);

    let query = supabase
      .from("whatsapp_messages")
      .select("zapi_message_id")
      .eq("tenant_id", tenantId)
      .eq("type", "incoming")
      .not("zapi_message_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(1);

    if (filters.length > 0) query = query.or(filters.join(","));

    const { data } = await query.maybeSingle();
    return data?.zapi_message_id || null;
  };

  let lastProductId: number | null = null;
  {
    const { data: lastCompleted } = await supabase
      .from("sendflow_tasks")
      .select("product_id")
      .eq("job_id", jobId)
      .in("status", ["completed", "skipped", "error"])
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastCompleted) lastProductId = lastCompleted.product_id;
  }

  const checkJobStatus = async (): Promise<string> => {
    const { data } = await supabase.from("sending_jobs").select("status").eq("id", jobId).single();
    return data?.status || "running";
  };

  const updateJobProgress = async (extra: Record<string, any> = {}) => {
    const { count: completedCount } = await supabase
      .from("sendflow_tasks")
      .select("*", { count: "exact", head: true })
      .eq("job_id", jobId)
      .in("status", ["completed", "skipped", "error"]);
    await supabase
      .from("sending_jobs")
      .update({
        processed_items: completedCount || 0,
        job_data: { ...jobData, sentMessages, errorMessages, ...extra },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  };

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i] as SendFlowTask;
    const product = productsMap.get(task.product_id);
    if (!product) {
      await supabase.from("sendflow_tasks").update({ status: "error", error_message: "Produto nao encontrado", completed_at: new Date().toISOString() }).eq("id", task.id);
      errorMessages++;
      continue;
    }

    if (isNearTimeout()) {
      await updateJobProgress({ countdownSeconds: 0, isWaitingForNextProduct: false });
      await selfReinvoke(supabaseUrl, jobId, tenantId);
      return;
    }

    const jobStatus = await checkJobStatus();
    if (jobStatus === "paused" || jobStatus === "cancelled") {
      await updateJobProgress();
      return;
    }

    if (lastProductId !== null && task.product_id !== lastProductId && perProductDelayMinutes > 0) {
      let delayMs: number;
      if (jobData._pendingProductDelayMs && jobData._pendingProductId === task.product_id) {
        delayMs = jobData._pendingProductDelayMs;
        jobData._pendingProductDelayMs = null;
        jobData._pendingProductId = null;
      } else {
        delayMs = perProductDelayMinutes * 60 * 1000;
      }

      const delayStep = 5000;
      let elapsed = 0;
      await updateJobProgress({ countdownSeconds: Math.ceil(delayMs / 1000), isWaitingForNextProduct: true, nextTaskId: task.id });

      while (elapsed < delayMs) {
        if (isNearTimeout()) {
          const remainingMs = delayMs - elapsed;
          await updateJobProgress({ countdownSeconds: Math.ceil(remainingMs / 1000), isWaitingForNextProduct: true, nextTaskId: task.id, _pendingProductDelayMs: remainingMs, _pendingProductId: task.product_id });
          await selfReinvoke(supabaseUrl, jobId, tenantId);
          return;
        }
        const s = await checkJobStatus();
        if (s === "paused" || s === "cancelled") {
          await updateJobProgress({ countdownSeconds: 0, isWaitingForNextProduct: false });
          return;
        }
        await sleep(Math.min(delayStep, delayMs - elapsed));
        elapsed += delayStep;
        const remainingSeconds = Math.ceil((delayMs - elapsed) / 1000);
        await updateJobProgress({ countdownSeconds: Math.max(0, remainingSeconds), isWaitingForNextProduct: remainingSeconds > 0, nextTaskId: task.id });
      }
      await updateJobProgress({ countdownSeconds: 0, isWaitingForNextProduct: false, _pendingProductDelayMs: null, _pendingProductId: null });
    }

    lastProductId = task.product_id;
    await supabase.from("sendflow_tasks").update({ status: "running", started_at: new Date().toISOString() }).eq("id", task.id);

    const DUPLICATE_WINDOW_MINUTES = 15;
    const cutoffIso = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data: recentSends } = await supabase
      .from("sendflow_history")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("product_id", task.product_id)
      .eq("group_id", task.group_id)
      .gte("sent_at", cutoffIso)
      .limit(1);

    if (Array.isArray(recentSends) && recentSends.length > 0) {
      await supabase.from("sendflow_tasks").update({ status: "skipped", completed_at: new Date().toISOString(), error_message: "Duplicata (" + DUPLICATE_WINDOW_MINUTES + "min)" }).eq("id", task.id);
      await updateJobProgress();
      if (i < tasks.length - 1 && tasks[i + 1].product_id === task.product_id) {
        const delayMs = useRandomDelay ? getRandomDelay(minGroupDelaySeconds, maxGroupDelaySeconds) : perGroupDelaySeconds * 1000;
        if (delayMs > 0) await sleep(delayMs);
      }
      continue;
    }

    const message = personalizeMessage(messageTemplate, product);

    let result: { success: boolean; error?: string };
    if (credentials.provider === "uazapi") {
      const lastMessageId = await getLatestGroupMessageId(task.group_name, task.group_id);
      result = await sendGroupMessageUazapi(credentials.instanceName, task.group_id, message, product.image_url || undefined, lastMessageId);
    } else {
      result = await sendGroupMessageZapi(credentials, task.group_id, message, product.image_url || undefined);
    }

    if (result.success) {
      sentMessages++;
      await supabase.from("sendflow_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.id);
      await supabase.from("sendflow_history").insert({ tenant_id: tenantId, product_id: task.product_id, group_id: task.group_id, job_id: jobId });
    } else {
      errorMessages++;
      await supabase.from("sendflow_tasks").update({ status: "error", error_message: result.error || "Unknown error", completed_at: new Date().toISOString() }).eq("id", task.id);
    }

    await updateJobProgress();

    if (i < tasks.length - 1) {
      const nextTask = tasks[i + 1];
      if (nextTask.product_id === task.product_id) {
        const delayMs = useRandomDelay ? getRandomDelay(minGroupDelaySeconds, maxGroupDelaySeconds) : perGroupDelaySeconds * 1000;
        if (delayMs > 0) {
          await updateJobProgress({ countdownSeconds: Math.ceil(delayMs / 1000), isWaitingForNextGroup: true, isWaitingForNextProduct: false, nextTaskId: nextTask.id });
          const step = 2000;
          let elapsed = 0;
          while (elapsed < delayMs) {
            await sleep(Math.min(step, delayMs - elapsed));
            elapsed += step;
            const remaining = Math.max(0, Math.ceil((delayMs - elapsed) / 1000));
            await updateJobProgress({ countdownSeconds: remaining, isWaitingForNextGroup: remaining > 0, isWaitingForNextProduct: false, nextTaskId: nextTask.id });
          }
        }
      }
    }
  }

  const { count: totalCompleted } = await supabase
    .from("sendflow_tasks")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("status", ["completed", "skipped", "error"]);

  await supabase
    .from("sending_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      processed_items: totalCompleted || 0,
      job_data: { ...jobData, sentMessages, errorMessages, countdownSeconds: 0, isWaitingForNextProduct: false, _pendingProductDelayMs: null, _pendingProductId: null },
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}