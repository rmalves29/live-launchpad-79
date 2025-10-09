import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Send, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import SendingControl from '@/components/SendingControl';

interface MassMessageControlProps {
  message: string;
  setMessage: (value: string) => void;
  orderStatus: 'paid' | 'unpaid' | 'all';
  setOrderStatus: (value: 'paid' | 'unpaid' | 'all') => void;
  orderDate: string;
  setOrderDate: (value: string) => void;
}

export default function MassMessageControl({
  message,
  setMessage,
  orderStatus,
  setOrderStatus,
  orderDate,
  setOrderDate,
}: MassMessageControlProps) {
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [sendingProgress, setSendingProgress] = useState({ sent: 0, total: 0 });
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const { tenant } = useTenant();

  useEffect(() => {
    if (tenant?.id) {
      loadServerUrl();
    }
  }, [tenant?.id]);

  const loadServerUrl = async () => {
    if (!tenant?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('api_url')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      
      if (data?.api_url) {
        setServerUrl(data.api_url);
      }
    } catch (error) {
      console.error('Erro ao buscar URL do servidor:', error);
    }
  };

  const fetchContactCount = async () => {
    if (!tenant?.id) return;

    setLoadingCount(true);
    try {
      // Buscar contagem diretamente do banco
      let query = supabase
        .from('orders')
        .select('customer_phone', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

      if (orderStatus === 'paid') {
        query = query.eq('is_paid', true);
      } else if (orderStatus === 'unpaid') {
        query = query.eq('is_paid', false);
      }

      if (orderDate) {
        query = query.eq('event_date', orderDate);
      }

      const { count, error } = await query;
      if (error) throw error;
      
      setContactCount(count || 0);
    } catch (error) {
      console.error('Erro ao buscar contagem:', error);
      setContactCount(null);
    } finally {
      setLoadingCount(false);
    }
  };

  const saveTemplate = async () => {
    if (!tenant?.id || !message.trim()) return;

    setSavingTemplate(true);
    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .upsert(
          {
            tenant_id: tenant.id,
            type: 'MSG_MASSA',
            title: 'Mensagem em Massa',
            content: message,
          },
          {
            onConflict: 'tenant_id,type',
          }
        );

      if (error) throw error;

      toast.success('Template salvo com sucesso');
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      toast.error('Erro ao salvar template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleBroadcast = async (resumeJob = null) => {
    toast.error('Funcionalidade de WhatsApp foi removida do sistema.');
  };

  return (
    <>
      <SendingControl jobType="mass_message" onResume={(job) => handleBroadcast(job)} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="orderStatus">Status do Pedido</Label>
          <Select
            value={orderStatus}
            onValueChange={(value: 'paid' | 'unpaid' | 'all') => {
              setOrderStatus(value);
              setContactCount(null);
            }}
          >
            <SelectTrigger id="orderStatus">
              <SelectValue placeholder="Selecione o status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Clientes</SelectItem>
              <SelectItem value="paid">Pedidos Pagos</SelectItem>
              <SelectItem value="unpaid">Pedidos Não Pagos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="orderDate">Data do Pedido (opcional)</Label>
          <Input
            id="orderDate"
            type="date"
            value={orderDate}
            onChange={(e) => {
              setOrderDate(e.target.value);
              setContactCount(null);
            }}
          />
        </div>
      </div>

      <Button onClick={fetchContactCount} disabled={loadingCount} variant="outline" className="w-full">
        {loadingCount ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Contando...
          </>
        ) : (
          'Verificar Quantidade de Contatos'
        )}
      </Button>

      {contactCount !== null && (
        <Card className="bg-muted">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Contatos que receberão a mensagem:</p>
              <p className="text-3xl font-bold">{contactCount}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <Label htmlFor="message">Mensagem</Label>
        <Textarea
          id="message"
          placeholder="Digite a mensagem que será enviada para os clientes..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={saveTemplate} disabled={savingTemplate || !message.trim()} variant="outline" className="flex-1">
          <Save className="h-4 w-4 mr-2" />
          {savingTemplate ? 'Salvando...' : 'Salvar Template'}
        </Button>

        <Button onClick={() => handleBroadcast()} disabled={loading || !message.trim()} className="flex-1">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Enviar Mensagem
            </>
          )}
        </Button>
      </div>

      {loading && sendingProgress.total > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm mb-2">Enviando mensagens...</p>
              <p className="text-xl font-bold">
                {sendingProgress.sent} de {sendingProgress.total}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
