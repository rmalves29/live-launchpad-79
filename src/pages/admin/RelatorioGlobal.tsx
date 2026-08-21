import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { RefreshCw, DollarSign, ShoppingCart, MessageSquare } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getBrasiliaDateISO } from "@/lib/date-utils";

type Preset = "dia" | "mes" | "ano" | "custom";

interface ReportData {
  orders: {
    total_value: number;
    paid_value: number;
    pending_value: number;
    count: number;
    count_paid: number;
    count_pending: number;
    ticket_medio: number;
    total_products?: number;
    avg_shipping_time_days?: number;
  };
  messages: { total: number; grupos: number; privado: number };
  daily_metrics?: Array<{
    date: string;
    orders_count: number;
    products_count: number;
  }>;
  customers?: { total: number; com_pedido_pago: number; sem_pedido_pago: number };
}

// Bounds em Brasília (-03:00): [from, to)
function rangeFor(preset: Preset, fromISO: string, toISO: string) {
  const today = getBrasiliaDateISO(); // yyyy-MM-dd
  const [y, m] = today.split("-");

  if (preset === "dia") {
    const next = new Date(`${today}T12:00:00`);
    next.setDate(next.getDate() + 1);
    const nextISO = next.toISOString().slice(0, 10);
    return { from: `${today}T00:00:00-03:00`, to: `${nextISO}T00:00:00-03:00` };
  }
  if (preset === "mes") {
    const start = `${y}-${m}-01`;
    const next = new Date(`${start}T12:00:00`);
    next.setMonth(next.getMonth() + 1);
    const nextISO = next.toISOString().slice(0, 10);
    return { from: `${start}T00:00:00-03:00`, to: `${nextISO}T00:00:00-03:00` };
  }
  if (preset === "ano") {
    return {
      from: `${y}-01-01T00:00:00-03:00`,
      to: `${Number(y) + 1}-01-01T00:00:00-03:00`,
    };
  }
  // custom: inclusivo no dia final
  const end = new Date(`${toISO}T12:00:00`);
  end.setDate(end.getDate() + 1);
  return {
    from: `${fromISO}T00:00:00-03:00`,
    to: `${end.toISOString().slice(0, 10)}T00:00:00-03:00`,
  };
}

const Metric = ({
  label,
  value,
  accent,
}: { label: string; value: string; accent?: string }) => (
  <div className="rounded-xl border border-border bg-card/60 p-4">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
      {label}
    </div>
    <div className={`mt-1 text-2xl font-bold ${accent ?? "text-foreground"}`}>{value}</div>
  </div>
);

export default function RelatorioGlobal() {
  const [preset, setPreset] = useState<Preset>("mes");
  const today = getBrasiliaDateISO();
  const [fromISO, setFromISO] = useState(today);
  const [toISO, setToISO] = useState(today);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => rangeFor(preset, fromISO, toISO), [preset, fromISO, toISO]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await supabase.rpc("admin_global_report", {
      p_from: range.from,
      p_to: range.to,
    });
    if (error) {
      toast({ title: "Erro ao carregar relatório", description: error.message, variant: "destructive" });
      setData(null);
    } else {
      setData(res as unknown as ReportData);
    }
    setLoading(false);
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const o = data?.orders;
  const m = data?.messages;
  const c = data?.customers;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatório Global</h1>
          <p className="text-sm text-muted-foreground">
            Consolidado de todas as empresas do sistema
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {([
              ["dia", "Hoje"],
              ["mes", "Mês"],
              ["ano", "Ano"],
              ["custom", "Personalizada"],
            ] as [Preset, string][]).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={preset === key ? "default" : "outline"}
                onClick={() => setPreset(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">De</Label>
                <Input
                  type="date"
                  value={fromISO}
                  max={toISO}
                  onChange={(e) => setFromISO(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input
                  type="date"
                  value={toISO}
                  min={fromISO}
                  onChange={(e) => setToISO(e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="w-4 h-4" /> Valores
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total vendido" value={formatCurrency(o?.total_value ?? 0)} />
          <Metric label="Valor pago" value={formatCurrency(o?.paid_value ?? 0)} accent="text-emerald-600" />
          <Metric label="Valor não pago" value={formatCurrency(o?.pending_value ?? 0)} accent="text-amber-600" />
          <Metric label="Ticket médio" value={formatCurrency(o?.ticket_medio ?? 0)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="w-4 h-4" /> Pedidos e Produtos
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Pedidos realizados" value={(o?.count ?? 0).toLocaleString("pt-BR")} />
          <Metric label="Produtos enviados" value={(o?.total_products ?? 0).toLocaleString("pt-BR")} accent="text-blue-600" />
          <Metric label="Pedidos pagos" value={(o?.count_paid ?? 0).toLocaleString("pt-BR")} accent="text-emerald-600" />
          <Metric label="Tempo médio envio" value={o?.avg_shipping_time_days ? `${o.avg_shipping_time_days}d` : "0.0d"} accent="text-purple-600" />
        </CardContent>
      </Card>

      {data?.daily_metrics && data.daily_metrics.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Detalhamento por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 font-semibold">Data</th>
                    <th className="py-2 font-semibold text-center">Pedidos</th>
                    <th className="py-2 font-semibold text-center">Produtos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily_metrics.map((day) => (
                    <tr key={day.date} className="border-b hover:bg-muted/50">
                      <td className="py-2">{new Date(day.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="py-2 text-center">{day.orders_count}</td>
                      <td className="py-2 text-center">{day.products_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="w-4 h-4" /> Mensagens enviadas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Metric label="Total enviadas" value={(m?.total ?? 0).toLocaleString("pt-BR")} />
          <Metric label="No privado" value={(m?.privado ?? 0).toLocaleString("pt-BR")} />
          <Metric label="Nos grupos" value={(m?.grupos ?? 0).toLocaleString("pt-BR")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="w-4 h-4" /> Base de Clientes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Metric label="Total de clientes" value={(c?.total ?? 0).toLocaleString("pt-BR")} />
          <Metric label="Com pedido pago" value={(c?.com_pedido_pago ?? 0).toLocaleString("pt-BR")} accent="text-emerald-600" />
          <Metric label="Sem pedido pago" value={(c?.sem_pedido_pago ?? 0).toLocaleString("pt-BR")} accent="text-amber-600" />
        </CardContent>
      </Card>
    </div>
  );
}
