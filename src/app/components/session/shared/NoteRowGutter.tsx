import { useCallback, useEffect, useState, type ReactElement, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { Plus, Type } from 'lucide-react';
import { usePortalContainer } from '../../ui/portal-container';
import {
  NOTE_COMMANDS,
  canRunNoteCommand,
  runSecondaryNoteCommand,
  type NoteCommandDescriptor,
  type NoteCommandId,
  type NoteSecondaryValue,
} from './noteEditorCommands';
import { placeFloatingNoteUI } from './noteFloatingPosition';
import { INLINE_MODIFIER_CHAR, getInlineBoxWidgetAt } from './tiptapInlineModifier';
import {
  NoteFontFamilyPicker,
  NoteFontSizePicker,
  NoteImagePicker,
  NoteInlineIconPicker,
} from './NoteContextualPickers';

// Pulsanti "+" laterali per le righe di box inline (Dado, Modificatore,
// Punti) che occupano l'intera riga: niente piu' riserve a inizio/fine riga,
// l'inserimento ai bordi passa da qui invece che dal caret in uno spazio
// riservato. Solo prototipo locale: nessuna modifica alle meccaniche di
// misura, inserimento, duplicazione, incolla o cancellazione esistenti.

const BOX_MARK_NAMES = new Set(['inlineModifier', 'inlineDice', 'inlinePoints']);
const GUTTER_BUTTON = 16;
// Stanza minima cliccabile dopo l'ultimo box: sopra questa soglia il "+"
// destro non serve, basta cliccare lo spazio e digitare "/" diretto.
const INLINE_EDGE_CLICK_ROOM = 40;

interface GutterAnchor {
  key: string;
  paraStart: number;
  paraEnd: number;
  // Blocco strutturale (TextBox/Collapse): la riga di testo non esiste
  // ancora, viene creata prima/dopo solo quando si sceglie una voce.
  blockPos: number | null;
  side: 'left' | 'right';
  top: number;
}

interface GutterMenuState {
  key: string;
  side: 'left' | 'right';
  paraStart: number;
  paraEnd: number;
  blockPos: number | null;
  top: number;
  left: number;
}

function isBoxChar(doc: Editor['state']['doc'], pos: number): boolean {
  if (pos < 0 || pos >= doc.content.size) return false;
  if (doc.textBetween(pos, pos + 1, '', '') !== INLINE_MODIFIER_CHAR) return false;
  let found = false;
  doc.nodesBetween(pos, pos + 1, (node) => {
    if (node.isText) {
      for (const mark of node.marks) {
        if (BOX_MARK_NAMES.has(mark.type.name)) {
          found = true;
          break;
        }
      }
    }
  });
  return found;
}

function gutterButton(
  anchor: GutterAnchor,
  active: boolean,
  onOpen: (anchor: GutterAnchor, event: React.MouseEvent<HTMLButtonElement>) => void,
): ReactElement {
  return (
    <button
      key={anchor.key}
      type="button"
      data-note-contextual-ui="true"
      data-note-row-gutter="true"
      data-note-row-gutter-side={anchor.side}
      aria-label={anchor.side === 'left' ? 'Aggiungi a sinistra della riga' : 'Aggiungi a destra della riga'}
      aria-expanded={active}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(anchor, event);
      }}
      style={{ top: `${anchor.top}px`, ...(anchor.side === 'left' ? { left: '2px' } : { right: '2px' }) }}
      className={`absolute z-[20] flex h-4 w-4 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-muted)] shadow-sm transition-all hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${
        active ? 'opacity-100 ring-1 ring-inset ring-[var(--dash-accent-2)]' : 'opacity-75 hover:opacity-100'
      }`}
    >
      <Plus className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

function gutterMenuButton(
  label: string,
  icon: NoteCommandDescriptor['icon'],
  disabled: boolean,
  highlighted: boolean,
  onActivate: () => void,
  onHover: () => void,
): ReactElement {
  const Icon = icon;
  return (
    <button
      key={label}
      type="button"
      role="menuitem"
      aria-label={label}
      aria-disabled={disabled}
      onPointerDown={(event) => {
        if (!disabled) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onActivate();
      }}
      onMouseEnter={onHover}
      className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-center transition-colors ${
        disabled
          ? 'cursor-not-allowed text-[var(--dash-muted)] opacity-35'
          : highlighted
            ? 'cursor-pointer bg-[var(--dash-accent)] text-[var(--dash-text-strong)] ring-1 ring-inset ring-[var(--dash-accent-2)]'
            : 'cursor-pointer text-[var(--dash-text)] hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)] hover:ring-1 hover:ring-inset hover:ring-[var(--dash-accent-2)]'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="max-w-full truncate text-[9px] leading-tight">{label}</span>
    </button>
  );
}

export function NoteRowGutter({
  editor,
  editable,
  shellRef,
}: {
  editor: Editor;
  editable: boolean;
  shellRef: RefObject<HTMLDivElement | null>;
}) {
  const portalContainer = usePortalContainer();
  const [anchors, setAnchors] = useState<GutterAnchor[]>([]);
  const [menu, setMenu] = useState<GutterMenuState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [openSecondaryId, setOpenSecondaryId] = useState<NoteCommandId | null>(null);

  const refresh = useCallback(() => {
    const shell = shellRef.current;
    if (!editable || !shell || !editor.view.dom.isConnected) {
      setAnchors((previous) => (previous.length ? [] : previous));
      return;
    }
    const shellRect = shell.getBoundingClientRect();
    const { doc } = editor.state;
    const found: GutterAnchor[] = [];
    doc.descendants((node, pos) => {
      // TextBox e Collapse: i due "+" aggiungono al lato scelto (il menu
      // crea il contenuto). Tabelle e Archivio mai. Le righe di blocchi
      // affiancati (blockRow) espongono i "+" a livello di riga; i bloerini
      // al loro interno non hanno piu' pulsanti propri.
      if (node.type.name === 'blockRow') {
        try {
          const dom = editor.view.nodeDOM(pos);
          const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : editor.view.coordsAtPos(pos + 1);
          if (rect.bottom >= shellRect.top && rect.top <= shellRect.bottom) {
            const center = (rect.top + rect.bottom) / 2 - shellRect.top - GUTTER_BUTTON / 2;
            found.push({ key: `${pos}-row-left`, paraStart: -1, paraEnd: -1, blockPos: pos, side: 'left', top: center });
            found.push({ key: `${pos}-row-right`, paraStart: -1, paraEnd: -1, blockPos: pos, side: 'right', top: Math.max(center, 46) });
          }
        } catch {
          /* posizione non piu' valida: si ricalcola alla prossima transazione */
        }
        return true;
      }
      if (node.type.name === 'textBox' || node.type.name === 'collapseBlock') {
        const here = doc.resolve(pos + 1);
        if (here.depth >= 1 && here.node(here.depth - 1)?.type.name === 'blockRow') {
          return true;
        }
        try {
          const dom = editor.view.nodeDOM(pos);
          const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : editor.view.coordsAtPos(pos + 1);
          if (rect.bottom >= shellRect.top && rect.top <= shellRect.bottom) {
            const center = (rect.top + rect.bottom) / 2 - shellRect.top - GUTTER_BUTTON / 2;
            found.push({
              key: `${pos}-block-left`,
              paraStart: -1,
              paraEnd: -1,
              blockPos: pos,
              side: 'left',
              top: center,
            });
            found.push({
              key: `${pos}-block-right`,
              paraStart: -1,
              paraEnd: -1,
              blockPos: pos,
              side: 'right',
              top: Math.max(center, 46),
            });
          }
        } catch {
          /* posizione non piu' valida: si ricalcola alla prossima transazione */
        }
        return true;
      }
      if (!node.isTextblock) return true;
      const start = pos + 1;
      const end = pos + node.nodeSize - 1;
      if (end <= start) return false;
      const $start = doc.resolve(start);
      for (let depth = $start.depth; depth >= 0; depth -= 1) {
        if (($start.node(depth).type.spec as { tableRole?: string }).tableRole) return false;
      }
      const startsWithBox = isBoxChar(doc, start);
      const endsWithBox = isBoxChar(doc, end - 1);
      if (!startsWithBox && !endsWithBox) return false;
      // Rettangoli reali dei widget di bordo: coordsAtPos sulle posizioni
      // di confine ha affinita' di riga ambigua e spiazza i pulsanti.
      const firstWidgetRect = getInlineBoxWidgetAt(start)?.getBoundingClientRect() ?? null;
      const lastWidgetRect = getInlineBoxWidgetAt(end - 1)?.getBoundingClientRect() ?? null;
      if (startsWithBox) {
        try {
          const coords = firstWidgetRect ?? editor.view.coordsAtPos(start);
          if (coords.bottom >= shellRect.top && coords.top <= shellRect.bottom) {
            found.push({
              key: `${start}-left`,
              paraStart: start,
              paraEnd: end,
              blockPos: null,
              side: 'left',
              top: (coords.top + coords.bottom) / 2 - shellRect.top - GUTTER_BUTTON / 2,
            });
          }
        } catch {
          /* posizione non piu' valida: si ricalcola alla prossima transazione */
        }
      }
      if (endsWithBox) {
        try {
          const coords = lastWidgetRect ?? editor.view.coordsAtPos(end);
          if (coords.bottom >= shellRect.top && coords.top <= shellRect.bottom) {
            // Se dopo il box c'e' stanza cliccabile, "/" diretto basta e il
            // "+" destro resterebbe un doppione spiazzato a bordo contenitore.
            const contentRight = editor.view.dom.getBoundingClientRect().right - 6;
            if (contentRight - coords.right < INLINE_EDGE_CLICK_ROOM) {
              const rawTop = (coords.top + coords.bottom) / 2 - shellRect.top - GUTTER_BUTTON / 2;
              found.push({
                key: `${start}-right`,
                paraStart: start,
                paraEnd: end,
                blockPos: null,
                side: 'right',
                // Il pulsante Annulla vive in alto a destra del contenitore:
                // la prima riga appoggia il suo "+" poco piu' sotto.
                top: Math.max(rawTop, 46),
              });
            }
          }
        } catch {
          /* posizione non piu' valida: si ricalcola alla prossima transazione */
        }
      }
      return false;
    });
    setAnchors((previous) => {
      if (previous.length === found.length && previous.every((item, index) => item.key === found[index].key && Math.abs(item.top - found[index].top) < 1)) {
        return previous;
      }
      if (typeof console !== 'undefined' && previous.length !== found.length) {
        console.info(
          `[NoteRowGutter] righe con bordi box: ${found.length}${found.length ? ` (${found.map((item) => `${item.key}@${Math.round(item.top)}`).join(', ')})` : ''}`,
        );
      }
      return found;
    });
  }, [editor, editable, shellRef]);

  useEffect(() => {
    if (typeof console !== 'undefined') {
      console.info(`[NoteRowGutter] build r6-clamp, editabile: ${editable ? 'si' : 'no'}`);
    }
  }, [editor, editable]);

  // La misura coordinata (performMeasurement) applica le larghezze su rAF
  // DOPO la transazione: al momento del transaction il box nuovo e' ancora a
  // larghezza provvisoria (4em) e il "+" destro (soglia INLINE_EDGE_CLICK_ROOM)
  // non puo' comparire. Si ri-aggancia la geometria un paio di frame dopo,
  // quando la riga e' assestata, cosi' il "+" appare senza dover cliccare
  // altrove (focus/selectionUpdate) per forzare un refresh.
  const refreshAfterMeasure = useCallback(() => {
    refresh();
    requestAnimationFrame(() => {
      requestAnimationFrame(refresh);
    });
  }, [refresh]);

  useEffect(() => {
    refresh();
    editor.on('transaction', refreshAfterMeasure);
    editor.on('selectionUpdate', refreshAfterMeasure);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      editor.off('transaction', refreshAfterMeasure);
      editor.off('selectionUpdate', refreshAfterMeasure);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [editor, refresh, refreshAfterMeasure]);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-note-row-gutter-menu="true"], [data-note-contextual-picker="true"], [data-note-row-gutter="true"]')) return;
      setMenu(null);
      setOpenSecondaryId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null);
        setOpenSecondaryId(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menu]);

  const openMenu = useCallback((anchor: GutterAnchor, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const placed = placeFloatingNoteUI(rect, 248, Math.min(420, window.innerHeight * 0.7), 8);
    setMenu({ key: anchor.key, side: anchor.side, paraStart: anchor.paraStart, paraEnd: anchor.paraEnd, blockPos: anchor.blockPos, ...placed });
    setSelectedIndex(0);
    setOpenSecondaryId(null);
  }, []);

  // Per i blocchi la riga di testo non esiste ancora: viene creata prima
  // (sinistra) o dopo (destra) il blocco solo quando si sceglie una voce.
  // Se il blocco nel frattempo si e' spostato, si annulla senza toccare nulla.
  const resolveMenuEdge = useCallback(
    (state: GutterMenuState): { paraStart: number; paraEnd: number } | null => {
      if (state.blockPos === null) {
        // Il documento puo' essere cambiato tra apertura menu e scelta
        // (es. una lettera digitata nel frattempo): se il bordo non ha piu'
        // il box, si annulla invece di inserire nel posto sbagliato.
        const edgePos = state.side === 'left' ? state.paraStart : state.paraEnd - 1;
        if (!isBoxChar(editor.state.doc, edgePos)) {
          if (typeof console !== 'undefined') console.info('[NoteRowGutter] posizioni scadute, riprova dal + aggiornato');
          return null;
        }
        return { paraStart: state.paraStart, paraEnd: state.paraEnd };
      }
      const node = editor.state.doc.nodeAt(state.blockPos);
      if (!node || (node.type.name !== 'textBox' && node.type.name !== 'collapseBlock')) return null;
      const paraType = editor.state.schema.nodes.paragraph;
      if (!paraType) return null;
      const insertAt = state.side === 'left' ? state.blockPos : state.blockPos + node.nodeSize;
      editor.view.dispatch(editor.state.tr.insert(insertAt, paraType.create()));
      return { paraStart: insertAt + 1, paraEnd: insertAt + 1 };
    },
    [editor],
  );

  // Il box appena creato nasce a larghezza provvisoria (4em/auto): prima che
  // il browser rifluisca lo si pre-stringe allo spazio restante della riga,
  // altrimenti un inserimento a riga quasi piena lo manda a capo per un frame
  // e la misura coordinata congela quello spezzamento in modo permanente.
  const clampNewBoxToRow = useCallback(() => {
    const shell = shellRef.current;
    if (!shell || !editor.view.dom.isConnected) return;
    const widget = getInlineBoxWidgetAt(editor.state.selection.from - 1);
    if (!widget) return;
    const contentRight = editor.view.dom.getBoundingClientRect().right - 6;
    const room = contentRight - widget.getBoundingClientRect().left;
    if (room < widget.offsetWidth) {
      // Senza soglia minima: anche 20px per un frame sono invisibili, la
      // misura coordinata assegna subito dopo la quota equa.
      widget.style.width = `${Math.max(0, Math.floor(room))}px`;
    }
  }, [editor, shellRef]);

  const insertInlineAtEdge = useCallback(
    (state: GutterMenuState, kind: 'inlineModifier' | 'inlineDice' | 'inlinePoints') => {
      const edge = state.side === 'left' ? state.paraStart : state.paraEnd;
      if (state.side === 'right') {
        editor.chain().focus().setTextSelection({ from: edge, to: edge }).run();
        if (kind === 'inlineModifier') editor.commands.insertInlineModifier();
        else if (kind === 'inlineDice') editor.commands.insertInlineDice();
        else editor.commands.insertInlinePoints();
        clampNewBoxToRow();
        return;
      }
      if (kind === 'inlinePoints') {
        // insertInlinePoints gestisce da solo il box successivo (spazio dopo).
        editor.chain().focus().setTextSelection({ from: edge, to: edge }).run();
        editor.commands.insertInlinePoints();
        clampNewBoxToRow();
        return;
      }
      // Modificatore e Dado aggiungono spazio solo prima del precedente:
      // si prepara uno spazio reale dopo, il nuovo box nasce prima di esso.
      editor.chain().focus().setTextSelection({ from: edge, to: edge }).insertContent(' ').run();
      editor.chain().focus().setTextSelection({ from: edge, to: edge }).run();
      if (kind === 'inlineModifier') editor.commands.insertInlineModifier();
      else editor.commands.insertInlineDice();
      clampNewBoxToRow();
    },
    [editor, clampNewBoxToRow],
  );

  const insertTextAtEdge = useCallback(
    (state: GutterMenuState) => {
      // Nessuno spazio aggiunto: il caret va subito a ridosso del box cosi'
      // la digitazione trova il mark adiacente e restringe il box via
      // makeRoom*, restando sulla stessa riga. Uno spazio in mezzo avrebbe
      // impedito il restringimento e mandato il testo a capo.
      const edge = state.side === 'left' ? state.paraStart : state.paraEnd;
      editor.chain().focus().setTextSelection({ from: edge, to: edge }).run();
    },
    [editor],
  );

  const choose = useCallback(
    (command: NoteCommandDescriptor | { id: 'gutterText' }, state: GutterMenuState) => {
      // Affiancamento: Testo / Box di testo / Collapse sul "+" di un blocco
      // si aggiungono alla riga (o la creano se il blocco e' da solo),
      // invece di creare una riga di paragrafo attorno al blocco.
      if (state.blockPos !== null) {
        const kind =
          command.id === 'gutterText' ? 'paragraph' : command.id === 'textBox' ? 'textBox' : command.id === 'collapse' ? 'collapseBlock' : null;
        if (kind) {
          const ok = editor.commands.addBlockToRow({ kind, side: state.side, pos: state.blockPos });
          if (!ok && typeof console !== 'undefined') {
            console.info('[NoteRowGutter] blocco scaduto, riprova dal + aggiornato');
          }
          editor.chain().focus().run();
          setMenu(null);
          setOpenSecondaryId(null);
          return;
        }
      }
      const rows = resolveMenuEdge(state);
      if (!rows) {
        setMenu(null);
        setOpenSecondaryId(null);
        return;
      }
      const edgeState = { ...state, ...rows };
      const edge = state.side === 'left' ? rows.paraStart : rows.paraEnd;
      if (command.id === 'gutterText') {
        insertTextAtEdge(edgeState);
      } else if (command.id === 'inlineModifier' || command.id === 'inlineDice' || command.id === 'inlinePoints') {
        insertInlineAtEdge(edgeState, command.id);
      } else {
        try {
          editor.chain().focus().setTextSelection({ from: edge, to: edge }).run();
        } catch {
          setMenu(null);
          setOpenSecondaryId(null);
          return;
        }
        command.run?.(editor);
      }
      setMenu(null);
      setOpenSecondaryId(null);
    },
    [editor, insertInlineAtEdge, insertTextAtEdge, resolveMenuEdge],
  );

  const applySecondary = useCallback(
    (state: GutterMenuState, value: NoteSecondaryValue) => {
      // I picker secondari si applicano al testo/bordo della riga, non ai
      // blocchi: su un anchor blocco si chiude e basta.
      if (state.blockPos !== null) {
        setMenu(null);
        setOpenSecondaryId(null);
        return;
      }
      const rows = resolveMenuEdge(state);
      if (!rows) {
        setMenu(null);
        return;
      }
      const edge = state.side === 'left' ? rows.paraStart : rows.paraEnd;
      try {
        editor.chain().focus().setTextSelection({ from: edge, to: edge }).run();
      } catch {
        setMenu(null);
        return;
      }
      runSecondaryNoteCommand(editor, value);
      setMenu(null);
      setOpenSecondaryId(null);
    },
    [editor, resolveMenuEdge],
  );

  const renderCommand = useCallback(
    (command: NoteCommandDescriptor, index: number, state: GutterMenuState) => {
      const disabled = !canRunNoteCommand(editor, command);
      const button = gutterMenuButton(
        command.label,
        command.icon,
        disabled,
        selectedIndex === index && !disabled,
        () => choose(command, state),
        () => setSelectedIndex(disabled ? -1 : index),
      );
      if (disabled || !command.secondaryPicker) return button;
      const common = {
        trigger: button,
        open: openSecondaryId === command.id,
        onOpenChange: (open: boolean) => {
          if (open) setOpenSecondaryId(command.id);
          else setOpenSecondaryId(null);
        },
      };
      switch (command.id) {
        case 'fontSize':
          return <NoteFontSizePicker key={command.id} {...common} onChoose={(size) => applySecondary(state, { commandId: 'fontSize', size })} />;
        case 'fontFamily':
          return <NoteFontFamilyPicker key={command.id} {...common} onChoose={(label) => applySecondary(state, { commandId: 'fontFamily', label })} />;
        case 'image':
          return <NoteImagePicker key={command.id} {...common} onChoose={(src) => applySecondary(state, { commandId: 'image', src })} />;
        case 'inlineIcon':
          return <NoteInlineIconPicker key={command.id} {...common} onChoose={(name) => applySecondary(state, { commandId: 'inlineIcon', name })} />;
        default:
          return button;
      }
    },
    [editor, selectedIndex, openSecondaryId, choose, applySecondary],
  );

  if (!editable) return null;

  return (
    <>
      {anchors.map((anchor) => gutterButton(anchor, menu !== null && anchor.key === menu.key, openMenu))}
      {menu &&
        createPortal(
          <div
            data-note-contextual-ui="true"
            data-note-row-gutter-menu="true"
            role="menu"
            aria-label="Aggiungi alla riga"
            style={{ position: 'fixed', top: menu.top, left: menu.left, zIndex: 9998 }}
            className="tiptap-slash-menu max-h-[min(70vh,420px)] w-[248px] overflow-y-auto rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 shadow-lg"
          >
            {(['text', 'block'] as const).map((group) => (
              <div
                key={group}
                data-note-slash-section="true"
                className="mb-3 overflow-hidden rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] last:mb-0"
              >
                <div
                  data-note-slash-section-header="true"
                  className="border-b border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-strong)]"
                >
                  {group === 'text' ? 'Testo' : 'Blocchi'}
                </div>
                <div data-note-slash-section-grid="true" className="grid auto-rows-fr grid-cols-4 gap-1 p-1.5">
                  {group === 'block'
                    ? gutterMenuButton('Testo', Type, !editor.isEditable, false, () => choose({ id: 'gutterText' }, menu), () => {})
                    : null}
                  {NOTE_COMMANDS.filter((command) => command.id !== 'undo' && command.group === group).map((command) => {
                    const index = NOTE_COMMANDS.indexOf(command);
                    return renderCommand(command, index, menu);
                  })}
                </div>
              </div>
            ))}
          </div>,
          portalContainer ?? document.body,
        )}
    </>
  );
}
