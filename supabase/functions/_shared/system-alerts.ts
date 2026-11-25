// Grava o resultado da checagem de saúde no quadro system_alerts (o que o sininho do super admin mostra).
// - problema encontrado agora: abre (ou reabre) e atualiza last_seen/ocorrências
// - problema em aberto que não apareceu nesta rodada: resolved_at = agora (some do sininho)
// deno-lint-ignore-file no-explicit-any
import type { HealthAlert } from "./health-rules.ts";

export async function syncSystemAlerts(supabase: any, alerts: HealthAlert[], now = new Date()) {
  const iso = now.toISOString();
  const { data: openRows } = await supabase.from("system_alerts").select("rule_key, occurrences, resolved_at").is("resolved_at", null);
  const { data: knownRows } = alerts.length
    ? await supabase.from("system_alerts").select("rule_key, occurrences, resolved_at").in("rule_key", alerts.map((a) => a.key))
    : { data: [] };
  const known = new Map((knownRows || []).map((r: any) => [r.rule_key, r]));

  let opened = 0;
  for (const a of alerts) {
    const prev: any = known.get(a.key);
    const base = { severity: a.severity, title: a.title, problem: a.problem ?? null, what_to_do: a.hint ?? null, detail: a.detail, last_seen: iso };
    if (!prev) {
      await supabase.from("system_alerts").insert({ rule_key: a.key, ...base, first_seen: iso, resolved_at: null, occurrences: 1 });
      opened++;
    } else if (prev.resolved_at) {
      // voltou depois de resolvido: conta como problema novo
      await supabase.from("system_alerts").update({ ...base, first_seen: iso, resolved_at: null, occurrences: 1 }).eq("rule_key", a.key);
      opened++;
    } else {
      await supabase.from("system_alerts").update({ ...base, occurrences: (prev.occurrences || 0) + 1 }).eq("rule_key", a.key);
    }
  }

  const current = new Set(alerts.map((a) => a.key));
  let resolved = 0;
  for (const r of openRows || []) {
    if (!current.has(r.rule_key)) {
      await supabase.from("system_alerts").update({ resolved_at: iso }).eq("rule_key", r.rule_key);
      resolved++;
    }
  }
  return { open: alerts.length, opened, resolved };
}
