import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, BookOpen, Plus, Trash2 } from 'lucide-react';

interface MeusCorreiosServiceCodesProps {
  tenantId: string;
  integrationId: string;
  currentCodes: Record<string, string>;
  onSaved: () => void;
}

const KNOWN_SERVICES: Record<string, string> = {
  '03298': 'PAC (Contrato)',
  '03220': 'SEDEX (Contrato)',
  '04227': 'Mini Envios',
  '03140': 'SEDEX 12',
  '03204': 'SEDEX Hoje',
  '03328': 'PAC Grande Formato',
  '04510': 'PAC (Público)',
  '04014': 'SEDEX (Público)',
  '03085': 'PAC (Público v2)',
  '03050': 'SEDEX (Público v2)',
};

export default function MeusCorreiosServiceCodes({ tenantId, integrationId, currentCodes, onSaved }: MeusCorreiosServiceCodesProps) {
  const { toast } = useToast();
  const [codes, setCodes] = useState<Record<string, string>>({ ...currentCodes });
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = (name: string, code: string) => {
    setCodes(prev => ({ ...prev, [name]: code }));
  };

  const handleRemove = (name: string) => {
    setCodes(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleAdd = () => {
    if (!newName.trim() || !newCode.trim()) return;
    setCodes(prev => ({ ...prev, [newName.trim().toUpperCase()]: newCode.trim() }));
    setNewName('');
    setNewCode('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('shipping_integrations')
        .update({ webhook_secret: JSON.stringify(codes) })
        .eq('id', integrationId);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Dicionário de serviços atualizado!' });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Dicionário de Serviços
        </CardTitle>
        <CardDescription>
          Configure os códigos de serviço válidos para seu cartão de postagem. Esses códigos serão usados na geração de etiquetas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md divide-y">
          {Object.entries(codes).map(([name, code]) => (
            <div key={name} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{name}</span>
                {KNOWN_SERVICES[code] && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {KNOWN_SERVICES[code]}
                  </Badge>
                )}
              </div>
              <Input
                value={code}
                onChange={e => handleUpdate(name, e.target.value)}
                className="w-24 text-center text-sm"
                maxLength={5}
              />
              <Button variant="ghost" size="sm" onClick={() => handleRemove(name)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Nome do Serviço</Label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ex: PAC MINI"
              className="text-sm"
            />
          </div>
          <div className="w-28 space-y-1">
            <Label className="text-xs">Código</Label>
            <Input
              value={newCode}
              onChange={e => setNewCode(e.target.value)}
              placeholder="04227"
              className="text-sm text-center"
              maxLength={5}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleAdd} disabled={!newName.trim() || !newCode.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Dicionário de Serviços
        </Button>
      </CardContent>
    </Card>
  );
}
