import React, { useState, useCallback, useRef } from 'react';
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

  const confirm = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);

    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  // Return a stable React element, NOT a component function
  const confirmDialogElement = (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
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
  );

  return { confirm, confirmDialogElement };
}
