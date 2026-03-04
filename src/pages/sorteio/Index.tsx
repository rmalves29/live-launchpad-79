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

      if (!error && data?.link) return data.link;
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
        const weight = 1.0 + (value.revenue / 100) * 0.1;
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
    <div className="container mx-auto py-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center">
          <Trophy className="h-8 w-8 mr-3 text-primary" />
          Sorteio Ponderado
        </h1>
        {(candidates.length > 0 || winner) && (
          <Button onClick={newRaffle} variant="outline">
            Novo Sorteio
          </Button>
        )}
      </div>

      {/* Configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Sparkles className="h-5 w-5 mr-2" />
            Configuração
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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
              {loadingCandidates ? 'Carregando...' : 'Carregar Candidatos'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Regras */}
      <Card>
        <CardHeader>
          <CardTitle>Regras do Sorteio Ponderado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full" />
              <span>Apenas pedidos <strong>PAGOS</strong> da data selecionada participam</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full" />
              <span><strong>Peso</strong> = 1.0 + (Receita Paga ÷ 100) × 0.1</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full" />
              <span>Quem compra mais tem <strong>maior chance</strong>, mas todos participam</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full" />
              <span>Ganhadores são <strong>removidos automaticamente</strong> da roleta na mesma sessão</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Candidatos */}
      {candidatesWithProbability.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Participantes ({candidatesWithProbability.length})
              </span>
              {excludedPhones.size > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {excludedPhones.size} já sorteado(s)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-foreground/20">
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Receita Paga</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead className="text-right">Probabilidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidatesWithProbability.map((candidate, index) => (
                  <TableRow key={candidate.customer_phone} className="border-foreground/10">
                    <TableCell>
                      <div>
                        <div className="font-medium">{candidate.customer_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {formatPhoneForDisplay(candidate.customer_phone)}
                          {candidate.order_count > 1 && ` · ${candidate.order_count} pedidos`}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(candidate.total_revenue)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {candidate.weight.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(candidate.probability, 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-sm min-w-[3rem] text-right">
                          {candidate.probability.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="p-4">
              <Button
                onClick={performRaffle}
                disabled={loading || candidatesWithProbability.length === 0}
                className="w-full"
                size="lg"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trophy className="h-4 w-4 mr-2" />}
                {loading ? 'Sorteando...' : 'Girar Roleta'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vencedor */}
      {winner && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardHeader>
            <CardTitle className="text-center text-2xl text-primary flex items-center justify-center">
              <Trophy className="h-6 w-6 mr-2" />
              🎉 VENCEDOR(A) DO SORTEIO! 🎉
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-6">
              <div className="bg-background/50 rounded-lg p-6 space-y-4">
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="w-32 h-32 rounded-2xl shadow-2xl overflow-hidden transform hover:scale-105 transition-all duration-300 rotate-3 hover:rotate-6">
                      {winner.profile_image ? (
                        <img
                          src={winner.profile_image}
                          alt={`Foto de ${winner.customer_name}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 flex items-center justify-center">
                          <Gift className="w-20 h-20 text-white" strokeWidth={2.5} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">{winner.customer_name}</div>
                    <div className="text-sm text-muted-foreground">{formatPhoneForDisplay(winner.customer_phone)}</div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Receita Paga</div>
                    <div className="font-mono font-bold text-lg">{formatCurrency(winner.total_revenue)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Peso no Sorteio</div>
                    <div className="font-mono font-bold text-lg">{winner.weight.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Probabilidade</div>
                    <div className="font-mono font-bold text-lg">{winner.probability.toFixed(1)}%</div>
                  </div>
                </div>

                <Separator />

                <div className="text-sm text-muted-foreground">
                  Data do evento: <strong>{formatBrasiliaDate(winner.event_date)}</strong>
                  {' · '}
                  {winner.order_count} pedido(s) pago(s)
                </div>
              </div>

              {candidatesWithProbability.length > 0 && (
                <Button onClick={performRaffle} disabled={loading} size="lg" variant="outline">
                  <Trophy className="h-4 w-4 mr-2" />
                  Sortear Próximo Prêmio
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Sorteio;
