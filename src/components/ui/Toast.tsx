import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const isErr = t.type === 'error';
        const isOk = t.type === 'success';
        const Icon = isErr ? AlertCircle : isOk ? CheckCircle2 : Info;
        const style = isErr
          ? 'bg-[#C53939] text-white'
          : isOk
            ? 'bg-[#16866B] text-white'
            : 'bg-[#183153] text-white';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg ${style}`}
          >
            <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
            <p className="text-sm font-medium flex-1">{t.text}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss notification"
              className="p-1 rounded-lg hover:bg-white/20 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
