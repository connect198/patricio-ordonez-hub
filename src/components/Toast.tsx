import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'error' | 'info';
interface T { id: number; kind: Kind; text: string }
const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((text: string, kind: Kind = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto max-w-md animate-rise rounded-xl border px-4 py-3 text-sm font-medium shadow-card backdrop-blur
            ${t.kind === 'error' ? 'border-red-400/50 bg-red-950/90 text-red-100' : t.kind === 'info' ? 'border-ivory/30 bg-charcoal text-ivory' : 'border-gold/50 bg-charcoal text-ivory'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
