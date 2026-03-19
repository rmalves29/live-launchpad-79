import { useState, useCallback, useRef, useMemo } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions>({ description: '' });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const closeSourceRef = useRef<'confirm' | 'cancel' | null>(null);

  const resolveDialog = useCallback((value: boolean, source: 'confirm' | 'cancel') => {
    closeSourceRef.current = source;
    setIsOpen(false);
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  const confirm = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);

    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveDialog(true, 'confirm');
  }, [resolveDialog]);

  const handleCancel = useCallback(() => {
    resolveDialog(false, 'cancel');
  }, [resolveDialog]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      setIsOpen(true);
      return;
    }

    if (closeSourceRef.current) {
      closeSourceRef.current = null;
      return;
    }

    if (resolveRef.current) {
      resolveDialog(false, 'cancel');
    } else {
      setIsOpen(false);
    }
  }, [resolveDialog]);

  const confirmDialogElement = useMemo(() => (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options.title || 'Confirmar'}</AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            {options.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            {options.cancelText || 'Cancelar'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={options.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {options.confirmText || 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ), [handleCancel, handleConfirm, handleOpenChange, isOpen, options]);

  return { confirm, confirmDialogElement };
}
