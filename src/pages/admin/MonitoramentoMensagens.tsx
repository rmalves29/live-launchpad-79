import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Activity } from "lucide-react";

type Row = {
  tenant_id: string;
  tenant_name: string;
  total_sent: number;
  msgs_per_minute: number | null;
  msgs_per_hour: number | null;
  item_added_count: number;
  item_added_per_minute: number | null;
  order_cancelled_count: number;
  payment_count: number;
  out_of_stock_count: number;
  group_msg_count: number;
  received_private: number;
  avg_gap_seconds: number | null;
  disconnect_count: number;
  avg_msgs_before_disconnect: number | null;
  last_msgs_before_disconnect: number | null;
};

type Granularity = "day" | "month" | "year";

function pad(n: number) { return String(n).padStart(2, "0"); }

function buildRange(g: Granularity, ref: string): { from: string; to: string; label: string } {
  // ref formats: day = YYYY-MM-DD, month = YYYY-MM, year = YYYY
  if (g === "day") {
    const [y, m, d] = ref.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // 00:00 -03:00 = 03:00 UTC
    const to = new Date(from.getTime() + 24 * 3600 * 1000);
    return { from: from.toISOString(), to: to.toISOString(), label: `${pad(d)}/${pad(m)}/${y}` };
  }
  if (g === "month") {
    const [y, m] = ref.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0));
    const to = new Date(Date.UTC(y, m, 1, 3, 0, 0));
    return { from: from.toISOString(), to: to.toISOString(), label: `${pad(m)}/${y}` };
  }
  const y = Number(ref);
  const from = new Date(Date.UTC(y, 0, 1, 3, 0, 0));
  const to = new Date(Date.UTC(y + 1, 0, 1, 3, 0, 0));
  return { from: from.toISOString(), to: to.toISOString(), label: `${y}` };
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = seconds / 60;
  if (m < 60) return `${m.toFixed(1)} min`;
  const h = m / 60;
  return `${h.toFixed(2)} h`;
}

