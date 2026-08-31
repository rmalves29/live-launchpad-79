import { type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'gray';
  hint?: string;
  className?: string;
}

const COLOR_MAP: Record<NonNullable<StatCardProps['color']>, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-400' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-600 dark:text-amber-400' },
  green: { bg: 'bg-green-100 dark:bg-green-950', text: 'text-green-600 dark:text-green-400' },
  red: { bg: 'bg-red-100 dark:bg-red-950', text: 'text-red-600 dark:text-red-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-950', text: 'text-purple-600 dark:text-purple-400' },
  gray: { bg: 'bg-muted', text: 'text-muted-foreground' },
};

// Card de estatística no padrão ReUI: badge de ícone colorido + número em destaque.
export function StatCard({ label, value, icon: Icon, color = 'gray', hint, className }: StatCardProps) {
  const colors = COLOR_MAP[color];
  return (
    <Card className={cn('p-4 flex items-center gap-3', className)}>
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', colors.bg)}>
        <Icon className={cn('h-5 w-5', colors.text)} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground/70 truncate">{hint}</div>}
      </div>
    </Card>
  );
}
