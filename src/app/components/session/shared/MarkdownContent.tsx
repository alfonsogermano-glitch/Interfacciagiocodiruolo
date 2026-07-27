import { parseLines, type HeadingLevel } from './markdownHeadings';

// Dimensioni scalate H1 (piu' grande) -> H4 (piu' piccolo, nello stesso
// stile delle etichette di sezione gia' usate ovunque nell'app, es.
// EntityDetailView.tsx "text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]").
const HEADING_CLASSES: Record<HeadingLevel, string> = {
  1: 'text-xl font-bold text-[var(--dash-text-strong)]',
  2: 'text-lg font-semibold text-[var(--dash-text-strong)]',
  3: 'text-base font-semibold text-[var(--dash-text-strong)]',
  4: 'text-xs font-semibold uppercase tracking-[0.08em] text-[var(--dash-accent-2)]',
};

/**
 * Vista di sola lettura del formato markdown-leggero LEGACY (righe con
 * prefisso "#"+spazio, vedi markdownHeadings.ts): intestazioni H1-H4
 * formattate, tutto il resto come testo semplice (a capo preservati). Usato
 * da RichTextEditor.tsx per le note non ancora promosse al nuovo editor
 * TipTap (content_rich nullo), e direttamente da TrashItemPreview.tsx (il
 * Cestino non ha bisogno di toggle vista/modifica, solo del rendering).
 */
export function MarkdownContent({ content }: { content: string }) {
  const lines = parseLines(content);
  return (
    <div className="space-y-1 text-sm text-[var(--dash-text)]">
      {lines.map((line, i) =>
        line.level === 0 ? (
          <p key={i} className="whitespace-pre-wrap break-words">{line.text || ' '}</p>
        ) : (
          <div key={i} className={`${HEADING_CLASSES[line.level]} whitespace-pre-wrap break-words`}>
            {line.text || ' '}
          </div>
        )
      )}
    </div>
  );
}
