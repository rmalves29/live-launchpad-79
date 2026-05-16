import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

function rowsToCsv(rows: Record<string, unknown>[], headers: string[], includeHeader: boolean): string {
  const lines: string[] = [];
  if (includeHeader) lines.push(headers.map(csvEscape).join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
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

  // Parse params
  let body: { retention_days?: number; folder_id?: string; dry_run?: boolean } = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch (_) { /* ignore */ }
  const url = new URL(req.url);
  const retentionDays = Number(body.retention_days ?? url.searchParams.get("retention_days") ?? 30);
  const folderId = String(body.folder_id ?? url.searchParams.get("folder_id") ?? DEFAULT_FOLDER_ID);
  const dryRun = String(body.dry_run ?? url.searchParams.get("dry_run") ?? "false") === "true";

  const cutoffISO = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `fe_group_events_backup_${stamp}.csv`;

  console.log(`[cleanup] retention=${retentionDays}d cutoff=${cutoffISO} dry_run=${dryRun}`);

  if (!lovableApiKey || !driveApiKey) {
    const msg = `Missing credentials: LOVABLE_API_KEY=${!!lovableApiKey} GOOGLE_DRIVE_API_KEY=${!!driveApiKey}`;
    console.error(msg);
    await supabase.from("fe_group_events_backups").insert({
      retention_days: retentionDays, cutoff_at: cutoffISO,
      success: false, dry_run: dryRun, error_message: msg,
    });
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    // 1) Count rows to backup
    const { count, error: countErr } = await supabase
      .from("fe_group_events")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoffISO);
    if (countErr) throw new Error(`count failed: ${countErr.message}`);

    const total = count ?? 0;
    console.log(`[cleanup] rows to export: ${total}`);

    if (total === 0) {
      await supabase.from("fe_group_events_backups").insert({
        retention_days: retentionDays, cutoff_at: cutoffISO,
        rows_exported: 0, deleted_rows: 0, success: true, dry_run: dryRun,
        duration_ms: Date.now() - startedAt,
      });
      return new Response(JSON.stringify({ success: true, message: "no rows to backup", rows: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Export in pages -> build CSV in memory
    const PAGE = 1000;
    let csvParts: string[] = [];
    let headers: string[] = [];
    let exported = 0;

    for (let from = 0; from < total; from += PAGE) {
      const to = from + PAGE - 1;
      const { data, error } = await supabase
        .from("fe_group_events")
        .select("*")
        .lt("created_at", cutoffISO)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`fetch page ${from}: ${error.message}`);
      if (!data || data.length === 0) break;
      if (headers.length === 0) headers = Object.keys(data[0]);
      csvParts.push(rowsToCsv(data as Record<string, unknown>[], headers, from === 0));
      exported += data.length;
    }
    const csv = csvParts.join("");
    csvParts = [];
    const csvBytes = new TextEncoder().encode(csv);
    console.log(`[cleanup] csv size=${csvBytes.length} bytes rows=${exported}`);

    // 3) Upload to Google Drive (multipart)
    const boundary = "----lov" + crypto.randomUUID().replace(/-/g, "");
    const metadata = { name: fileName, mimeType: "text/csv", parents: [folderId] };
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: text/csv\r\n\r\n`
    );
    const tail = enc.encode(`\r\n--${boundary}--\r\n`);
    const multipartBody = new Uint8Array(head.length + csvBytes.length + tail.length);
    multipartBody.set(head, 0);
    multipartBody.set(csvBytes, head.length);
    multipartBody.set(tail, head.length + csvBytes.length);

    const uploadRes = await fetch(`${GATEWAY_UPLOAD}?uploadType=multipart&fields=id,name,size,webViewLink`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": driveApiKey,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    const uploadText = await uploadRes.text();
    if (!uploadRes.ok) {
      throw new Error(`Drive upload failed [${uploadRes.status}]: ${uploadText.slice(0, 500)}`);
    }
    const driveFile = JSON.parse(uploadText);
    console.log(`[cleanup] uploaded file id=${driveFile.id} size=${driveFile.size}`);

    // 4) Delete rows (skip if dry_run)
    let deleted = 0;
    if (!dryRun) {
      const { error: rpcErr } = await supabase.rpc("exec_cleanup_fe_group_events", {
        p_cutoff: cutoffISO,
      }).catch(() => ({ error: null } as any));

      // Fallback: usar CALL via SQL direto não é possível pelo PostgREST,
      // então fazemos delete em batches aqui.
      const BATCH = 5000;
      while (true) {
        const { data: ids, error: selErr } = await supabase
          .from("fe_group_events")
          .select("id")
          .lt("created_at", cutoffISO)
          .order("id", { ascending: true })
          .limit(BATCH);
        if (selErr) throw new Error(`select batch: ${selErr.message}`);
        if (!ids || ids.length === 0) break;
        const idList = ids.map((r: any) => r.id);
        const { error: delErr, count: delCount } = await supabase
          .from("fe_group_events")
          .delete({ count: "exact" })
          .in("id", idList);
        if (delErr) throw new Error(`delete batch: ${delErr.message}`);
        deleted += delCount ?? idList.length;
        if (idList.length < BATCH) break;
      }
      console.log(`[cleanup] deleted=${deleted}`);
    }

    await supabase.from("fe_group_events_backups").insert({
      retention_days: retentionDays, cutoff_at: cutoffISO,
      rows_exported: exported,
      drive_file_id: driveFile.id,
      drive_file_name: driveFile.name,
      drive_file_url: driveFile.webViewLink ?? null,
      drive_file_size_bytes: driveFile.size ? Number(driveFile.size) : csvBytes.length,
      deleted_rows: deleted,
      duration_ms: Date.now() - startedAt,
      success: true,
      dry_run: dryRun,
    });

    return new Response(JSON.stringify({
      success: true, rows_exported: exported, deleted_rows: deleted,
      drive_file_id: driveFile.id, drive_file_url: driveFile.webViewLink, dry_run: dryRun,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[cleanup] ERROR:", msg);
    await supabase.from("fe_group_events_backups").insert({
      retention_days: retentionDays, cutoff_at: cutoffISO,
      success: false, dry_run: dryRun, error_message: msg,
      duration_ms: Date.now() - startedAt,
    });
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
