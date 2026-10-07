import { useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { checkVideoNoteFile } from '@/lib/video-note-check';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { BarChart3, Circle, FileText, Image, Loader2, Music, Plus, Trash2, Upload, Video, X } from 'lucide-react';

export type StepType = 'text' | 'image' | 'audio' | 'video' | 'video_note' | 'poll';

export interface SeqStep {
  key: string;
  contentType: StepType;
  text: string;
  mediaUrl: string;
  mediaName: string;
  uploading: boolean;
  pollOptions: string[];
  pollMultiple: boolean;
  delayValue: number;
  delayUnit: 'seconds' | 'minutes';
}

export const MAX_EXTRA_STEPS = 4;

export const newStep = (): SeqStep => ({
  key: Math.random().toString(36).slice(2),
  contentType: 'text',
  text: '',
  mediaUrl: '',
  mediaName: '',
  uploading: false,
  pollOptions: ['', ''],
  pollMultiple: false,
  delayValue: 5,
  delayUnit: 'seconds',
});

export const stepDelaySeconds = (s: SeqStep) =>
  Math.max(0, Math.round((Number(s.delayValue) || 0) * (s.delayUnit === 'minutes' ? 60 : 1)));

export const cleanStepPoll = (s: SeqStep) => s.pollOptions.map((o) => o.trim()).filter(Boolean);

/** Retorna a mensagem de erro (ou null se a etapa está válida). */
export function validateStep(s: SeqStep, index: number): string | null {
  const label = `Mensagem ${index + 2}`;
  if (s.uploading) return `${label}: aguarde o envio do arquivo terminar`;
  if (s.contentType === 'text' && !s.text.trim()) return `${label}: escreva o texto`;
  if (s.contentType === 'poll') {
    const opts = cleanStepPoll(s);
    if (!s.text.trim()) return `${label}: escreva a pergunta da enquete`;
    if (opts.length < 2) return `${label}: a enquete precisa de pelo menos 2 opções`;
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return `${label}: há opções repetidas na enquete`;
  } else if (s.contentType !== 'text' && !s.mediaUrl) {
    return `${label}: anexe um arquivo`;
  }
  return null;
}

const typeLabels: Record<StepType, string> = {
  text: 'Texto', image: 'Imagem', audio: 'Áudio', video: 'Vídeo', video_note: 'Vídeo redondo', poll: 'Enquete',
};
const acceptMap: Partial<Record<StepType, string>> = { image: 'image/*', audio: 'audio/*', video: 'video/*', video_note: 'video/*' };
const icon = (t: StepType) => {
  const c = 'h-4 w-4';
  return t === 'text' ? <FileText className={c} /> : t === 'image' ? <Image className={c} /> : t === 'audio' ? <Music className={c} />
    : t === 'video' ? <Video className={c} /> : t === 'video_note' ? <Circle className={c} /> : <BarChart3 className={c} />;
};

interface Props {
  steps: SeqStep[];
  onChange: (steps: SeqStep[]) => void;
  tenantId: string;
}

export default function SequenceSteps({ steps, onChange, tenantId }: Props) {
  const { toast } = useToast();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const patch = (key: string, p: Partial<SeqStep>) => onChange(steps.map((s) => (s.key === key ? { ...s, ...p } : s)));

  const upload = async (step: SeqStep, file: File) => {
    // Vídeo redondo: bloqueia arquivo pesado ou em HEVC antes de subir (senão chega em branco no WhatsApp)
    if (step.contentType === 'video_note') {
      const problem = await checkVideoNoteFile(file);
      if (problem) {
        toast({ title: 'Vídeo não serve para vídeo redondo', description: problem, variant: 'destructive' });
        const input = fileRefs.current[step.key];
        if (input) input.value = '';
        return;
      }
    }
    patch(step.key, { uploading: true, mediaName: file.name });
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${tenantId}/${Date.now()}-${step.key}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      patch(step.key, { uploading: false, mediaUrl: data.publicUrl, mediaName: file.name });
    } catch (e: any) {
      toast({ title: 'Erro ao enviar arquivo', description: e.message, variant: 'destructive' });
      patch(step.key, { uploading: false, mediaUrl: '', mediaName: '' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label>Mensagens seguintes (opcional)</Label>
          <p className="text-xs text-muted-foreground">
            Envie uma sequência, por exemplo uma imagem e logo depois a enquete, com um intervalo entre elas.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={steps.length >= MAX_EXTRA_STEPS} onClick={() => onChange([...steps, newStep()])}>
          <Plus className="h-4 w-4 mr-1" />Adicionar mensagem
        </Button>
      </div>

      {steps.map((s, idx) => (
        <Card key={s.key} className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Mensagem {idx + 2}</span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onChange(steps.filter((x) => x.key !== s.key))} aria-label="Remover mensagem">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Enviar</span>
              <Input
                type="number" min={0} max={s.delayUnit === 'minutes' ? 1440 : 3600} className="h-8 w-20"
                value={s.delayValue} onChange={(e) => patch(s.key, { delayValue: Number(e.target.value) })} aria-label="Tempo de espera"
              />
              <Select value={s.delayUnit} onValueChange={(v: any) => patch(s.key, { delayUnit: v })}>
                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">segundos</SelectItem>
                  <SelectItem value="minutes">minutos</SelectItem>
                </SelectContent>
              </Select>
              <span>depois da mensagem {idx + 1}</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(typeLabels) as StepType[]).map((t) => (
                <Button key={t} type="button" size="sm" variant={s.contentType === t ? 'default' : 'outline'}
                  onClick={() => patch(s.key, { contentType: t, mediaUrl: '', mediaName: '' })}>
                  {icon(t)}<span className="ml-1">{typeLabels[t]}</span>
                </Button>
              ))}
            </div>

            <div>
              <Label className="text-xs">{s.contentType === 'poll' ? 'Pergunta da enquete' : s.contentType === 'text' ? 'Mensagem' : 'Legenda (opcional)'}</Label>
              <Textarea rows={s.contentType === 'poll' ? 2 : 3} value={s.text} onChange={(e) => patch(s.key, { text: e.target.value })}
                placeholder={s.contentType === 'poll' ? 'Ex: Qual coleção você quer ver na live?' : 'Digite sua mensagem...'} />
            </div>

            {s.contentType === 'poll' && (
              <div className="space-y-2">
                <Label className="text-xs">Opções (de 2 a 12)</Label>
                {s.pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder={`Opção ${i + 1}`} value={opt} maxLength={100}
                      onChange={(e) => patch(s.key, { pollOptions: s.pollOptions.map((o, j) => (j === i ? e.target.value : o)) })} />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={s.pollOptions.length <= 2}
                      onClick={() => patch(s.key, { pollOptions: s.pollOptions.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" disabled={s.pollOptions.length >= 12}
                  onClick={() => patch(s.key, { pollOptions: [...s.pollOptions, ''] })}>
                  <Plus className="h-4 w-4 mr-1" />Adicionar opção
                </Button>
                <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30">
                  <Checkbox id={`pm-${s.key}`} checked={s.pollMultiple} onCheckedChange={(v) => patch(s.key, { pollMultiple: !!v })} />
                  <label htmlFor={`pm-${s.key}`} className="text-sm cursor-pointer">Permitir selecionar mais de uma opção</label>
                </div>
              </div>
            )}

            {s.contentType !== 'text' && s.contentType !== 'poll' && (
              <div>
                <input ref={(el) => { fileRefs.current[s.key] = el; }} type="file" accept={acceptMap[s.contentType]} className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(s, f); e.target.value = ''; }} />
                {s.mediaName ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
                    {icon(s.contentType)}
                    <span className="text-sm truncate flex-1">{s.mediaName}</span>
                    {s.uploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => patch(s.key, { mediaUrl: '', mediaName: '' })}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="w-full" onClick={() => fileRefs.current[s.key]?.click()}>
                    <Upload className="h-4 w-4 mr-2" />Selecionar arquivo
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
