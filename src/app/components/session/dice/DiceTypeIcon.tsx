interface DiceTypeIconProps {
  sides: 4 | 6 | 8 | 10 | 12 | 20 | 100;
  className?: string;
}

const sharedProps = {
  viewBox: '0 0 48 48',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function DiceTypeIcon({ sides, className }: DiceTypeIconProps) {
  if (sides === 4) {
    return (
      <svg {...sharedProps} data-die-shape="d4" className={className}>
        <path d="M24 5 42 39H6L24 5Z" />
        <path d="m24 5 5.5 23.5L42 39M24 5 18.5 28.5 6 39M18.5 28.5h11" />
      </svg>
    );
  }

  if (sides === 6) {
    return (
      <svg {...sharedProps} data-die-shape="d6" className={className}>
        <path d="m11 14 13-7 13 7v20l-13 7-13-7V14Z" />
        <path d="m11 14 13 7 13-7M24 21v20" />
      </svg>
    );
  }

  if (sides === 8) {
    return (
      <svg {...sharedProps} data-die-shape="d8" className={className}>
        <path d="M24 5 41 24 24 43 7 24 24 5Z" />
        <path d="M24 5v38M7 24h34M7 24l17-8 17 8M7 24l17 8 17-8" />
      </svg>
    );
  }

  if (sides === 10) {
    return (
      <svg {...sharedProps} data-die-shape="d10" className={className}>
        <path d="M24 4 39 16l4 12-19 16L5 28l4-12L24 4Z" />
        <path d="M24 4 18 18 5 28M24 4l6 14 13 10M18 18h12M18 18l6 26 6-26M5 28h38" />
      </svg>
    );
  }

  if (sides === 12) {
    return (
      <svg {...sharedProps} data-die-shape="d12" className={className}>
        <path d="m24 4 12 5 8 10-2 14-10 9H16L6 33 4 19 12 9l12-5Z" />
        <path d="m24 13 9 6-3 11H18l-3-11 9-6Z" />
        <path d="M24 4v9M12 9l3 10M4 19l11 0M6 33l12-3M16 42l2-12M32 42l-2-12M42 33l-12-3M44 19l-11 0M36 9l-3 10" />
      </svg>
    );
  }

  if (sides === 20) {
    return (
      <svg {...sharedProps} data-die-shape="d20" className={className}>
        <path d="M24 4 39 11l6 13-7 14-14 6-14-6-7-14 6-13 15-7Z" />
        <path d="m24 4-8 13 8 10 8-10-8-13ZM16 17 9 11M32 17l7-6M16 17 3 20M32 17l-3 20M24 27v17M3 24l13-7M45 24l-13-7M3 24l16 13M45 24 29 37M19 37h10" />
      </svg>
    );
  }

  return (
    <svg {...sharedProps} data-die-shape="d100" className={className}>
      <path d="M17 7 29 15l3 10-15 15L4 28l3-11L17 7Z" />
      <path d="M17 7 12 19 4 28M17 7l5 12 10 6M12 19h10M12 19l5 21 5-21" />
      <path d="M31 8 43 16l2 10-13 14-7-6" />
      <path d="m31 8-5 11 5 9 5-10-5-10ZM36 18l7-2M36 18l-4 22M45 26l-9-8" />
    </svg>
  );
}
