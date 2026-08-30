interface DiceTypeIconProps {
  sides: 4 | 6 | 8 | 10 | 12 | 20 | 100;
  className?: string;
}

const sharedProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.15,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function DiceTypeIcon({ sides, className }: DiceTypeIconProps) {
  if (sides === 4) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="wireframe-polyhedral" data-die-shape="d4" className={className}>
        <path data-die-wireframe-shell d="M24 5 43 39H5L24 5Z" />
        <g data-die-wireframe-edges>
          <path d="M24 5v25M5 39l19-9 19 9" />
        </g>
      </svg>
    );
  }

  if (sides === 6) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="wireframe-polyhedral" data-die-shape="d6" className={className}>
        <path data-die-wireframe-shell d="M9 14h26v26H9V14Z" />
        <g data-die-wireframe-edges>
          <path d="m9 14 7-8h25v25l-6 9M35 14l6-8M35 40l6-9" />
        </g>
      </svg>
    );
  }

  if (sides === 8) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="wireframe-polyhedral" data-die-shape="d8" className={className}>
        <path data-die-wireframe-shell d="M24 4 43 22 24 44 5 22 24 4Z" />
        <g data-die-wireframe-edges>
          <path d="m24 4 9 18-9 13-9-13 9-18ZM5 22h38M24 35v9" />
        </g>
      </svg>
    );
  }

  if (sides === 10) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="wireframe-polyhedral" data-die-shape="d10" className={className}>
        <path data-die-wireframe-shell d="m24 4 14 9 5 15-19 16L5 28l5-15 14-9Z" />
        <g data-die-wireframe-edges>
          <path d="m24 4 8 22-8 10-8-10 8-22ZM10 13l6 13-11 2M38 13l-6 13 11 2M24 36v8" />
        </g>
      </svg>
    );
  }

  if (sides === 12) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="wireframe-polyhedral" data-die-shape="d12" className={className}>
        <path data-die-wireframe-shell d="m24 4 12 4 8 10-2 13-9 10H15L6 31 4 18l8-10 12-4Z" />
        <g data-die-wireframe-edges>
          <path d="m24 11 9 7-4 11H19l-4-11 9-7ZM12 8l3 10-11 0M36 8l-3 10 11 0M6 31l13-2-4 12M42 31l-13-2 4 12" />
        </g>
      </svg>
    );
  }

  if (sides === 20) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="wireframe-polyhedral" data-die-shape="d20" className={className}>
        <path data-die-wireframe-shell d="M24 4 39 12 43 29 32 41H16L5 29 9 12 24 4Z" />
        <g data-die-wireframe-edges>
          <path d="M24 4 16 18h16L24 4ZM16 18 5 29l19-5 19 5-11-11M16 18l8 6 8-6M5 29l11 12 8-17 8 17 11-12M16 41h16" />
        </g>
      </svg>
    );
  }

  return (
    <svg {...sharedProps} viewBox="0 0 68 48" data-die-style="wireframe-polyhedral" data-die-shape="d100" className={className}>
      <g data-die-percentile-tens>
        <path data-die-wireframe-shell d="m18 6 11 7 4 12-15 15L3 26l4-12 11-8Z" />
        <g data-die-wireframe-edges>
          <path d="m18 6 6 18-6 9-6-9 6-18ZM7 14l5 10-9 2M29 13l-5 11 9 1M18 33v7" />
        </g>
      </g>
      <g data-die-percentile-units>
        <path data-die-wireframe-shell d="m50 8 11 7 4 12-15 15-15-14 4-12 11-8Z" />
        <g data-die-wireframe-edges>
          <path d="m50 8 6 18-6 9-6-9 6-18ZM39 16l5 10-9 2M61 15l-5 11 9 1M50 35v7" />
        </g>
      </g>
    </svg>
  );
}
