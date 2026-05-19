import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, FolderTree } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { supabaseTenant } from '@/lib/supabase-tenant';

interface Categoria {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  products_count?: number;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default function CategoriasManager() {
  const { toast } = useToast();
  const { confirm, confirmDialogElement } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Categoria[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabaseTenant as any)
        .from('product_categories')
        .select('id, name, slug, is_active')
        .order('name', { ascending: true });
      if (error) throw error;

      const ids = (data || []).map((c: any) => c.id);
      const counts: Record<string, number> = {};
      if (ids.length) {
        const { data: prods } = await (supabaseTenant as any)
          .from('products').select('category_id').in('category_id', ids);
        (prods || []).forEach((p: any) => {
          if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
        });
      }
      setItems((data || []).map((c: any) => ({ ...c, products_count: counts[c.id] || 0 })));
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao carregar', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const tenantId = (supabaseTenant as any).getTenantId?.();
      const { error } = await (supabaseTenant as any)
        .from('product_categories')
        .insert({ name, slug: slugify(name), tenant_id: tenantId, is_active: true });
      if (error) throw error;
      setNewName('');
      await load();
      toast({ title: 'Categoria criada' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao criar', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (cat: Categoria) => {
    try {
      const { error } = await (supabaseTenant as any)
        .from('product_categories').update({ is_active: !cat.is_active }).eq('id', cat.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao atualizar', variant: 'destructive' });
    }
  };

  const handleDelete = async (cat: Categoria) => {
    const ok = await confirm({
      description: `Excluir categoria "${cat.name}"? Os produtos vinculados ficarão sem categoria.`,
      confirmText: 'Excluir', variant: 'destructive',
    });
    if (!ok) return;
    try {
      const { error } = await (supabaseTenant as any)
        .from('product_categories').delete().eq('id', cat.id);
      if (error) throw error;
      await load();
      toast({ title: 'Categoria removida' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao excluir', variant: 'destructive' });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            Categorias de produtos
          </CardTitle>
          <CardDescription>
            Agrupe produtos (ex: "Anéis", "Promo") para aplicar promoções em lote.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nova categoria (ex: Anéis)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">Criar</span>
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma categoria criada ainda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-[120px]">Produtos</TableHead>
                  <TableHead className="w-[100px]">Ativa</TableHead>
                  <TableHead className="w-[80px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.products_count}</TableCell>
                    <TableCell>
                      <Switch checked={c.is_active} onCheckedChange={() => handleToggle(c)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {confirmDialogElement}
    </>
  );
}
