import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, RefreshCw, Package, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { formatBrasiliaDateTime } from '@/lib/date-utils';

interface TaskRow {
  product_id: number;
  product_code: string;
  group_name: string;
  status: string;
  completed_at: string | null;
  created_at: string;
}

interface ProductSummary {
  product_id: number;
  product_code: string;
  totalGroups: number;
  sent: number;
  failed: number;
  cancelled: number;
  lastSentAt: string | null;
}

function startOfTodayBrasiliaISO(): string {
  // Início do dia em -03:00
  const now = new Date();
  const brasilia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  brasilia.setHours(0, 0, 0, 0);
  // Reconstrói ISO -03:00
  const y = brasilia.getFullYear();
  const m = String(brasilia.getMonth() + 1).padStart(2, '0');
  const d = String(brasilia.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00-03:00`;
}

export default function SendflowTodayHistory() {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [summaries, setSummaries] = useState<ProductSummary[]>([]);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const since = startOfTodayBrasiliaISO();
      const all: TaskRow[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('sendflow_tasks')
          .select('product_id, product_code, group_name, status, completed_at, created_at')
          .eq('tenant_id', tenant.id)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data || []) as TaskRow[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      const byProduct = new Map<number, ProductSummary>();
      for (const t of all) {
        let s = byProduct.get(t.product_id);
        if (!s) {
          s = {
            product_id: t.product_id,
            product_code: t.product_code,
            totalGroups: 0,
            sent: 0,
            failed: 0,
            cancelled: 0,
            lastSentAt: null,
          };
          byProduct.set(t.product_id, s);
        }
        s.totalGroups += 1;
        if (t.status === 'completed') {
          s.sent += 1;
          const ts = t.completed_at || t.created_at;
          if (!s.lastSentAt || new Date(ts) > new Date(s.lastSentAt)) {
            s.lastSentAt = ts;
          }
        } else if (t.status === 'error') {
          s.failed += 1;
        } else if (t.status === 'cancelled') {
          s.cancelled += 1;
        }
      }

      const list = Array.from(byProduct.values())
        .filter((s) => s.sent > 0 || s.failed > 0)
        .sort((a, b) => {
          const ta = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0;
          const tb = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0;
          return tb - ta;
        });
      setSummaries(list);
    } catch (e) {
      console.error('[SendflowTodayHistory] erro:', e);
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const totalProducts = summaries.length;
  const totalSent = summaries.reduce((acc, s) => acc + s.sent, 0);
  const totalFailed = summaries.reduce((acc, s) => acc + s.failed, 0);

  return (
    <Card className="rounded-2xl border-border/60 bg-card/70 backdrop-blur-xl shadow-sm">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <History className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Histórico de Produtos Enviados Hoje</CardTitle>
              <CardDescription className="pt-1">
                {totalProducts > 0
                  ? `${totalProducts} produto(s) • ${totalSent} envios concluídos${totalFailed > 0 ? ` • ${totalFailed} falhas` : ''}`
                  : 'Nenhum envio registrado hoje'}
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Atualizar</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && summaries.length === 0 ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum produto foi enviado hoje ainda.</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-center">Grupos</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Último envio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => (
                  <TableRow key={s.product_id}>
                    <TableCell className="font-mono font-medium">{s.product_code}</TableCell>
                    <TableCell className="text-center">{s.totalGroups}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {s.sent}
                        </Badge>
                        {s.failed > 0 && (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            {s.failed}
                          </Badge>
                        )}
                        {s.cancelled > 0 && (
                          <Badge variant="outline">
                            {s.cancelled} canc.
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.lastSentAt ? formatBrasiliaDateTime(s.lastSentAt) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
