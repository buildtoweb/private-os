'use client';
import { useEffect } from 'react';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
};

export function ConfirmDialog({ state, onClose }: {
  state: ConfirmOptions | null;
  onClose: () => void;
}) {
  const open = !!state;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') { state?.onConfirm(); onClose(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, state, onClose]);

  if (!open || !state) return null;

  const danger = state.tone === 'danger';

  return (
    <div
      className="safe-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 fade-in"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {state.title && <p className="font-semibold text-primary mb-1.5">{state.title}</p>}
        <p className="text-secondary text-sm leading-relaxed">{state.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={onClose}>
            {state.cancelLabel || 'Abbrechen'}
          </button>
          <button
            className="btn btn-primary"
            autoFocus
            style={danger ? { background: 'var(--color-red, #b8543a)', borderColor: 'transparent' } : undefined}
            onClick={() => { state.onConfirm(); onClose(); }}
          >
            {state.confirmLabel || 'Bestätigen'}
          </button>
        </div>
      </div>
    </div>
  );
}
