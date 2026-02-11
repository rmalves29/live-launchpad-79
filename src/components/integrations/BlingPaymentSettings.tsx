import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Save, CreditCard, Info } from 'lucide-react';

interface BlingPaymentSettingsProps {
  tenantId: string;
}

const PAYMENT_FIELDS = [
  { key: 'bling_payment_id_pix', label: 'PIX', description: 'ID da forma de pagamento PIX no Bling' },
  { key: 'bling_payment_id_credit_card', label: 'Cartão de Crédito', description: 'ID da forma de pagamento Cartão de Crédito no Bling' },
  { key: 'bling_payment_id_debit_card', label: 'Cartão de Débito', description: 'ID da forma de pagamento Cartão de Débito no Bling' },
  { key: 'bling_payment_id_boleto', label: 'Boleto', description: 'ID da forma de pagamento Boleto no Bling' },
  { key: 'bling_payment_id_other', label: 'Outros / Dinheiro', description: 'ID da forma para pagamentos não mapeados' },
] as const;

export default function BlingPaymentSettings({ tenantId }: BlingPaymentSettingsProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  const { data: integration } = useQuery({
    queryKey: ['bling-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_bling')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (integration) {
      const newValues: Record<string, string> = {};
      for (const field of PAYMENT_FIELDS) {
        const val = (integration as any)[field.key];
        newValues[field.key] = val ? String(val) : '';
      }
      setValues(newValues);
    }
  }, [integration]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!integration?.id) throw new Error('Integração não encontrada');

      const payload: Record<string, any> = {};
      for (const field of PAYMENT_FIELDS) {
        const v = values[field.key]?.trim();
        payload[field.key] = v ? Number(v) : null;
      }

      const { error } = await supabase
        .from('integration_bling')
        .update(payload)
        .eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bling-integration', tenantId] });
      toast.success('IDs de formas de pagamento salvos!');
    },
    onError: () => {
      toast.error('Erro ao salvar formas de pagamento');
    },
  });

  if (!integration) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          Formas de Pagamento no Bling
        </CardTitle>
        <CardDescription>
          Configure os IDs das formas de pagamento cadastradas no seu Bling para que os pedidos cheguem com a informação correta de como o cliente pagou (PIX, cartão, boleto, etc.) e o número de parcelas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Para encontrar os IDs, acesse no Bling: <strong>Cadastros → Formas de Pagamento</strong>. 
            Clique em cada forma de pagamento e copie o número do ID que aparece na URL (ex: <code>/formas-pagamento/123</code> → ID = 123).
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PAYMENT_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type="number"
                placeholder="Ex: 123456"
                value={values[field.key] || ''}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{field.description}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            size="sm"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Formas de Pagamento
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
