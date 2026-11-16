import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Truck } from 'lucide-react';

export default function FreteBaratoIntegration({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [platform, setPlatform] = useState('');
  const [fromCep, setFromCep] = useState('');
  const [token, setToken] = useState('');
  const [cep, setCep] = useState('');
  const [busy, setBusy] = useState(false);
  const [quotes, setQuotes] = useState<Array<{ id: string; name: string; price: number; delivery_time: string }>>([]);
  const invoke = async (action: string, values = {}) => {
    const { data, error } = await supabase.functions.invoke('fretebarato-settings', { body: { action, tenant_id: tenantId, ...values } });
    if (error || !data?.success) throw new Error(data?.error || 'Não foi possível acessar a configuração do Frete Barato.');
    return data;
  };
  const { data: settings, isLoading, error } = useQuery({ queryKey: ['fretebarato-integration', tenantId], queryFn: () => invoke('get'), enabled: !!tenantId });
  useEffect(() => {
    setCustomerId(settings?.customerId ?? ''); setPlatform(settings?.platform ?? ''); setFromCep(settings?.fromCep ?? ''); setToken(''); setQuotes([]);
  }, [settings, tenantId]);
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); } catch (e) { toast({ title: 'Frete Barato', description: e instanceof Error ? e.message : 'Tente novamente.', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;
  if (error) return <Alert variant="destructive"><AlertDescription>Não foi possível carregar o Frete Barato. Confira se a integração foi publicada e tente novamente.</AlertDescription></Alert>;
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />Frete Barato</CardTitle>
      <CardDescription>Cotação de preço e prazo no checkout. Informe o mesmo CEP de origem usado na sua loja para obter as tarifas corretas.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="fb-active">Disponível no checkout</Label>
        <Switch id="fb-active" checked={Boolean(settings?.isActive)} disabled={busy || !settings?.configured} onCheckedChange={isActive => action(async () => {
          await invoke('toggle', { isActive }); await queryClient.invalidateQueries({ queryKey: ['fretebarato-integration', tenantId] });
          toast({ title: isActive ? 'Frete Barato ativado' : 'Frete Barato desativado' });
        })} />
      </div>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); action(async () => {
        await invoke('save', { customerId, platform, fromCep, token }); setToken('');
        await queryClient.invalidateQueries({ queryKey: ['fretebarato-integration', tenantId] });
        toast({ title: 'Configuração salva', description: 'Ative a integração para disponibilizar as cotações no checkout.' });
      }); }}>
        <div className="space-y-2"><Label htmlFor="fb-origin">CEP de origem dos envios</Label><Input id="fb-origin" value={fromCep} onChange={e => setFromCep(e.target.value)} inputMode="numeric" maxLength={9} placeholder="00000-000" /><p className="text-xs text-muted-foreground">CEP de onde os pedidos são despachados. Deve ser o mesmo cadastrado na Nuvemshop; não informe o CEP da cliente.</p></div>
        <div className="space-y-2"><Label htmlFor="fb-customer">Customer ID</Label><Input id="fb-customer" value={customerId} onChange={e => setCustomerId(e.target.value)} required={!/^https:\/\//i.test(platform.trim())} maxLength={80} autoCapitalize="none" spellCheck={false} /><p className="text-xs text-muted-foreground">Copie o identificador completo, incluindo letras. Se colar o link de cotação abaixo, deixe este campo vazio para usar o ID do link.</p></div>
        <div className="space-y-2"><Label htmlFor="fb-platform">Identificação da plataforma ou link de cotação</Label><Input id="fb-platform" value={platform} onChange={e => setPlatform(e.target.value)} required maxLength={256} autoCapitalize="none" spellCheck={false} /><p className="text-xs text-muted-foreground">Use o identificador ou cole o link completo de cotação informado pelo Frete Barato.</p></div>
        <div className="space-y-2"><Label htmlFor="fb-token">Token de acesso</Label><Input id="fb-token" type="password" autoComplete="new-password" value={token} onChange={e => setToken(e.target.value)} required={!settings?.hasToken} maxLength={4000} placeholder={settings?.hasToken ? 'Token salvo — deixe vazio para manter' : 'Token fornecido pelo Frete Barato'} /></div>
        <Button type="submit" disabled={busy || (!customerId.trim() && !/^https:\/\//i.test(platform.trim())) || !platform.trim() || (!settings?.hasToken && !token.trim())}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar configuração</Button>
      </form>
      <Alert><AlertDescription>Até duas integrações de frete podem ficar ativas por loja. Nesta etapa, o Frete Barato calcula frete; etiquetas e envio de notas fiscais não estão incluídos.</AlertDescription></Alert>
      <div className="border-t pt-4 space-y-3">
        <Label htmlFor="fb-test-cep">CEP para testar a cotação</Label>
        <Input id="fb-test-cep" value={cep} onChange={e => { setCep(e.target.value); setQuotes([]); }} inputMode="numeric" maxLength={9} placeholder="00000-000" />
        <p className="text-xs text-muted-foreground">Teste com um pacote de 300 g, 20 × 16 × 2 cm e valor de R$ 50,00.</p>
        <Button variant="outline" disabled={busy || !settings?.isActive || cep.replace(/\D/g, '').length !== 8} onClick={() => action(async () => {
          setQuotes([]);
          const { data, error } = await supabase.functions.invoke('fretebarato-shipping', { body: { tenant_id: tenantId, to_postal_code: cep, products: [{ id: 'teste', quantity: 1, weight: 0.3, length: 20, width: 16, height: 2, insurance_value: 50 }] } });
          if (error || !data?.success) throw new Error(data?.error || 'Não foi possível consultar o Frete Barato.');
          setQuotes(data.shipping_options ?? []);
          if (!data.shipping_options?.length) toast({ title: 'Nenhuma opção disponível para este teste.' });
        })}>Testar cotação</Button>
        {quotes.map(q => <div key={q.id} className="flex justify-between gap-3 border rounded p-3 text-sm"><span>{q.name} · {q.delivery_time}</span><strong>{Number(q.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>)}
      </div>
    </CardContent>
  </Card>;
}
