import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Clock, ListOrdered, RefreshCw, Trash2, Send, ExternalLink, Users } from 'lucide-react';

type WaitlistRow = {
  id: number;
  tenant_id: string;
  product_id: number;
  customer_phone: string;
  customer_name: string | null;
  customer_instagram: string | null;
  qty: number;
  status: 'waiting' | 'notified' | 'converted' | 'expired' | 'cancelled';
  source: 'storefront' | 'whatsapp' | 'manual';
  notified_at: string | null;
  reserved_until: string | null;
  order_id: number | null;
  created_at: string;
  product?: { id: number; name: string; code: string | null; image_url: string | null; stock: number };
};

const STATUS_COLORS: Record<string, string> = {
  waiting: 'bg-blue-100 text-blue-800 border-blue-200',
  notified: 'bg-amber-100 text-amber-800 border-amber-200',
  converted: 'bg-green-100 text-green-800 border-green-200',
  expired: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};
const STATUS_LABEL: Record<string, string> = {
  waiting: 'Aguardando',
  notified: 'Notificada',
  converted: 'Convertida',
  expired: 'Expirou',
  cancelled: 'Cancelada',
};

export default function FilaEsperaPage() {
  const { tenant } = useTenant();
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [search, setSearch] = useState('');

  async function load() {
    if (!tenant?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_waitlist')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) {
        console.error('[fila-espera] erro ao carregar fila:', error);
        toast({ title: 'Erro ao carregar fila', description: error.message, variant: 'destructive' });
        setRows([]);
        return;
      }

      const waitlistRows = (data || []) as WaitlistRow[];
      const productIds = Array.from(new Set(waitlistRows.map((r) => r.product_id).filter(Boolean)));

      if (productIds.length > 0) {
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('id, name, code, image_url, stock')
          .eq('tenant_id', tenant.id)
          .in('id', productIds);

        if (productsError) {
          console.error('[fila-espera] erro ao carregar produtos da fila:', productsError);
        }

        const productsById = new Map((products || []).map((product) => [product.id, product]));
        waitlistRows.forEach((row) => {
          row.product = productsById.get(row.product_id) as WaitlistRow['product'];
        });
      }

      setRows(waitlistRows);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [tenant?.id]);

  // Realtime
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase.channel('waitlist-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_waitlist', filter: `tenant_id=eq.${tenant.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id]);

  const filtered = rows.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterSource !== 'all' && r.source !== filterSource) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(
        (r.customer_name || '').toLowerCase().includes(s) ||
        (r.customer_phone || '').includes(s) ||
        (r.product?.name || '').toLowerCase().includes(s) ||
        (r.product?.code || '').toLowerCase().includes(s)
      )) return false;
    }
    return true;
  });

  const stats = {
    waiting: rows.filter(r => r.status === 'waiting').length,
    notified: rows.filter(r => r.status === 'notified').length,
    converted: rows.filter(r => r.status === 'converted').length,
  };

  // Posição calculada por produto (somente em waiting)
  const positionMap = new Map<string, number>();
  const counters = new Map<number, number>();
  rows.filter(r => r.status === 'waiting').forEach(r => {
    const n = (counters.get(r.product_id) || 0) + 1;
    counters.set(r.product_id, n);
    positionMap.set(`${r.product_id}:${r.id}`, n);
  });

  async function remove(id: number) {
    if (!confirm('Remover esta cliente da fila?')) return;
    const { error } = await supabase.from('product_waitlist').update({ status: 'cancelled' }).eq('id', id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Removida da fila' }); load(); }
  }

  async function processNow(productId: number) {
    const { data, error } = await supabase.functions.invoke('waitlist-process-next', {
      body: { tenant_id: tenant?.id, product_id: productId },
    });
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Processamento disparado', description: JSON.stringify(data?.results?.[0] || data) }); load(); }
  }

  function timeLeft(iso: string | null): string {
    if (!iso) return '-';
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'expirado';
    const min = Math.floor(ms / 60000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return `${h}h ${min % 60}min`;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ListOrdered className="h-6 w-6"/> Fila de Espera</h1>
          <p className="text-sm text-muted-foreground">Clientes aguardando produtos esgotados. Quando o estoque volta, o sistema cria pedido automaticamente para a próxima e envia WhatsApp.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-2"/>Atualizar</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 flex items-center gap-3"><Users className="h-8 w-8 text-blue-500"/><div><div className="text-2xl font-bold">{stats.waiting}</div><div className="text-xs text-muted-foreground">Aguardando</div></div></Card>
        <Card className="p-4 flex items-center gap-3"><Clock className="h-8 w-8 text-amber-500"/><div><div className="text-2xl font-bold">{stats.notified}</div><div className="text-xs text-muted-foreground">Notificadas (reserva ativa)</div></div></Card>
        <Card className="p-4 flex items-center gap-3"><ListOrdered className="h-8 w-8 text-green-500"/><div><div className="text-2xl font-bold">{stats.converted}</div><div className="text-xs text-muted-foreground">Convertidas em pedido pago</div></div></Card>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <Input placeholder="Buscar cliente, telefone ou produto..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs"/>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-44"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as origens</SelectItem>
            <SelectItem value="storefront">Vitrine</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Pos.</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Qtd</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Entrou em</TableHead>
              <TableHead>Reserva</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (<TableRow><TableCell colSpan={10} className="text-center py-8">Carregando…</TableCell></TableRow>)}
            {!loading && filtered.length === 0 && (<TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum registro na fila.</TableCell></TableRow>)}
            {filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.status === 'waiting' ? `${positionMap.get(`${r.product_id}:${r.id}`)}º` : '-'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {r.product?.image_url && <img src={r.product.image_url} alt="" className="h-10 w-10 rounded object-cover"/>}
                    <div>
                      <div className="font-medium">{r.product?.name || `#${r.product_id}`}</div>
                      <div className="text-xs text-muted-foreground">cód. {r.product?.code} · estoque: {r.product?.stock ?? '-'}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{r.customer_name || '-'}</div>
                  <div className="text-xs text-muted-foreground">{r.customer_phone}{r.customer_instagram ? ` · @${r.customer_instagram}` : ''}</div>
                </TableCell>
                <TableCell>{r.qty}</TableCell>
                <TableCell><Badge className={STATUS_COLORS[r.status]}>{STATUS_LABEL[r.status]}</Badge></TableCell>
                <TableCell><span className="text-xs uppercase">{r.source}</span></TableCell>
                <TableCell className="text-xs">{new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</TableCell>
                <TableCell className="text-xs">{r.status === 'notified' ? timeLeft(r.reserved_until) : '-'}</TableCell>
                <TableCell>{r.order_id ? <a className="text-blue-600 inline-flex items-center gap-1 text-xs" href={`/pedidos?id=${r.order_id}`} target="_blank" rel="noreferrer">#{r.order_id} <ExternalLink className="h-3 w-3"/></a> : '-'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {r.status === 'waiting' && (r.product?.stock ?? 0) > 0 && (
                      <Button size="sm" variant="outline" onClick={() => processNow(r.product_id)} title="Processar fila agora"><Send className="h-3 w-3"/></Button>
                    )}
                    {(r.status === 'waiting' || r.status === 'notified') && (
                      <Button size="sm" variant="outline" onClick={() => remove(r.id)} title="Remover da fila"><Trash2 className="h-3 w-3 text-red-500"/></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
