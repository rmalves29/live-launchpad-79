import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KanbanColumn {
  id: string;
  title: string;
  colorClass: string;
  items: ReactNode[];
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  className?: string;
}

// Board estilo Kanban (padrão ReUI), somente leitura/ações via card — sem
// drag-and-drop pra não introduzir dependência nova (@dnd-kit) no projeto.
export function KanbanBoard({ columns, className }: KanbanBoardProps) {
  return (
    <div className={cn('flex gap-3 overflow-x-auto pb-2', className)}>
      {columns.map((col) => (
        <div key={col.id} className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30">
          <div className={cn('flex items-center justify-between rounded-t-lg border-b px-3 py-2', col.colorClass)}>
            <span className="text-sm font-medium">{col.title}</span>
            <span className="text-xs font-semibold opacity-70">{col.items.length}</span>
          </div>
          <div className="flex-1 space-y-2 p-2 max-h-[560px] overflow-y-auto">
            {col.items.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Vazio</p>
            ) : (
              col.items
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KanbanCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md border bg-card p-3 text-sm shadow-sm', className)}>
      {children}
    </div>
  );
}
