import { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CalendarIcon, Trophy, Sparkles, Gift, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useTenantContext } from '@/contexts/TenantContext';
import { formatPhoneForDisplay } from '@/lib/phone-utils';
import { formatBrasiliaDate } from '@/lib/date-utils';

interface Candidate {
  customer_phone: string;
  customer_name: string;
  total_revenue: number;
  weight: number;
  probability: number;
  order_count: number;
}

interface Winner extends Candidate {
  order_id?: number;
  event_date: string;
  profile_image?: string;
}

const Sorteio = () => {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [eventDate, setEventDate] = useState<Date | undefined>();
  const [winner, setWinner] = useState<Winner | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [excludedPhones, setExcludedPhones] = useState<Set<string>>(new Set());

  // Candidatos filtrados (remove já sorteados na sessão)
  const activeCandidates = useMemo(() => {
    return candidates.filter(c => !excludedPhones.has(c.customer_phone));
  }, [candidates, excludedPhones]);

  // Recalcular probabilidades para candidatos ativos
  const candidatesWithProbability = useMemo(() => {
    const totalWeight = activeCandidates.reduce((sum, c) => sum + c.weight, 0);
    return activeCandidates.map(c => ({
      ...c,
      probability: totalWeight > 0 ? (c.weight / totalWeight) * 100 : 0,
    }));
  }, [activeCandidates]);

  // Buscar foto de perfil do WhatsApp via Z-API
  const getWhatsAppProfilePicture = async (phone: string): Promise<string> => {
    try {
      if (!tenantId) throw new Error('Tenant não identificado');
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      const { data, error } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
        body: { action: 'profile-picture', tenant_id: tenantId, phone: formattedPhone }
      });

      // Z-API retorna link:"null" (string) quando não encontra — tratar como falha
      if (!error && data?.link && data.link !== 'null' && !data.errorMessage) return data.link;
      if (!error && (data?.imgUrl || data?.image)) return data.imgUrl || data.image;
    } catch (error) {
      console.log('Erro ao buscar foto do WhatsApp:', error);
    }
    const lastDigits = phone.replace(/\D/g, '').slice(-2);
    return `https://ui-avatars.com/api/?name=${lastDigits}&background=9b59b6&color=fff&size=256&format=png&rounded=true&bold=true`;
  };

  // Carregar candidatos elegíveis
  const loadCandidates = async () => {
    if (!eventDate) {
      toast({ title: 'Erro', description: 'Selecione a data do evento', variant: 'destructive' });
      return;
    }

    setLoadingCandidates(true);
    setWinner(null);
    setExcludedPhones(new Set());

    try {
      const selectedDate = format(eventDate, 'yyyy-MM-dd');

      // Buscar todos os pedidos pagos da data
      const { data: paidOrders, error } = await supabaseTenant
        .from('orders')
        .select('id, customer_phone, customer_name, total_amount, event_date')
        .eq('is_paid', true)
        .eq('event_date', selectedDate);

      if (error) throw error;

      if (!paidOrders || paidOrders.length === 0) {
        toast({ title: 'Nenhum Pedido', description: 'Não há pedidos pagos para esta data.', variant: 'destructive' });
        setCandidates([]);
        return;
      }

      // Agrupar por telefone (cliente) e somar receita
      const customerMap = new Map<string, { name: string; revenue: number; count: number }>();

      for (const order of paidOrders) {
        const phone = order.customer_phone;
        const existing = customerMap.get(phone);
        if (existing) {
          existing.revenue += Number(order.total_amount);
          existing.count += 1;
          if (!existing.name && order.customer_name) existing.name = order.customer_name;
        } else {
          customerMap.set(phone, {
            name: order.customer_name || phone,
            revenue: Number(order.total_amount),
            count: 1,
          });
        }
      }

      // Buscar nomes de customers para quem não tem nome no pedido
      const phonesWithoutName = Array.from(customerMap.entries())
        .filter(([_, v]) => !v.name || v.name === _.toString())
        .map(([phone]) => phone);

      if (phonesWithoutName.length > 0) {
        const { data: customerData } = await supabaseTenant
          .from('customers')
          .select('phone, name');

        if (customerData) {
          for (const c of customerData) {
            const entry = customerMap.get(c.phone);
            if (entry && (!entry.name || entry.name === c.phone)) {
              entry.name = c.name;
            }
          }
        }
      }

      // Calcular pesos: Peso = 1.0 + (receita / 100) * 0.1
      const candidateList: Candidate[] = [];
      let totalWeight = 0;

      customerMap.forEach((value, phone) => {
        // Peso proporcional puro: quem gastou mais tem chance diretamente proporcional ao valor
        // Piso mínimo de R$ 1 para evitar peso zero em pedidos de valor irrisório
        const weight = Math.max(1, value.revenue);
        totalWeight += weight;
        candidateList.push({
          customer_phone: phone,
          customer_name: value.name,
          total_revenue: value.revenue,
          weight,
          probability: 0, // será recalculado
          order_count: value.count,
        });
      });

      // Calcular probabilidades
      const withProb = candidateList.map(c => ({
        ...c,
        probability: (c.weight / totalWeight) * 100,
      }));

      // Ordenar por peso decrescente
      withProb.sort((a, b) => b.weight - a.weight);

      setCandidates(withProb);

      toast({ title: 'Candidatos Carregados', description: `${withProb.length} clientes elegíveis encontrados.` });
    } catch (error: any) {
      console.error('Error loading candidates:', error);
      toast({ title: 'Erro', description: error?.message || 'Erro ao carregar candidatos', variant: 'destructive' });
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Sorteio ponderado (roleta)
  const performRaffle = async () => {
    if (candidatesWithProbability.length === 0) {
      toast({ title: 'Erro', description: 'Nenhum candidato disponível para sorteio.', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const totalWeight = candidatesWithProbability.reduce((sum, c) => sum + c.weight, 0);
      let random = Math.random() * totalWeight;

      let selected: Candidate | null = null;
      for (const candidate of candidatesWithProbability) {
        random -= candidate.weight;
        if (random <= 0) {
          selected = candidate;
          break;
        }
      }

      // Fallback
      if (!selected) selected = candidatesWithProbability[candidatesWithProbability.length - 1];

      // Buscar foto de perfil
      const profileImage = await getWhatsAppProfilePicture(selected.customer_phone);

      const selectedDate = format(eventDate!, 'yyyy-MM-dd');

      const winnerData: Winner = {
        ...selected,
        event_date: selectedDate,
        profile_image: profileImage,
      };

      setWinner(winnerData);

      // Adicionar à lista de excluídos para próximos giros na mesma sessão
      setExcludedPhones(prev => new Set([...prev, selected!.customer_phone]));

      // Atualizar ultimo_sorteio_ganho no banco
      try {
        await supabaseTenant
          .from('customers')
          .update({ ultimo_sorteio_ganho: new Date().toISOString() } as any)
          .eq('phone', selected.customer_phone);
      } catch (e) {
        console.log('Aviso: campo ultimo_sorteio_ganho pode não existir ainda:', e);
      }

      toast({ title: '🎉 Sorteio Realizado!', description: `${selected.customer_name} foi sorteado(a)!` });
    } catch (error: any) {
      console.error('Error performing raffle:', error);
      toast({ title: 'Erro', description: error?.message || 'Erro ao realizar sorteio', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const newRaffle = () => {
    setWinner(null);
    setCandidates([]);
    setExcludedPhones(new Set());
    setEventDate(undefined);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="container mx-auto py-6 max-w-[1600px] space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sorteio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Realize sorteios ponderados por valor de compra
          </p>
        </div>
        {(candidates.length > 0 || winner) && (
          <Button onClick={newRaffle} variant="outline" size="sm">
            Novo Sorteio
          </Button>
        )}
      </div>

      {/* 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Coluna 1: Configurações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configurações do Sorteio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data do Evento</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !eventDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {eventDate ? format(eventDate, "PPP", { locale: ptBR }) : "Selecionar data do evento"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={eventDate} onSelect={setEventDate} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <Button
              onClick={loadCandidates}
              disabled={loadingCandidates || !eventDate}
              className="w-full"
              size="lg"
            >
              {loadingCandidates ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />}
              {loadingCandidates ? 'Carregando...' : 'Calcular participantes'}
            </Button>

            <Separator />

            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 shrink-0" />
                <span>Apenas pedidos <strong className="text-foreground">PAGOS</strong> da data participam</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 shrink-0" />
                <span><strong className="text-foreground">Peso</strong> = Receita Paga (proporcional puro)</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 shrink-0" />
                <span>Quem compra mais tem <strong className="text-foreground">maior chance</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 shrink-0" />
                <span>Ganhadores são <strong className="text-foreground">removidos</strong> da roleta na sessão</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Coluna 2: Participantes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span>Participantes</span>
              {candidatesWithProbability.length > 0 && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                  {candidatesWithProbability.length} participantes
                </span>
              )}
            </CardTitle>
            {excludedPhones.size > 0 && (
              <p className="text-xs text-muted-foreground">{excludedPhones.size} já sorteado(s)</p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {candidatesWithProbability.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground text-center py-8">
                Selecione uma data e clique em "Calcular participantes"
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-foreground/10">
                    <TableHead className="text-xs uppercase tracking-wide">Cliente</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Rec. Paga</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">Peso</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">Prob.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidatesWithProbability.slice(0, 8).map((candidate) => (
                    <TableRow key={candidate.customer_phone} className="border-foreground/5">
                      <TableCell className="py-3">
                        <div className="font-medium text-sm">{candidate.customer_name}</div>
                      </TableCell>
                      <TableCell className="py-3 font-mono text-sm">
                        {formatCurrency(candidate.total_revenue)}
                      </TableCell>
                      <TableCell className="py-3 text-right font-mono text-sm">
                        {candidate.weight.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-3 text-right font-mono text-sm text-primary">
                        {candidate.probability.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {candidatesWithProbability.length > 8 && (
              <div className="px-6 py-3 text-xs italic text-muted-foreground">
                ... mais {candidatesWithProbability.length - 8} participantes
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coluna 3: Realizar Sorteio */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-center">Realizar Sorteio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-center py-4">
              <div className={cn(
                "w-40 h-40 rounded-full border-[6px] border-primary/30 bg-primary/5 flex items-center justify-center transition-transform",
                loading && "animate-spin border-primary"
              )}>
                {winner?.profile_image ? (
                  <img
                    src={winner.profile_image}
                    alt={winner.customer_name}
                    className="w-32 h-32 rounded-full object-cover"
                  />
                ) : (
                  <Trophy className="w-16 h-16 text-primary" strokeWidth={1.5} />
                )}
              </div>
            </div>

            <Button
              onClick={performRaffle}
              disabled={loading || candidatesWithProbability.length === 0}
              className="w-full"
              size="lg"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {loading ? 'Sorteando...' : 'Girar Roleta'}
            </Button>

            {winner && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center space-y-1">
                <div className="text-sm text-primary font-medium">🎉 Ganhadora</div>
                <div className="text-xl font-bold">{winner.customer_name}</div>
                <div className="text-sm text-muted-foreground">{formatPhoneForDisplay(winner.customer_phone)}</div>
                <div className="text-xs text-muted-foreground pt-1">
                  Receita: {formatCurrency(winner.total_revenue)} · Probabilidade: {winner.probability.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBrasiliaDate(winner.event_date)} · {winner.order_count} pedido(s)
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Sorteio;
