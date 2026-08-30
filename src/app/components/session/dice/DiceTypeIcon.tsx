interface DiceTypeIconProps {
  sides: 4 | 6 | 8 | 10 | 12 | 20 | 100;
  className?: string;
}

const sharedProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.1,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const valueProps = {
  fill: 'currentColor',
  stroke: 'none',
  textAnchor: 'middle' as const,
  dominantBaseline: 'central' as const,
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  fontWeight: 700,
};

export function DiceTypeIcon({ sides, className }: DiceTypeIconProps) {
  if (sides === 4) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="polymath-outline" data-die-shape="d4" className={className}>
        <path d="M24 6 42 39H6L24 6Z" />
        <text {...valueProps} x="24" y="28" fontSize="13">4</text>
      </svg>
    );
  }

  if (sides === 6) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="polymath-outline" data-die-shape="d6" className={className}>
        <rect x="8" y="8" width="32" height="32" rx="3" />
        <text {...valueProps} x="24" y="24" fontSize="14">6</text>
      </svg>
    );
  }

  if (sides === 8) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="polymath-outline" data-die-shape="d8" className={className}>
        <path d="M24 5 42 24 24 43 6 24 24 5Z" />
        <text {...valueProps} x="24" y="24" fontSize="14">8</text>
      </svg>
    );
  }

  if (sides === 10) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="polymath-outline" data-die-shape="d10" className={className}>
        <path d="M24 5 39 16 42 28 24 43 6 28l3-12L24 5Z" />
        <text {...valueProps} x="24" y="25" fontSize="12">10</text>
      </svg>
    );
  }

  if (sides === 12) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="polymath-outline" data-die-shape="d12" className={className}>
        <path d="m24 5 11 4 8 9-1 13-8 10H14L6 31 5 18l8-9 11-4Z" />
        <text {...valueProps} x="24" y="24" fontSize="12">12</text>
      </svg>
    );
  }

  if (sides === 20) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="polymath-outline" data-die-shape="d20" className={className}>
        <path d="m24 4 14 7 7 13-7 14-14 6-14-6-7-14 7-13 14-7Z" />
        <text {...valueProps} x="24" y="24" fontSize="12">20</text>
      </svg>
    );
  }

  return (
    <svg {...sharedProps} viewBox="0 0 64 48" data-die-style="polymath-outline" data-die-shape="d100" className={className}>
      <g data-die-percentile-tens>
        <path d="M19 7 30 15l2 9-13 15L6 27l3-11L19 7Z" />
        <text {...valueProps} x="19" y="24" fontSize="9.5">00</text>
      </g>
      <g data-die-percentile-units>
        <path d="M45 9 57 17l2 9-13 14-13-12 2-10L45 9Z" />
        <text {...valueProps} x="46" y="25" fontSize="10">0</text>
      </g>
    </svg>
  );
}
