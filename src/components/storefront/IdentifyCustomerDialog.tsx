/**
 * Modal de identificação progressiva na vitrine pública.
 * Fluxo:
 *  - Estado A: pede só o @ do Instagram → busca em customers (lookup público)
 *      • cliente encontrado  → confirma direto (sem pedir telefone)
 *      • cliente bloqueado   → mensagem "Cliente bloqueado"
 *      • não encontrado      → vai para Estado B
 *  - Estado B: mostra o @ digitado e pede o WhatsApp para criar o cadastro
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, AtSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface StorefrontIdentity {
  phone: string;
  instagram: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (identity: StorefrontIdentity) => void | Promise<void>;
  /** Loading externo enquanto o add-to-cart roda após confirmar */
  loading?: boolean;
  /** Slug do tenant (necessário para o lookup por @) */
  tenantSlug: string;
}

function sanitizeInstagram(v: string): string {
  return v.trim().replace(/^@+/, '').replace(/\s+/g, '');
}
function sanitizePhone(v: string): string {
  let clean = v.replace(/\D/g, '');
  if (clean.startsWith('55') && clean.length > 11) clean = clean.slice(2);
  return clean;
}
function isValidBrPhone(v: string): boolean {
  const c = sanitizePhone(v);
  return c.length === 10 || c.length === 11;
}
function formatPhoneInput(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

type Step = 'instagram' | 'phone';

export default function IdentifyCustomerDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
  tenantSlug,
}: Props) {
  const [step, setStep] = useState<Step>('instagram');
  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Reset ao fechar
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // pequeno reset para a próxima abertura começar limpa
      setTimeout(() => {
        setStep('instagram');
        setInstagram('');
        setPhone('');
        setError(null);
        setLookupLoading(false);
      }, 200);
    }
    onOpenChange(next);
  };

  const handleLookupInstagram = async () => {
    setError(null);
    const ig = sanitizeInstagram(instagram);
    if (!ig) {
      setError('Informe seu @ do Instagram');
      return;
    }

    setLookupLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'storefront-lookup-by-instagram',
        { body: { tenant_slug: tenantSlug, instagram: ig } },
      );

      if (fnErr) {
        console.error('[IdentifyCustomer] lookup error', fnErr);
        // fallback: deixa o cliente digitar o telefone
        setInstagram(ig);
        setStep('phone');
        return;
      }

      if (data?.found && data?.blocked) {
        setError('Cliente bloqueado. Entre em contato com a loja.');
        return;
      }

      if (data?.found && data?.phone) {
        // Cliente reconhecido — confirma direto
        toast.success(`Bem-vindo de volta, @${data.instagram || ig}!`);
        await onConfirm({ instagram: data.instagram || ig, phone: data.phone });
        return;
      }

      // Não encontrado → pede telefone
      setInstagram(ig);
      setStep('phone');
    } catch (e) {
      console.error('[IdentifyCustomer] lookup exception', e);
      // segue para o passo do telefone como fallback
      setInstagram(ig);
      setStep('phone');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleConfirmPhone = async () => {
    setError(null);
    const ig = sanitizeInstagram(instagram);
    const ph = sanitizePhone(phone);
    if (!ig) {
      setStep('instagram');
      return;
    }
    if (!isValidBrPhone(ph)) {
      setError('WhatsApp inválido. Use DDD + número');
      return;
    }
    await onConfirm({ instagram: ig, phone: ph });
  };

  const onKeyDownInstagram = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !lookupLoading) handleLookupInstagram();
  };
  const onKeyDownPhone = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) handleConfirmPhone();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 'instagram' && (
          <>
            <DialogHeader>
              <DialogTitle>Identifique-se para comprar</DialogTitle>
              <DialogDescription>
                Use o mesmo @ do Instagram que você usa nas nossas lives.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="ig">@ do Instagram</Label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="ig"
                    placeholder="seu_instagram"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    onKeyDown={onKeyDownInstagram}
                    autoFocus
                    disabled={lookupLoading}
                    className="pl-9"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button onClick={handleLookupInstagram} disabled={lookupLoading} className="w-full">
                {lookupLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Continuar'
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'phone' && (
          <>
            <DialogHeader>
              <DialogTitle>Primeira compra? Bem-vindo!</DialogTitle>
              <DialogDescription>
                Não encontramos seu @. Informe seu WhatsApp para finalizar o cadastro.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <AtSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{instagram}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('instagram');
                    setError(null);
                  }}
                  disabled={loading}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <ArrowLeft className="h-3 w-3" />
                  usar outro @
                </button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">WhatsApp</Label>
                <Input
                  id="phone"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                  onKeyDown={onKeyDownPhone}
                  inputMode="tel"
                  autoFocus
                  disabled={loading}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button onClick={handleConfirmPhone} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adicionando...
                  </>
                ) : (
                  'Confirmar e adicionar'
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
