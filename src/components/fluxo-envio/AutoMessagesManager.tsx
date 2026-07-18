import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, UserPlus, UserMinus, MessageSquare, Upload, X, Pencil, Gift } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface AutoMessage {
  id: string;
  tenant_id: string;
  group_id: string | null;
  campaign_id: string | null;
  event_type: string;
  content_type: string;
  content_text: string | null;
  media_url: string | null;
  is_active: boolean;
}

interface ReturnAutomation {
  id: string;
  tenant_id: string;
  name: string;
  group_ids: string[];
  campaign_ids: string[];
  delay_minutes: number;
  invite_message: string;
  reward_message: string;
  coupon_code: string;
  validity_days: number;
  cooldown_hours: number;
  is_active: boolean;
}

interface FeGroup { id: string; group_name: string; }
interface FeCampaign { id: string; name: string; }
interface Coupon { id: string; code: string; }

type ScopeType = 'all' | 'group' | 'campaign';

interface JoinForm {
  event_type: 'join';
  content_type: string;
  content_text: string;
  media_url: string;
  scope_type: ScopeType;
  scope_id: string;
}

interface LeaveForm {
  event_type: 'leave';
  name: string;
  scope_type: 'group' | 'campaign';
  scope_ids: string[];
  invite_message: string;
  reward_message: string;
  coupon_code: string;
  validity_days: number;
  cooldown_hours: number;
  is_active: boolean;
}

const defaultJoin: JoinForm = {
  event_type: 'join',
  content_type: 'text',
  content_text: '',
  media_url: '',
  scope_type: 'all',
  scope_id: '',
};

const defaultLeave: LeaveForm = {
  event_type: 'leave',
  name: '',
  scope_type: 'group',
  scope_ids: [],
  invite_message: 'Olá {nome}, sentimos sua falta no grupo *{grupo}*! 💛\nVolte agora pelo link e libere um cupom especial:\n{link_grupo}',
  reward_message: 'Que bom te ver de volta, {nome}! 🎉\nAqui está seu cupom exclusivo: *{cupom}*',
  coupon_code: '',
  validity_days: 7,
  cooldown_hours: 24,
  is_active: true,
};

