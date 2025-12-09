import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, CalendarIcon, Trophy, Sparkles, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useTenantContext } from '@/contexts/TenantContext';
import { formatPhoneForDisplay } from '@/lib/phone-utils';

interface Winner {
  order_id: number;
  customer_phone: string;
  customer_name?: string;
  total_amount: number;
  event_date: string;
  profile_image?: string;
}

const Sorteio = () => {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [eventDate, setEventDate] = useState<Date | undefined>();
  const [winner, setWinner] = useState<Winner | null>(null);
  const [loading, setLoading] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number>(0);

  // Função para buscar foto de perfil do WhatsApp
  const getWhatsAppProfilePicture = async (phone: string): Promise<string> => {
    try {
      // Chama o endpoint do backend (/wa-profile) que faz cache e proxy seguro
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantId) headers['x-tenant-id'] = String(tenantId);
      const resp = await fetch(`/wa-profile?phone=${encodeURIComponent(phone)}`, { headers });
      if (resp.ok) {
        const j = await resp.json();
        if (j?.url) return j.url;
      } else {
        // tentar ler body para debug mas não falhar
        try { const txt = await resp.text(); console.log('wa-profile resp:', resp.status, txt); } catch(e){}
      }
    } catch (error) {
      console.log('Erro ao chamar /wa-profile:', error);
    }

    // Fallback: gerar avatar baseado no número
    const cleanPhone = phone.replace(/\D/g, '');
    return `https://ui-avatars.com/api/?name=${cleanPhone}&background=random&size=256&format=png&rounded=true&bold=true`;
  };

  // Função para gerar avatar baseado no número de telefone (fallback)
  const getProfileImage = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    return `https://ui-avatars.com/api/?name=${cleanPhone}&background=random&size=256&format=png&rounded=true`;
  };

  const performRaffle = async () => {
    if (!eventDate) {
      toast({
        title: 'Erro',
        description: 'Selecione a data do evento',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const selectedDate = format(eventDate, 'yyyy-MM-dd');
      
      // Buscar pedidos pagos da data selecionada
      const { data: paidOrders, error } = await supabaseTenant
        .from('orders')
        .select('id, customer_phone, total_amount, event_date')
        .eq('is_paid', true)
        .eq('event_date', selectedDate);

      if (error) throw error;

      if (!paidOrders || paidOrders.length === 0) {
        toast({
          title: 'Nenhum Pedido Encontrado',
          description: 'Não há pedidos pagos para a data selecionada',
          variant: 'destructive'
        });
        return;
      }

      // Selecionar um vencedor aleatório
      const randomIndex = Math.floor(Math.random() * paidOrders.length);
      const selectedOrder = paidOrders[randomIndex];

      // Buscar o nome do cliente usando o telefone
      const { data: customerData } = await supabaseTenant
        .from('customers')
        .select('name')
        .eq('phone', selectedOrder.customer_phone)
        .maybeSingle();

      // Buscar foto de perfil real do WhatsApp
      const profileImage = await getWhatsAppProfilePicture(selectedOrder.customer_phone);

      const winnerData: Winner = {
        order_id: selectedOrder.id,
        customer_phone: selectedOrder.customer_phone,
        customer_name: customerData?.name || selectedOrder.customer_phone, // Usa telefone se nome não encontrado
        total_amount: Number(selectedOrder.total_amount),
        event_date: selectedOrder.event_date,
        profile_image: profileImage
      };

      setWinner(winnerData);
      setEligibleCount(paidOrders.length);

      toast({
        title: 'Sorteio Realizado!',
        description: `Vencedor selecionado entre ${paidOrders.length} pedidos elegíveis`,
      });
    } catch (error) {
      console.error('Error performing raffle:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao realizar sorteio',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const newRaffle = () => {
    setWinner(null);
    setEligibleCount(0);
    setEventDate(undefined);
  };

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center">
          <Trophy className="h-8 w-8 mr-3 text-primary" />
          Sorteio de Pedidos
        </h1>
      </div>

      {/* Raffle Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Sparkles className="h-5 w-5 mr-2" />
            Configuração do Sorteio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label className="text-sm font-medium">Data do Evento</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !eventDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {eventDate ? format(eventDate, "PPP", { locale: ptBR }) : "Selecionar data do evento"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={eventDate}
                  onSelect={setEventDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="mt-6 flex space-x-4">
            <Button 
              onClick={performRaffle} 
              disabled={loading || !eventDate}
              className="flex-1"
              size="lg"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trophy className="h-4 w-4 mr-2" />
              )}
              {loading ? 'Sorteando...' : 'Realizar Sorteio'}
            </Button>

            {winner && (
              <Button onClick={newRaffle} variant="outline" size="lg">
                Novo Sorteio
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Raffle Criteria */}
      <Card>
        <CardHeader>
          <CardTitle>Critérios do Sorteio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Apenas pedidos <strong>PAGOS</strong> (is_paid = true) participam do sorteio</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Pedidos devem ser da <strong>data do evento</strong> selecionada</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>A seleção é <strong>aleatória</strong> entre todos os pedidos elegíveis</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Winner Display */}
      {winner && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardHeader>
            <CardTitle className="text-center text-2xl text-primary flex items-center justify-center">
              <Trophy className="h-6 w-6 mr-2" />
              🎉 VENCEDOR DO SORTEIO! 🎉
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-6">
                <div className="bg-white/50 rounded-lg p-6 space-y-4">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="relative">
                      {/* Mostrar foto de perfil do WhatsApp do vencedor quando disponível; caso contrário, fallback */}
                      <div className="w-32 h-32 rounded-2xl shadow-2xl overflow-hidden transform hover:scale-105 transition-all duration-300 rotate-3 hover:rotate-6">
                        {winner?.profile_image ? (
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
                      <div className="absolute -top-2 -right-2 w-12 h-12 bg-red-500 rounded-full shadow-lg flex items-center justify-center text-2xl font-bold text-white border-4 border-white">
                        {eligibleCount}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold">{winner.customer_name}</div>
                      <div className="text-sm text-muted-foreground">Pedido #{winner.order_id}</div>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Telefone</div>
                      <div className="font-mono font-medium">{formatPhoneForDisplay(winner.customer_phone)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Data do Evento</div>
                      <div className="font-medium">{format(new Date(winner.event_date), 'dd/MM/yyyy')}</div>
                    </div>
                  </div>

                  <Separator />

                  <div className="text-sm text-muted-foreground">
                    Selecionado entre <strong>{eligibleCount}</strong> pedidos elegíveis
                  </div>
                </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  Para contato com o vencedor, utilize o telefone cadastrado no pedido.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      {!winner && (
        <Card>
          <CardHeader>
            <CardTitle>Como Funciona</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>
                O sistema de sorteio seleciona automaticamente um pedido vencedor entre todos os pedidos 
                <strong> pagos</strong> de uma data específica.
              </p>
              <p>
                Para realizar um sorteio:
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Selecione a <strong>data do evento</strong> que deseja sortear</li>
                <li>Clique em <strong>"Realizar Sorteio"</strong></li>
                <li>O sistema irá selecionar aleatoriamente um vencedor entre os pedidos elegíveis</li>
              </ol>
              <p>
                O vencedor será exibido com foto de perfil e todas as informações necessárias para contato.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default Sorteio;
