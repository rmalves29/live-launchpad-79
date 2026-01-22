import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Users, Plus, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { supabaseTenant } from '@/lib/supabase-tenant';

interface AllowedGroup {
  id: string;
  tenant_id: string;
  group_name: string;
  is_active: boolean;
  created_at: string;
}

export function WhatsAppGroupsManager() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<AllowedGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [suggestedGroups, setSuggestedGroups] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    if (tenant?.id) {
      loadGroups();
      loadSuggestions();
    }
  }, [tenant?.id]);

  const loadGroups = async () => {
    if (!tenant?.id) return;
    
    setLoading(true);
    try {
      // Usar raw client com filtro manual já que a tabela pode não estar nos tipos ainda
      const { data, error } = await supabaseTenant.raw
        .from('whatsapp_allowed_groups')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('group_name');

      if (error) throw error;
      setGroups((data as AllowedGroup[]) || []);
    } catch (error: any) {
      console.error('Error loading allowed groups:', error);
      // Se a tabela não existir ainda, não mostrar erro
      if (error?.code === '42P01') {
        console.warn('Tabela whatsapp_allowed_groups ainda não existe. Execute a migração SQL.');
        setGroups([]);
      } else {
        toast({
          title: 'Erro',
          description: error?.message || 'Erro ao carregar grupos permitidos',
          variant: 'destructive'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async () => {
    if (!tenant?.id) return;
    
    setLoadingSuggestions(true);
    try {
      // Buscar grupos únicos dos pedidos deste tenant
      const { data: orders, error } = await supabaseTenant
        .from('orders')
        .select('whatsapp_group_name')
        .not('whatsapp_group_name', 'is', null);

      if (error) throw error;

      // Extrair nomes únicos e filtrar nomes que parecem grupos
      const uniqueNames = new Set<string>();
      const groupPatterns = ['#', 'VIP', 'GRUPO', 'Bazar', 'Festival', '@g.us', 'Secreto', 'Compras'];
      
      orders?.forEach((order: { whatsapp_group_name: string | null }) => {
        const name = order.whatsapp_group_name;
        if (name && groupPatterns.some(p => name.toLowerCase().includes(p.toLowerCase()))) {
          uniqueNames.add(name);
        }
      });

      // Também carregar grupos da Z-API se disponível
      try {
        const response = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
          body: { action: 'list-groups', tenant_id: tenant.id }
        });
        
        if (response.data && Array.isArray(response.data)) {
          response.data.forEach((chat: { isGroup: boolean; name: string }) => {
            if (chat.isGroup && chat.name) {
              uniqueNames.add(chat.name);
            }
          });
        }
      } catch (zapiError) {
        console.warn('Z-API não disponível para sugestões');
      }

      // Buscar grupos já cadastrados
      const { data: existingGroups } = await supabaseTenant.raw
        .from('whatsapp_allowed_groups')
        .select('group_name')
        .eq('tenant_id', tenant.id);

      const existingNames = new Set(
        ((existingGroups as { group_name: string }[]) || []).map((g) => g.group_name)
      );

      // Filtrar sugestões que ainda não estão cadastradas
      const suggestions = Array.from(uniqueNames)
        .filter(name => !existingNames.has(name))
        .sort();

      setSuggestedGroups(suggestions);
    } catch (error: any) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const addGroup = async (groupName: string) => {
    if (!tenant?.id || !groupName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabaseTenant.raw
        .from('whatsapp_allowed_groups')
        .insert({
          tenant_id: tenant.id,
          group_name: groupName.trim(),
          is_active: true
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Aviso',
            description: 'Este grupo já está cadastrado',
            variant: 'destructive'
          });
          return;
        }
        throw error;
      }

      toast({
        title: 'Sucesso',
        description: `Grupo "${groupName}" adicionado`
      });

      setNewGroupName('');
      setSuggestedGroups(prev => prev.filter(g => g !== groupName));
      loadGroups();
    } catch (error: any) {
      console.error('Error adding group:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao adicionar grupo',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = async (group: AllowedGroup) => {
    try {
      const { error } = await supabaseTenant.raw
        .from('whatsapp_allowed_groups')
        .update({ is_active: !group.is_active })
        .eq('id', group.id)
        .eq('tenant_id', tenant?.id);

      if (error) throw error;

      setGroups(prev => prev.map(g => 
        g.id === group.id ? { ...g, is_active: !g.is_active } : g
      ));

      toast({
        title: 'Sucesso',
        description: `Grupo ${!group.is_active ? 'ativado' : 'desativado'}`
      });
    } catch (error: any) {
      console.error('Error toggling group:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao atualizar grupo',
        variant: 'destructive'
      });
    }
  };

  const deleteGroup = async (group: AllowedGroup) => {
    if (!confirm(`Remover "${group.group_name}" da lista de grupos permitidos?`)) return;

    try {
      const { error } = await supabaseTenant.raw
        .from('whatsapp_allowed_groups')
        .delete()
        .eq('id', group.id)
        .eq('tenant_id', tenant?.id);

      if (error) throw error;

      setGroups(prev => prev.filter(g => g.id !== group.id));
      
      // Adicionar de volta às sugestões
      setSuggestedGroups(prev => [...prev, group.group_name].sort());

      toast({
        title: 'Sucesso',
        description: 'Grupo removido'
      });
    } catch (error: any) {
      console.error('Error deleting group:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao remover grupo',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Grupos do WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Users className="h-5 w-5 mr-2" />
          Grupos do WhatsApp
        </CardTitle>
        <CardDescription>
          Configure quais grupos de WhatsApp devem aparecer nos relatórios. 
          Apenas grupos cadastrados aqui serão exibidos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Adicionar novo grupo */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Adicionar Grupo</h4>
          <div className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nome do grupo (ex: GRUPO VIP #01)"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newGroupName.trim()) {
                  addGroup(newGroupName);
                }
              }}
            />
            <Button 
              onClick={() => addGroup(newGroupName)} 
              disabled={saving || !newGroupName.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Adicionar</span>
            </Button>
          </div>
        </div>

        {/* Sugestões baseadas nos pedidos */}
        {suggestedGroups.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Sugestões de Grupos</h4>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={loadSuggestions}
                disabled={loadingSuggestions}
              >
                {loadingSuggestions ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedGroups.slice(0, 10).map((name) => (
                <Badge
                  key={name}
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => addGroup(name)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {name}
                </Badge>
              ))}
              {suggestedGroups.length > 10 && (
                <Badge variant="outline">
                  +{suggestedGroups.length - 10} mais
                </Badge>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Lista de grupos cadastrados */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              Grupos Cadastrados ({groups.length})
            </h4>
            {groups.length > 0 && (
              <Badge variant="outline">
                {groups.filter(g => g.is_active).length} ativos
              </Badge>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum grupo cadastrado</p>
              <p className="text-sm">
                Adicione grupos acima ou clique nas sugestões
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    group.is_active 
                      ? 'bg-muted/30 border-border' 
                      : 'bg-muted/10 border-muted opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={group.is_active ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleGroup(group)}
                    >
                      {group.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <span className={group.is_active ? '' : 'line-through'}>
                      {group.group_name}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteGroup(group)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
          <strong>💡 Dica:</strong> O relatório de Grupos de WhatsApp só mostrará vendas 
          dos grupos cadastrados aqui + "Pedido Manual". Grupos de outros tenants 
          não aparecerão no seu relatório.
        </div>
      </CardContent>
    </Card>
  );
}
