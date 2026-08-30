interface DiceTypeIconProps {
  sides: 4 | 6 | 8 | 10 | 12 | 20 | 100;
  className?: string;
}

const sharedProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function DiceTypeIcon({ sides, className }: DiceTypeIconProps) {
  if (sides === 4) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="faceted-3d" data-die-shape="d4" className={className}>
        <path d="M24 5 43 40H5L24 5Z" />
        <g data-die-facets>
          <path d="M24 5 24 30M5 40l19-10 19 10" />
        </g>
      </svg>
    );
  }

  if (sides === 6) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="faceted-3d" data-die-shape="d6" className={className}>
        <path d="m10 14 16-8 13 9-2 22-16 6-13-9 2-20Z" />
        <g data-die-facets>
          <path d="m10 14 14 9 15-8M24 23l-3 20M8 34l13 9M24 23 37 37" />
        </g>
      </svg>
    );
  }

  if (sides === 8) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="faceted-3d" data-die-shape="d8" className={className}>
        <path d="M24 4 43 24 24 44 5 24 24 4Z" />
        <g data-die-facets>
          <path d="M24 4v40M5 24h38M24 4 5 24l19 7 19-7L24 4Z" />
        </g>
      </svg>
    );
  }

  if (sides === 10) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="faceted-3d" data-die-shape="d10" className={className}>
        <path d="m24 4 15 10 4 14-19 16L5 28l4-14L24 4Z" />
        <g data-die-facets>
          <path d="M24 4v29M9 14l15 19 15-19M5 28l19 5 19-5M24 33v11" />
        </g>
      </svg>
    );
  }

  if (sides === 12) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="faceted-3d" data-die-shape="d12" className={className}>
        <path d="m24 4 12 5 8 10-2 13-9 10H15L6 32 4 19l8-10 12-5Z" />
        <g data-die-facets>
          <path d="m24 11 8 6-3 10H19l-3-10 8-6ZM12 9l4 8-10 2M36 9l-4 8 12 2M6 32l13-5-4 15M42 32l-13-5 4 15" />
        </g>
      </svg>
    );
  }

  if (sides === 20) {
    return (
      <svg {...sharedProps} viewBox="0 0 48 48" data-die-style="faceted-3d" data-die-shape="d20" className={className}>
        <path d="m24 3 14 7 7 14-7 14-14 7-14-7-7-14 7-14 14-7Z" />
        <g data-die-facets>
          <path d="m24 3-8 14h16L24 3ZM16 17 7 24l17 5 21-5-13-7M7 24l7 14 10-9 14 9 7-14M14 38l10 7 14-7M24 29V45" />
        </g>
      </svg>
    );
  }

  return (
    <svg {...sharedProps} viewBox="0 0 68 48" data-die-style="faceted-3d" data-die-shape="d100" className={className}>
      <g data-die-percentile-tens>
        <path d="m19 6 11 8 3 11-14 16L5 27l3-12L19 6Z" />
        <g data-die-facets>
          <path d="M19 6v25M8 15l11 16 11-17M5 27l14 4 14-6M19 31v10" />
        </g>
      </g>
      <g data-die-percentile-units>
        <path d="m49 8 11 8 3 11-14 15-14-13 3-12L49 8Z" />
        <g data-die-facets>
          <path d="M49 8v25M38 17l11 16 11-17M35 29l14 4 14-6M49 33v9" />
        </g>
      </g>
    </svg>
  );
}
