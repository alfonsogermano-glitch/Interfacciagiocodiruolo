import type { ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';

export function ContextHint({ children, title = 'Suggerimento' }: { children: ReactNode; title?: string }) {
  return (
    <aside
      role="status"
      aria-live="polite"
      className="pointer-events-none w-[min(420px,calc(100%-2rem))] rounded-xl border border-cyan-300/35 bg-slate-950/95 px-4 py-3 text-sm leading-5 text-slate-100 shadow-xl backdrop-blur-sm"
    >
      <div className="mb-1 flex items-center gap-2 font-semibold text-cyan-300">
        <Lightbulb data-static-icon className="h-4 w-4" />
        {title}
      </div>
      <div>{children}</div>
    </aside>
  );
}
