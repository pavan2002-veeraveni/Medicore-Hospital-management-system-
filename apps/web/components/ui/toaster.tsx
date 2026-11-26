'use client';

import * as React from 'react';

interface ToastProps { id: string; title?: string; description?: string; variant?: 'default' | 'destructive'; }

const ToastContext = React.createContext<{ toast: (props: Omit<ToastProps, 'id'>) => void }>({ toast: () => {} });

export function useToast() { return React.useContext(ToastContext); }

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastProps[]>([]);
  const toast = React.useCallback((props: Omit<ToastProps, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...props, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`rounded-lg border p-4 shadow-lg animate-in slide-in-from-right ${t.variant === 'destructive' ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
            {t.title && <p className="font-semibold text-sm">{t.title}</p>}
            {t.description && <p className="text-sm text-gray-600 mt-1">{t.description}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
