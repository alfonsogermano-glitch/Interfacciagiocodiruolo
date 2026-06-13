import type { ReactNode } from 'react';

type TagBadgeProps = {
  children: ReactNode;
  tooltip?: string;
};

export function TagBadge({ children, tooltip }: TagBadgeProps) {
  return (
    <span className="group/tag relative inline-flex">
      <span className="rounded-full border border-[#5a4030] bg-[#1b1616] px-2 py-0.5 text-[#bfa98c]">
        {children}
      </span>

      {tooltip && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-[#6a452f] bg-[#221714] px-3 py-2 text-xs text-[#f3e7d0] shadow-xl group-hover/tag:block">
          {tooltip}
        </span>
      )}
    </span>
  );
}