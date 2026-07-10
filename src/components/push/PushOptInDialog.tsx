import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  isPushSupported,
  isIosSafariNotStandalone,
  subscribePush,
  getExistingSubscription,
} from '@/lib/push-client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  phone: string;
  name?: string;
  customerId?: number | null;
  onDone?: (accepted: boolean) => void;
}

/**
 * Popup que pergunta ao cliente se ele quer receber notificações push.
 * O clique em "OK" já registra a inscrição e vincula o telefone informado.
 */
export function PushOptInDialog({
  open,
  onOpenChange,
  tenantId,
  phone,
  name,
  customerId,
  onDone,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const iosBlocked = isIosSafariNotStandalone();
  const unsupported = !isPushSupported() && !iosBlocked;

  const handleAccept = async () => {
    if (iosBlocked) {
      onOpenChange(false);
      onDone?.(false);
      return;
    }
    if (unsupported) {
      onOpenChange(false);
      onDone?.(false);
      return;
    }
    setLoading(true);
    const res = await subscribePush({
      tenantId,
      name: (name || '').trim() || undefined,
      phone: phone.replace(/\D/g, ''),
      customerId: customerId ?? null,
    });
    setLoading(false);
    if (res.ok) {
      toast({
        title: 'Notificações ativadas',
        description: 'Você receberá avisos do seu pedido nesta tela.',
      });
      onOpenChange(false);
      onDone?.(true);
    } else {
      toast({
        title: 'Não foi possível ativar',
        description: res.error,
        variant: 'destructive',
      });
      onOpenChange(false);
      onDone?.(false);
    }
  };

  const handleDismiss = () => {
    onOpenChange(false);
    onDone?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleDismiss() : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
            <BellRing className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
          </div>
          <DialogTitle className="text-center">Ativar notificações</DialogTitle>
          <DialogDescription className="text-center">
            {iosBlocked ? (
              <>Para receber notificações no iPhone, toque em <b>Compartilhar</b> no Safari e escolha <b>Adicionar à Tela de Início</b>.</>
            ) : unsupported ? (
              <>Seu navegador não suporta notificações push.</>
            ) : (
              <>A partir de agora você receberá as notificações de pagamento, códigos de rastreio e status do seu pedido diretamente na tela do seu telefone.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          {!iosBlocked && !unsupported && (
            <Button variant="ghost" onClick={handleDismiss} disabled={loading}>
              Agora não
            </Button>
          )}
          <Button
            onClick={handleAccept}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {loading ? 'Ativando...' : 'OK'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
