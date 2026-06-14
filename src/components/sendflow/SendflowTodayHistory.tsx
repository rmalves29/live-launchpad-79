import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { History, RefreshCw, Package, Loader2, ChevronDown, Users } from 'lucide-react';
import { formatBrasiliaDateTime } from '@/lib/date-utils';

interface HistoryRow {
  product_id: number;
  group_id: string;
  sent_at: string;
}

interface GroupSend {
  group_id: string;
  group_name: string;
  sent_at: string;
}

interface ProductSummary {
  product_id: number;
  product_code: string;
  product_name: string;
  groups: GroupSend[];
  lastSentAt: string;
}

function startOfTodayBrasiliaISO(): string {
  const now = new Date();
  const brasilia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  brasilia.setHours(0, 0, 0, 0);
  const y = brasilia.getFullYear();
  const m = String(brasilia.getMonth() + 1).padStart(2, '0');
  const d = String(brasilia.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00-03:00`;
}

export default function SendflowTodayHistory() {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [summaries, setSummaries] = useState<ProductSummary[]>([]);
  const [openProducts, setOpenProducts] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const since = startOfTodayBrasiliaISO();
      const all: HistoryRow[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('sendflow_history')
          .select('product_id, group_id, sent_at')
          .eq('tenant_id', tenant.id)
          .gte('sent_at', since)
          .order('sent_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data || []) as HistoryRow[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      if (all.length === 0) {
        setSummaries([]);
        return;
      }

      // Buscar nomes de produtos e grupos
      const productIds = Array.from(new Set(all.map((r) => r.product_id)));
      const groupIds = Array.from(new Set(all.map((r) => r.group_id)));

      const [{ data: products }, { data: groups }] = await Promise.all([
        supabase
          .from('products')
          .select('id, code, name')
          .eq('tenant_id', tenant.id)
          .in('id', productIds),
        supabase
          .from('fe_groups')
          .select('group_jid, group_name')
          .eq('tenant_id', tenant.id)
          .in('group_jid', groupIds),
      ]);

      const productMap = new Map<number, { code: string; name: string }>();
      (products || []).forEach((p: any) =>
        productMap.set(p.id, { code: p.code, name: p.name })
      );
      const groupMap = new Map<string, string>();
      (groups || []).forEach((g: any) => groupMap.set(g.group_jid, g.group_name));

      // Agrupar por produto
      const byProduct = new Map<number, ProductSummary>();
      for (const r of all) {
        let s = byProduct.get(r.product_id);
        if (!s) {
          const p = productMap.get(r.product_id);
          s = {
            product_id: r.product_id,
            product_code: p?.code || `#${r.product_id}`,
            product_name: p?.name || '—',
            groups: [],
            lastSentAt: r.sent_at,
          };
          byProduct.set(r.product_id, s);
        }
        s.groups.push({
          group_id: r.group_id,
          group_name: groupMap.get(r.group_id) || r.group_id,
          sent_at: r.sent_at,
        });
        if (new Date(r.sent_at) > new Date(s.lastSentAt)) {
          s.lastSentAt = r.sent_at;
        }
      }

      const list = Array.from(byProduct.values()).sort(
        (a, b) => new Date(b.lastSentAt).getTime() - new Date(a.lastSentAt).getTime()
      );
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
  const totalSends = summaries.reduce((acc, s) => acc + s.groups.length, 0);

  const toggle = (id: number) =>
    setOpenProducts((prev) => ({ ...prev, [id]: !prev[id] }));

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
                  ? `${totalProducts} produto(s) • ${totalSends} envio(s) em grupos`
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
          <div className="max-h-[28rem] overflow-y-auto space-y-2">
            {summaries.map((s) => {
              const isOpen = !!openProducts[s.product_id];
              return (
                <Collapsible
                  key={s.product_id}
                  open={isOpen}
                  onOpenChange={() => toggle(s.product_id)}
                  className="border border-border/60 rounded-lg bg-background/40"
                >
                  <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                      />
                      <span className="font-mono font-semibold text-primary">{s.product_code}</span>
                      <span className="truncate text-sm text-muted-foreground">{s.product_name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" />
                        {s.groups.length}
                      </Badge>
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {formatBrasiliaDateTime(s.lastSentAt)}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-3 pt-1 space-y-1">
                      {s.groups
                        .slice()
                        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
                        .map((g, idx) => (
                          <div
                            key={`${g.group_id}-${idx}`}
                            className="flex items-center justify-between text-sm px-2 py-1.5 rounded hover:bg-muted/30"
                          >
                            <span className="truncate">{g.group_name}</span>
                            <span className="text-xs text-muted-foreground shrink-0 ml-2">
                              {formatBrasiliaDateTime(g.sent_at)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
