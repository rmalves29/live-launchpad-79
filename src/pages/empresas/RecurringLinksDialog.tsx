import { useEffect, useRef, useState } from 'react';
import { Copy, Link, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';

interface RecurringLink {
  id: string; name: string; price: number; cycles: number; url: string; created_at: string;
}

function errorMessage(data: Record<string, unknown>) {
  const parts = [String(data.error ?? 'Não foi possível completar a operação')];
  if (data.pagarme_error !== undefined) parts.push(JSON.stringify(data.pagarme_error, null, 2));
  if (data.plan_id) parts.push(`Plano: ${data.plan_id}`);
  if (data.url) parts.push(`Link criado: ${data.url}`);
  return parts.join('\n');
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('pagarme-recurring-links', { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      const detail = await response.json().catch(() => null);
      if (detail?.error) throw new Error(errorMessage(detail));
    }
    throw new Error(error.message);
  }
  if (!data?.success) throw new Error(errorMessage(data ?? {}));
  return data;
}

export function RecurringLinksDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cycles, setCycles] = useState('12');
  const [links, setLinks] = useState<RecurringLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!open) return;
    setError(null);
    setLoading(true);
    invoke({ action: 'list' }).then((data) => {
      if (generationRef.current === generation) setLinks(data.links);
    }).catch((err) => {
      if (generationRef.current === generation) setError(err.message);
    }).finally(() => {
      if (generationRef.current === generation) setLoading(false);
    });
    return () => { generationRef.current++; };
  }, [open]);

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const value = Number(price.replace(',', '.'));
    const count = Number(cycles);
    if (!name.trim() || !Number.isFinite(value) || value <= 0 || !Number.isInteger(count) || count <= 0) {
      setError('Informe nome, valor positivo e ciclos inteiros maiores que zero.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await invoke({ action: 'create', name: name.trim(), price: value, cycles: count });
      setName(''); setPrice(''); setCycles('12');
      const data = await invoke({ action: 'list' });
      setLinks(data.links);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Link className="h-4 w-4 mr-2" />Links recorrentes</Button></DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Links recorrentes</DialogTitle>
          <DialogDescription>Assinaturas Pagar.me · cartão de crédito · cobrança mensal</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 space-y-6 py-2">
          <form onSubmit={generate} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="recurring-name">Nome</Label><Input id="recurring-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} disabled={saving} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="recurring-price">Valor (R$)</Label><Input id="recurring-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required disabled={saving} /></div>
              <div className="space-y-2"><Label htmlFor="recurring-cycles">Ciclos</Label><Input id="recurring-cycles" type="number" min={1} step={1} value={cycles} onChange={(e) => setCycles(e.target.value)} required disabled={saving} /></div>
            </div>
            <Button type="submit" disabled={saving || loading}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link className="mr-2 h-4 w-4" />}Gerar link</Button>
          </form>
          {error && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap break-words">{error}</AlertDescription></Alert>}
          <section className="space-y-3">
            <h3 className="font-semibold">Links gerados</h3>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando links" /> : links.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum link gerado.</p> : links.map((item) => (
              <div key={item.id} className="border-b pb-3 space-y-2">
                <p className="font-medium break-words">{item.name}</p>
                <p className="text-sm text-muted-foreground">{Number(item.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · {item.cycles} ciclos · {new Date(item.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                <div className="flex items-start gap-2">
                  <a href={item.url.startsWith('https://') ? item.url : undefined} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline break-all flex-1 min-w-0">{item.url}</a>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try { await navigator.clipboard.writeText(item.url); setCopiedId(item.id); }
                    catch { setError('Não foi possível copiar o link.'); }
                  }}><Copy className="h-4 w-4 mr-2" />{copiedId === item.id ? 'Copiado' : 'Copiar'}</Button>
                </div>
              </div>
            ))}
          </section>
        </div>
        <div className="flex justify-end border-t pt-4"><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button></div>
      </DialogContent>
    </Dialog>
  );
}