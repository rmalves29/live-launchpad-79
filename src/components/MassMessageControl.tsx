import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Send, Save, Loader2 } from 'lucide-react';
import { whatsappService } from '@/lib/whatsapp-service';
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
  const { tenant } = useTenant();

  const fetchContactCount = async () => {
    if (!tenant?.id) return;

    setLoadingCount(true);
    try {
      const count = await whatsappService.getContactCount(
        orderStatus,
        tenant.id,
        orderDate || undefined
      );
      setContactCount(count);
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
    if (!message.trim() && !resumeJob) {
      toast.error('Digite uma mensagem para enviar.');
      return;
    }

    if (!tenant?.id) {
      toast.error('Tenant não identificado.');
      return;
    }

    setLoading(true);
    try {
      let jobId = currentJobId;
      let startIndex = 0;

      if (resumeJob) {
        // Retomar de onde parou
        jobId = resumeJob.id;
        startIndex = resumeJob.current_index;
        setSendingProgress({ sent: resumeJob.processed_items, total: resumeJob.total_items });
        toast.success('Retomando envio de onde parou...');
      } else {
        // Criar novo job
        const count = contactCount || (await whatsappService.getContactCount(orderStatus, tenant.id, orderDate || undefined));
        
        const response = await fetch('http://localhost:3333/sending-job/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobType: 'mass_message',
            totalItems: count,
            jobData: {
              orderStatus,
              orderDate,
              message,
            },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          jobId = result.job?.id;
          setCurrentJobId(jobId);
        }

        setSendingProgress({ sent: 0, total: count });
      }

      // Enviar mensagens
      const response = await whatsappService.broadcastByOrderStatusAndDate(
        orderStatus,
        message,
        tenant.id,
        orderDate || undefined
      );

      toast.success(`Mensagem enviada para ${response.total || 0} contatos`);

      // Marcar como completo
      if (jobId) {
        await fetch('http://localhost:3333/sending-job/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            status: 'completed',
          }),
        });
      }

      setMessage('');
      setOrderDate('');
      setContactCount(null);
      setCurrentJobId(null);
    } catch (error) {
      console.error('Erro ao enviar broadcast:', error);
      toast.error('Erro ao enviar mensagem em massa');
      
      // Marcar como pausado em caso de erro
      if (currentJobId) {
        await fetch('http://localhost:3333/sending-job/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: currentJobId,
            status: 'paused',
            processedItems: sendingProgress.sent,
          }),
        });
      }
    } finally {
      setLoading(false);
    }
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
