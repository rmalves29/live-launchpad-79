import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, Link, User, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Componente que ajuda o usuário a se vincular à empresa do subdomínio atual
 * Aparece quando o usuário não tem tenant_id mas está em um subdomínio válido
 */
export const TenantLinkHelper = () => {
  const { user, profile } = useAuth();
  const { tenant, isMainSite } = useTenantContext();
  const { toast } = useToast();
  const [linking, setLinking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Só mostrar se:
  // 1. Usuário está logado
  // 2. Não está no site principal
  // 3. Tem um tenant válido detectado
  // 4. O usuário não está vinculado a nenhuma empresa
  // 5. Não foi dispensado pelo usuário
  if (!user || isMainSite || !tenant || profile?.tenant_id || dismissed) {
    return null;
  }

  const handleLinkToTenant = async () => {
    if (!user || !tenant) return;

    setLinking(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          tenant_id: tenant.id,
          role: 'staff' // Usuário padrão da empresa
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Sucesso!',
        description: `Você foi vinculado à empresa "${tenant.name}". Faça logout e login novamente para aplicar as mudanças.`,
      });

      // Recarregar a página após 2 segundos para aplicar mudanças
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error: any) {
      console.error('Erro ao vincular usuário:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível vincular à empresa',
        variant: 'destructive'
      });
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 p-3 bg-amber-50 border-b border-amber-200 shadow-sm">
        <div className="container mx-auto">
          <Alert className="bg-white border-amber-200">
            <Building2 className="h-4 w-4 text-amber-600" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm">
                Você está na empresa <strong className="text-amber-700">{tenant.name}</strong> mas não está vinculado a ela. 
                <Button 
                  variant="link" 
                  className="p-1 h-auto font-semibold text-amber-700 underline"
                  onClick={handleLinkToTenant}
                  disabled={linking}
                >
                  {linking ? 'Vinculando...' : 'Clique aqui para se vincular'}
                </Button>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-1 text-amber-600 hover:text-amber-700"
                onClick={() => setDismissed(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
      {/* Spacer para empurrar o conteúdo para baixo */}
      <div className="h-20"></div>
    </>
  );
};