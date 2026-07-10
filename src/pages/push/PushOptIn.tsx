import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BellRing, CheckCircle2, Loader2 } from 'lucide-react';
import { useTenantBySlug } from '@/hooks/useTenantBySlug';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  isPushSupported,
  isIosSafariNotStandalone,
  subscribePush,
  getExistingSubscription,
} from '@/lib/push-client';

/**
 * Página pública de opt-in de notificações push.
 * URL: /t/:slug/push
 * Cliente informa nome e telefone e ativa as notificações do navegador.
 */
export default function PushOptIn() {
  const { slug } = useParams<{ slug: string }>();
  const { tenant, loading, error } = useTenantBySlug(slug);
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [done, setDone] = useState(false);

  const iosBlocked = isIosSafariNotStandalone();
  const unsupported = !isPushSupported() && !iosBlocked;
  const primary = tenant?.primary_color || '#4f46e5';

  useEffect(() => {
    (async () => {
      const sub = await getExistingSubscription();
      if (sub) setAlreadySubscribed(true);
    })();
  }, []);

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const canSubmit = useMemo(() => {
    const d = phone.replace(/\D/g, '');
    return d.length >= 10 && !!tenant?.id;
  }, [phone, tenant]);

  const handleActivate = async () => {
    if (!tenant?.id) return;
    if (iosBlocked) {
      toast({
        title: 'Adicione o site à Tela de Início',
        description: 'No iPhone é preciso instalar o site na Tela de Início para receber notificações.',
      });
      return;
    }
    if (unsupported) {
      toast({ title: 'Navegador incompatível', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const res = await subscribePush({
      tenantId: tenant.id,
      name: name.trim() || undefined,
      phone: phone.replace(/\D/g, ''),
    });
    setSaving(false);
    if (res.ok) {
      setDone(true);
      toast({
        title: 'Tudo pronto!',
        description: 'Você receberá as novidades direto no seu celular.',
      });
    } else {
      toast({ title: 'Não foi possível ativar', description: res.error, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-800">Loja não encontrada</h1>
          <p className="text-sm text-slate-500 mt-1">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{
        background: `linear-gradient(135deg, ${primary}15 0%, #ffffff 60%)`,
      }}
    >
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardContent className="pt-8 pb-6 px-6 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: `${primary}20` }}
          >
            {done ? (
              <CheckCircle2 className="h-8 w-8" style={{ color: primary }} />
            ) : (
              <BellRing className="h-8 w-8" style={{ color: primary }} />
            )}
          </div>

          {tenant.logo_url && (
            <img
              src={tenant.logo_url}
              alt={tenant.name}
              className="mx-auto mb-3 h-10 w-auto object-contain"
            />
          )}
          <h1 className="text-xl font-bold text-slate-900">{tenant.name}</h1>

          {done ? (
            <>
              <p className="text-sm text-slate-600 mt-3">
                Notificações ativadas com sucesso. A partir de agora você recebe promoções,
                lançamentos e o status do seu pedido direto na tela do celular.
              </p>
              <Button
                className="mt-6 w-full"
                style={{ backgroundColor: primary }}
                onClick={() => (window.location.href = `/t/${tenant.slug}`)}
              >
                Ir para a loja
              </Button>
            </>
          ) : alreadySubscribed ? (
            <>
              <p className="text-sm text-slate-600 mt-3">
                Este dispositivo já está inscrito nas notificações. Se quiser atualizar seu
                cadastro, informe seus dados abaixo.
              </p>
              <div className="mt-5 space-y-3 text-left">
                <div>
                  <Label className="text-xs">Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div>
                  <Label className="text-xs">WhatsApp</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                  />
                </div>
                <Button
                  className="w-full"
                  style={{ backgroundColor: primary }}
                  disabled={!canSubmit || saving}
                  onClick={handleActivate}
                >
                  {saving ? 'Salvando...' : 'Atualizar cadastro'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 mt-3">
                Ative as notificações e receba promoções, lançamentos e o status do seu pedido
                direto na tela do seu celular.
              </p>

              {iosBlocked && (
                <div className="mt-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 text-left">
                  No iPhone é necessário tocar em <b>Compartilhar</b> no Safari e escolher
                  <b> Adicionar à Tela de Início</b>. Depois abra o site pelo ícone criado e ative aqui.
                </div>
              )}
              {unsupported && (
                <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">
                  Seu navegador não suporta notificações push.
                </div>
              )}

              <div className="mt-5 space-y-3 text-left">
                <div>
                  <Label className="text-xs">Nome (opcional)</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div>
                  <Label className="text-xs">WhatsApp</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                  />
                </div>
                <Button
                  className="w-full h-11 text-base"
                  style={{ backgroundColor: primary }}
                  disabled={!canSubmit || saving || iosBlocked || unsupported}
                  onClick={handleActivate}
                >
                  {saving ? 'Ativando...' : 'Ativar notificações'}
                </Button>
                <p className="text-[11px] text-slate-400 text-center">
                  Você pode desativar a qualquer momento nas configurações do navegador.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
