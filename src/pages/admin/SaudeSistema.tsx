import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { RefreshCw, Activity, AlertTriangle, CheckCircle2, Phone, Save, Play } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Snapshot {
  webhooks_24h: Array<{ origem: string; total: number; erros: number; pct_erro: number | null }>;
  webhooks_recent_errors: Array<{
    id: number; webhook_type: string; status_code: number | null;
    error_message: string | null; created_at: string; retry_count: number; tenant_id: string | null;
  }>;
  stuck_jobs: {
    sending_jobs_running_gt_10min: number;
    sendflow_pending_gt_30min: number;
    push_campaigns_incomplete_gt_1h: number;
  };
  whatsapp_sessions: Array<{ status: string; total: number }>;
  top_tables: Array<{ table_name: string; total_size: string; row_count: number; dead_rows: number }>;
  recent_health_alerts: Array<{
    id: number; rule_key: string; severity: string; title: string; sent_at: string;
  }>;
  db_total_size: string;
  generated_at: string;
}

export default function SaudeSistema() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertPhone, setAlertPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: snapData, error: snapErr }, { data: settings }] = await Promise.all([
      supabase.rpc("get_health_snapshot"),
      supabase.from("app_settings").select("health_alert_phone").maybeSingle(),
    ]);
    if (snapErr) toast({ title: "Erro ao carregar", description: snapErr.message, variant: "destructive" });
    setSnap(snapData as any);
    setAlertPhone(settings?.health_alert_phone || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const savePhone = async () => {
    setSavingPhone(true);
    const digits = alertPhone.replace(/\D/g, "");
    const { data: existing } = await supabase.from("app_settings").select("id").maybeSingle();
    const { error } = existing?.id
      ? await supabase.from("app_settings").update({ health_alert_phone: digits }).eq("id", existing.id)
      : await supabase.from("app_settings").insert({ health_alert_phone: digits });
    setSavingPhone(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Telefone salvo", description: "Alertas de saúde serão enviados aqui" });
  };

  const runHealthCheck = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("system-health-check", { body: {} });
    setRunning(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({
      title: "Checagem executada",
      description: `Avaliados: ${data?.evaluated ?? 0} · Enviados: ${data?.sent ?? 0}`,
    });
    load();
  };

  const retryWebhook = async (id: number) => {
    setRetrying(id);
    const { data, error } = await supabase.functions.invoke("webhook-retry", { body: { webhook_log_id: id } });
    setRetrying(null);
    if (error || data?.success === false) {
      toast({
        title: "Falha ao reprocessar",
        description: error?.message || data?.error || "Erro desconhecido",
        variant: "destructive",
      });
    } else {
      toast({ title: "Reprocessado", description: `Tentativa ${data?.retry_count} concluída` });
      load();
    }
  };

  if (loading && !snap) {
    return <div className="p-8 text-muted-foreground">Carregando saúde do sistema...</div>;
  }
  if (!snap) return null;

  const totalStuck =
    snap.stuck_jobs.sending_jobs_running_gt_10min +
    snap.stuck_jobs.sendflow_pending_gt_30min +
    snap.stuck_jobs.push_campaigns_incomplete_gt_1h;

  const hasErrors = snap.webhooks_24h.some((w) => (w.pct_erro || 0) > 20) || totalStuck > 0;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8" />
            Saúde do Sistema
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Auto-refresh a cada 30s · Última atualização: {new Date(snap.generated_at).toLocaleTimeString("pt-BR")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runHealthCheck} disabled={running}>
            <Play className="h-4 w-4 mr-2" />
            {running ? "Rodando..." : "Rodar checagem agora"}
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Status geral */}
      <Card className={hasErrors ? "border-destructive" : "border-emerald-500/40"}>
        <CardContent className="pt-6 flex items-center gap-4">
          {hasErrors ? (
            <AlertTriangle className="h-10 w-10 text-destructive" />
          ) : (
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          )}
          <div>
            <div className="text-lg font-semibold">
              {hasErrors ? "Atenção necessária" : "Tudo saudável"}
            </div>
            <div className="text-sm text-muted-foreground">
              Banco: {snap.db_total_size} · Filas travadas: {totalStuck} · Alertas 24h: {snap.recent_health_alerts.length}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Config telefone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            Telefone para alertas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 items-center">
          <Input
            value={alertPhone}
            onChange={(e) => setAlertPhone(e.target.value)}
            placeholder="55DDDNNNNNNNNN (ex: 5511999999999)"
            className="max-w-xs"
          />
          <Button onClick={savePhone} disabled={savingPhone}>
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </Button>
          <p className="text-xs text-muted-foreground ml-4">
            Cooldown de 2h por regra para não spammar
          </p>
        </CardContent>
      </Card>

      {/* Webhooks 24h */}
      <Card>
        <CardHeader>
          <CardTitle>Webhooks — últimas 24h</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Erros</TableHead>
                <TableHead className="text-right">% erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snap.webhooks_24h.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum webhook registrado</TableCell></TableRow>
              )}
              {snap.webhooks_24h.map((w) => (
                <TableRow key={w.origem}>
                  <TableCell className="font-medium">{w.origem}</TableCell>
                  <TableCell className="text-right">{w.total}</TableCell>
                  <TableCell className="text-right">{w.erros}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={(w.pct_erro || 0) > 20 ? "destructive" : (w.pct_erro || 0) > 5 ? "secondary" : "outline"}>
                      {w.pct_erro ?? 0}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Webhook errors recent */}
      <Card>
        <CardHeader>
          <CardTitle>Últimos webhooks com erro</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead>Retries</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snap.webhooks_recent_errors.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum erro nas últimas 24h ✅</TableCell></TableRow>
              )}
              {snap.webhooks_recent_errors.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{new Date(e.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell><Badge variant="outline">{e.webhook_type}</Badge></TableCell>
                  <TableCell><Badge variant="destructive">{e.status_code || "—"}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{e.error_message || "—"}</TableCell>
                  <TableCell>{e.retry_count}/3</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retryWebhook(e.id)}
                      disabled={retrying === e.id || e.retry_count >= 3}
                    >
                      {retrying === e.id ? "..." : "Reprocessar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Filas + WhatsApp lado a lado */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Filas travadas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <StuckRow label="Jobs de envio em 'running' > 10min" value={snap.stuck_jobs.sending_jobs_running_gt_10min} />
            <StuckRow label="SendFlow tasks pendentes > 30min" value={snap.stuck_jobs.sendflow_pending_gt_30min} />
            <StuckRow label="Push campaigns incompletas > 1h" value={snap.stuck_jobs.push_campaigns_incomplete_gt_1h} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sessões WhatsApp</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {snap.whatsapp_sessions.length === 0 && (
                  <TableRow><TableCell className="text-muted-foreground">Nenhuma sessão registrada</TableCell></TableRow>
                )}
                {snap.whatsapp_sessions.map((s) => (
                  <TableRow key={s.status}>
                    <TableCell className="capitalize">{s.status}</TableCell>
                    <TableCell className="text-right font-semibold">{s.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Top tabelas */}
      <Card>
        <CardHeader><CardTitle>Top 10 tabelas por tamanho</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tabela</TableHead>
                <TableHead className="text-right">Tamanho</TableHead>
                <TableHead className="text-right">Linhas vivas</TableHead>
                <TableHead className="text-right">Dead rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snap.top_tables.map((t) => (
                <TableRow key={t.table_name}>
                  <TableCell className="font-mono text-xs">{t.table_name}</TableCell>
                  <TableCell className="text-right">{t.total_size}</TableCell>
                  <TableCell className="text-right">{t.row_count?.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={t.dead_rows > 10000 ? "destructive" : t.dead_rows > 1000 ? "secondary" : "outline"}>
                      {t.dead_rows?.toLocaleString("pt-BR")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Alertas recentes */}
      <Card>
        <CardHeader><CardTitle>Alertas disparados (24h)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead>Título</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snap.recent_health_alerts.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum alerta nas últimas 24h ✅</TableCell></TableRow>
              )}
              {snap.recent_health_alerts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs">{new Date(a.sent_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="font-mono text-xs">{a.rule_key}</TableCell>
                  <TableCell>
                    <Badge variant={a.severity === "error" ? "destructive" : "secondary"}>{a.severity}</Badge>
                  </TableCell>
                  <TableCell>{a.title}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StuckRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center py-2 border-b last:border-0">
      <span className="text-sm">{label}</span>
      <Badge variant={value > 0 ? "destructive" : "outline"}>{value}</Badge>
    </div>
  );
}
