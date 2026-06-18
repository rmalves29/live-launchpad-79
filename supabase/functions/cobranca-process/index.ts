import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_EXECUTION_MS = 120_000;

interface CobrancaCustomer {
  phone: string;
  name?: string;
  order_id?: number | null;
  total_amount?: number;
  payment_link?: string;
  items?: Array<{ product_name: string; product_code: string; qty: number; unit_price: number }>;
}

interface CobrancaJobData {
  customers: CobrancaCustomer[];
  messageTemplate: string;
  imageUrl?: string | null;
  buttonEnabled?: boolean;
  buttonLabel?: string;
  buttonUrl?: string;
  tagId?: string | null;
  delayBetweenMessages?: number;
  messagesBeforePause?: number;
  pauseDuration?: number;
  batchId?: string;
  sentCount?: number;
  errorCount?: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtBRL(n: number): string {
  return `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizePhone(phone: string): string {
  let p = (phone || "").replace(/\D/g, "");
  if (p.startsWith("55")) p = p.slice(2);
  return "55" + p;
}

function renderTemplate(tpl: string, c: CobrancaCustomer): string {
  let out = tpl || "";
  const rawName = (c.name || "").trim();
  const firstName = rawName ? rawName.split(/\s+/)[0] : "";
  if (firstName) {
    out = out.replace(/\{\{nome\}\}/g, firstName);
  } else {
    out = out
      .replace(/(Olá|Oi|Ola|Olá,)\s*\{\{nome\}\}\s*,?\s*/gi, "Olá, ")
      .replace(/\{\{nome\}\}/g, "");
  }

  const items = c.items || [];
  if (items.length === 0) {
    out = out.split("\n").filter((line) => !line.includes("{{produtos}}")).join("\n");
  } else {
    const block = items
      .map((it) => {
        const code = it.product_code ? ` (${it.product_code})` : "";
        return `• ${it.product_name}${code} — ${it.qty}x ${fmtBRL(it.unit_price)}`;
      })
      .join("\n");
    out = out.replace(/\{\{produtos\}\}/g, block);
  }

  const totalNum = Number(c.total_amount || 0);
  out = out.replace(/\{\{total\}\}/g, totalNum ? fmtBRL(totalNum) : "");
  out = out.replace(/\{\{valor\}\}/g, totalNum ? fmtBRL(totalNum) : "");
  out = out.replace(/\{\{pedido\}\}/g, c.order_id ? `#${c.order_id}` : "");
  out = out.replace(/\{\{payment_link\}\}/g, c.payment_link || "");
  out = out.replace(/\{\{link\}\}/g, c.payment_link || "");

  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

const EMOJI_VARIATIONS: Record<string, string[]> = {
  "✅": ["☑️", "✔️", "👍", "💚"],
  "🎉": ["🥳", "✨", "🎊", "💫"],
  "🛒": ["🛍️", "📦", "🛍", "🧺"],
  "💰": ["💵", "💲", "💸", "🤑"],
  "❌": ["🚫", "⛔", "✖️", "🔴"],
  "📦": ["🎁", "📬", "📭", "🗳️"],
};

function addVariation(message: string): string {
  let result = message;
  if (Math.random() < 0.3) {
    for (const [original, alts] of Object.entries(EMOJI_VARIATIONS)) {
      if (result.includes(original) && Math.random() < 0.5) {
        result = result.replace(original, alts[Math.floor(Math.random() * alts.length)]);
        break;
      }
    }
  }
  if (Math.random() < 0.6) {
    const pos = Math.floor(Math.random() * result.length);
    result = result.slice(0, pos) + "\u200B" + result.slice(pos);
  }
  return result;
}

function humanizedDelayMs(baseSeconds: number): number {
  // ±25% jitter
  const ms = baseSeconds * 1000;
  const jitter = ms * 0.25;
  return Math.max(500, Math.round(ms + (Math.random() * 2 - 1) * jitter));
}

async function callZapiProxy(
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: any; error?: string }> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/zapi-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!resp.ok) return { ok: false, data, error: data?.error || `HTTP ${resp.status}` };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, data: null, error: e?.message || "fetch failed" };
  }
}

