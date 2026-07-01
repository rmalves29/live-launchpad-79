import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Gift, Pencil, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { supabaseTenant } from '@/lib/supabase-tenant';

interface Categoria {
  id: string;
  name: string;
  is_active: boolean;
}

interface Tier {
  qty: number;
  percent: number;
}

interface Promocao {
  id: string;
  name: string;
  category_id: string;
  promotion_type: 'buy_x_get_y' | 'progressive_qty';
  buy_qty: number | null;
  get_qty: number | null;
  discount_percent: number | null;
  tiers: Tier[] | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function PromocoesManager() {
  const { toast } = useToast();
  const { confirm, confirmDialogElement } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Promocao[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [promotionType, setPromotionType] = useState<'buy_x_get_y' | 'progressive_qty'>('buy_x_get_y');
  const [buyQty, setBuyQty] = useState(1);
  const [getQty, setGetQty] = useState(1);
  const [discountPercent, setDiscountPercent] = useState(100);
  const [tiers, setTiers] = useState<Tier[]>([{ qty: 1, percent: 5 }, { qty: 2, percent: 7 }, { qty: 3, percent: 10 }]);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setName(''); setCategoryId('');
    setPromotionType('buy_x_get_y');
    setBuyQty(1); setGetQty(1); setDiscountPercent(100);
    setTiers([{ qty: 1, percent: 5 }, { qty: 2, percent: 7 }, { qty: 3, percent: 10 }]);
    setStartsAt(''); setEndsAt('');
  };

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: promos, error: e1 }, { data: cats, error: e2 }] = await Promise.all([
        (supabaseTenant as any).from('product_promotions').select('*').order('created_at', { ascending: false }),
        (supabaseTenant as any).from('product_categories').select('id, name, is_active').order('name'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setItems((promos || []) as Promocao[]);
      setCategorias((cats || []) as Categoria[]);
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao carregar', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const validatePeriod = (): boolean => {
    if (startsAt && endsAt) {
      const s = new Date(startsAt).getTime();
      const e = new Date(endsAt).getTime();
      if (e <= s) {
        toast({ title: 'Período inválido', description: 'A data de fim deve ser maior que a de início.', variant: 'destructive' });
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!name.trim() || !categoryId) {
      toast({ title: 'Preencha nome e categoria', variant: 'destructive' });
      return;
    }
    if (!validatePeriod()) return;

    if (promotionType === 'progressive_qty') {
      const cleaned = tiers
        .filter(t => Number(t.qty) > 0 && Number(t.percent) > 0)
        .map(t => ({ qty: Number(t.qty), percent: Number(t.percent) }))
        .sort((a, b) => a.qty - b.qty);
      if (cleaned.length === 0) {
        toast({ title: 'Adicione ao menos uma faixa', description: 'Informe quantidade e percentual.', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        category_id: categoryId,
        promotion_type: promotionType,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      };

      if (promotionType === 'buy_x_get_y') {
        payload.buy_qty = buyQty;
        payload.get_qty = getQty;
        payload.discount_percent = discountPercent;
        payload.tiers = null;
      } else {
        payload.buy_qty = 0;
        payload.get_qty = 0;
        payload.discount_percent = 0;
        payload.tiers = tiers
          .filter(t => Number(t.qty) > 0 && Number(t.percent) > 0)
          .map(t => ({ qty: Number(t.qty), percent: Number(t.percent) }))
          .sort((a, b) => a.qty - b.qty);
      }

      if (editingId) {
        const { error } = await (supabaseTenant as any)
          .from('product_promotions').update(payload).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Promoção atualizada' });
      } else {
        const tenantId = (supabaseTenant as any).getTenantId?.();
        const { error } = await (supabaseTenant as any).from('product_promotions').insert({
          ...payload,
          tenant_id: tenantId,
          is_active: true,
        });
        if (error) throw error;
        toast({ title: 'Promoção criada' });
      }
      resetForm();
      setEditOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (p: Promocao) => {
    setEditingId(p.id);
    setName(p.name);
    setCategoryId(p.category_id);
    setPromotionType((p.promotion_type as any) || 'buy_x_get_y');
    setBuyQty(p.buy_qty ?? 1);
    setGetQty(p.get_qty ?? 1);
    setDiscountPercent(p.discount_percent ?? 100);
    setTiers(Array.isArray(p.tiers) && p.tiers.length ? p.tiers : [{ qty: 1, percent: 5 }]);
    setStartsAt(toLocalInput(p.starts_at));
    setEndsAt(toLocalInput(p.ends_at));
    setEditOpen(true);
  };

  const handleToggle = async (p: Promocao) => {
    try {
      const { error } = await (supabaseTenant as any)
        .from('product_promotions').update({ is_active: !p.is_active }).eq('id', p.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao atualizar', variant: 'destructive' });
    }
  };

  const handleDelete = async (p: Promocao) => {
    const ok = await confirm({ description: `Excluir promoção "${p.name}"?`, confirmText: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    try {
      const { error } = await (supabaseTenant as any).from('product_promotions').delete().eq('id', p.id);
      if (error) throw error;
      await load();
      toast({ title: 'Promoção removida' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao excluir', variant: 'destructive' });
    }
  };

  const categoryName = (id: string) => categorias.find((c) => c.id === id)?.name || '—';

  const describeRule = (p: Promocao) => {
    if (p.promotion_type === 'progressive_qty') {
      const list = (p.tiers || []).map(t => `${t.qty}+: ${t.percent}%`).join(' · ');
      return `Desconto progressivo (${list || 'sem faixas'})`;
    }
    return `Compra ${p.buy_qty}, ganha ${p.get_qty} ${p.discount_percent === 100 ? 'grátis' : `com ${p.discount_percent}% off`}`;
  };

  const updateTier = (i: number, field: 'qty' | 'percent', value: number) => {
    setTiers(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  };
  const addTier = () => {
    const lastQty = tiers.length ? Math.max(...tiers.map(t => t.qty)) : 0;
    setTiers(prev => [...prev, { qty: lastQty + 1, percent: 5 }]);
  };
  const removeTier = (i: number) => setTiers(prev => prev.filter((_, idx) => idx !== i));

  const FormFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1 lg:col-span-2">
          <Label>Nome</Label>
          <Input placeholder="Ex: Progressivo Anéis" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1 lg:col-span-2">
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {categorias.filter((c) => c.is_active).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 lg:col-span-4">
          <Label>Tipo de promoção</Label>
          <Select value={promotionType} onValueChange={(v) => setPromotionType(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="buy_x_get_y">Compre X, Ganhe Y</SelectItem>
              <SelectItem value="progressive_qty">Desconto Progressivo por Quantidade</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {promotionType === 'buy_x_get_y' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Compra (qtd)</Label>
            <Input type="number" min={1} value={buyQty} onChange={(e) => setBuyQty(Math.max(1, +e.target.value || 1))} />
          </div>
          <div className="space-y-1">
            <Label>Ganha (qtd)</Label>
            <Input type="number" min={1} value={getQty} onChange={(e) => setGetQty(Math.max(1, +e.target.value || 1))} />
          </div>
          <div className="space-y-1">
            <Label>Desconto % nos "ganhos"</Label>
            <Input type="number" min={1} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(Math.max(1, Math.min(100, +e.target.value || 100)))} />
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Faixas de desconto</Label>
            <Button type="button" size="sm" variant="outline" onClick={addTier}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar faixa
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ex: 1 peça = 5%, 2 peças = 7%, 3 peças = 10%. O desconto vale sobre todos os itens da categoria e usa sempre a maior faixa alcançada.
          </p>
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">A partir de (qtd)</Label>
                  <Input type="number" min={1} value={t.qty}
                    onChange={(e) => updateTier(i, 'qty', Math.max(1, +e.target.value || 1))} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Desconto (%)</Label>
                  <Input type="number" min={1} max={100} value={t.percent}
                    onChange={(e) => updateTier(i, 'percent', Math.max(1, Math.min(100, +e.target.value || 1)))} />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeTier(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Início (opcional)</Label>
          <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Fim (opcional)</Label>
          <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Promoções (Compre X, Ganhe Y / Progressivo)
          </CardTitle>
          <CardDescription>
            Escolha uma categoria e o tipo de promoção. No modo "Compre X, Ganhe Y" os itens mais baratos recebem o desconto. No modo "Progressivo", quanto mais peças o cliente levar da categoria, maior o percentual de desconto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {FormFields}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">Criar promoção</span>
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma promoção criada ainda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Regra</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="w-[80px]">Ativa</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="secondary">{categoryName(p.category_id)}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {p.promotion_type === 'progressive_qty' ? 'Progressivo' : 'Compre X, Ganhe Y'}
                    </TableCell>
                    <TableCell className="text-sm">{describeRule(p)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.starts_at ? new Date(p.starts_at).toLocaleString('pt-BR') : 'sempre'}
                      {' → '}
                      {p.ends_at ? new Date(p.ends_at).toLocaleString('pt-BR') : 'sem fim'}
                    </TableCell>
                    <TableCell>
                      <Switch checked={p.is_active} onCheckedChange={() => handleToggle(p)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(p)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar promoção</DialogTitle>
          </DialogHeader>
          <div className="py-2">{FormFields}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialogElement}
    </>
  );
}
