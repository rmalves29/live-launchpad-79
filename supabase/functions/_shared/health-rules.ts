// Regras do alerta de saúde do sistema (super admin). Roda a cada 15 min pela função system-health-check.
// Cada regra devolve alertas com uma chave estável (rule_key): a mesma chave não é reenviada antes do cooldown.
// Só lê o banco; quem envia e registra é a função.
// deno-lint-ignore-file no-explicit-any

export interface HealthAlert {
  key: string;
  title: string;
  hint?: string; // o que fazer
  detail: Record<string, unknown>;
  severity: "warn" | "error";
}

const H = 3600_000;

// Nome amigável dos tipos de webhook mais comuns (o resto aparece como está)
function webhookLabel(type: string): string {
  if (type.startsWith("bling_") && type.endsWith(":assinatura_invalida")) return `Bling (${type.slice(6, -20)}): assinatura inválida`;
  if (type.startsWith("bling")) return `Bling (${type})`;
  if (type.startsWith("mercadopago")) return `Mercado Pago (${type})`;
  if (type.startsWith("pagarme")) return `Pagar.me (${type})`;
  if (type.startsWith("infinitepay")) return `InfinitePay (${type})`;
  return type;
}

async function tenantNames(supabase: any, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await supabase.from("tenants").select("id, name").in("id", unique);
  return new Map((data || []).map((t: any) => [t.id, String(t.name || t.id).trim()]));
}

