import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, UserMinus, Gift } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Automation {
  id: string;
  tenant_id: string;
  name: string;
  group_ids: string[];
  delay_minutes: number;
  invite_message: string;
  reward_message: string;
  coupon_code: string;
  validity_days: number;
  cooldown_hours: number;
  is_active: boolean;
}

interface FeGroup { id: string; group_name: string; }
interface Coupon { id: string; code: string; is_active: boolean; }

const defaultForm: Omit<Automation, 'id' | 'tenant_id'> = {
  name: '',
  group_ids: [],
  delay_minutes: 60,
  invite_message: 'Olá {nome}, sentimos sua falta no grupo *{grupo}*! 💛\nVolte agora pelo link e libere um cupom especial:\n{link_grupo}',
  reward_message: 'Que bom te ver de volta, {nome}! 🎉\nAqui está seu cupom exclusivo: *{cupom}*',
  coupon_code: '',
  validity_days: 7,
  cooldown_hours: 24,
  is_active: true,
};

export default function ReturnAutomationsManager() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [items, setItems] = useState<Automation[]>([]);
  const [groups, setGroups] = useState<FeGroup[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [stats, setStats] = useState<{ scheduled: number; invited: number; rewarded: number }>({ scheduled: 0, invited: 0, rewarded: 0 });

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const [{ data: autos }, { data: grps }, { data: cps }, { data: pend }] = await Promise.all([
      supabase.from('fe_return_automations' as any).select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
      supabase.from('fe_groups').select('id, group_name').eq('tenant_id', tenant.id).eq('is_active', true).order('group_name'),
      supabase.from('coupons').select('id, code, is_active').eq('tenant_id', tenant.id).eq('is_active', true).order('code'),
      supabase.from('fe_return_pending' as any).select('status').eq('tenant_id', tenant.id),
    ]);
    setItems((autos || []) as any);
    setGroups((grps || []) as any);
    setCoupons((cps || []) as any);
    const p = (pend || []) as any[];
    setStats({
      scheduled: p.filter((x) => x.status === 'scheduled').length,
      invited: p.filter((x) => x.status === 'invited').length,
      rewarded: p.filter((x) => x.status === 'rewarded').length,
    });
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => { setEditingId(null); setForm({ ...defaultForm }); setDialogOpen(true); };
  const openEdit = (a: Automation) => {
    setEditingId(a.id);
    setForm({
      name: a.name,
      group_ids: a.group_ids || [],
      delay_minutes: a.delay_minutes,
      invite_message: a.invite_message,
      reward_message: a.reward_message,
      coupon_code: a.coupon_code,
      validity_days: a.validity_days,
      cooldown_hours: a.cooldown_hours,
      is_active: a.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!tenant) return;
    if (!form.name.trim() || form.group_ids.length === 0 || !form.invite_message.trim() || !form.reward_message.trim() || !form.coupon_code.trim()) {
      toast({ title: 'Preencha nome, grupos, mensagens e cupom', variant: 'destructive' });
      return;
    }
    const payload = { ...form, tenant_id: tenant.id };
    const { error } = editingId
      ? await supabase.from('fe_return_automations' as any).update(payload).eq('id', editingId)
      : await supabase.from('fe_return_automations' as any).insert(payload);
    if (error) { toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editingId ? 'Automação atualizada' : 'Automação criada' });
    setDialogOpen(false);
    fetchData();
  };

  const toggle = async (a: Automation) => {
    const { error } = await supabase.from('fe_return_automations' as any).update({ is_active: !a.is_active }).eq('id', a.id);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    fetchData();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir esta automação? Convites pendentes serão cancelados.')) return;
    const { error } = await supabase.from('fe_return_automations' as any).delete().eq('id', id);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Automação excluída' });
    fetchData();
  };

  const toggleGroupInForm = (gid: string) => {
    setForm((f) => ({
      ...f,
      group_ids: f.group_ids.includes(gid) ? f.group_ids.filter((x) => x !== gid) : [...f.group_ids, gid],
    }));
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Automações de Retorno</h2>
          <p className="text-sm text-muted-foreground">
            Envie um convite privado com cupom para clientes que saíram do grupo e voltarem.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova automação</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Convites agendados</div>
          <div className="text-2xl font-bold">{stats.scheduled}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Aguardando retorno</div>
          <div className="text-2xl font-bold">{stats.invited}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Cupons entregues</div>
          <div className="text-2xl font-bold">{stats.rewarded}</div>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma automação de retorno criada ainda.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => {
            const groupNames = a.group_ids.map((gid) => groups.find((g) => g.id === gid)?.group_name).filter(Boolean);
            return (
              <Card key={a.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{a.name}</h3>
                      {a.is_active ? <Badge variant="default">Ativa</Badge> : <Badge variant="secondary">Pausada</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1"><UserMinus className="h-3 w-3" /> Convite em {a.delay_minutes} min</span>
                      <span className="inline-flex items-center gap-1"><Gift className="h-3 w-3" /> Cupom: <b>{a.coupon_code}</b></span>
                      <span>Validade: {a.validity_days} dias</span>
                    </div>
                    {groupNames.length > 0 && (
                      <div className="text-xs mt-1 text-muted-foreground truncate">
                        Grupos: {groupNames.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={a.is_active} onCheckedChange={() => toggle(a)} />
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar automação' : 'Nova automação de retorno'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Volta VIP" />
            </div>

            <div>
              <Label>Grupos onde a automação vale</Label>
              <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                {groups.length === 0 && <div className="text-xs text-muted-foreground p-2">Nenhum grupo cadastrado</div>}
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-muted rounded">
                    <input type="checkbox" checked={form.group_ids.includes(g.id)} onChange={() => toggleGroupInForm(g.id)} />
                    <span>{g.group_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Delay do convite (minutos)</Label>
                <Input type="number" min={1} value={form.delay_minutes} onChange={(e) => setForm({ ...form, delay_minutes: parseInt(e.target.value) || 60 })} />
              </div>
              <div>
                <Label>Validade do convite (dias)</Label>
                <Input type="number" min={1} value={form.validity_days} onChange={(e) => setForm({ ...form, validity_days: parseInt(e.target.value) || 7 })} />
              </div>
            </div>

            <div>
              <Label>Cooldown por cliente (horas) — evita reenvio se sair/voltar várias vezes</Label>
              <Input type="number" min={0} value={form.cooldown_hours} onChange={(e) => setForm({ ...form, cooldown_hours: parseInt(e.target.value) || 0 })} />
            </div>

            <div>
              <Label>Cupom que será entregue</Label>
              <Select value={form.coupon_code} onValueChange={(v) => setForm({ ...form, coupon_code: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione um cupom" /></SelectTrigger>
                <SelectContent>
                  {coupons.length === 0 && <SelectItem value="__none" disabled>Nenhum cupom ativo</SelectItem>}
                  {coupons.map((c) => <SelectItem key={c.id} value={c.code}>{c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Mensagem de convite (privada)</Label>
              <Textarea rows={4} value={form.invite_message} onChange={(e) => setForm({ ...form, invite_message: e.target.value })} />
              <div className="text-xs text-muted-foreground mt-1">Variáveis: {'{nome}'}, {'{grupo}'}, {'{link_grupo}'}</div>
            </div>

            <div>
              <Label>Mensagem de recompensa (quando voltar)</Label>
              <Textarea rows={3} value={form.reward_message} onChange={(e) => setForm({ ...form, reward_message: e.target.value })} />
              <div className="text-xs text-muted-foreground mt-1">Variáveis: {'{nome}'}, {'{cupom}'}, {'{grupo}'}</div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Ativa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
