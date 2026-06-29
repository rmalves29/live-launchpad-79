import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Wifi } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string;
  context?: 'precheck' | 'mid-send';
}

export default function ZapiDisconnectedModal({ open, onClose, reason, context = 'precheck' }: Props) {
  const navigate = useNavigate();

  const title = context === 'mid-send'
    ? 'Envio pausado — WhatsApp desconectado'
    : 'WhatsApp desconectado';

  const description = context === 'mid-send'
    ? 'Detectamos várias falhas seguidas. O envio foi pausado automaticamente para evitar que mais mensagens deixem de ser entregues. Reconecte o WhatsApp e retome o envio em "Envios Ativos".'
    : 'Sua instância Z-API não está conectada. Se você enviar agora, as mensagens NÃO serão entregues às clientes. Reconecte o WhatsApp antes de continuar.';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <DialogTitle className="text-lg">{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        {reason && (
          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground font-mono">
            {reason}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={() => { onClose(); navigate('/whatsapp/conexao'); }}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Wifi className="w-4 h-4 mr-2" />
            Reconectar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
