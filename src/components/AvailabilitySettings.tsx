import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export const AvailabilitySettings = () => {
  const { toast } = useToast();
  const [handlingDays, setHandlingDays] = useState<number>(3);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('handling_days')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading settings:', error);
        return;
      }

      if (data?.handling_days) {
        setHandlingDays(data.handling_days);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ 
          id: 1, // Use fixed ID for singleton
          handling_days: handlingDays,
          updated_at: new Date().toISOString()
        });

      if (error) {
        throw error;
      }

      toast({
        title: 'Configurações salvas',
        description: 'Disponibilidade atualizada com sucesso',
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao salvar configurações',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <Clock className="h-5 w-5 mr-2" />
          Disponibilidade para Postagem
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="handling_days">Dias para postagem</Label>
          <div className="flex items-center space-x-4 mt-2">
            <Input
              id="handling_days"
              type="number"
              min="1"
              max="30"
              value={handlingDays}
              onChange={(e) => setHandlingDays(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">
              dias úteis
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Este valor será somado ao prazo de entrega da transportadora
          </p>
        </div>

        <Button 
          onClick={saveSettings}
          disabled={saving || loading}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </CardContent>
    </Card>
  );
};