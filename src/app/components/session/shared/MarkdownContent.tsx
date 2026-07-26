import { parseLines, HEADING_CLASSES } from './markdownHeadings';

/**
 * Vista di sola lettura del contenuto markdown-leggero (SlashCommandEditor.tsx):
 * intestazioni H1-H4 formattate, tutto il resto come testo semplice (a capo
 * preservati). Usato sia come "modalita' vista" dell'editor sia direttamente
 * da TrashItemPreview.tsx (il Cestino non ha bisogno del toggle vista/modifica,
 * solo del rendering).
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
