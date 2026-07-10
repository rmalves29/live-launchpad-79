import { useEffect, useState } from 'react';
import { Bell, BellRing, Check, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  isPushSupported,
  isIosSafariNotStandalone,
  subscribePush,
  getExistingSubscription,
} from '@/lib/push-client';

interface Props {
  tenantId: string;
  defaultName?: string;
  defaultPhone?: string;
  customerId?: number | null;
}

export function PushOptInCard({ tenantId, defaultName, defaultPhone, customerId }: Props) {
  const { toast } = useToast();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(defaultName || '');
  const [phone, setPhone] = useState(defaultPhone || '');
  const [instagram, setInstagram] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { setName(defaultName || ''); }, [defaultName]);
  useEffect(() => { setPhone(defaultPhone || ''); }, [defaultPhone]);

  useEffect(() => {
    (async () => {
      const sub = await getExistingSubscription();
      setSubscribed(!!sub && Notification.permission === 'granted');
    })();
  }, []);

  if (!tenantId) return null;
  if (dismissed) return null;

  if (isIosSafariNotStandalone()) {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900 dark:text-amber-100 flex-1">
            Para receber notificações no iPhone, toque em <b>Compartilhar</b> no Safari e escolha <b>Adicionar à Tela de Início</b>.
          </div>
          <button className="text-xs text-amber-700 underline" onClick={() => setDismissed(true)}>fechar</button>
        </CardContent>
      </Card>
    );
  }

  if (!isPushSupported()) return null;

  if (subscribed) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
        <CardContent className="pt-4 pb-4 flex items-center gap-3">
          <Check className="h-5 w-5 text-emerald-600" />
          <span className="text-sm text-emerald-900 dark:text-emerald-100">Notificações ativas neste dispositivo.</span>
        </CardContent>
      </Card>
    );
  }

  const handleEnable = async () => {
    setLoading(true);
    const res = await subscribePush({
      tenantId,
      name: name.trim(),
      phone: phone.replace(/\D/g, ''),
      instagramHandle: instagram.replace(/^@/, '').trim() || undefined,
      customerId: customerId ?? null,
    });
    setLoading(false);
    if (res.ok) {
      setSubscribed(true);
      toast({ title: 'Pronto!', description: 'Você receberá notificações do seu pedido.' });
    } else {
      toast({ title: 'Não foi possível ativar', description: res.error, variant: 'destructive' });
    }
  };

  return (
    <Card className="border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/30">
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-start gap-3">
          <BellRing className="h-5 w-5 text-indigo-600 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-sm text-indigo-900 dark:text-indigo-100">Receba notificações do seu pedido</div>
            <div className="text-xs text-muted-foreground">Avisos de carrinho, pagamento e rastreio direto no seu celular.</div>
          </div>
          <button className="text-xs text-muted-foreground underline" onClick={() => setDismissed(true)}>agora não</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Input placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <Input placeholder="Telefone (DDD + número)" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
          <Input placeholder="@instagram (opcional)" value={instagram} onChange={(e) => setInstagram(e.target.value)} maxLength={40} />
        </div>
        <Button onClick={handleEnable} disabled={loading} className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700">
          <Bell className="h-4 w-4 mr-2" />
          {loading ? 'Ativando...' : 'Ativar notificações'}
        </Button>
      </CardContent>
    </Card>
  );
}
