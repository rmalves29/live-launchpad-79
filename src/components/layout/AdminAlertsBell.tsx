// Sininho de alertas do super admin (topo do sistema, ao lado de Tutoriais).
// Mostra quantos problemas estão em aberto agora; ao clicar, lista cada um com o que está acontecendo,
// o efeito para as lojas e o que fazer. Os alertas vêm da checagem de saúde (cron a cada 15 min) — nada é enviado
// por WhatsApp. Um problema some sozinho do sininho quando a checagem não o encontra mais.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SystemAlert {
  rule_key: string;
  severity: 'warn' | 'error';
  title: string;
  problem: string | null;
  what_to_do: string | null;
  first_seen: string;
  last_seen: string;
}

const REFRESH_MS = 60_000;

function since(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

export function AdminAlertsBell() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('system_alerts')
      .select('rule_key, severity, title, problem, what_to_do, first_seen, last_seen')
      .is('resolved_at', null)
      .order('severity', { ascending: true }) // 'error' antes de 'warn'
      .order('first_seen', { ascending: false });
    if (!error) setAlerts((data || []) as SystemAlert[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => clearInterval(iv);
  }, [load]);

  const count = alerts.length;
  const hasError = alerts.some((a) => a.severity === 'error');

  return (
    <Popover onOpenChange={(open) => { if (open) load(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex items-center justify-center h-8 w-8 rounded-full text-[#4b5563] hover:bg-[#f3f4f6] hover:text-[#111827]"
          title={count ? `${count} alerta(s) do sistema` : 'Alertas do sistema'}
          aria-label={count ? `${count} alertas do sistema` : 'Alertas do sistema'}
        >
          <Bell className="h-[18px] w-[18px]" />
          {count > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-[18px] text-white text-center ${hasError ? 'bg-red-600' : 'bg-amber-500'}`}
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-semibold text-[#111827]">Alertas do sistema</p>
          <Link to="/admin/saude" className="text-[12px] text-[#4f46e5] hover:underline">Saúde do sistema</Link>
        </div>
        {!loaded ? (
          <p className="px-4 py-6 text-sm text-[#6b7280]">Carregando…</p>
        ) : count === 0 ? (
          <div className="px-4 py-6 flex items-center gap-2 text-sm text-[#6b7280]">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Nenhum problema agora.
          </div>
        ) : (
          <ScrollArea className="max-h-[420px]">
            <ul className="divide-y">
              {alerts.map((a) => (
                <li key={a.rule_key} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    {a.severity === 'error'
                      ? <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                      : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />}
                    <div className="space-y-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#111827] leading-snug">{a.title}</p>
                      {a.problem && <p className="text-[12px] text-[#4b5563] leading-snug"><span className="font-medium">Problema:</span> {a.problem}</p>}
                      {a.what_to_do && <p className="text-[12px] text-[#4b5563] leading-snug"><span className="font-medium">O que fazer:</span> {a.what_to_do}</p>}
                      <p className="text-[11px] text-[#9ca3af]">Desde {since(a.first_seen)} · visto {since(a.last_seen)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default AdminAlertsBell;
