import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Plus, Users, Link2, Trash2, ExternalLink, ShieldCheck, Pencil } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface FeGroup {
  id: string;
  tenant_id: string;
  group_jid: string;
  group_name: string;
  invite_link: string | null;
  participant_count: number;
  max_participants: number;
  is_entry_open: boolean;
  is_active: boolean;
  created_at: string;
}

export default function GroupsManager() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [groups, setGroups] = useState<FeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [adminOnly, setAdminOnly] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({ group_jid: '', group_name: '', invite_link: '' });
  const [search, setSearch] = useState('');
  const [editingLink, setEditingLink] = useState<{ id: string; invite_link: string } | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('fe_groups' as any)
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('group_name');
    if (!error && data) setGroups(data as any);
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const syncFromWhatsApp = async () => {
    if (!tenant) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fe-list-groups', {
        body: { tenant_id: tenant.id, admin_only: adminOnly },
      });

      if (error) {
        toast({ title: 'Erro ao sincronizar', description: error.message, variant: 'destructive' });
      } else if (data?.error) {
        toast({ title: 'Erro ao sincronizar', description: data.error, variant: 'destructive' });
      } else {
        toast({ title: `${data.synced} grupos sincronizados (${data.total_found} encontrados no WhatsApp)` });
        fetchGroups();
      }
    } catch (err: any) {
      toast({ title: 'Erro ao sincronizar', description: err.message, variant: 'destructive' });
    }
    setSyncing(false);
  };

  const addGroup = async () => {
    if (!tenant || !newGroup.group_jid || !newGroup.group_name) {
      toast({ title: 'Preencha JID e nome do grupo', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('fe_groups' as any)
      .insert({
        tenant_id: tenant.id,
        group_jid: newGroup.group_jid,
        group_name: newGroup.group_name,
        invite_link: newGroup.invite_link || null,
      } as any);
    if (error) {
      toast({ title: 'Erro ao adicionar grupo', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Grupo adicionado' });
      setNewGroup({ group_jid: '', group_name: '', invite_link: '' });
      setAddOpen(false);
      fetchGroups();
    }
  };

  const toggleEntryOpen = async (group: FeGroup) => {
    await supabase
      .from('fe_groups' as any)
      .update({ is_entry_open: !group.is_entry_open } as any)
      .eq('id', group.id);
    fetchGroups();
  };

  const toggleActive = async (group: FeGroup) => {
    await supabase
      .from('fe_groups' as any)
      .update({ is_active: !group.is_active } as any)
      .eq('id', group.id);
    fetchGroups();
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Remover este grupo do gerenciamento?')) return;
    await supabase.from('fe_groups' as any).delete().eq('id', id);
    fetchGroups();
  };

  const saveInviteLink = async () => {
    if (!editingLink) return;
    await supabase
      .from('fe_groups' as any)
      .update({ invite_link: editingLink.invite_link || null } as any)
      .eq('id', editingLink.id);
    toast({ title: 'Link atualizado' });
    setEditingLink(null);
    fetchGroups();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-foreground">Grupos WhatsApp</h3>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Buscar grupo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox checked={adminOnly} onCheckedChange={(v) => setAdminOnly(!!v)} />
            <ShieldCheck className="h-4 w-4" />
            Somente grupos que sou admin
          </label>
          <Button variant="outline" size="sm" onClick={syncFromWhatsApp} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            Buscar do WhatsApp
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Adicionar Manual</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adicionar Grupo</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>JID do Grupo (WhatsApp)</Label>
                  <Input placeholder="5511999999999-1234567890@g.us" value={newGroup.group_jid}
                    onChange={(e) => setNewGroup(p => ({ ...p, group_jid: e.target.value }))} />
                </div>
                <div>
                  <Label>Nome do Grupo</Label>
                  <Input placeholder="Grupo de Vendas 01" value={newGroup.group_name}
                    onChange={(e) => setNewGroup(p => ({ ...p, group_name: e.target.value }))} />
                </div>
                <div>
                  <Label>Link de Convite (opcional)</Label>
                  <Input placeholder="https://chat.whatsapp.com/..." value={newGroup.invite_link}
                    onChange={(e) => setNewGroup(p => ({ ...p, invite_link: e.target.value }))} />
                </div>
                <Button onClick={addGroup} className="w-full">Adicionar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando grupos...</div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum grupo cadastrado</p>
            <p className="text-sm mt-1">Clique em "Buscar do WhatsApp" para importar seus grupos ou adicione manualmente.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-center">Participantes</TableHead>
                  <TableHead className="text-center">Entrada</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="text-center">Link</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.filter(g => g.group_name.toLowerCase().includes(search.toLowerCase())).map(g => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{g.group_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{g.group_jid}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        <Users className="h-3 w-3 mr-1" />{g.participant_count || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={g.is_entry_open} onCheckedChange={() => toggleEntryOpen(g)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={g.is_active} onCheckedChange={() => toggleActive(g)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {g.invite_link ? (
                          <a href={g.invite_link} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 text-primary inline" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setEditingLink({ id: g.id, invite_link: g.invite_link || '' })}
                          title="Editar link">
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteGroup(g.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Link Dialog */}
      <Dialog open={!!editingLink} onOpenChange={(open) => !open && setEditingLink(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Link de Convite</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Link de Convite do WhatsApp</Label>
              <Input
                placeholder="https://chat.whatsapp.com/..."
                value={editingLink?.invite_link || ''}
                onChange={(e) => setEditingLink(prev => prev ? { ...prev, invite_link: e.target.value } : null)}
              />
            </div>
            <Button onClick={saveInviteLink} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
