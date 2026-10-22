import { useCallback, useEffect, useState } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useTenant } from '@/hooks/useTenant';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { EditOrderDialog } from '@/components/EditOrderDialog';
import { ViewOrderDialog } from '@/components/ViewOrderDialog';
import { formatBrasiliaDate, formatBrasiliaDateTime } from '@/lib/date-utils';
import { normalizeForStorage } from '@/lib/phone-utils';
import { Eye, Pencil, Search, X } from 'lucide-react';

// Pedidos da Loja da Live: "LIVE" (pedidos feitos na live) e "INSTAGRAM_LIVE" (feitos pelo link da loja).
const LIVE_EVENTS = ['LIVE', 'INSTAGRAM_LIVE'];
const PAGE_SIZE = 25;

type StatusFilter = 'all' | 'paid' | 'unpaid' | 'cancelled';

const money = (v: number | null | undefined) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function LiveOrdersManager() {
  const { tenant } = useTenant();
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [date, setDate] = useState('');
  const [viewing, setViewing] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      let query = supabaseTenant
        .from('orders')
        .select('*', { count: 'exact' })
        .in('event_type', LIVE_EVENTS)
        .order('created_at', { ascending: false });
      if (status === 'paid') query = query.eq('is_paid', true).eq('is_cancelled', false);
      if (status === 'unpaid') query = query.eq('is_paid', false).eq('is_cancelled', false);
      if (status === 'cancelled') query = query.eq('is_cancelled', true);
      if (date) query = query.eq('event_date', date);

      const q = debounced.replace(/[%_\\,()]/g, ' ').trim().slice(0, 40);
      if (q) {
        const digits = q.replace(/\D/g, '');
        // Número do pedido, telefone ou nome do cliente
        const { data: byName } = await supabaseTenant.from('customers').select('phone').ilike('name', `%${q}%`).limit(100);
        const phones = ((byName as any[]) || []).map((c) => c.phone).filter(Boolean);
        const parts: string[] = [];
        if (digits) parts.push(`customer_phone.ilike.%${digits}%`);
        if (digits && digits.length <= 9) parts.push(`tenant_order_number.eq.${digits}`);
        if (phones.length) parts.push(`customer_phone.in.(${phones.join(',')})`);
        if (parts.length === 0) { setOrders([]); setTotal(0); setLoading(false); return; }
        query = query.or(parts.join(','));
      }

      const { data, count, error } = await query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      const list: any[] = data || [];
      setTotal(count ?? list.length);
      if (list.length === 0) { setOrders([]); return; }

      const phonesAll = [...new Set(list.flatMap((o) => [o.customer_phone, normalizeForStorage(o.customer_phone)]).filter(Boolean))];
      const cartIds = [...new Set(list.filter((o) => o.cart_id).map((o) => o.cart_id))];
      const [{ data: customers }, { data: items }] = await Promise.all([
        supabaseTenant
          .from('customers')
          .select('phone, name, cpf, street, number, complement, neighborhood, city, state, cep, instagram, bling_contact_id')
          .in('phone', phonesAll),
        cartIds.length
          ? supabaseTenant.raw
              .from('cart_items')
              .select('id, cart_id, qty, unit_price, product_name, product_code, product_image_url, product:products!cart_items_product_id_fkey (name, code, image_url, color, size)')
              .in('cart_id', cartIds)
          : Promise.resolve({ data: [] } as any),
      ]);
      const custMap = new Map<string, any>();
      ((customers as any[]) || []).forEach((c) => { custMap.set(c.phone, c); custMap.set(normalizeForStorage(c.phone), c); });
      const itemMap = new Map<number, any[]>();
      ((items as any[]) || []).forEach((i) => { const a = itemMap.get(i.cart_id) || []; a.push(i); itemMap.set(i.cart_id, a); });

      setOrders(list.map((o) => ({
        ...o,
        customer: custMap.get(o.customer_phone) || custMap.get(normalizeForStorage(o.customer_phone)) || undefined,
        cart_items: o.cart_id ? itemMap.get(o.cart_id) || [] : [],
      })));
    } catch (e: any) {
      toast({ title: 'Erro ao carregar pedidos', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, debounced, status, date, page]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold">Pedidos da live</h3>
        <p className="text-xs text-muted-foreground">Só os pedidos feitos na live e pelo link da Loja da Live. Use o olho para ver o pedido completo e o lápis para editar itens, frete e pagamento.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, celular ou nº do pedido" className="pl-9 pr-9" aria-label="Buscar pedido" />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Limpar busca">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Input type="date" className="w-40" value={date} onChange={(e) => { setDate(e.target.value); setPage(0); }} aria-label="Data do evento" />
        <div className="inline-flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Filtrar por status">
          {([['all', 'Todos'], ['paid', 'Pagos'], ['unpaid', 'Pendentes'], ['cancelled', 'Cancelados']] as [StatusFilter, string][]).map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={status === v}
              onClick={() => { setStatus(v); setPage(0); }}
              className={`rounded-md px-3 py-1.5 transition ${status === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="w-16">Pedido</span>
          <span className="flex-1">Cliente</span>
          <span className="hidden w-24 text-right sm:block">Total</span>
          <span className="w-28 text-right">Status</span>
          <span className="w-20 text-right">Ações</span>
        </div>
        {loading ? (
          <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : orders.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum pedido da live neste filtro.</p>
        ) : (
          <ul className="divide-y">
            {orders.map((o) => {
              const itemsQty = (o.cart_items || []).reduce((s: number, i: any) => s + (Number(i.qty) || 0), 0);
              return (
                <li key={o.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-16 text-sm font-mono">#{o.tenant_order_number ?? o.id}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.customer?.name || o.customer_name || o.customer_phone}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatBrasiliaDate(o.event_date)} · {itemsQty} {itemsQty === 1 ? 'item' : 'itens'}{o.customer?.name ? ` · ${o.customer_phone}` : ''}
                    </p>
                  </div>
                  <span className="hidden w-24 text-right text-sm tabular-nums sm:block">{money(o.total_amount)}</span>
                  <span className="w-28 text-right">
                    {o.is_cancelled ? <Badge variant="outline">Cancelado</Badge>
                      : o.is_paid ? (
                        <>
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Pago</Badge>
                          {o.paid_at && <span className="mt-0.5 block text-[11px] leading-tight text-emerald-700">{formatBrasiliaDateTime(o.paid_at).slice(0, 5)} às {formatBrasiliaDateTime(o.paid_at).slice(11)}</span>}
                        </>
                      )
                      : <Badge className="bg-amber-500 hover:bg-amber-500">Pendente</Badge>}
                  </span>
                  <span className="flex w-20 justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Ver pedido ${o.tenant_order_number ?? o.id}`} onClick={() => { setViewing(o); setViewOpen(true); }}><Eye className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar pedido ${o.tenant_order_number ?? o.id}`} onClick={() => { setEditing(o); setEditOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} pedido(s)</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
          <span>Página {page + 1} de {pages}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      </div>

      <EditOrderDialog open={editOpen} onOpenChange={setEditOpen} order={editing} onOrderUpdated={load} />
      <ViewOrderDialog open={viewOpen} onOpenChange={setViewOpen} order={viewing} onOrderUpdated={load} />
    </Card>
  );
}
