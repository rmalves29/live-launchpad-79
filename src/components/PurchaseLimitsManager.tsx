// Promoções > Limite por cliente: em um período, um ou vários produtos têm um máximo de unidades por cliente.
// "Por produto" = máximo de cada produto; "Somado" = máximo no total entre os produtos escolhidos.
// Quem barra é o banco (trigger enforce_purchase_limits), em todos os canais: live, bazar, pedido manual,
// Loja da Live e vitrine. A cliente recebe um aviso quando passa do limite.
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Pencil, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { supabaseTenant } from '@/lib/supabase-tenant';

interface Limite {
  id: string;
  name: string;
  product_ids: number[];
  max_qty: number;
  scope: 'per_product' | 'combined';
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}
interface Produto { id: number; code: string | null; name: string; is_active: boolean }

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function PurchaseLimitsManager() {
  const { toast } = useToast();
  const { confirm, confirmDialogElement } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Limite[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [maxQty, setMaxQty] = useState(2);
  const [scope, setScope] = useState<'per_product' | 'combined'>('per_product');
  const [selected, setSelected] = useState<number[]>([]);
  const [busca, setBusca] = useState('');

  // Limites e produtos carregam separados: se um falhar, o outro continua funcionando.
  const load = async () => {
    setLoading(true);
    try {
      const { data: lim, error } = await (supabaseTenant as any).from('purchase_limits').select('*').order('starts_at', { ascending: false });
      if (error) throw error;
      const rows = (lim || []) as Limite[];
      setItems(rows);
      const ids = [...new Set(rows.flatMap((l) => l.product_ids || []))];
      if (ids.length) await loadProdutosPorId(ids);
    } catch (e: any) {
      toast({ title: 'Erro ao carregar limites', description: e?.message || 'Falha ao carregar', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Guarda nome/código dos produtos já vistos (para mostrar os escolhidos e a tabela)
  const guardar = (rows: Produto[]) => setProdutos((prev) => {
    const m = new Map(prev.map((p) => [p.id, p]));
    rows.forEach((p) => m.set(p.id, p));
    return [...m.values()];
  });
  const loadProdutosPorId = async (ids: number[]) => {
    const { data } = await (supabaseTenant as any).from('products').select('id, code, name, is_active').in('id', ids);
    guardar((data || []) as Produto[]);
  };

  // Busca no banco enquanto digita (código ou nome), com pequena espera para não consultar a cada tecla
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setResultados([]); return; }
    const termo = q.replace(/[%,()]/g, ' ').trim();
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data, error } = await (supabaseTenant as any)
          .from('products')
          .select('id, code, name, is_active')
          .or(`code.ilike.%${termo}%,name.ilike.%${termo}%`)
          .order('code')
          .limit(40);
        if (error) throw error;
        const rows = (data || []) as Produto[];
        guardar(rows);
        setResultados(rows.filter((p) => !selected.includes(p.id)));
      } catch (e: any) {
        toast({ title: 'Erro na busca', description: e?.message || 'Falha ao buscar produtos', variant: 'destructive' });
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busca, selected]);

  const byId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const resetForm = () => {
    setEditingId(null); setName(''); setStartsAt(''); setEndsAt('');
    setMaxQty(2); setScope('per_product'); setSelected([]); setBusca('');
  };
  const openNew = () => { resetForm(); setOpen(true); };
  const openEdit = (l: Limite) => {
    setEditingId(l.id); setName(l.name); setStartsAt(toLocalInput(l.starts_at)); setEndsAt(toLocalInput(l.ends_at));
    setMaxQty(l.max_qty); setScope(l.scope); setSelected(l.product_ids || []); setBusca(''); setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast({ title: 'Dê um nome para o limite', variant: 'destructive' });
    if (!startsAt || !endsAt) return toast({ title: 'Informe início e fim', variant: 'destructive' });
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return toast({ title: 'Período inválido', description: 'O fim precisa ser depois do início.', variant: 'destructive' });
    }
    if (!selected.length) return toast({ title: 'Escolha pelo menos um produto', variant: 'destructive' });
    if (!(maxQty > 0)) return toast({ title: 'O máximo por cliente precisa ser 1 ou mais', variant: 'destructive' });

    setSaving(true);
    try {
      const payload = {
        name: name.trim(), product_ids: selected, max_qty: Math.floor(maxQty), scope,
        starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(), updated_at: new Date().toISOString(),
      };
      if (editingId) {
        const { error } = await (supabaseTenant as any).from('purchase_limits').update(payload).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Limite atualizado' });
      } else {
        const tenantId = (supabaseTenant as any).getTenantId?.();
        const { error } = await (supabaseTenant as any).from('purchase_limits').insert({ ...payload, tenant_id: tenantId, is_active: true });
        if (error) throw error;
        toast({ title: 'Limite criado' });
      }
      setOpen(false); resetForm(); await load();
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (l: Limite) => {
    const { error } = await (supabaseTenant as any).from('purchase_limits').update({ is_active: !l.is_active, updated_at: new Date().toISOString() }).eq('id', l.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    await load();
  };
  const handleDelete = async (l: Limite) => {
    const ok = await confirm({ description: `Excluir o limite "${l.name}"?`, confirmText: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    const { error } = await (supabaseTenant as any).from('purchase_limits').delete().eq('id', l.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else toast({ title: 'Limite removido' });
    await load();
  };

  const situacao = (l: Limite) => {
    const now = Date.now();
    if (!l.is_active) return <Badge variant="outline">Desligado</Badge>;
    if (now < new Date(l.starts_at).getTime()) return <Badge variant="secondary">Agendado</Badge>;
    if (now > new Date(l.ends_at).getTime()) return <Badge variant="outline">Encerrado</Badge>;
    return <Badge>Valendo</Badge>;
  };
  const nomesProdutos = (ids: number[]) => {
    const list = ids.map((id) => byId.get(id)?.code || `#${id}`);
    return list.length > 4 ? `${list.slice(0, 4).join(', ')} +${list.length - 4}` : list.join(', ');
  };

  return (
    <Card>
      {confirmDialogElement}
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Limite por cliente</CardTitle>
          <CardDescription>
            Limita quantas unidades cada cliente pode pedir de um ou mais produtos num período. Vale para live, bazar,
            pedido manual e Loja da Live. Se a cliente passar do limite, o item não entra e ela recebe um aviso no WhatsApp.
          </CardDescription>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" /> Novo limite</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum limite criado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Produtos</TableHead>
                  <TableHead>Regra</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell className="text-sm">{nomesProdutos(l.product_ids || [])}</TableCell>
                    <TableCell className="text-sm">
                      Máx. {l.max_qty} {l.scope === 'combined' ? 'no total' : 'de cada produto'} por cliente
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{fmt(l.starts_at)} até {fmt(l.ends_at)}</TableCell>
                    <TableCell>{situacao(l)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Switch checked={l.is_active} onCheckedChange={() => handleToggle(l)} className="mr-2 align-middle" />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(l)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar limite por cliente' : 'Novo limite por cliente'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input placeholder="Ex.: Kit Londres na Black" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Início</Label>
                <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Fim</Label>
                <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Produtos</Label>
              <Input placeholder="Digite o código ou o nome do produto (ex.: C001 ou colar)" value={busca} onChange={(e) => setBusca(e.target.value)} />
              {busca.trim().length >= 2 && (buscando ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Buscando…</p>
              ) : resultados.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum produto encontrado com “{busca.trim()}”.</p>
              ) : null)}
              {resultados.length > 0 && (
                <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                  {resultados.map((p) => (
                    <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      onClick={() => { setSelected((s) => [...s, p.id]); setBusca(''); }}>
                      <span className="font-mono font-medium">{p.code || '—'}</span> · {p.name}
                      {!p.is_active && <span className="text-muted-foreground"> (inativo)</span>}
                    </button>
                  ))}
                </div>
              )}
              {selected.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selected.map((id) => {
                    const p = byId.get(id);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1">
                        <span className="font-mono">{p?.code || `#${id}`}</span>
                        <span className="max-w-[160px] truncate">{p?.name || ''}</span>
                        <button type="button" onClick={() => setSelected((s) => s.filter((x) => x !== id))} className="ml-1 rounded hover:bg-background p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Digite pelo menos 2 letras e clique no produto para adicionar. Dá para adicionar vários.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Máximo por cliente (unidades)</Label>
                <Input type="number" min={1} value={maxQty} onChange={(e) => setMaxQty(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Como contar</Label>
                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="radio" className="mt-1" checked={scope === 'per_product'} onChange={() => setScope('per_product')} />
                    <span><b>Por produto</b> — até {maxQty || 0} de <i>cada</i> produto</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="radio" className="mt-1" checked={scope === 'combined'} onChange={() => setScope('combined')} />
                    <span><b>Somado</b> — até {maxQty || 0} no <i>total</i>, entre todos os produtos escolhidos</span>
                  </label>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Conta só o que a cliente pediu entre o início e o fim, em qualquer canal. Pedidos cancelados não contam.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
