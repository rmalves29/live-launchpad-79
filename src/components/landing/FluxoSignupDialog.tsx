import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function FluxoSignupDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.functions.invoke('landing-fluxo-signup', {
          body: { email, password, name, company },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Falha ao criar conta.');
        // login imediato
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;
        toast({ title: 'Conta criada!', description: 'Bem-vindo ao Fluxo de Envio.' });
        onOpenChange(false);
        navigate('/fluxo-envio/app', { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: 'Bem-vindo de volta!' });
        onOpenChange(false);
        navigate('/fluxo-envio/app', { replace: true });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'signup' ? 'Criar sua conta grátis' : 'Entrar no Fluxo de Envio'}</DialogTitle>
          <DialogDescription>
            {mode === 'signup'
              ? 'Teste 7 dias sem cartão. Acesso ao painel do Fluxo de Envio.'
              : 'Acesse sua conta do Fluxo de Envio.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === 'signup' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="fx-name">Seu nome</Label>
                <Input id="fx-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como te chamam" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fx-company">Nome do negócio</Label>
                <Input id="fx-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ex: Loja da Mari" />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="fx-email">E-mail</Label>
            <Input id="fx-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fx-pass">Senha</Label>
            <Input id="fx-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mín. 6 caracteres" />
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === 'signup' ? 'Criar conta e entrar' : 'Entrar'}
          </Button>

          <button
            type="button"
            className="w-full text-xs text-muted-foreground underline text-center"
            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
          >
            {mode === 'signup' ? 'Já tenho conta — entrar' : 'Não tenho conta — criar agora'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
