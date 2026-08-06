import React, { createContext, useContext, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  toast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = (type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const remove = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const icons = {
    success: <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />,
    error: <XCircle size={18} className="text-red-500 flex-shrink-0" />,
    warning: <AlertCircle size={18} className="text-amber-500 flex-shrink-0" />,
    info: <Info size={18} className="text-blue-500 flex-shrink-0" />,
  };

  const borders = {
    success: 'border-l-emerald-500',
    error: 'border-l-red-500',
    warning: 'border-l-amber-500',
    info: 'border-l-blue-500',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'bg-white border border-slate-100 border-l-4 rounded-2xl shadow-toast p-4 flex gap-3 items-start pointer-events-auto',
              'slide-in-right',
              borders[t.type]
            )}
          >
            <div className={cn(
              'p-1 rounded-full flex-shrink-0',
              t.type === 'success' ? 'bg-emerald-50' :
              t.type === 'error' ? 'bg-red-50' :
              t.type === 'warning' ? 'bg-amber-50' : 'bg-blue-50'
            )}>
              {icons[t.type]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              {t.message && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.message}</p>}
            </div>
            <button
              onClick={() => remove(t.id)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex-shrink-0 transition-all"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