export async function evaluateHealth(supabase: any, now = Date.now()): Promise<HealthAlert[]> {
  const alerts: HealthAlert[] = [];
  const since = (ms: number) => new Date(now - ms).toISOString();

  // 1) Webhooks (pagamento, Bling, frete…) com mais de 20% de erro na última hora (mínimo 10 avisos)
  const { data: whRows } = await supabase.from("webhook_logs").select("webhook_type, status_code").gt("created_at", since(H));
  const byType = new Map<string, { total: number; err: number }>();
  for (const row of whRows || []) {
    const t = row.webhook_type || "desconhecido";
    const e = byType.get(t) || { total: 0, err: 0 };
    e.total += 1;
    if (!row.status_code || row.status_code >= 400) e.err += 1;
    byType.set(t, e);
  }
  for (const [type, s] of byType) {
    if (s.total >= 10 && s.err / s.total > 0.2) {
      alerts.push({
        key: `webhook_error_rate_${type}`,
        title: `Webhook ${webhookLabel(type)}: ${Math.round((s.err / s.total) * 100)}% de erro na última hora (${s.err} de ${s.total})`,
        hint: "Ver em Admin › Saúde do sistema › Últimos webhooks com erro.",
        detail: { type, total: s.total, errors: s.err },
        severity: "error",
      });
    }
  }

  // 2) Jobs de envio de WhatsApp travados há mais de 30 min
  const { count: stuckJobs } = await supabase.from("sending_jobs").select("*", { count: "exact", head: true })
    .eq("status", "running").lt("updated_at", since(30 * 60_000));
  if ((stuckJobs || 0) > 0) {
    alerts.push({ key: "sending_jobs_stuck", title: `${stuckJobs} envio(s) de WhatsApp travado(s) há mais de 30 min`, detail: { count: stuckJobs }, severity: "error" });
  }

  // 3) Sessões de WhatsApp que caíram nas últimas 24h (antes contava sessões antigas, de meses atrás, e gerava ruído)
  const { data: sess } = await supabase.from("whatsapp_active_sessions").select("phone_number, instance_name, last_heartbeat")
    .eq("status", "disconnected").gt("last_heartbeat", since(24 * H));
  if ((sess || []).length > 0) {
    const nums = [...new Set((sess || []).map((s: any) => s.phone_number || s.instance_name))];
    alerts.push({ key: "whatsapp_disconnected", title: `WhatsApp desconectado nas últimas 24h: ${nums.join(", ")}`, detail: { sessions: nums }, severity: "warn" });
  }

  // 4) Campanhas push paradas há mais de 2h
  const { count: pushStuck } = await supabase.from("push_campaigns").select("*", { count: "exact", head: true })
    .in("status", ["queued", "running", "sending"]).lt("created_at", since(2 * H));
  if ((pushStuck || 0) > 0) {
    alerts.push({ key: "push_campaigns_stuck", title: `${pushStuck} campanha(s) push parada(s) há mais de 2h`, detail: { count: pushStuck }, severity: "warn" });
  }

  // 5–7) Bling: configuração das integrações ativas
  const { data: blings } = await supabase.from("integration_bling")
    .select("tenant_id, client_id, client_secret, token_expires_at, bling_company_id").eq("is_active", true);
  const active = blings || [];
  const names = await tenantNames(supabase, active.map((b: any) => b.tenant_id));
  const nm = (id: string) => names.get(id) || id;

  for (const b of active) {
    if (!b.client_id || !b.client_secret) {
      alerts.push({
        key: `bling_sem_credenciais_${b.tenant_id}`,
        title: `Bling da ${nm(b.tenant_id)}: integração ativa sem as credenciais do aplicativo`,
        hint: "Avisos de produto/estoque dessa loja são recusados. A loja precisa reconectar o Bling no Cartzy.",
        detail: { tenant_id: b.tenant_id },
        severity: "warn",
      });
    }
    if (b.token_expires_at && new Date(b.token_expires_at).getTime() < now - H) {
      alerts.push({
        key: `bling_token_vencido_${b.tenant_id}`,
        title: `Bling da ${nm(b.tenant_id)}: acesso vencido desde ${new Date(b.token_expires_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        hint: "A renovação automática falhou: pedidos não vão para o Bling. A loja precisa reconectar.",
        detail: { tenant_id: b.tenant_id, token_expires_at: b.token_expires_at },
        severity: "error",
      });
    }
  }
  const byClient = new Map<string, any[]>();
  for (const b of active) if (b.client_id) byClient.set(b.client_id, [...(byClient.get(b.client_id) || []), b]);
  for (const [clientId, list] of byClient) {
    if (list.length > 1 && list.filter((b) => !b.bling_company_id).length > 0) {
      alerts.push({
        key: `bling_app_compartilhado_${clientId.slice(0, 8)}`,
        title: `Bling: o mesmo aplicativo está em ${list.length} lojas (${list.map((b) => nm(b.tenant_id)).join(", ")})`,
        hint: "Avisos de produto podem ir para a loja errada ou ser recusados. Cada loja deve ter o próprio aplicativo.",
        detail: { client_id: clientId, tenants: list.map((b) => b.tenant_id) },
        severity: "warn",
      });
    }
  }

  // 8) Bling: falhas ao enviar pedido / baixar estoque na última hora (5+ por loja)
  const { data: syncErr } = await supabase.from("bling_sync_logs").select("tenant_id, action").eq("status", "error").gt("created_at", since(H));
  const errByTenant = new Map<string, number>();
  for (const r of syncErr || []) errByTenant.set(r.tenant_id, (errByTenant.get(r.tenant_id) || 0) + 1);
  const errNames = await tenantNames(supabase, [...errByTenant.keys()]);
  for (const [tid, n] of errByTenant) {
    if (n >= 5) {
      alerts.push({
        key: `bling_falhas_envio_${tid}`,
        title: `Bling da ${errNames.get(tid) || tid}: ${n} falhas ao enviar pedido ou baixar estoque na última hora`,
        hint: "Ver o registro de sincronização do Bling da loja.",
        detail: { tenant_id: tid, errors: n },
        severity: "error",
      });
    }
  }

  // 9) Tarefas agendadas (cron) falhando na última hora
  const { data: cronFails } = await supabase.rpc("admin_health_cron_failures", { p_since: since(H) });
  for (const c of cronFails || []) {
    if (Number(c.failures) > 0) {
      alerts.push({
        key: `cron_falhando_${c.jobname}`,
        title: `Tarefa automática "${c.jobname}" falhou ${c.failures}x na última hora`,
        hint: c.last_error ? `Último erro: ${String(c.last_error).slice(0, 160)}` : undefined,
        detail: { jobname: c.jobname, failures: c.failures },
        severity: "error",
      });
    }
  }

  return alerts;
}

// Uma mensagem só por rodada, com os alertas novos (erros primeiro).
export function formatAlertMessage(alerts: HealthAlert[], now = new Date()): string {
  const sorted = [...alerts].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const lines = sorted.map((a) => `${a.severity === "error" ? "🔴" : "🟡"} ${a.title}${a.hint ? `\n   ↳ ${a.hint}` : ""}`);
  const when = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `🩺 *Saúde do Sistema — Cartzy*\n\n${lines.join("\n\n")}\n\n_${when} · painel: app.cartzy.com.br/admin/saude_`;
}