export default function AutoMessagesManager() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [joinMessages, setJoinMessages] = useState<AutoMessage[]>([]);
  const [returnAutos, setReturnAutos] = useState<ReturnAutomation[]>([]);
  const [groups, setGroups] = useState<FeGroup[]>([]);
  const [campaigns, setCampaigns] = useState<FeCampaign[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [returnStats, setReturnStats] = useState({ left: 0, returned: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventType, setEventType] = useState<'join' | 'leave'>('join');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [joinForm, setJoinForm] = useState<JoinForm>({ ...defaultJoin });
  const [leaveForm, setLeaveForm] = useState<LeaveForm>({ ...defaultLeave });

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const [{ data: msgs }, { data: autos }, { data: grps }, { data: camps }, { data: cps }, { count: leftCount }, { count: returnedCount }] = await Promise.all([
      supabase.from('fe_auto_messages' as any).select('*').eq('tenant_id', tenant.id).eq('event_type', 'join').order('created_at', { ascending: false }),
      supabase.from('fe_return_automations' as any).select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
      supabase.from('fe_groups' as any).select('id, group_name, is_admin, is_active').eq('tenant_id', tenant.id).eq('is_admin', true).eq('is_active', true).order('group_name'),
      supabase.from('fe_campaigns' as any).select('id, name').eq('tenant_id', tenant.id).order('name'),
      supabase.from('coupons').select('id, code').eq('tenant_id', tenant.id).eq('is_active', true).order('code'),
      supabase.from('fe_return_pending' as any).select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      supabase.from('fe_return_pending' as any).select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'rewarded'),
    ]);
    if (msgs) setJoinMessages(msgs as any);
    if (autos) setReturnAutos(autos as any);
    if (grps) setGroups(grps as any);
    if (camps) setCampaigns(camps as any);
    if (cps) setCoupons(cps as any);
    setReturnStats({ left: leftCount || 0, returned: returnedCount || 0 });
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast({ title: 'Formato inválido', description: 'Use JPG, PNG, WebP ou GIF', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) { toast({ title: 'Arquivo muito grande', variant: 'destructive' }); return; }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${tenant.id}/auto-messages/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
    if (error) toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    else {
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      setJoinForm(p => ({ ...p, media_url: urlData.publicUrl }));
      toast({ title: 'Imagem enviada!' });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCreate = () => {
    setEditingId(null);
    setEventType('join');
    setJoinForm({ ...defaultJoin });
    setLeaveForm({ ...defaultLeave });
    setDialogOpen(true);
  };

  const openEditJoin = (msg: AutoMessage) => {
    setEditingId(msg.id);
    setEventType('join');
    let scope_type: ScopeType = 'all'; let scope_id = '';
    if (msg.campaign_id) { scope_type = 'campaign'; scope_id = msg.campaign_id; }
    else if (msg.group_id) { scope_type = 'group'; scope_id = msg.group_id; }
    setJoinForm({
      event_type: 'join',
      content_type: msg.content_type,
      content_text: msg.content_text || '',
      media_url: msg.media_url || '',
      scope_type, scope_id,
    });
    setDialogOpen(true);
  };

  const openEditLeave = (a: ReturnAutomation) => {
    setEditingId(a.id);
    setEventType('leave');
    const useCampaigns = (a.campaign_ids?.length || 0) > 0;
    setLeaveForm({
      event_type: 'leave',
      name: a.name,
      scope_type: useCampaigns ? 'campaign' : 'group',
      scope_ids: useCampaigns ? (a.campaign_ids || []) : (a.group_ids || []),
      invite_message: a.invite_message,
      reward_message: a.reward_message,
      coupon_code: a.coupon_code,
      validity_days: a.validity_days,
      cooldown_hours: a.cooldown_hours,
      is_active: a.is_active,
    });
    setDialogOpen(true);
  };

  const saveJoin = async () => {
    if (!tenant || !joinForm.content_text.trim()) { toast({ title: 'Preencha o texto', variant: 'destructive' }); return; }
    if (joinForm.content_type === 'image' && !joinForm.media_url) { toast({ title: 'Anexe uma imagem', variant: 'destructive' }); return; }
    if (joinForm.scope_type !== 'all' && !joinForm.scope_id) { toast({ title: 'Selecione o escopo', variant: 'destructive' }); return; }
    const payload = {
      tenant_id: tenant.id,
      event_type: 'join',
      content_type: joinForm.content_type,
      content_text: joinForm.content_text,
      media_url: joinForm.media_url || null,
      group_id: joinForm.scope_type === 'group' ? joinForm.scope_id : null,
      campaign_id: joinForm.scope_type === 'campaign' ? joinForm.scope_id : null,
      is_active: true,
    } as any;
    let error;
    if (editingId) {
      const { tenant_id, ...upd } = payload;
      ({ error } = await supabase.from('fe_auto_messages' as any).update(upd).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('fe_auto_messages' as any).insert(payload));
    }
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Salvo' }); setDialogOpen(false); fetchData(); }
  };

  const saveLeave = async () => {
    if (!tenant) return;
    if (!leaveForm.name.trim() || leaveForm.scope_ids.length === 0 || !leaveForm.invite_message.trim() || !leaveForm.reward_message.trim()) {
      toast({ title: 'Preencha nome, escopo e mensagens', variant: 'destructive' });
      return;
    }
    const payload = {
      tenant_id: tenant.id,
      name: leaveForm.name,
      group_ids: leaveForm.scope_type === 'group' ? leaveForm.scope_ids : [],
      campaign_ids: leaveForm.scope_type === 'campaign' ? leaveForm.scope_ids : [],
      delay_minutes: 0,
      invite_message: leaveForm.invite_message,
      reward_message: leaveForm.reward_message,
      coupon_code: leaveForm.coupon_code,
      validity_days: leaveForm.validity_days,
      cooldown_hours: leaveForm.cooldown_hours,
      is_active: leaveForm.is_active,
    } as any;
    const { error } = editingId
      ? await supabase.from('fe_return_automations' as any).update(payload).eq('id', editingId)
      : await supabase.from('fe_return_automations' as any).insert(payload);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Salvo' }); setDialogOpen(false); fetchData(); }
  };

  const save = () => (eventType === 'join' ? saveJoin() : saveLeave());

  const toggleJoin = async (msg: AutoMessage) => {
    await supabase.from('fe_auto_messages' as any).update({ is_active: !msg.is_active } as any).eq('id', msg.id);
    fetchData();
  };
  const toggleLeave = async (a: ReturnAutomation) => {
    await supabase.from('fe_return_automations' as any).update({ is_active: !a.is_active }).eq('id', a.id);
    fetchData();
  };

  const deleteJoin = async (id: string) => {
    if (!confirm('Remover?')) return;
    await supabase.from('fe_auto_messages' as any).delete().eq('id', id); fetchData();
  };
  const deleteLeave = async (id: string) => {
    if (!confirm('Remover? Convites pendentes serão cancelados.')) return;
    await supabase.from('fe_return_automations' as any).delete().eq('id', id); fetchData();
  };

  const getJoinScope = (msg: AutoMessage) => {
    if (msg.campaign_id) return `Campanha: ${campaigns.find(c => c.id === msg.campaign_id)?.name || ''}`;
    if (msg.group_id) return groups.find(g => g.id === msg.group_id)?.group_name || 'Grupo';
    return 'Todos os grupos';
  };

  const toggleScopeId = (id: string) => {
    setLeaveForm(f => ({
      ...f,
      scope_ids: f.scope_ids.includes(id) ? f.scope_ids.filter(x => x !== id) : [...f.scope_ids, id],
    }));
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Automações</h3>
          <p className="text-sm text-muted-foreground">Boas-vindas (entrada) e reengajamento com cupom (saída/retorno)</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Nova Automação</Button>
      </div>

      {/* Entradas */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground">Mensagens de entrada</h4>
        </div>
        {joinMessages.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />Nenhuma mensagem de boas-vindas configurada.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {joinMessages.map(msg => (
              <Card key={msg.id}>
                <CardContent className="py-3 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted"><UserPlus className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="default">Entrada</Badge>
                      <Badge variant="outline">{getJoinScope(msg)}</Badge>
                    </div>
                    <p className="text-sm whitespace-pre-wrap line-clamp-2">{msg.content_text}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEditJoin(msg)}><Pencil className="h-4 w-4" /></Button>
                    <Switch checked={msg.is_active} onCheckedChange={() => toggleJoin(msg)} />
                    <Button variant="ghost" size="icon" onClick={() => deleteJoin(msg.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Estatísticas de retorno */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <UserMinus className="h-3.5 w-3.5 text-destructive" /> Clientes que saíram
            </div>
            <div className="text-2xl font-bold text-foreground">{returnStats.left}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <UserPlus className="h-3.5 w-3.5 text-primary" /> Clientes que retornaram
            </div>
            <div className="text-2xl font-bold text-foreground">{returnStats.returned}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Gift className="h-3.5 w-3.5 text-primary" /> Sucesso de retorno
            </div>
            <div className="text-2xl font-bold text-foreground">
              {returnStats.left > 0 ? ((returnStats.returned / returnStats.left) * 100).toFixed(1) : '0.0'}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retorno */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <UserMinus className="h-4 w-4 text-destructive" />
          <h4 className="font-semibold text-foreground">Retorno após saída (com cupom)</h4>
        </div>
        {returnAutos.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">
            <Gift className="h-8 w-8 mx-auto mb-2 opacity-40" />Nenhuma automação de retorno configurada.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {returnAutos.map(a => {
              const inCamp = (a.campaign_ids?.length || 0) > 0;
              const names = inCamp
                ? a.campaign_ids.map(id => campaigns.find(c => c.id === id)?.name).filter(Boolean)
                : a.group_ids.map(id => groups.find(g => g.id === id)?.group_name).filter(Boolean);
              return (
                <Card key={a.id}>
                  <CardContent className="py-3 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted"><UserMinus className="h-4 w-4 text-destructive" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="destructive">Saída → Retorno</Badge>
                        <Badge variant="outline">{inCamp ? 'Campanhas' : 'Grupos'}: {names.join(', ') || '—'}</Badge>
                        <Badge variant="secondary"><Gift className="h-3 w-3 mr-1" />{a.coupon_code}</Badge>
                        <span className="text-xs text-muted-foreground">Validade {a.validity_days}d · Cooldown {a.cooldown_hours}h</span>
                      </div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{a.invite_message}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEditLeave(a)}><Pencil className="h-4 w-4" /></Button>
                      <Switch checked={a.is_active} onCheckedChange={() => toggleLeave(a)} />
                      <Button variant="ghost" size="icon" onClick={() => deleteLeave(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar automação' : 'Nova automação'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Evento</Label>
              <Select
                value={eventType}
                onValueChange={(v) => setEventType(v as 'join' | 'leave')}
                disabled={!!editingId}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="join">Entrada (boas-vindas no grupo)</SelectItem>
                  <SelectItem value="leave">Saída (convite privado de retorno + cupom)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {eventType === 'join' && (
              <>
                <div>
                  <Label>Escopo</Label>
                  <Select value={joinForm.scope_type} onValueChange={v => setJoinForm(p => ({ ...p, scope_type: v as ScopeType, scope_id: '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os grupos</SelectItem>
                      <SelectItem value="group">Grupo específico</SelectItem>
                      <SelectItem value="campaign">Campanha específica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {joinForm.scope_type === 'group' && (
                  <div>
                    <Label>Grupo</Label>
                    <Select value={joinForm.scope_id} onValueChange={v => setJoinForm(p => ({ ...p, scope_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{groups.map(g => <SelectItem key={g.id} value={g.id}>{g.group_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {joinForm.scope_type === 'campaign' && (
                  <div>
                    <Label>Campanha</Label>
                    <Select value={joinForm.scope_id} onValueChange={v => setJoinForm(p => ({ ...p, scope_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Tipo de conteúdo</Label>
                  <Select value={joinForm.content_type} onValueChange={v => setJoinForm(p => ({ ...p, content_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="image">Imagem + legenda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Texto</Label>
                  <Textarea rows={4} value={joinForm.content_text} onChange={e => setJoinForm(p => ({ ...p, content_text: e.target.value }))} />
                  <p className="text-xs text-muted-foreground mt-1">Variáveis: {'{{phone}}'}, {'{{group}}'}</p>
                </div>
                {joinForm.content_type === 'image' && (
                  <div className="space-y-2">
                    <Label>Imagem</Label>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFileUpload} />
                    {joinForm.media_url ? (
                      <div className="relative rounded-lg border overflow-hidden">
                        <img src={joinForm.media_url} alt="" className="w-full h-32 object-cover" />
                        <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => setJoinForm(p => ({ ...p, media_url: '' }))}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <Button variant="outline" className="w-full h-24 border-dashed flex flex-col gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        {uploading ? 'Enviando...' : (<><Upload className="h-5 w-5" /><span className="text-sm">Enviar imagem</span></>)}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}

            {eventType === 'leave' && (
              <>
                <div>
                  <Label>Nome da automação</Label>
                  <Input value={leaveForm.name} onChange={e => setLeaveForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Volta VIP" />
                </div>
                <div>
                  <Label>Aplicar em</Label>
                  <Select value={leaveForm.scope_type} onValueChange={v => setLeaveForm(p => ({ ...p, scope_type: v as any, scope_ids: [] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="group">Grupos</SelectItem>
                      <SelectItem value="campaign">Campanhas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{leaveForm.scope_type === 'group' ? 'Grupos (onde você é admin)' : 'Campanhas'}</Label>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {leaveForm.scope_type === 'group' ? (
                      groups.length === 0
                        ? <div className="text-xs text-muted-foreground p-2">Nenhum grupo admin ativo</div>
                        : groups.map(g => (
                          <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-muted rounded">
                            <input type="checkbox" checked={leaveForm.scope_ids.includes(g.id)} onChange={() => toggleScopeId(g.id)} />
                            <span>{g.group_name}</span>
                          </label>
                        ))
                    ) : (
                      campaigns.length === 0
                        ? <div className="text-xs text-muted-foreground p-2">Nenhuma campanha</div>
                        : campaigns.map(c => (
                          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-muted rounded">
                            <input type="checkbox" checked={leaveForm.scope_ids.includes(c.id)} onChange={() => toggleScopeId(c.id)} />
                            <span>{c.name}</span>
                          </label>
                        ))
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Validade (dias)</Label>
                    <Input type="number" min={1} value={leaveForm.validity_days} onChange={e => setLeaveForm(p => ({ ...p, validity_days: parseInt(e.target.value) || 7 }))} />
                  </div>
                  <div>
                    <Label>Cooldown (horas)</Label>
                    <Input type="number" min={0} value={leaveForm.cooldown_hours} onChange={e => setLeaveForm(p => ({ ...p, cooldown_hours: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div>
                  <Label>Mensagem de convite (privada, envio imediato)</Label>
                  <Textarea rows={4} value={leaveForm.invite_message} onChange={e => setLeaveForm(p => ({ ...p, invite_message: e.target.value }))} />
                  <p className="text-xs text-muted-foreground mt-1">Variáveis: {'{nome}'}, {'{grupo}'}, {'{link_grupo}'} · Envios respeitam limite de 1 msg / 5s.</p>
                </div>
                <div>
                  <Label>Mensagem de recompensa (quando o cliente voltar)</Label>
                  <Textarea rows={3} value={leaveForm.reward_message} onChange={e => setLeaveForm(p => ({ ...p, reward_message: e.target.value }))} />
                  <p className="text-xs text-muted-foreground mt-1">Variáveis: {'{nome}'}, {'{cupom}'}, {'{grupo}'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={leaveForm.is_active} onCheckedChange={v => setLeaveForm(p => ({ ...p, is_active: v }))} />
                  <Label>Ativa</Label>
                </div>
              </>
            )}

            <Button onClick={save} className="w-full" disabled={uploading}>
              {editingId ? 'Salvar alterações' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
