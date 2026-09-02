import { layoutCustomDieFaceText } from './diceCustomDie.ts';

export function CustomDieTextFace({
  text,
  color,
  className = 'h-full w-full',
}: {
  text: string;
  color?: string;
  className?: string;
}) {
  const layout = layoutCustomDieFaceText(text);
  return (
    <svg
      data-custom-die-text-face
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-label={text}
      role="img"
    >
      {layout.lines.map((line, index) => (
        <text
          key={`${index}:${line}`}
          x="50"
          y={layout.lineYs[index]}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={layout.fontSize}
          fontWeight="700"
          fontFamily="Arial, Helvetica, sans-serif"
          fill={color || 'currentColor'}
        >
          {line}
        </text>
      ))}
    </svg>
  );
}