async function selfReinvoke(supabaseUrl: string, serviceKey: string, jobId: string, tenantId: string) {
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/cobranca-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ job_id: jobId, tenant_id: tenantId }),
    });
    await r.text();
    console.log(`[cobranca-process] ♻️ Reinvoke status: ${r.status}`);
  } catch (e: any) {
    console.error("[cobranca-process] Reinvoke error:", e?.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { job_id, tenant_id } = await req.json();
    if (!job_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "job_id e tenant_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobErr } = await supabase
      .from("sending_jobs").select("*").eq("id", job_id).eq("tenant_id", tenant_id).single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status === "completed" || job.status === "cancelled") {
      return new Response(JSON.stringify({ skipped: true, status: job.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Run in background; return immediately
    EdgeRuntime.waitUntil(
      processCobranca({ supabase, supabaseUrl, serviceKey, job, jobId: job_id, tenantId: tenant_id })
        .catch((e) => console.error("[cobranca-process] Background error:", e?.message || e)),
    );

    return new Response(JSON.stringify({ queued: true, job_id }), {
      status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[cobranca-process] Error:", e?.message);
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processCobranca({
  supabase, supabaseUrl, serviceKey, job, jobId, tenantId,
}: {
  supabase: any; supabaseUrl: string; serviceKey: string;
  job: any; jobId: string; tenantId: string;
}) {
  const start = Date.now();
  const isNearTimeout = () => Date.now() - start >= MAX_EXECUTION_MS;

  const jd: CobrancaJobData = job.job_data || ({} as any);
  const customers = jd.customers || [];
  const messageTemplate = jd.messageTemplate || "";
  const imageUrl = jd.imageUrl || null;
  const buttonEnabled = !!jd.buttonEnabled;
  const buttonLabel = jd.buttonLabel || "";
  const buttonUrl = jd.buttonUrl || "";
  const tagId = jd.tagId || null;
  const delayBetweenMessages = Number(jd.delayBetweenMessages ?? 15);
  const messagesBeforePause = Number(jd.messagesBeforePause ?? 10);
  const pauseDuration = Number(jd.pauseDuration ?? 120);
  const batchId = jd.batchId || jobId;

  let sentCount = jd.sentCount || 0;
  let errorCount = jd.errorCount || 0;
  let consecutiveDisconnect = 0;

  await supabase.from("sending_jobs").update({
    status: "running", updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  const startIdx = Number(job.current_index || 0);

  async function persistProgress(idx: number, extra: Record<string, any> = {}) {
    await supabase.from("sending_jobs").update({
      processed_items: idx,
      current_index: idx,
      job_data: { ...jd, sentCount, errorCount, batchId },
      updated_at: new Date().toISOString(),
      ...extra,
    }).eq("id", jobId);
  }

  async function fetchStatus(): Promise<string> {
    const { data } = await supabase.from("sending_jobs").select("status").eq("id", jobId).single();
    return data?.status || "running";
  }

  for (let i = startIdx; i < customers.length; i++) {
    if (isNearTimeout()) {
      console.log(`[cobranca-process] ⏱️ Near timeout at index ${i}, reinvoking...`);
      await persistProgress(i);
      await selfReinvoke(supabaseUrl, serviceKey, jobId, tenantId);
      return;
    }

    const status = await fetchStatus();
    if (status === "cancelled") {
      console.log(`[cobranca-process] Cancelled at index ${i}`);
      await persistProgress(i, {
        completed_at: new Date().toISOString(),
        error_message: "Cancelado pelo usuário",
      });
      return;
    }
    if (status === "paused") {
      console.log(`[cobranca-process] Paused at index ${i}; will stop and wait for resume.`);
      await persistProgress(i);
      return;
    }

    const c = customers[i];
    const phone = normalizePhone(c.phone);
    const personalized = renderTemplate(messageTemplate, c);
    const varied = addVariation(personalized);

    const resolvedButtonLabel = buttonEnabled ? renderTemplate(buttonLabel, c).slice(0, 20) : "";
    const resolvedButtonUrl = buttonEnabled ? renderTemplate(buttonUrl, c).trim() : "";
    const hasValidButton =
      buttonEnabled &&
      resolvedButtonLabel.length > 0 &&
      /^https?:\/\/.+/i.test(resolvedButtonUrl);

    let deliveryStatus = "PENDING";
    let messageId: string | null = null;
    let sendFailedMsg: string | null = null;
    let looksDisconnected = false;

    try {
      // 1) Image first (if any)
      let imageResp: { ok: boolean; data: any; error?: string } = { ok: true, data: null };
      if (imageUrl) {
        imageResp = await callZapiProxy(supabaseUrl, serviceKey, {
          action: "send-image",
          tenant_id: tenantId,
          phone,
          mediaUrl: imageUrl,
          caption: hasValidButton ? "" : varied,
        });
        if (hasValidButton) await sleep(600);
      }

      // 2) Main message
      let mainResp: { ok: boolean; data: any; error?: string } | null = null;
      if (hasValidButton) {
        mainResp = await callZapiProxy(supabaseUrl, serviceKey, {
          action: "send-button-actions",
          tenant_id: tenantId,
          phone,
          message: varied,
          buttonActions: [
            { id: "1", type: "URL", url: resolvedButtonUrl, label: resolvedButtonLabel },
          ],
        });
      } else if (!imageUrl) {
        mainResp = await callZapiProxy(supabaseUrl, serviceKey, {
          action: "send-text",
          tenant_id: tenantId,
          phone,
          message: varied,
        });
      } else {
        mainResp = imageResp;
      }

      const resp = mainResp!;
      const payloadErr: string | null =
        resp.data && typeof resp.data === "object" && (resp.data.error || resp.data.message)
          ? String(resp.data.error || resp.data.message)
          : null;
      const hasMessageId = !!(resp.data && (resp.data.messageId || resp.data.zaapId || resp.data.id));
      looksDisconnected = !!payloadErr && /not.?connected|disconnect|desconect|sessão|session|qrcode|qr.code/i.test(payloadErr);
      const failed = !resp.ok || (!!payloadErr && !hasMessageId) || resp.data?.connected === false;

      if (failed) {
        sendFailedMsg = resp.error || payloadErr || "Falha desconhecida";
        deliveryStatus = "FAILED";
        errorCount++;
        if (looksDisconnected) {
          consecutiveDisconnect++;
          if (consecutiveDisconnect >= 3) {
            console.warn(`[cobranca-process] 🛑 3 desconexões consecutivas — pausando.`);
            await supabase.from("sending_jobs").update({
              status: "paused",
              paused_at: new Date().toISOString(),
              error_message: "Z-API desconectado",
              job_data: { ...jd, sentCount, errorCount, batchId },
              current_index: i,
              processed_items: i,
              updated_at: new Date().toISOString(),
            }).eq("id", jobId);
            return;
          }
        } else {
          consecutiveDisconnect = 0;
        }
      } else {
        sentCount++;
        consecutiveDisconnect = 0;
        if (hasMessageId) {
          deliveryStatus = "SENT";
          messageId = String(resp.data.messageId || resp.data.zaapId || resp.data.id);
        } else {
          deliveryStatus = "PENDING";
        }

        // Tag (best effort)
        if (tagId && tagId !== "none") {
          callZapiProxy(supabaseUrl, serviceKey, {
            action: "add-tag",
            tenant_id: tenantId,
            phone,
            tagId,
          }).catch(() => {});
        }
      }
    } catch (e: any) {
      sendFailedMsg = e?.message || "Erro desconhecido";
      deliveryStatus = "FAILED";
      errorCount++;
    }

    // Log in whatsapp_messages
    try {
      await supabase.from("whatsapp_messages").insert({
        tenant_id: tenantId,
        phone,
        message: varied,
        type: "bulk",
        batch_id: batchId,
        delivery_status: deliveryStatus,
        zapi_message_id: messageId,
        sent_at: new Date().toISOString(),
        processed: true,
      });
    } catch (e: any) {
      console.warn("[cobranca-process] failed inserting whatsapp_messages:", e?.message);
    }

    await persistProgress(i + 1);

    // Inter-message delay (skip after last)
    if (i < customers.length - 1) {
      const isPauseTick = messagesBeforePause > 0 && (i + 1) % messagesBeforePause === 0;
      const totalDelayMs = humanizedDelayMs(delayBetweenMessages) + (isPauseTick ? humanizedDelayMs(pauseDuration) : 0);

      const step = 2000;
      let waited = 0;
      while (waited < totalDelayMs) {
        if (isNearTimeout()) {
          console.log(`[cobranca-process] ⏱️ Near timeout during delay at idx ${i + 1}, reinvoking.`);
          await persistProgress(i + 1);
          await selfReinvoke(supabaseUrl, serviceKey, jobId, tenantId);
          return;
        }
        const s = await fetchStatus();
        if (s === "cancelled") {
          await persistProgress(i + 1, {
            completed_at: new Date().toISOString(),
            error_message: "Cancelado pelo usuário",
          });
          return;
        }
        if (s === "paused") {
          await persistProgress(i + 1);
          return;
        }
        await sleep(Math.min(step, totalDelayMs - waited));
        waited += step;
      }
    }
  }

  // Done
  await supabase.from("sending_jobs").update({
    status: "completed",
    processed_items: customers.length,
    current_index: customers.length,
    completed_at: new Date().toISOString(),
    job_data: { ...jd, sentCount, errorCount, batchId },
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  console.log(`[cobranca-process] Job ${jobId} done: sent=${sentCount} errors=${errorCount}`);
}
