// Regras do alerta de saúde do sistema (super admin). Roda a cada 15 min pela função system-health-check.
// Cada regra devolve alertas com uma chave estável (rule_key): a mesma chave não é reenviada antes do cooldown.
// Só lê o banco; quem envia e registra é a função.
// deno-lint-ignore-file no-explicit-any

export interface HealthAlert {
  key: string;
  title: string;
  problem?: string; // por que importa (efeito para as lojas)
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
        problem: type.endsWith(":assinatura_invalida")
          ? "Os avisos de produto/estoque do Bling estão sendo recusados: alterações feitas no Bling não chegam ao Cartzy."
          : "Avisos externos (pagamento, ERP ou frete) estão falhando: pedidos podem não atualizar sozinhos.",
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
    alerts.push({ key: "sending_jobs_stuck", title: `${stuckJobs} envio(s) de WhatsApp travado(s) há mais de 30 min`, problem: "Mensagens em massa pararam no meio: parte das clientes não recebeu.", hint: "Ver o envio em andamento na tela de disparos e reiniciar.", detail: { count: stuckJobs }, severity: "error" });
  }

  // 3) Sessões de WhatsApp que caíram nas últimas 24h (antes contava sessões antigas, de meses atrás, e gerava ruído)
  const { data: sess } = await supabase.from("whatsapp_active_sessions").select("phone_number, instance_name, last_heartbeat")
    .eq("status", "disconnected").gt("last_heartbeat", since(24 * H));
  if ((sess || []).length > 0) {
    const nums = [...new Set((sess || []).map((s: any) => s.phone_number || s.instance_name))];
    alerts.push({ key: "whatsapp_disconnected", title: `WhatsApp desconectado nas últimas 24h: ${nums.join(", ")}`, problem: "Enquanto desconectado, nenhuma mensagem sai por esse número.", hint: "Reconectar o número (ler o QR code) na tela de conexão do WhatsApp.", detail: { sessions: nums }, severity: "warn" });
  }

  // 4) Campanhas push paradas há mais de 2h
  const { count: pushStuck } = await supabase.from("push_campaigns").select("*", { count: "exact", head: true })
    .in("status", ["queued", "running", "sending"]).lt("created_at", since(2 * H));
  if ((pushStuck || 0) > 0) {
    alerts.push({ key: "push_campaigns_stuck", title: `${pushStuck} campanha(s) push parada(s) há mais de 2h`, problem: "Notificações push não terminaram de sair.", hint: "Ver as campanhas push e reenviar.", detail: { count: pushStuck }, severity: "warn" });
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
        problem: "Avisos de produto/estoque dessa loja são recusados: alterações no Bling não chegam ao Cartzy.",
        hint: "A loja precisa reconectar o Bling no Cartzy informando as credenciais do aplicativo.",
        detail: { tenant_id: b.tenant_id },
        severity: "warn",
      });
    }
    if (b.token_expires_at && new Date(b.token_expires_at).getTime() < now - H) {
      alerts.push({
        key: `bling_token_vencido_${b.tenant_id}`,
        title: `Bling da ${nm(b.tenant_id)}: acesso vencido desde ${new Date(b.token_expires_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        problem: "A renovação automática do acesso falhou: pedidos e estoque não vão para o Bling.",
        hint: "A loja precisa reconectar o Bling no Cartzy.",
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
        problem: "Avisos de produto do Bling podem ir para a loja errada ou ser recusados.",
        hint: "Cada loja deve conectar o Bling com o próprio aplicativo (nunca o de outra loja).",
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
        problem: "Pedidos podem não estar chegando ao Bling ou sem baixa de estoque.",
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
        problem: c.last_error ? `Último erro: ${String(c.last_error).slice(0, 200)}` : "Uma rotina automática do sistema não está completando.",
        hint: "Me chamar para ver o erro dessa rotina.",
        detail: { jobname: c.jobname, failures: c.failures },
        severity: "error",
      });
    }
  }

  // 10) P-03 (etapa 4.1): chamadas SEM identificação às funções internas nas últimas 24h.
  //     Enquanto a trava não liga, isto mostra se ainda há alguém chamando sem chave (o que seria recusado).
  const { data: semChave } = await supabase.from("internal_call_audit").select("fn").eq("caller", "sem_chave").gt("created_at", since(24 * H));
  const porFn = new Map<string, number>();
  for (const r of semChave || []) porFn.set(r.fn, (porFn.get(r.fn) || 0) + 1);
  for (const [fn, n] of porFn) {
    alerts.push({
      key: `chamada_sem_chave_${fn}`,
      title: `${n} chamada(s) sem identificação à função ${fn} nas últimas 24h`,
      problem: "Com a trava ligada, essas chamadas seriam recusadas. Pode ser uma origem do sistema que ainda não manda a chave, ou alguém de fora.",
      hint: "Não ligar a trava enquanto este alerta aparecer. Me chamar para ver de onde vêm.",
      detail: { fn, count: n },
      severity: "warn",
    });
  }

  return alerts;
}
