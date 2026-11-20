// Arquiva no Google Drive e limpa o histórico de execução das tarefas automáticas (cron.job_run_details).
// Só apaga um bloco DEPOIS que a cópia dele subiu para o Drive. Guarda os últimos `retention_days` dias (7).
// Também limpa respostas antigas do pg_net (efêmeras, sem cópia).
//
// Código trazido do Supabase para o GitHub em 20/11/2026 (antes só existia publicado). Mudança:
// pausa entre blocos — o Drive recusava o 2º bloco por cota de envios por minuto (403), então só saíam
// 50 mil linhas por semana e o histórico crescia. A rotina também passou a rodar todo dia (cron 02h).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files";
const DEFAULT_FOLDER_ID = "1_VbPMQAci0g6knmx1fLbONwraB-m2hyo";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Record<string, unknown>[], headers: string[], includeHeader: boolean): string {
  const lines: string[] = [];
  if (includeHeader) lines.push(headers.map(csvEscape).join(","));
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  return lines.join("\n") + "\n";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const driveApiKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try { if (req.method === "POST") body = await req.json(); } catch { /* */ }
  const url = new URL(req.url);
  const retentionDays = Number(body.retention_days ?? url.searchParams.get("retention_days") ?? 7);
  const folderId = String(body.folder_id ?? url.searchParams.get("folder_id") ?? DEFAULT_FOLDER_ID);
  const dryRun = String(body.dry_run ?? url.searchParams.get("dry_run") ?? "false") === "true";
  const chunkSize = Number(body.chunk_size ?? url.searchParams.get("chunk_size") ?? 50000);
  const maxChunks = Number(body.max_chunks ?? url.searchParams.get("max_chunks") ?? 5);
  const maxRuntimeMs = Number(body.max_runtime_ms ?? 140000);
  // Pausa entre blocos para não estourar a cota de envios por minuto do Google Drive
  const pauseMs = Number(body.pause_ms ?? 65000);

  const cutoffISO = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const runId = crypto.randomUUID().slice(0, 8);
  console.log(`[${runId}] cleanup-cron-logs retention=${retentionDays}d cutoff=${cutoffISO} dry_run=${dryRun}`);

  if (!lovableApiKey || !driveApiKey) {
    return new Response(JSON.stringify({ success: false, error: "Missing LOVABLE_API_KEY or GOOGLE_DRIVE_API_KEY" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const chunks: any[] = [];
  let totalExported = 0, totalDeleted = 0;

  try {
    for (let i = 0; i < maxChunks; i++) {
      if (i > 0) {
        if (Date.now() - startedAt + pauseMs > maxRuntimeMs) { console.log(`[${runId}] sem tempo para outro bloco (${i})`); break; }
        await sleep(pauseMs);
      }
      if (Date.now() - startedAt > maxRuntimeMs) { console.log(`[${runId}] runtime limit at chunk ${i}`); break; }

      // Leitura via RPC (acessa cron schema via SECURITY DEFINER)
      const SUB = 1000;
      let rows: Record<string, unknown>[] = [];
      for (let off = 0; off < chunkSize; off += SUB) {
        const { data, error } = await supabase.rpc("get_cron_logs_for_export", {
          cutoff: cutoffISO,
          lim: SUB,
          off,
        });
        if (error) throw new Error(`fetch chunk ${i} off ${off}: ${error.message}`);
        if (!data || data.length === 0) break;
        rows = rows.concat(data as any);
        if (data.length < SUB) break;
      }
      if (rows.length === 0) { console.log(`[${runId}] no more rows`); break; }

      const headers = Object.keys(rows[0]);
      const csv = rowsToCsv(rows, headers, true);
      const csvBytes = new TextEncoder().encode(csv);
      const cs = new CompressionStream("gzip");
      const gzBuf = new Uint8Array(await new Response(new Blob([csvBytes]).stream().pipeThrough(cs)).arrayBuffer());

      const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const datePart = now.toISOString().slice(0, 10);
      const timePart = now.toISOString().slice(11, 19).replace(/:/g, "");
      const fileName = `cron_job_run_details_${datePart}_${timePart}_chunk${i}_${rows.length}rows.csv.gz`;
      console.log(`[${runId}] chunk ${i}: rows=${rows.length} gz=${gzBuf.length}`);

      const boundary = "----lov" + crypto.randomUUID().replace(/-/g, "");
      const metadata = { name: fileName, mimeType: "application/gzip", parents: [folderId] };
      const enc = new TextEncoder();
      const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`);
      const tail = enc.encode(`\r\n--${boundary}--\r\n`);
      const mp = new Uint8Array(head.length + gzBuf.length + tail.length);
      mp.set(head, 0); mp.set(gzBuf, head.length); mp.set(tail, head.length + gzBuf.length);

      const uploadRes = await fetch(`${GATEWAY_UPLOAD}?uploadType=multipart&fields=id,name,size,webViewLink`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${lovableApiKey}`, "X-Connection-Api-Key": driveApiKey, "Content-Type": `multipart/related; boundary=${boundary}` },
        body: mp,
      });
      const upText = await uploadRes.text();
      if (!uploadRes.ok) throw new Error(`Drive upload [${uploadRes.status}]: ${upText.slice(0, 400)}`);
      const driveFile = JSON.parse(upText);
      console.log(`[${runId}] chunk ${i} uploaded id=${driveFile.id}`);

      let deleted = 0;
      if (!dryRun) {
        const minId = (rows[0] as any).runid;
        const maxId = (rows[rows.length - 1] as any).runid;
        const { data: delCount, error: delErr } = await supabase.rpc("delete_cron_logs", {
          cutoff: cutoffISO,
          min_runid: minId,
          max_runid: maxId,
        });
        if (delErr) throw new Error(`delete [${minId}..${maxId}]: ${delErr.message}`);
        deleted = Number(delCount ?? rows.length);
        console.log(`[${runId}] chunk ${i} deleted=${deleted}`);
      }

      await supabase.from("cron_logs_backups").insert({ retention_days: retentionDays, cutoff_at: cutoffISO, rows_exported: rows.length, drive_file_id: driveFile.id, drive_file_name: driveFile.name, drive_file_url: driveFile.webViewLink ?? null, drive_file_size_bytes: driveFile.size ? Number(driveFile.size) : gzBuf.length, deleted_rows: deleted, duration_ms: Date.now() - startedAt, success: true, dry_run: dryRun });
      chunks.push({ index: i, file: driveFile.name, rows: rows.length, deleted, url: driveFile.webViewLink });
      totalExported += rows.length;
      totalDeleted += deleted;
      if (rows.length < chunkSize) break;
    }

    // Limpar pg_net responses (efemeros, sem backup)
    if (!dryRun) {
      const { error: netErr } = await supabase.rpc("cleanup_net_http_responses", { older_than: cutoffISO });
      if (netErr) console.warn(`[${runId}] net cleanup warn: ${netErr.message}`);
      else console.log(`[${runId}] net._http_response limpo`);
    }

    const { data: remaining } = await supabase.rpc("count_cron_logs", { cutoff: cutoffISO });
    return new Response(JSON.stringify({ success: true, run_id: runId, chunks_processed: chunks.length, total_exported: totalExported, total_deleted: totalDeleted, remaining_rows: Number(remaining ?? 0), dry_run: dryRun, duration_ms: Date.now() - startedAt, chunks }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`[${runId}] ERROR:`, msg);
    await supabase.from("cron_logs_backups").insert({ retention_days: retentionDays, cutoff_at: cutoffISO, success: false, dry_run: dryRun, error_message: msg, rows_exported: totalExported, deleted_rows: totalDeleted, duration_ms: Date.now() - startedAt });
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
