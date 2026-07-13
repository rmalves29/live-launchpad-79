import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TableConfig = {
  table: string;
  dateColumn: string;
  orderColumn: string;
};

const SUPPORTED: Record<string, TableConfig> = {
  webhook_logs: { table: "webhook_logs", dateColumn: "created_at", orderColumn: "id" },
  fe_group_events: { table: "fe_group_events", dateColumn: "created_at", orderColumn: "id" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any = {};
  try { if (req.method === "POST") body = await req.json(); } catch { /* */ }
  const url = new URL(req.url);

  const tableKey = String(body.table ?? url.searchParams.get("table") ?? "");
  const retentionDays = Number(body.retention_days ?? url.searchParams.get("retention_days") ?? 30);
  const dryRun = String(body.dry_run ?? url.searchParams.get("dry_run") ?? "false") === "true";
  const chunkSize = Number(body.chunk_size ?? url.searchParams.get("chunk_size") ?? 20000);
  const maxChunks = Number(body.max_chunks ?? url.searchParams.get("max_chunks") ?? 5);
  const maxRuntimeMs = Number(body.max_runtime_ms ?? 90000);

  const cfg = SUPPORTED[tableKey];
  if (!cfg) {
    return new Response(JSON.stringify({
      success: false, error: `table must be one of: ${Object.keys(SUPPORTED).join(", ")}`
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffISO = cutoffDate.toISOString();
  const runId = crypto.randomUUID().slice(0, 8);
  console.log(`[${runId}] table=${cfg.table} retention=${retentionDays}d cutoff=${cutoffISO} dry=${dryRun}`);

  const chunks: any[] = [];
  let totalExported = 0, totalDeleted = 0;

  try {
    for (let i = 0; i < maxChunks; i++) {
      if (Date.now() - startedAt > maxRuntimeMs) {
        console.log(`[${runId}] runtime limit at chunk ${i}`);
        break;
      }

      // 1) Ler chunk em sub-páginas de 1000
      const SUB = 1000;
      let rows: Record<string, unknown>[] = [];
      for (let off = 0; off < chunkSize; off += SUB) {
        const { data, error } = await supabase
          .from(cfg.table)
          .select("*")
          .lt(cfg.dateColumn, cutoffISO)
          .order(cfg.orderColumn, { ascending: true })
          .range(off, off + SUB - 1);
        if (error) throw new Error(`fetch ${i}/${off}: ${error.message}`);
        if (!data || data.length === 0) break;
        rows = rows.concat(data as any);
        if (data.length < SUB) break;
      }
      if (rows.length === 0) {
        console.log(`[${runId}] no more rows`);
        break;
      }

      // 2) JSONL + gzip (mantém tipos, ideal para reimportar)
      const jsonl = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
      const rawBytes = new TextEncoder().encode(jsonl);
      const cs = new CompressionStream("gzip");
      const gzBuf = new Uint8Array(await new Response(new Blob([rawBytes]).stream().pipeThrough(cs)).arrayBuffer());

      // 3) Nome com timestamp Brasília (UTC-3)
      const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const y = brNow.getUTCFullYear();
      const m = String(brNow.getUTCMonth() + 1).padStart(2, "0");
      const d = String(brNow.getUTCDate()).padStart(2, "0");
      const hm = brNow.toISOString().slice(11, 19).replace(/:/g, "");
      const storagePath = `${cfg.table}/${y}/${m}/${d}_${hm}_chunk${i}_${rows.length}rows.jsonl.gz`;

      // 4) Upload ao bucket "archives"
      const { error: upErr } = await supabase.storage
        .from("archives")
        .upload(storagePath, gzBuf, {
          contentType: "application/gzip",
          upsert: false,
        });
      if (upErr) throw new Error(`upload ${storagePath}: ${upErr.message}`);
      console.log(`[${runId}] uploaded ${storagePath} gz=${gzBuf.length}`);

      // 5) Deletar as linhas arquivadas (range por id)
      let deleted = 0;
      if (!dryRun) {
        const minId = (rows[0] as any)[cfg.orderColumn];
        const maxId = (rows[rows.length - 1] as any)[cfg.orderColumn];
        const { error: delErr, count } = await supabase
          .from(cfg.table)
          .delete({ count: "exact" })
          .lt(cfg.dateColumn, cutoffISO)
          .gte(cfg.orderColumn, minId)
          .lte(cfg.orderColumn, maxId);
        if (delErr) throw new Error(`delete ${i} [${minId}..${maxId}]: ${delErr.message}`);
        deleted = count ?? rows.length;
      }

      // 6) Catalogar
      const periodStart = new Date((rows[0] as any)[cfg.dateColumn]).toISOString();
      const periodEnd = new Date((rows[rows.length - 1] as any)[cfg.dateColumn]).toISOString();
      await supabase.from("archive_files").insert({
        source_table: cfg.table,
        storage_path: storagePath,
        period_start: periodStart,
        period_end: periodEnd,
        row_count: rows.length,
        size_bytes: rawBytes.length,
        compressed_size_bytes: gzBuf.length,
        status: dryRun ? "dry_run" : "completed",
      });

      chunks.push({ index: i, path: storagePath, rows: rows.length, deleted, gz_bytes: gzBuf.length });
      totalExported += rows.length;
      totalDeleted += deleted;
      if (rows.length < chunkSize) break;
    }

    const { count: remaining } = await supabase
      .from(cfg.table)
      .select("id", { count: "exact", head: true })
      .lt(cfg.dateColumn, cutoffISO);

    return new Response(JSON.stringify({
      success: true, run_id: runId, table: cfg.table,
      chunks_processed: chunks.length,
      total_exported: totalExported, total_deleted: totalDeleted,
      remaining_rows: remaining ?? 0,
      dry_run: dryRun, duration_ms: Date.now() - startedAt, chunks,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`[${runId}] ERROR:`, msg);
    await supabase.from("archive_files").insert({
      source_table: cfg.table,
      storage_path: `error/${runId}`,
      period_start: cutoffISO,
      period_end: cutoffISO,
      row_count: totalExported,
      status: "error",
      error_message: msg,
    });
    return new Response(JSON.stringify({
      success: false, error: msg,
      partial: { totalExported, totalDeleted, chunks },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