export default function MonitoramentoMensagens() {
  const today = new Date();
  const brToday = new Date(today.getTime() - 3 * 3600 * 1000);
  const defaultDay = `${brToday.getUTCFullYear()}-${pad(brToday.getUTCMonth() + 1)}-${pad(brToday.getUTCDate())}`;
  const defaultMonth = `${brToday.getUTCFullYear()}-${pad(brToday.getUTCMonth() + 1)}`;
  const defaultYear = `${brToday.getUTCFullYear()}`;

  const [granularity, setGranularity] = useState<Granularity>("day");
  const [dayRef, setDayRef] = useState(defaultDay);
  const [monthRef, setMonthRef] = useState(defaultMonth);
  const [yearRef, setYearRef] = useState(defaultYear);
  const [tenantFilter, setTenantFilter] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ref = granularity === "day" ? dayRef : granularity === "month" ? monthRef : yearRef;
  const range = useMemo(() => buildRange(granularity, ref), [granularity, ref]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("admin_whatsapp_activity_metrics", {
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      setRows((data as Row[]) || []);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar métricas");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range.from, range.to]);

  const filtered = rows.filter(r =>
    !tenantFilter || r.tenant_name.toLowerCase().includes(tenantFilter.toLowerCase())
  );

  const totals = useMemo(() => {
    const totalSent = filtered.reduce((s, r) => s + Number(r.total_sent || 0), 0);
    const totalReceived = filtered.reduce((s, r) => s + Number(r.received_private || 0), 0);
    const itemAdded = filtered.reduce((s, r) => s + Number(r.item_added_count || 0), 0);
    const orderCancelled = filtered.reduce((s, r) => s + Number(r.order_cancelled_count || 0), 0);
    const payment = filtered.reduce((s, r) => s + Number(r.payment_count || 0), 0);
    const outOfStock = filtered.reduce((s, r) => s + Number(r.out_of_stock_count || 0), 0);
    const groupMsg = filtered.reduce((s, r) => s + Number(r.group_msg_count || 0), 0);
    const disc = filtered.reduce((s, r) => s + Number(r.disconnect_count || 0), 0);
    const gaps = filtered.map(r => Number(r.avg_gap_seconds)).filter(v => !Number.isNaN(v) && v > 0);
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
    const durationMin = Math.max((new Date(range.to).getTime() - new Date(range.from).getTime()) / 60000, 1);
    const perMin = totalSent / durationMin;
    const perHour = totalSent / (durationMin / 60);
    const itemAddedPerMin = itemAdded / durationMin;
    return { totalSent, totalReceived, itemAdded, orderCancelled, payment, outOfStock, groupMsg, disc, avgGap, perMin, perHour, itemAddedPerMin };
  }, [filtered, range.from, range.to]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3">
        <Activity className="w-6 h-6 text-[#4f46e5]" />
        <h1 className="text-2xl font-bold">Monitoramento de Mensagens</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Período</label>
            <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Dia</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
                <SelectItem value="year">Ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {granularity === "day" && (
            <div>
              <label className="text-xs text-muted-foreground">Data</label>
              <Input type="date" value={dayRef} onChange={(e) => setDayRef(e.target.value)} className="w-[180px]" />
            </div>
          )}
          {granularity === "month" && (
            <div>
              <label className="text-xs text-muted-foreground">Mês</label>
              <Input type="month" value={monthRef} onChange={(e) => setMonthRef(e.target.value)} className="w-[180px]" />
            </div>
          )}
          {granularity === "year" && (
            <div>
              <label className="text-xs text-muted-foreground">Ano</label>
              <Input type="number" min={2020} max={2100} value={yearRef} onChange={(e) => setYearRef(e.target.value)} className="w-[120px]" />
            </div>
          )}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Empresa</label>
            <Input placeholder="Buscar empresa..." value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} />
          </div>
          <Button onClick={load} disabled={loading} variant="outline">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2">Atualizar</span>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total de envios ({range.label})</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totals.totalSent.toLocaleString("pt-BR")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Envios / minuto</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totals.perMin.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Envios / hora</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totals.perHour.toFixed(1)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Recebidas no privado</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totals.totalReceived.toLocaleString("pt-BR")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Tempo médio entre envios</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatDuration(totals.avgGap)}</div>
            <p className="text-xs text-muted-foreground mt-1">Ignora pausas &gt; 230 min</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Desconexões no período</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totals.disc.toLocaleString("pt-BR")}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por empresa</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {error && <div className="text-sm text-destructive mb-3">{error}</div>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Enviadas</TableHead>
                <TableHead className="text-right">Msg/min</TableHead>
                <TableHead className="text-right">Msg/h</TableHead>
                <TableHead className="text-right">Recebidas privado</TableHead>
                <TableHead className="text-right">Tempo médio entre envios</TableHead>
                <TableHead className="text-right">Desconexões</TableHead>
                <TableHead className="text-right">Média msgs até desconectar</TableHead>
                <TableHead className="text-right">Últ. antes de desconectar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline" /></TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum dado</TableCell></TableRow>
              )}
              {!loading && filtered.map((r) => (
                <TableRow key={r.tenant_id}>
                  <TableCell className="font-medium">{r.tenant_name}</TableCell>
                  <TableCell className="text-right">{Number(r.total_sent).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{r.msgs_per_minute != null ? Number(r.msgs_per_minute).toFixed(2) : "—"}</TableCell>
                  <TableCell className="text-right">{r.msgs_per_hour != null ? Number(r.msgs_per_hour).toFixed(1) : "—"}</TableCell>
                  <TableCell className="text-right">{Number(r.received_private || 0).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{formatDuration(r.avg_gap_seconds != null ? Number(r.avg_gap_seconds) : null)}</TableCell>
                  <TableCell className="text-right">{Number(r.disconnect_count).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{r.avg_msgs_before_disconnect != null ? Number(r.avg_msgs_before_disconnect).toFixed(1) : "—"}</TableCell>
                  <TableCell className="text-right">{r.last_msgs_before_disconnect ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
