import { useState, type ReactNode } from 'react';

const REGIONAL = /[\u{1F1E6}-\u{1F1FF}]/u;
const TAG = /[\u{E0020}-\u{E007F}]/u;
const FLAG_IN_TEXT = /\u{1F3F4}[\u{E0020}-\u{E007F}]+|[\u{1F1E6}-\u{1F1FF}]{2}/gu;

function toFileName(codePoints: string[]): string {
  return codePoints.map((char) => char.codePointAt(0)?.toString(16) ?? '').join('-');
}

/** Nome file SVG Twemoji per una bandiera (sigle paese o suddivisioni UK), altrimenti null. */
export function flagImageName(char: string): string | null {
  const codePoints = [...char];
  if (codePoints.length === 2 && codePoints.every((cp) => REGIONAL.test(cp))) {
    return toFileName(codePoints);
  }
  if (
    codePoints[0] === '\u{1F3F4}'
    && codePoints.length > 1
    && codePoints.slice(1).every((cp) => TAG.test(cp))
  ) {
    return toFileName(codePoints);
  }
  return null;
}

/**
 * Bandiera come immagine (Windows non ha glifi bandiera e mostra le sigle
 * tipo "IT"); se l'immagine non carica si torna al carattere testuale.
 */
export function EmojiFlag({ char, className }: { char: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const file = flagImageName(char);
  if (!file || failed) return <span className={className}>{char}</span>;
  return (
    <img
      src={`/emoji-flags/${file}.svg`}
      alt={char}
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

/** Testo con le bandiere renderizzate come immagini (bolle chat, ecc.). */
export function FlagText({ children, className }: { children: string; className?: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of children.matchAll(FLAG_IN_TEXT)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(children.slice(lastIndex, index));
    nodes.push(
      <EmojiFlag
        key={index}
        char={match[0]}
        className="inline-block h-[1.15em] w-[1.4em] align-[-0.2em]"
      />,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < children.length) nodes.push(children.slice(lastIndex));
  return <span className={className}>{nodes}</span>;
}
