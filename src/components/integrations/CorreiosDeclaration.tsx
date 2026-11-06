/**
 * Declaração de conteúdo dos pedidos (A4 ou etiqueta térmica 10x15), dentro da tela de Etiquetas dos Correios.
 * O remetente vem dos dados da empresa (Configurações > Empresa); o destinatário, do pedido; os itens, do carrinho do pedido.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2, Info, AlertTriangle } from 'lucide-react';
import { printDeclarations, formatCepBr, type DeclarationData, type DeclarationFormat } from '@/lib/content-declaration';

interface Props {
  tenantId: string;
}

interface OrderRow {
  id: number;
  customer_name: string | null;
  customer_phone: string;
  customer_cep: string | null;
  customer_street: string | null;
  customer_number: string | null;
  customer_complement: string | null;
  customer_neighborhood: string | null;
  customer_city: string | null;
  customer_state: string | null;
  cart_id: number | null;
  total_amount: number;
  observation: string | null;
  created_at: string | null;
}

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// pedidos de retirada na loja não são postados
const isPickup = (o: OrderRow) => /retirada|retirar/i.test(o.observation || '');

export default function CorreiosDeclaration({ tenantId }: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<DeclarationFormat>('a4');
  const [hidePickup, setHidePickup] = useState(true);
  const [printing, setPrinting] = useState(false);

  const { data: company } = useQuery({
    queryKey: ['declaration-company', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('name, company_name, company_document, company_address, company_number, company_complement, company_district, company_city, company_state, company_cep')
        .eq('id', tenantId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!tenantId,
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ['declaration-orders', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_name, customer_phone, customer_cep, customer_street, customer_number, customer_complement, customer_neighborhood, customer_city, customer_state, cart_id, total_amount, observation, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_paid', true)
        .or('is_cancelled.is.null,is_cancelled.eq.false')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as OrderRow[];
    },
    enabled: !!tenantId,
  });

  const shown = useMemo(() => (orders || []).filter((o) => !(hidePickup && isPickup(o))), [orders, hidePickup]);

  const missingCompany = useMemo(() => {
    if (!company) return [] as string[];
    const miss: string[] = [];
    if (!company.company_name && !company.name) miss.push('nome da empresa');
    if (!company.company_document) miss.push('CPF/CNPJ');
    if (!company.company_address) miss.push('endereço');
    if (!company.company_city || !company.company_state) miss.push('cidade/UF');
    if (!company.company_cep) miss.push('CEP');
    return miss;
  }, [company]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const allSelected = shown.length > 0 && shown.every((o) => selected.has(o.id));

  async function handlePrint() {
    if (!company || missingCompany.length) return;
    const chosen = shown.filter((o) => selected.has(o.id));
    if (!chosen.length) return;
    setPrinting(true);
    try {
      const cartIds = chosen.map((o) => o.cart_id).filter((x): x is number => x != null);
      const phones = [...new Set(chosen.map((o) => o.customer_phone).filter(Boolean))];

      const [itemsRes, cpfRes, setRes] = await Promise.all([
        cartIds.length
          ? supabase.from('cart_items').select('cart_id, product_name, product_code, qty, unit_price').in('cart_id', cartIds)
          : Promise.resolve({ data: [], error: null } as any),
        phones.length
          ? supabase.from('customers').select('phone, cpf').eq('tenant_id', tenantId).in('phone', phones)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from('app_settings').select('default_weight_kg').limit(1).maybeSingle(),
      ]);
      if (itemsRes.error) throw itemsRes.error;

      const itemsByCart = new Map<number, any[]>();
      for (const it of (itemsRes.data || []) as any[]) {
        itemsByCart.set(it.cart_id, [...(itemsByCart.get(it.cart_id) || []), it]);
      }
      const cpfByPhone = new Map<string, string>();
      for (const c of (cpfRes.data || []) as any[]) if (c.cpf) cpfByPhone.set(c.phone, c.cpf);
      const unitWeight = Number((setRes.data as any)?.default_weight_kg) > 0 ? Number((setRes.data as any).default_weight_kg) : 0.01;

      const list: DeclarationData[] = [];
      const skipped: number[] = [];
      for (const o of chosen) {
        const its = o.cart_id != null ? itemsByCart.get(o.cart_id) || [] : [];
        if (!its.length || !o.customer_cep || !o.customer_city || !o.customer_state) { skipped.push(o.id); continue; }
        const qty = its.reduce((s, i) => s + (Number(i.qty) || 1), 0);
        list.push({
          orderId: o.id,
          weightKg: Math.max(0.01, qty * unitWeight),
          sender: {
            name: company.company_name || company.name,
            document: company.company_document,
            street: company.company_address,
            number: company.company_number,
            complement: company.company_complement,
            district: company.company_district,
            city: company.company_city,
            state: company.company_state,
            cep: company.company_cep,
          },
          recipient: {
            name: o.customer_name || 'Cliente',
            document: cpfByPhone.get(o.customer_phone) || null,
            street: o.customer_street || '',
            number: o.customer_number,
            complement: o.customer_complement,
            district: o.customer_neighborhood,
            city: o.customer_city,
            state: o.customer_state,
            cep: o.customer_cep,
          },
          items: its.map((i) => ({
            description: String(i.product_name || i.product_code || 'Produto'),
            quantity: Number(i.qty) || 1,
            unitValue: Number(i.unit_price) || 0,
          })),
        });
      }

      if (!list.length) {
        toast({ title: 'Nada para imprimir', description: 'Os pedidos escolhidos não têm itens ou endereço completo.', variant: 'destructive' });
        return;
      }
      printDeclarations(list, format);
      if (skipped.length) {
        toast({
          title: `${list.length} declaração(ões) enviada(s) para impressão`,
          description: `Pedido(s) sem itens ou endereço completo, ignorado(s): ${skipped.map((n) => `#${n}`).join(', ')}.`,
        });
      }
    } catch (e: any) {
      toast({ title: 'Erro ao montar a declaração', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Declaração de conteúdo
        </CardTitle>
        <CardDescription>
          Imprima a declaração dos pedidos pagos, com os produtos reais de cada pedido. Escolha folha A4 ou etiqueta térmica 10x15.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Use a declaração apenas nos pedidos <b>sem nota fiscal</b>. Pedido com nota fiscal segue com a nota.
          </AlertDescription>
        </Alert>

        {missingCompany.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Faltam dados da empresa para o remetente: <b>{missingCompany.join(', ')}</b>. Preencha em Configurações &gt; Empresa.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="decl_format">Formato</Label>
            <select
              id="decl_format"
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value as DeclarationFormat)}
            >
              <option value="a4">Folha A4</option>
              <option value="thermal">Etiqueta térmica 10x15</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
            <Checkbox checked={hidePickup} onCheckedChange={(v) => setHidePickup(v === true)} aria-label="Ocultar retirada na loja" />
            Ocultar retirada na loja
          </label>
          <Button onClick={handlePrint} disabled={printing || selected.size === 0 || missingCompany.length > 0} className="ml-auto">
            {printing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Imprimir declaração ({selected.size})
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pedido pago encontrado.</p>
        ) : (
          <div className="rounded-lg border">
            <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v === true ? new Set(shown.map((o) => o.id)) : new Set())}
                aria-label="Marcar todos os pedidos"
              />
              <span className="flex-1">Pedido</span>
              <span className="w-24 text-right">Total</span>
            </div>
            <ul className="divide-y max-h-[420px] overflow-auto">
              {shown.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} aria-label={`Selecionar pedido ${o.id}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">Pedido #{o.id} · {o.customer_name || o.customer_phone}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.customer_city || '?'}/{o.customer_state || '?'} · CEP {formatCepBr(o.customer_cep)}
                    </p>
                  </div>
                  <span className="w-24 text-right text-sm tabular-nums">{brl(o.total_amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
