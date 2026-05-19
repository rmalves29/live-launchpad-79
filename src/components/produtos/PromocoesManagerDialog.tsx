import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Gift } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { supabaseTenant } from '@/lib/supabase-tenant';

interface Categoria {
  id: string;
  name: string;
  is_active: boolean;
}

interface Promocao {
  id: string;
  name: string;
  category_id: string;
  buy_qty: number;
  get_qty: number;
  discount_percent: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PromocoesManagerDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { confirm, confirmDialogElement } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Promocao[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [saving, setSaving] = useState(false);

  // form
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [buyQty, setBuyQty] = useState(1);
  const [getQty, setGetQty] = useState(1);
  const [discountPercent, setDiscountPercent] = useState(100);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const resetForm = () => {
    setName('');
    setCategoryId('');
    setBuyQty(1);
    setGetQty(1);
    setDiscountPercent(100);
    setStartsAt('');
    setEndsAt('');
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

  useEffect(() => {
    if (open) load();
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim() || !categoryId) {
      toast({ title: 'Preencha nome e categoria', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const tenantId = (supabaseTenant as any).getTenantId?.();
      const { error } = await (supabaseTenant as any).from('product_promotions').insert({
        tenant_id: tenantId,
        name: name.trim(),
        category_id: categoryId,
        buy_qty: buyQty,
        get_qty: getQty,
        discount_percent: discountPercent,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        is_active: true,
      });
      if (error) throw error;
      resetForm();
      await load();
      toast({ title: 'Promoção criada' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao criar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p: Promocao) => {
    try {
      const { error } = await (supabaseTenant as any)
        .from('product_promotions')
        .update({ is_active: !p.is_active })
        .eq('id', p.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao atualizar', variant: 'destructive' });
    }
  };

  const handleDelete = async (p: Promocao) => {
    const ok = await confirm({
      description: `Excluir promoção "${p.name}"?`,
      confirmText: 'Excluir',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const { error } = await (supabaseTenant as any)
        .from('product_promotions')
        .delete()
        .eq('id', p.id);
      if (error) throw error;
      await load();
      toast({ title: 'Promoção removida' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao excluir', variant: 'destructive' });
    }
  };

  const categoryName = (id: string) => categorias.find((c) => c.id === id)?.name || '—';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Promoções BOGO (Compre X, Ganhe Y)
            </DialogTitle>
            <DialogDescription>
              Defina uma categoria e quantos itens o cliente ganha ao comprar uma quantidade mínima. Os itens mais baratos do grupo recebem o desconto.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-3 border-b">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                placeholder="Ex: Compre 1 Ganhe 1 - Anéis"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.filter((c) => c.is_active).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <div className="space-y-1">
              <Label>Início (opcional)</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-1">
              <Label>Fim (opcional)</Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={handleCreate} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-2">Criar promoção</span>
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pt-2">
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
                    <TableHead>Regra</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="w-[80px]">Ativa</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{categoryName(p.category_id)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        Compra {p.buy_qty}, ganha {p.get_qty} {p.discount_percent === 100 ? 'grátis' : `com ${p.discount_percent}% off`}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.starts_at ? new Date(p.starts_at).toLocaleDateString('pt-BR') : 'sempre'}
                        {' → '}
                        {p.ends_at ? new Date(p.ends_at).toLocaleDateString('pt-BR') : 'sem fim'}
                      </TableCell>
                      <TableCell>
                        <Switch checked={p.is_active} onCheckedChange={() => handleToggle(p)} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(p)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialogElement}
    </>
  );
}
