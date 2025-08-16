import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, CalendarIcon, Trophy, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Winner {
  order_id: number;
  customer_phone: string;
  total_amount: number;
  event_type: string;
  event_date: string;
}

const Sorteio = () => {
  const { toast } = useToast();
  const [eventDate, setEventDate] = useState<Date | undefined>();
  const [eventType, setEventType] = useState<string>('');
  const [winner, setWinner] = useState<Winner | null>(null);
  const [loading, setLoading] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number>(0);

  const performRaffle = async () => {
    if (!eventDate || !eventType) {
      toast({
        title: 'Erro',
        description: 'Selecione a data e o tipo do evento',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      // Simulate API call - in real implementation, this would call POST /raffle
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock raffle data
      const mockWinner: Winner = {
        order_id: Math.floor(Math.random() * 1000) + 1,
        customer_phone: '5511999999999',
        total_amount: 89.70,
        event_type: eventType,
        event_date: format(eventDate, 'yyyy-MM-dd')
      };

      const mockEligibleCount = Math.floor(Math.random() * 50) + 10;

      setWinner(mockWinner);
      setEligibleCount(mockEligibleCount);

      toast({
        title: 'Sorteio Realizado!',
        description: `Vencedor selecionado entre ${mockEligibleCount} pedidos elegíveis`,
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
    setEventType('');
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo do Evento</label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar tipo do evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAZAR">BAZAR</SelectItem>
                  <SelectItem value="LIVE">LIVE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-6 flex space-x-4">
            <Button 
              onClick={performRaffle} 
              disabled={loading || !eventDate || !eventType}
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
              <span>Apenas pedidos <strong>pagos</strong> (is_paid = true) participam do sorteio</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Pedidos devem ser da <strong>data do evento</strong> selecionada</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Pedidos devem ser do <strong>tipo de evento</strong> selecionado</span>
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
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Pedido Vencedor</div>
                  <Badge variant="default" className="text-lg px-4 py-2">
                    #{winner.order_id}
                  </Badge>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Telefone</div>
                    <div className="font-mono font-medium">{winner.customer_phone}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Valor do Pedido</div>
                    <div className="font-medium text-lg">R$ {winner.total_amount.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Evento</div>
                    <div className="space-y-1">
                      <Badge variant="outline">{winner.event_type}</Badge>
                      <div className="text-sm">{format(new Date(winner.event_date), 'dd/MM/yyyy')}</div>
                    </div>
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
                <strong> pagos</strong> de uma data e tipo de evento específicos.
              </p>
              <p>
                Para realizar um sorteio:
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Selecione a <strong>data do evento</strong> que deseja sortear</li>
                <li>Escolha o <strong>tipo de evento</strong> (BAZAR ou LIVE)</li>
                <li>Clique em <strong>"Realizar Sorteio"</strong></li>
                <li>O sistema irá selecionar aleatoriamente um vencedor entre os pedidos elegíveis</li>
              </ol>
              <p>
                O vencedor será exibido com todas as informações necessárias para contato e verificação.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default Sorteio;