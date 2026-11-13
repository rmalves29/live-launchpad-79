/**
 * Olist ERP: depósito do estoque e produtos.
 *  - Depósito: de onde vem o saldo (como no Bling).
 *  - Buscar: traz os produtos e o saldo da Olist, mostra o que é novo / já existe / já está vinculado e ATUALIZA o estoque do Cartzy
 *    pelo código ERP (SKU da Olist = sku_erp do Cartzy). A Olist só é lida aqui, nada é escrito nela.
 *  - Importar: cria no Cartzy os produtos novos escolhidos (ou só vincula quando o código já existe).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Search, Download, RefreshCw, AlertTriangle, Warehouse } from 'lucide-react';

type Deposit = { id: number; nome: string; padrao: boolean; desconsidera_saldo: boolean };
type Row = { olist_id: number; sku: string; nome: string; preco: number; tipo: string; variacao: string; saldo: number; status: 'novo' | 'existe' | 'vinculado'; cartzy_id: number | null };

const MAX_LOOPS = 300;
const PAGE_SIZE = 50;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const chunk = <T,>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

export default function OlistStockPanel({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [search, setSearch] = useState('');
  const [withZero, setWithZero] = useState(false); // trazer também os produtos sem estoque na Olist
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [depositPick, setDepositPick] = useState('');
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const cancelRef = useRef(false);

  async function call(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('olist-products', { body: { tenant_id: tenantId, ...body } });
    if (error) throw new Error((data as any)?.error || error.message || 'Erro ao falar com o servidor');
    if (!data?.success) throw new Error(data?.error || 'A Olist não respondeu como esperado');
    return data;
  }

  const { data: dep, isLoading: depLoading, error: depError, refetch: refetchDep } = useQuery({
    queryKey: ['olist-deposits', tenantId],
    queryFn: async () => (await call({ action: 'deposits' })) as { deposits: Deposit[]; selected: { id: number; nome: string } | null },
    enabled: !!tenantId,
    retry: false,
  });

  // ao abrir, mostra o catálogo que já foi buscado antes (sem falar com a Olist)
  useEffect(() => {
    if (!tenantId) return;
    let off = false;
    (async () => {
      try {
        const r = await call({ action: 'catalog_load' });
        if (off || !r.rows?.length) return;
        const list: Row[] = (r.rows as any[]).filter((p) => p.variacao !== 'P').map((p) => ({ ...p, status: 'novo' as const, cartzy_id: null }));
        const st = new Map<number, { status: Row['status']; cartzy_id: number | null }>();
        for (const part of chunk(list, 400)) {
          const s = await call({ action: 'statuses', items: part.map((p) => ({ olist_id: p.olist_id, sku: p.sku })) });
          for (const x of s.statuses) st.set(x.olist_id, x);
        }
        if (off) return;
        setRows(list.map((p) => ({ ...p, ...(st.get(p.olist_id) || {}) }) as Row));
        setSyncedAt(r.synced_at || null);
      } catch { /* sem catálogo guardado ainda */ }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function saveDeposit() {
    const id = Number(depositPick || dep?.selected?.id);
    if (!id) return;
    setSavingDeposit(true);
    try {
      await call({ action: 'set_deposit', deposit_id: id });
      toast.success('Depósito salvo.');
      await refetchDep();
      queryClient.invalidateQueries({ queryKey: ['olist-status-v3', tenantId] });
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar o depósito'); } finally { setSavingDeposit(false); }
  }

  // Atualiza o estoque do Cartzy (só dos produtos que já existem, pelo código ERP) com o saldo já lido.
  async function applyStock() {
    const alvos = rows.filter((p) => p.status !== 'novo');
    if (!alvos.length) { toast.message('Nenhum produto existente para atualizar.'); return; }
    setLoading(true); cancelRef.current = false;
    try {
      const stock = new Map<number, number>();
      for (let off = 0, i = 0; i < MAX_LOOPS && !cancelRef.current; i++) {
        setProgress(`Lendo o estoque da Olist… ${stock.size}`);
        const r = await call({ action: 'stock_page', offset: off });
        for (const s of r.rows as Array<{ olist_id: number; saldo: number }>) stock.set(s.olist_id, s.saldo);
        if (!r.has_more) break;
        off += 100;
      }
      const comSaldo = rows.map((p) => ({ ...p, saldo: stock.get(p.olist_id) ?? 0 }));
      setRows(comSaldo);
      for (const part of chunk(comSaldo, 400)) await call({ action: 'catalog_save', started_at: syncedAt || new Date().toISOString(), items: part });
      let updated = 0, linked = 0;
      for (const part of chunk(alvos, 300)) {
        setProgress('Atualizando o estoque do Cartzy…');
        const r = await call({ action: 'apply_stock', items: part.map((p) => ({ olist_id: p.olist_id, sku: p.sku, saldo: stock.get(p.olist_id) ?? 0 })) });
        updated += r.updated || 0; linked += r.linked || 0;
      }
      toast.success(`Estoque atualizado no Cartzy em ${updated} produto(s)${linked ? ` e ${linked} vinculado(s) pelo código ERP` : ''}.`);
    } catch (e: any) { toast.error(e?.message || 'Erro ao atualizar o estoque'); } finally { setLoading(false); setProgress(''); }
  }

  // Busca na Olist a foto dos produtos já vinculados que estão sem foto no Cartzy.
  async function syncImages() {
    setLoading(true); cancelRef.current = false;
    try {
      setProgress('Procurando produtos sem foto…');
      const { ids } = (await call({ action: 'images_pending' })) as { ids: number[] };
      if (!ids.length) { toast.message('Todos os produtos vinculados já têm foto.'); return; }
      let updated = 0, semFoto = 0;
      for (const part of chunk(ids, 25)) {
        if (cancelRef.current) break;
        setProgress(`Buscando fotos… ${updated + semFoto} de ${ids.length}`);
        const r = await call({ action: 'sync_images', ids: part });
        updated += r.updated || 0; semFoto += r.sem_foto || 0;
      }
      toast.success(`Fotos gravadas em ${updated} produto(s)${semFoto ? `; ${semFoto} não têm foto na Olist` : ''}.`);
    } catch (e: any) { toast.error(e?.message || 'Erro ao buscar as fotos'); } finally { setLoading(false); setProgress(''); }
  }

  // Busca os PRODUTOS da Olist (página por página) e o saldo do depósito escolhido, e confere o que já existe no Cartzy. Não grava nada.
  async function load() {
    setLoading(true); cancelRef.current = false; setRows([]); setSelected(new Set());
    const startedAt = new Date().toISOString();
    let completed = false;
    try {
      setProgress('Lendo os produtos da Olist…');
      const list: Row[] = [];
      for (let off = 0, i = 0; i < MAX_LOOPS && !cancelRef.current; i++) {
        const r = await call({ action: 'products_page', offset: off });
        for (const p of r.rows as any[]) {
          if (p.variacao === 'P') continue; // pai de variações não tem estoque próprio: entram as variações
          list.push({ ...p, saldo: 0, status: 'novo', cartzy_id: null });
        }
        setProgress(`Lendo os produtos da Olist… ${list.length}`);
        if (!r.has_more) { completed = true; break; }
        off += 100;
      }
      setProgress('Conferindo o que já existe no Cartzy…');
      const st = new Map<number, { status: Row['status']; cartzy_id: number | null }>();
      for (const part of chunk(list, 400)) {
        const r = await call({ action: 'statuses', items: part.map((p) => ({ olist_id: p.olist_id, sku: p.sku })) });
        for (const s of r.statuses) st.set(s.olist_id, s);
      }
      let merged = list.map((p) => ({ ...p, ...(st.get(p.olist_id) || {}) }) as Row);
      // saldo do depósito (só leitura): necessário para saber quais produtos têm estoque
      const stock = new Map<number, number>();
      for (let off = 0, i = 0; i < MAX_LOOPS && !cancelRef.current; i++) {
        setProgress(`Lendo o saldo do depósito… ${stock.size}`);
        const r = await call({ action: 'stock_page', offset: off });
        for (const x of r.rows as Array<{ olist_id: number; saldo: number }>) stock.set(x.olist_id, x.saldo);
        if (!r.has_more) break;
        off += 100;
      }
      merged = merged.map((p) => ({ ...p, saldo: stock.get(p.olist_id) ?? 0 }));
      // sem a opção ligada, produto novo sem estoque na Olist não vem (os que já estão no Cartzy ficam, para o estoque poder zerar)
      if (!withZero) merged = merged.filter((p) => p.saldo > 0 || p.status !== 'novo');
      setRows(merged); setPage(0);
      setProgress('Guardando o catálogo…');
      for (const part of chunk(merged, 400)) await call({ action: 'catalog_save', started_at: startedAt, items: part });
      if (completed) { await call({ action: 'catalog_finish', started_at: startedAt }); setSyncedAt(new Date().toISOString()); }

      toast.success(`${merged.length} produtos lidos da Olist (${merged.filter((p) => p.status === 'novo').length} novos). Escolha os que quer importar.`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao buscar na Olist');
    } finally { setLoading(false); setProgress(''); }
  }

  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (!words.length) return true;
      const t = `${r.nome} ${r.sku}`.toLowerCase();
      return words.every((w) => t.includes(w));
    });
  }, [rows, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const shown = filtered.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);
  const importable = shown.filter((r) => r.status !== 'vinculado');

  function toggle(id: number) { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  async function importSelected() {
    const items = rows.filter((r) => selected.has(r.olist_id) && r.status !== 'vinculado');
    if (!items.length) return;
    setImporting(true);
    try {
      let created = 0, linked = 0, failed = 0;
      const done = new Set<number>();
      for (const part of chunk(items, 40)) {
        const r = await call({ action: 'import', sale_type: 'AMBOS', items: part.map((p) => ({ olist_id: p.olist_id, sku: p.sku, nome: p.nome, preco: p.preco, saldo: p.saldo })) });
        for (const x of r.results as any[]) {
          if (x.status === 'criado') { created++; done.add(x.olist_id); }
          else if (x.status === 'vinculado' || x.status === 'ja_vinculado') { linked++; done.add(x.olist_id); }
          else failed++;
        }
      }
      setRows((prev) => prev.map((r) => (done.has(r.olist_id) ? { ...r, status: 'vinculado' as const } : r)));
      setSelected(new Set());
      toast.success(`Importação concluída: ${created} criado(s), ${linked} vinculado(s)${failed ? `, ${failed} com erro` : ''}.`);
    } catch (e: any) { toast.error(e?.message || 'Erro ao importar'); } finally { setImporting(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Warehouse className="h-4 w-4" /> Depósito do estoque</CardTitle>
          <CardDescription>O saldo disponível (já descontado o reservado) deste depósito da Olist vira o estoque do produto no Cartzy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {depLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {depError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{(depError as Error).message}</AlertDescription>
            </Alert>
          )}
          {dep && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-10 min-w-[240px] rounded-md border bg-background px-3 text-sm"
                value={depositPick || String(dep.selected?.id || '')}
                onChange={(e) => setDepositPick(e.target.value)}
              >
                <option value="">Escolha um depósito</option>
                {dep.deposits.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}{d.padrao ? ' (padrão)' : ''}{d.desconsidera_saldo ? ' — não conta saldo' : ''}</option>
                ))}
              </select>
              <Button onClick={saveDeposit} disabled={savingDeposit || !(depositPick || dep.selected)}>
                {savingDeposit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar depósito
              </Button>
              <Button variant="ghost" size="icon" onClick={() => refetchDep()} aria-label="Atualizar depósitos"><RefreshCw className="h-4 w-4" /></Button>
              {dep.selected && <Badge variant="secondary">Atual: {dep.selected.nome}</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Download className="h-4 w-4" /> Produtos da Olist</CardTitle>
          <CardDescription>
            <b>Buscar produtos</b> lista os produtos da Olist para você importar os novos no Cartzy.
            <b>Atualizar estoque no Cartzy</b> grava o saldo nos produtos que já existem (pelo código ERP). Nada é escrito na Olist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={load} disabled={loading || !dep?.selected}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Buscar produtos
            </Button>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={withZero} onCheckedChange={(v) => setWithZero(v === true)} disabled={loading} />Trazer também produtos sem estoque</label>
            {rows.length > 0 && !loading && <Button variant="outline" onClick={applyStock}>Atualizar estoque no Cartzy</Button>}
            {!loading && <Button variant="outline" onClick={syncImages}>Buscar fotos dos produtos</Button>}
            {loading && <Button variant="outline" onClick={() => { cancelRef.current = true; }}>Parar</Button>}
            {loading && <span className="text-sm text-muted-foreground">{progress}</span>}
            {!loading && syncedAt && rows.length > 0 && <span className="text-sm text-muted-foreground">Catálogo guardado em {new Date(syncedAt).toLocaleString('pt-BR')}</span>}
            {!dep?.selected && !loading && <span className="text-sm text-muted-foreground">Escolha e salve o depósito primeiro.</span>}
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Input className="max-w-sm" placeholder="Filtrar por nome ou código…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
                                <span className="text-sm text-muted-foreground">{filtered.length} produto(s) · página {cur + 1} de {pages}</span>
                <Button size="sm" onClick={importSelected} disabled={importing || selected.size === 0}>
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Importar selecionados ({selected.size})
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="w-10 p-2">
                        <Checkbox
                          checked={importable.length > 0 && importable.every((r) => selected.has(r.olist_id))}
                          onCheckedChange={(v) => setSelected(v === true ? new Set(importable.map((r) => r.olist_id)) : new Set())}
                          aria-label="Selecionar todos"
                        />
                      </th>
                      <th className="p-2">Produto (código da Olist)</th><th className="p-2 text-right">Preço</th><th className="p-2 text-right">Estoque (após atualizar)</th><th className="p-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.olist_id} className="border-t">
                        <td className="p-2"><Checkbox disabled={r.status === 'vinculado'} checked={selected.has(r.olist_id)} onCheckedChange={() => toggle(r.olist_id)} aria-label={`Selecionar ${r.nome}`} /></td>
                        <td className="p-2"><div className="font-medium">{r.nome}</div><div className="text-xs text-muted-foreground">{r.sku || 'sem código'}</div></td>
                        <td className="p-2 text-right">{brl(r.preco)}</td>
                        <td className="p-2 text-right">{r.saldo}</td>
                        <td className="p-2">
                          {r.status === 'vinculado' ? <Badge variant="secondary">Já no Cartzy</Badge>
                            : r.status === 'existe' ? <Badge className="bg-amber-500 hover:bg-amber-500">Vincular</Badge>
                            : <Badge>Novo</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Anterior</Button>
                  <span className="text-sm text-muted-foreground">Página {cur + 1} de {pages}</span>
                  <Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Próxima</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
