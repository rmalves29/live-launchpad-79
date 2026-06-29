import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── Padrão idêntico ao cleanup-fe-group-events ───────────────────────────────
// Exporta registros de whatsapp_messages mais antigos que `retention_days` dias
// para o Google Drive (CSV gzipado), registra em whatsapp_messages_backups e
// deleta do banco apenas após backup bem-sucedido.
//
// Parâmetros (body JSON ou query string):
//   retention_days  number   Dias de retenção (default: 90)
//   folder_id       string   ID da pasta no Google Drive
//   dry_run         boolean  Se true, exporta mas NÃO deleta (default: false)
//   chunk_size      number   Linhas por chunk (default: 50000)
//   max_chunks      number   Máximo de chunks por execução (default: 3)
//   max_runtime_ms  number   Limite de tempo em ms (default: 90000)
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files";
const DEFAULT_FOLDER_ID = "1_VbPMQAci0g6knmx1fLbONwraB-m2hyo";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(
  rows: Record<string, unknown>[],
  headers: string[],
  includeHeader: boolean,
): string {
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

  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch { /* ignora body inválido */ }

  const url = new URL(req.url);
  const retentionDays = Number(body.retention_days ?? url.searchParams.get("retention_days") ?? 90);
  const folderId = String(body.folder_id ?? url.searchParams.get("folder_id") ?? DEFAULT_FOLDER_ID);
  const dryRun = String(body.dry_run ?? url.searchParams.get("dry_run") ?? "false") === "true";
  const chunkSize = Number(body.chunk_size ?? url.searchParams.get("chunk_size") ?? 50000);
  const maxChunks = Number(body.max_chunks ?? url.searchParams.get("max_chunks") ?? 3);
  const maxRuntimeMs = Number(body.max_runtime_ms ?? 90000);

  const cutoffISO = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const runId = crypto.randomUUID().slice(0, 8);

  console.log(
    `[${runId}] cleanup-whatsapp-messages | retention=${retentionDays}d | cutoff=${cutoffISO} | dry_run=${dryRun} | chunk=${chunkSize} | max=${maxChunks}`,
  );

  if (!lovableApiKey || !driveApiKey) {
    const msg = `Credenciais ausentes: LOVABLE=${!!lovableApiKey} DRIVE=${!!driveApiKey}`;
    console.error(`[${runId}] ${msg}`);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const chunks: Array<{
    index: number;
    file: string;
    rows: number;
    deleted: number;
    url: string | null;
  }> = [];
  let totalExported = 0;
  let totalDeleted = 0;

  try {
    for (let i = 0; i < maxChunks; i++) {
      if (Date.now() - startedAt > maxRuntimeMs) {
        console.log(`[${runId}] limite de tempo atingido no chunk ${i}`);
        break;
      }

      // ── 1. Lê chunk em sub-páginas de 1000 (limite PostgREST) ──────────────
      const SUB = 1000;
      let rows: Record<string, unknown>[] = [];
      for (let off = 0; off < chunkSize; off += SUB) {
        const { data, error } = await supabase
          .from("whatsapp_messages")
          .select("*")
          .lt("created_at", cutoffISO)
          .order("id", { ascending: true })
          .range(off, off + SUB - 1);

        if (error) throw new Error(`fetch chunk ${i} off ${off}: ${error.message}`);
        if (!data || data.length === 0) break;
        rows = rows.concat(data as Record<string, unknown>[]);
        if (data.length < SUB) break;
      }

      if (rows.length === 0) {
        console.log(`[${runId}] sem linhas restantes — concluído`);
        break;
      }

      // ── 2. Gera CSV e comprime em gzip ─────────────────────────────────────
      const headers = Object.keys(rows[0]);
      const csv = rowsToCsv(rows, headers, true);
      const csvBytes = new TextEncoder().encode(csv);

      const cs = new CompressionStream("gzip");
      const gzBuf = new Uint8Array(
        await new Response(new Blob([csvBytes]).stream().pipeThrough(cs)).arrayBuffer(),
      );

      // Nome do arquivo com timestamp Brasília (UTC-3)
      const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const datePart = now.toISOString().slice(0, 10);
      const timePart = now.toISOString().slice(11, 19).replace(/:/g, "");
      const fileName = `whatsapp_messages_${datePart}_${timePart}_chunk${i}_${rows.length}rows.csv.gz`;

      console.log(
        `[${runId}] chunk ${i}: linhas=${rows.length} csv=${csvBytes.length}B gz=${gzBuf.length}B`,
      );

      // ── 3. Upload para o Google Drive ──────────────────────────────────────
      const boundary = "----lov" + crypto.randomUUID().replace(/-/g, "");
      const metadata = {
        name: fileName,
        mimeType: "application/gzip",
        parents: [folderId],
      };
      const enc = new TextEncoder();
      const head = enc.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
          `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
      );
      const tail = enc.encode(`\r\n--${boundary}--\r\n`);
      const mp = new Uint8Array(head.length + gzBuf.length + tail.length);
      mp.set(head, 0);
      mp.set(gzBuf, head.length);
      mp.set(tail, head.length + gzBuf.length);

      const uploadRes = await fetch(
        `${GATEWAY_UPLOAD}?uploadType=multipart&fields=id,name,size,webViewLink`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "X-Connection-Api-Key": driveApiKey,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: mp,
        },
      );

      const upText = await uploadRes.text();
      if (!uploadRes.ok) {
        throw new Error(`Drive upload chunk ${i} [${uploadRes.status}]: ${upText.slice(0, 400)}`);
      }
      const driveFile = JSON.parse(upText) as {
        id: string;
        name: string;
        size?: string;
        webViewLink?: string;
      };
      console.log(`[${runId}] chunk ${i} enviado ao Drive id=${driveFile.id}`);

      // ── 4. Deleta as linhas recém-exportadas (somente se não for dry_run) ──
      let deleted = 0;
      if (!dryRun) {
        const minId = (rows[0] as { id: string }).id;
        const maxId = (rows[rows.length - 1] as { id: string }).id;

        const { error: delErr, count } = await supabase
          .from("whatsapp_messages")
          .delete({ count: "exact" })
          .lt("created_at", cutoffISO)
          .gte("id", minId)
          .lte("id", maxId);

        if (delErr) {
          throw new Error(`delete chunk ${i} [${minId}..${maxId}]: ${delErr.message}`);
        }
        deleted = count ?? rows.length;
        console.log(`[${runId}] chunk ${i} deletado=${deleted} range=[${minId}..${maxId}]`);
      }

      // ── 5. Registra o backup na tabela de log ──────────────────────────────
      await supabase.from("whatsapp_messages_backups").insert({
        retention_days: retentionDays,
        cutoff_at: cutoffISO,
        rows_exported: rows.length,
        drive_file_id: driveFile.id,
        drive_file_name: driveFile.name,
        drive_file_url: driveFile.webViewLink ?? null,
        drive_file_size_bytes: driveFile.size ? Number(driveFile.size) : gzBuf.length,
        deleted_rows: deleted,
        duration_ms: Date.now() - startedAt,
        success: true,
        dry_run: dryRun,
      });

      chunks.push({
        index: i,
        file: driveFile.name,
        rows: rows.length,
        deleted,
        url: driveFile.webViewLink ?? null,
      });
      totalExported += rows.length;
      totalDeleted += deleted;

      // Último chunk parcial — não há mais dados
      if (rows.length < chunkSize) break;
    }

    // Conta linhas restantes acima do cutoff (para monitoramento)
    const { count: remaining } = await supabase
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoffISO);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        chunks_processed: chunks.length,
        total_exported: totalExported,
        total_deleted: totalDeleted,
        remaining_rows: remaining ?? 0,
        dry_run: dryRun,
        duration_ms: Date.now() - startedAt,
        chunks,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${runId}] ERRO:`, msg);

    await supabase.from("whatsapp_messages_backups").insert({
      retention_days: retentionDays,
      cutoff_at: cutoffISO,
      success: false,
      dry_run: dryRun,
      error_message: msg,
      rows_exported: totalExported,
      deleted_rows: totalDeleted,
      duration_ms: Date.now() - startedAt,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: msg,
        partial: { totalExported, totalDeleted, chunks },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
