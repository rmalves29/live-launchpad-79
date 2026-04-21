/**
 * Modal de identificação do cliente na vitrine pública.
 * Pede apenas @Instagram + WhatsApp.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export interface StorefrontIdentity {
  phone: string;
  instagram: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (identity: StorefrontIdentity) => void | Promise<void>;
  loading?: boolean;
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

export default function IdentifyCustomerDialog({ open, onOpenChange, onConfirm, loading }: Props) {
  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    const ig = sanitizeInstagram(instagram);
    const ph = sanitizePhone(phone);
    if (!ig) return setError('Informe seu @ do Instagram');
    if (!isValidBrPhone(ph)) return setError('WhatsApp inválido. Use DDD + número');
    await onConfirm({ instagram: ig, phone: ph });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Identifique-se para comprar</DialogTitle>
          <DialogDescription>
            Precisamos só do seu Instagram e WhatsApp para registrar seu pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ig">@ do Instagram</Label>
            <Input
              id="ig"
              placeholder="seu_instagram"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              autoFocus
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">WhatsApp</Label>
            <Input
              id="phone"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              inputMode="tel"
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleConfirm} disabled={loading} className="w-full">
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
      </DialogContent>
    </Dialog>
  );
}
