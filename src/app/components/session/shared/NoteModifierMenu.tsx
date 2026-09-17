import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as React from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, Clipboard, Copy, GripVertical, Maximize2, Minimize2, Pencil, Save, Trash2, Wrench, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { usePortalContainer } from '../../ui/portal-container';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
import { CUSTOM_DICE_LIBRARY_CHANGED_EVENT, loadCustomDice } from '../../../../services/supabase/diceCustomDiceService';
import { CustomDieLibraryIcon } from '../dice/CustomDieLibraryIcon';
import { DiceNumericStepper } from '../dice/DiceNumericStepper';
import { useOptionalDiceSession } from '../dice/DiceSessionContext';
import { toCustomDieRollSnapshot } from '../dice/diceCustomDie';
import type { CustomDieRollSnapshot, SavedCustomDie } from '../dice/diceTypes';
import { placeFloatingNoteUI } from './noteFloatingPosition';
import { NOTE_COMMANDS, type NoteCommandId } from './noteEditorCommands';

import { FONT_SIZES } from './tiptapFontSize';
import { FONT_FAMILIES } from './tiptapFontFamily';
import { extractModifierRefs, modifierFormulaHasDice } from './modifierFormula';
import {
  applyModifierTitleFormat,
  copyModifierToClipboard,
  deleteModifierAt,
  duplicateModifierAt,
  getModifierAt,
  getModifierLookup,
  setModifierCompactAt,
  setModifierAttrs,
  parseModifierValue,
  MODIFIER_VALUE_MAX_LENGTH,
  NOTE_MODIFIER_MENU_EVENT,
  NOTE_MODIFIER_RENAME_EVENT,
  NOTE_MODIFIER_ROLL_EVENT,
  NOTE_MODIFIER_TITLE_FORMAT_EVENT,
  NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT,
  NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT,
  NOTE_MODIFIER_TITLE_MENU_EVENT,
  type ModifierSnapshot,
  type ModifierTitleFormat,
  type ModifierTitleFormatCommand,
  type NoteModifierMenuRequest,
  type NoteModifierRollRequest,
  type NoteModifierTitleFormatRequest,
  type NoteModifierTitleMenuRequest,
} from './tiptapInlineModifier';
import {
  copyDiceToClipboard,
  deleteDiceAt,
  DICE_WIDGET_SELECTOR,
  duplicateDiceAt,
  getDiceAt,
  NOTE_DICE_MENU_EVENT,
  refreshInlineCustomDiceSnapshots,
  setDiceAttrs,
  type DiceMode,
} from './tiptapInlineDice';

const MENU_WIDTH = 184;
const MENU_HEIGHT = 236;
const MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]';
const DANGER_ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--dash-danger-strong)] transition-colors hover:bg-[var(--dash-danger)] hover:text-[var(--dash-text-strong)]';

interface NoteModifierMenuProps {
  editor: Editor;
  editable: boolean;
}

type MenuMode = 'menu' | 'edit';

interface CustomDiceScrollIndicator {
  visible: boolean;
  topPercent: number;
  heightPercent: number;
}

function measureCustomDiceScroll(element: HTMLDivElement): CustomDiceScrollIndicator {
  if (element.scrollHeight <= element.clientHeight + 1) return { visible: false, topPercent: 0, heightPercent: 100 };
  const heightPercent = Math.max(15, (element.clientHeight / element.scrollHeight) * 100);
  const progress = element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight);
  return {
    visible: true,
    topPercent: progress * (100 - heightPercent),
    heightPercent,
  };
}

function MenuAction({ label, icon: Icon, onActivate, danger = false, hint }: { label: string; icon: typeof Pencil; onActivate: () => void; danger?: boolean; hint?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        onActivate();
      }}
      onMouseDown={(event) => event.preventDefault()}
      className={danger ? DANGER_ITEM_CLASS : MENU_ITEM_CLASS}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {hint ? <span className="ml-auto shrink-0 text-[9px] text-[var(--dash-muted)]">{hint}</span> : null}
    </button>
  );
}

// Tag "Nome" non modificabile: pill che vale come valore/formula e si cancella
// intera con Backspace/Canc, cosi' il nome non si puo' corrompere a meta'.
function createFormulaTag(name: string): HTMLSpanElement {
  const tag = document.createElement('span');
  tag.setAttribute('data-modifier-tag', name);
  tag.setAttribute('contenteditable', 'false');
  tag.className = 'mx-0.5 inline-flex items-center rounded-md border border-[var(--dash-accent-2)] bg-[var(--dash-accent)]/20 px-1.5 py-px font-mono text-xs text-[var(--dash-text-strong)]';
  tag.textContent = name;
  return tag;
}

function serializeFormulaEditor(el: HTMLElement | null): string {
  if (!el) return '';
  let out = '';
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node instanceof HTMLElement) {
      if (node.hasAttribute('data-modifier-tag')) {
        out += `"${node.getAttribute('data-modifier-tag') ?? ''}"`;
        return;
      }
      if (node.tagName === 'BR') {
        out += '\n';
        return;
      }
      node.childNodes.forEach(walk);
      if (node.tagName === 'DIV' || node.tagName === 'P') out += '\n';
    }
  };
  el.childNodes.forEach(walk);
  return out;
}

function appendFormulaSegments(el: HTMLElement, formula: string): void {
  const pattern = /"([^"]*)"/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const appendText = (text: string) => {
    if (text) el.appendChild(document.createTextNode(text));
  };
  while ((match = pattern.exec(formula)) !== null) {
    appendText(formula.slice(last, match.index));
    el.appendChild(createFormulaTag(match[1]));
    last = match.index + match[0].length;
  }
  appendText(formula.slice(last));
}

// Tooltip stile sito sui tag della formula (condiviso tra pannello
// Modificatore e pannello Dado): sopra la pill mostra formula o valore del
// modificatore referenziato.
function useFormulaTagTips(
  lookup: Map<string, ModifierSnapshot>,
  editorRef: React.RefObject<HTMLDivElement | null>,
) {
  const tagTipRef = useRef<HTMLSpanElement | null>(null);
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  const hideTagTip = () => {
    window.removeEventListener('scroll', hideTagTip, true);
    tagTipRef.current?.remove();
    tagTipRef.current = null;
  };
  const showTagTip = (tagName: string, rect: DOMRect) => {
    hideTagTip();
    const entry = lookupRef.current.get(tagName);
    const tip = document.createElement('span');
    tip.textContent = entry ? (entry.formula || entry.value || '—') : `"${tagName}" non trovato`;
    // z-index sopra il pannello (z 9999): a 1200 il tooltip veniva dipinto
    // sotto lo sfondo del pannello e risultava invisibile.
    tip.style.cssText = 'position:fixed;z-index:10001;pointer-events:none;white-space:nowrap;max-width:min(320px,80vw);overflow:hidden;text-overflow:ellipsis;background:var(--dash-panel);color:var(--dash-text);border:1px solid var(--dash-border-soft);border-radius:0.45rem;padding:0.15rem 0.45rem;font-size:0.72rem;line-height:1.25;box-shadow:0 6px 22px rgba(0,0,0,0.35);';
    const host = editorRef.current?.closest('[data-dashboard-palette]') ?? document.body;
    host.appendChild(tip);
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = rect.top - tipRect.height - 6;
    if (top < 8) top = rect.bottom + 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tagTipRef.current = tip;
    window.addEventListener('scroll', hideTagTip, true);
  };

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const showFor = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement) || !target.hasAttribute('data-modifier-tag')) {
        hideTagTip();
        return;
      }
      showTagTip(target.getAttribute('data-modifier-tag') ?? '', target.getBoundingClientRect());
    };
    const onOver = (event: MouseEvent) => showFor(event.target);
    const onOut = (event: MouseEvent) => {
      if (!(event.relatedTarget instanceof Node) || !el.contains(event.relatedTarget)) hideTagTip();
    };
    el.addEventListener('mouseover', onOver);
    el.addEventListener('mouseout', onOut);
    return () => {
      el.removeEventListener('mouseover', onOver);
      el.removeEventListener('mouseout', onOut);
      hideTagTip();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function ModifierEditForm({ modifierName, modifiers, lookup, initialValue, initialFormula, onSave, onCancel }: {
  modifierName: string;
  modifiers: ModifierSnapshot[];
  lookup: Map<string, ModifierSnapshot>;
  initialValue: string;
  initialFormula: string;
  onSave: (value: string, formula: string) => void;
  onCancel: () => void;
}) {
  const [valueDraft, setValueDraft] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const formulaRef = useRef<HTMLDivElement | null>(null);
  useFormulaTagTips(lookup, formulaRef);

  // Costruzione iniziale una sola volta (contenuto poi gestito dal DOM).
  useEffect(() => {
    const el = formulaRef.current;
    if (!el || el.dataset.initialized) return;
    el.dataset.initialized = 'true';
    appendFormulaSegments(el, initialFormula);
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } catch { /* selezione non disponibile */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = () => {
    if (!valueDraft.trim()) {
      setError('Il valore non puo\' essere vuoto (il solo testo vale 0).');
      return;
    }
    if (!parseModifierValue(valueDraft.trim())) {
      setError('Valore non valido.');
      return;
    }
    const formulaText = serializeFormulaEditor(formulaRef.current).trim();
    if (formulaText) {
      const refs = extractModifierRefs(formulaText);
      if (refs === null) {
        setError('Formula non valida: usa numeri, d, +, -, *, /, parentesi e tag "Nome" (es. (1d6+3)-(1d4)).');
        return;
      }
      const selfRef = refs.find((ref) => ref === modifierName);
      if (selfRef) {
        setError(`La formula non puo' riferirsi a se' stessa ("${selfRef}").`);
        return;
      }
      const missing = refs.find((ref) => !lookup.has(ref));
      if (missing) {
        setError(`Modificatore "${missing}" non trovato tra i modificatori della nota.`);
        return;
      }
    }
    onSave(valueDraft.trim(), formulaText);
  };

  const insertTag = (tagName: string) => {
    const el = formulaRef.current;
    setError(null);
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    const tag = createFormulaTag(tagName);
    if (selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(tag);
      range.setStartAfter(tag);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      el.appendChild(tag);
    }
  };

  const onFormulaKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      confirm();
      return;
    }
    // Backspace/Canc su tag adiacente: via il tag intero, mai a pezzi.
    const el = formulaRef.current;
    if ((event.key !== 'Backspace' && event.key !== 'Delete') || !el) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
    const { anchorNode, anchorOffset } = selection;
    let sibling: ChildNode | null = null;
    if (anchorNode === el) {
      const kids = el.childNodes;
      const index = event.key === 'Backspace' ? anchorOffset - 1 : anchorOffset;
      sibling = index >= 0 && index < kids.length ? kids[index] : null;
    } else if (anchorNode.nodeType === Node.TEXT_NODE) {
      const atEdge = event.key === 'Backspace'
        ? anchorOffset === 0
        : anchorOffset === (anchorNode.textContent ?? '').length;
      if (!atEdge) return;
      sibling = event.key === 'Backspace' ? anchorNode.previousSibling : anchorNode.nextSibling;
    } else {
      return;
    }
    if (sibling instanceof HTMLElement && sibling.hasAttribute('data-modifier-tag')) {
      event.preventDefault();
      sibling.remove();
      setError(null);
    }
  };

  const onFormulaPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    // Solo testo semplice: niente HTML esterno dentro la formula.
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    document.execCommand('insertText', false, text);
  };

  return (
    <div className="flex flex-col gap-2 p-1">
      <label className="block">
        <span className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">Valore</span>
        <textarea
          autoFocus
          rows={2}
          value={valueDraft}
          maxLength={MODIFIER_VALUE_MAX_LENGTH}
          onChange={(event) => { setValueDraft(event.target.value); setError(null); }}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); confirm(); } }}
          placeholder="0"
          className="w-full resize-y rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1.5 font-mono text-xs text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
        />
      </label>
      <div>
        <span className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">Formula</span>
        <div
          ref={formulaRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Formula"
          onKeyDown={onFormulaKeyDown}
          onPaste={onFormulaPaste}
          onInput={() => setError(null)}
          className="min-h-[3.2em] w-full resize-y whitespace-pre-wrap break-words rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1.5 font-mono text-xs text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
        />
      </div>
      {modifiers.length > 0 && (
        <div>
          <span className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">Modificatori</span>
          <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1">
            {modifiers.map((modifier) => (
              <Tooltip key={modifier.name}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertTag(modifier.name)}
                    className="truncate rounded-md px-2 py-1 text-left text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
                  >
                    {modifier.name}
                  </button>
                </TooltipTrigger>
                {/* z sopra il pannello (z 9999): il default z-[1200] resterebbe sotto il suo sfondo. */}
                <TooltipContent className="z-[10001]">{modifier.formula || modifier.value || '—'}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="px-0.5 text-xs text-[var(--dash-danger-text)]">{error}</p>}
      <div className="mt-0.5 flex gap-1.5">
        <button
          type="button"
          onClick={confirm}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--dash-accent)] px-2 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)] transition-colors hover:brightness-110"
        >
          <Save className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Salva
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
        >
          <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Annulla
        </button>
      </div>
    </div>
  );
}

function ModifierEditPanel({ top, left, name, modifiers, lookup, initialValue, initialFormula, onSave, onCancel }: {
  top: number;
  left: number;
  name: string;
  modifiers: ModifierSnapshot[];
  lookup: Map<string, ModifierSnapshot>;
  initialValue: string;
  initialFormula: string;
  onSave: (value: string, formula: string) => void;
  onCancel: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState({ top, left });

  // Trascinamento dalla maniglia in testata (non dai bordi: un click appena
  // fuori chiuderebbe il pannello). Solo tasto sinistro, con clamp viewport.
  const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const root = rootRef.current;
    if (!root) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    try { root.setPointerCapture(event.pointerId); } catch { /* pointer gia' rilasciato */ }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || !root) return;
    setPos({
      top: Math.max(8, Math.min(event.clientY - drag.dy, window.innerHeight - root.offsetHeight - 8)),
      left: Math.max(8, Math.min(event.clientX - drag.dx, window.innerWidth - root.offsetWidth - 8)),
    });
  };
  const endDrag = () => { dragRef.current = null; };

  return (
    <div
      ref={rootRef}
      data-note-contextual-ui="true"
      data-note-modifier-menu="true"
      data-note-modifier-edit="true"
      role="dialog"
      aria-label={`Modifica ${name}`}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-[232px] rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        data-edit-drag-handle="true"
        onPointerDown={onHandlePointerDown}
        className="mb-1 flex cursor-grab touch-none items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </div>
      <ModifierEditForm
        modifierName={name}
        modifiers={modifiers}
        lookup={lookup}
        initialValue={initialValue}
        initialFormula={initialFormula}
        onSave={onSave}
        onCancel={onCancel}
      />
    </div>
  );
}

// Il Dado Standard conserva Valore e Modificatori; il Custom sostituisce
// entrambi con scelta del dado salvato e quantità.
function DiceEditForm({ dicePos, modifiers, lookup, customDice, customDiceLoading, initialName, initialTitle, initialFormula, initialMode, initialQuantity, initialCustomDie, onSave, onCancel }: {
  dicePos: number;
  modifiers: ModifierSnapshot[];
  lookup: Map<string, ModifierSnapshot>;
  customDice: SavedCustomDie[];
  customDiceLoading: boolean;
  initialName: string;
  initialTitle: ModifierTitleFormat;
  initialFormula: string;
  initialMode: DiceMode;
  initialQuantity: number;
  initialCustomDie: CustomDieRollSnapshot | null;
  onSave: (name: string, formula: string, title: ModifierTitleFormat, mode: DiceMode, quantity: number, customDie: CustomDieRollSnapshot | null) => void;
  onCancel: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(initialName);
  const [titleFormat, setTitleFormat] = useState(initialTitle);
  const [diceMode, setDiceMode] = useState<DiceMode>(initialMode);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [customDieDraft, setCustomDieDraft] = useState<CustomDieRollSnapshot | null>(initialCustomDie);
  const [customScroll, setCustomScroll] = useState<CustomDiceScrollIndicator>({ visible: false, topPercent: 0, heightPercent: 100 });
  const [error, setError] = useState<string | null>(null);
  const formulaRef = useRef<HTMLDivElement | null>(null);
  const customPickerRef = useRef<HTMLDivElement | null>(null);
  const standardFormulaDraftRef = useRef(initialFormula);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const titleMenuOpenRef = useRef(false);
  const nameDraftRef = useRef(nameDraft);
  nameDraftRef.current = nameDraft;
  useFormulaTagTips(lookup, formulaRef);

  // Se il dado e' stato aggiornato in libreria dopo l'inserimento nella Nota,
  // anteprima e snapshot salvato devono indicare la stessa versione.
  useEffect(() => {
    if (!customDieDraft) return;
    const current = customDice.find((die) => die.id === customDieDraft.id);
    if (current && current.updatedAt !== customDieDraft.updatedAt) setCustomDieDraft(toCustomDieRollSnapshot(current));
  }, [customDice, customDieDraft]);

  useEffect(() => {
    if (diceMode !== 'custom') return;
    const picker = customPickerRef.current;
    if (!picker) return;
    const sync = () => setCustomScroll(measureCustomDiceScroll(picker));
    const frame = window.requestAnimationFrame(sync);
    const observer = new ResizeObserver(sync);
    observer.observe(picker);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [customDice.length, customDiceLoading, customDieDraft?.id, diceMode]);

  // Anteprima live del formato titolo sul Nome.
  useEffect(() => {
    const input = nameRef.current;
    if (input) applyModifierTitleFormat(input, titleFormat);
  }, [titleFormat]);

  // Menu "/" nel Nome: stesse opzioni del titolo Modificatore (solo gruppo
  // Testo). Il marcatore data-note-modifier-rename fa consumare al menu
  // Invio/Escape/frecce; qui si applica il formato e si toglie il trigger.
  const syncTitleMenu = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = before.match(/\/([A-Za-zÀ-ÿ]*)$/);
    if (!match) {
      if (titleMenuOpenRef.current) {
        titleMenuOpenRef.current = false;
        window.dispatchEvent(new CustomEvent<{ pos: number }>(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, { detail: { pos: dicePos } }));
      }
      return;
    }
    titleMenuOpenRef.current = true;
    const rect = nameRef.current?.getBoundingClientRect();
    if (!rect) return;
    window.dispatchEvent(
      new CustomEvent<NoteModifierTitleMenuRequest>(NOTE_MODIFIER_TITLE_MENU_EVENT, {
        detail: { pos: dicePos, query: match[1] ?? '', x: rect.left, y: rect.bottom },
      }),
    );
  };

  useEffect(() => {
    const removeTitleTrigger = () => {
      const input = nameRef.current;
      if (!input) return;
      const value = nameDraftRef.current;
      const caret = input.selectionStart ?? value.length;
      const match = value.slice(0, caret).match(/\/([A-Za-zÀ-ÿ]*)$/);
      if (!match || typeof match.index !== 'number') return;
      const next = value.slice(0, match.index) + value.slice(caret);
      nameDraftRef.current = next;
      setNameDraft(next);
      window.requestAnimationFrame(() => {
        try { input.setSelectionRange(match.index, match.index); } catch { /* input non testuale: ignora */ }
        input.focus();
      });
    };
    const onTitleFormat = (event: Event) => {
      const detail = (event as CustomEvent<NoteModifierTitleFormatRequest>).detail;
      if (!detail || detail.pos !== dicePos) return;
      setTitleFormat((prev) => {
        const next = { ...prev };
        switch (detail.command) {
          case 'bold': next.bold = !next.bold; break;
          case 'italic': next.italic = !next.italic; break;
          case 'underline': next.underline = !next.underline; break;
          case 'strike': next.strike = !next.strike; break;
          case 'fontSize': next.fontSize = typeof detail.value === 'number' ? detail.value : next.fontSize; break;
          case 'fontFamily': next.fontFamily = typeof detail.value === 'string' ? detail.value : next.fontFamily; break;
          case 'alignLeft': next.align = next.align === 'left' ? null : 'left'; break;
          case 'alignCenter': next.align = next.align === 'center' ? null : 'center'; break;
          case 'alignRight': next.align = next.align === 'right' ? null : 'right'; break;
        }
        return next;
      });
      removeTitleTrigger();
      // Il menu resta aperto per altre scelte (lista completa, query
      // azzerata): chiuderlo a ogni voce costringerebbe a ridigitare "/".
      titleMenuOpenRef.current = true;
      const rect = nameRef.current?.getBoundingClientRect();
      if (rect) {
        window.dispatchEvent(
          new CustomEvent<NoteModifierTitleMenuRequest>(NOTE_MODIFIER_TITLE_MENU_EVENT, {
            detail: { pos: dicePos, query: '', x: rect.left, y: rect.bottom },
          }),
        );
      }
    };
    const onTitleDismiss = (event: Event) => {
      const detail = (event as CustomEvent<{ pos: number }>).detail;
      if (!detail || detail.pos !== dicePos) return;
      // Escape nel menu titolo: chiude solo il menu, "/" resta testo.
      titleMenuOpenRef.current = false;
      nameRef.current?.focus();
    };
    window.addEventListener(NOTE_MODIFIER_TITLE_FORMAT_EVENT, onTitleFormat as EventListener);
    window.addEventListener(NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT, onTitleDismiss as EventListener);
    return () => {
      window.removeEventListener(NOTE_MODIFIER_TITLE_FORMAT_EVENT, onTitleFormat as EventListener);
      window.removeEventListener(NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT, onTitleDismiss as EventListener);
      window.dispatchEvent(new CustomEvent<{ pos: number }>(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, { detail: { pos: dicePos } }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dicePos]);

  // Costruzione iniziale una sola volta (contenuto poi gestito dal DOM). Il
  // focus resta sul Nome (autoFocus): qui niente el.focus().
  useEffect(() => {
    const el = formulaRef.current;
    if (!el || el.dataset.initialized) return;
    el.dataset.initialized = 'true';
    appendFormulaSegments(el, standardFormulaDraftRef.current);
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } catch { /* selezione non disponibile */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diceMode]);

  const confirm = () => {
    const formulaText = diceMode === 'standard'
      ? serializeFormulaEditor(formulaRef.current).trim()
      : standardFormulaDraftRef.current.trim();
    if (diceMode === 'custom') {
      if (!customDieDraft) {
        setError('Seleziona un dado Custom.');
        return;
      }
      titleMenuOpenRef.current = false;
      window.dispatchEvent(new CustomEvent<{ pos: number }>(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, { detail: { pos: dicePos } }));
      onSave(nameDraft.trim(), formulaText || initialFormula, titleFormat, diceMode, quantity, customDieDraft);
      return;
    }
    if (!formulaText) {
      setError('Il valore non puo\' essere vuoto.');
      return;
    }
    const refs = extractModifierRefs(formulaText);
    if (refs === null) {
      setError('Formula non valida: usa numeri, d, +, -, *, /, parentesi e tag "Nome" (es. (1d6+3)-(1d4)).');
      return;
    }
    const missing = refs.find((ref) => !lookup.has(ref));
    if (missing) {
      setError(`Modificatore "${missing}" non trovato tra i modificatori della nota.`);
      return;
    }
    // Il Dado tira sempre: serve almeno una notazione XdY testuale digitata
    // dall'utente (senza risolvere i riferimenti: un Modificatore che tira
    // dadi non basta). Altri Modificatori restano liberamente aggiungibili.
    if (!modifierFormulaHasDice(formulaText)) {
      setError('Il valore deve contenere almeno una notazione XdY (es. 1d6).');
      return;
    }
    titleMenuOpenRef.current = false;
    window.dispatchEvent(new CustomEvent<{ pos: number }>(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, { detail: { pos: dicePos } }));
    onSave(nameDraft.trim(), formulaText, titleFormat, diceMode, quantity, customDieDraft);
  };

  const selectMode = (nextMode: DiceMode) => {
    if (diceMode === 'standard') standardFormulaDraftRef.current = serializeFormulaEditor(formulaRef.current).trim() || initialFormula;
    setDiceMode(nextMode);
    setError(null);
  };

  const insertTag = (tagName: string) => {
    const el = formulaRef.current;
    setError(null);
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    const tag = createFormulaTag(tagName);
    if (selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(tag);
      range.setStartAfter(tag);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      el.appendChild(tag);
    }
  };

  const onFormulaKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      confirm();
      return;
    }
    // Backspace/Canc su tag adiacente: via il tag intero, mai a pezzi.
    const el = formulaRef.current;
    if ((event.key === 'Backspace' || event.key === 'Delete') && el) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
      const anchor = selection.anchorNode;
      const offset = selection.anchorOffset;
      let sibling: ChildNode | null = null;
      if (anchor === el) {
        const index = event.key === 'Backspace' ? offset - 1 : offset;
        sibling = el.childNodes[index] ?? null;
      } else if (anchor?.nodeType === Node.TEXT_NODE && anchor.parentNode === el) {
        const index = Array.prototype.indexOf.call(el.childNodes, anchor);
        if (event.key === 'Backspace' && offset === 0 && index > 0) sibling = el.childNodes[index - 1];
        else if (event.key === 'Delete' && offset === (anchor.textContent ?? '').length) sibling = el.childNodes[index + 1] ?? null;
      }
      if (sibling instanceof HTMLElement && sibling.hasAttribute('data-modifier-tag')) {
        event.preventDefault();
        sibling.remove();
        setError(null);
      }
    }
  };

  const onFormulaPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    // Solo testo semplice: niente HTML esterno dentro la formula.
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    document.execCommand('insertText', false, text);
  };

  return (
    <div className="flex flex-col gap-2 p-1">
      <label className="block">
        <span className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">Nome</span>
        <input
          autoFocus
          ref={nameRef}
          value={nameDraft}
          maxLength={MODIFIER_VALUE_MAX_LENGTH}
          // Marcatore rename: il menu titolo "/" consuma qui Invio/Escape e
          // frecce quando e' aperto (stesse opzioni del titolo Modificatore).
          data-note-modifier-rename="true"
          aria-label="Nome dado"
          onChange={(event) => {
            const next = event.target.value;
            setNameDraft(next);
            setError(null);
            applyModifierTitleFormat(event.target, titleFormat);
            syncTitleMenu(next, event.target.selectionStart ?? next.length);
          }}
          onKeyDown={(event) => {
            if (titleMenuOpenRef.current && (event.key === 'Enter' || event.key === 'Escape' || event.key.startsWith('Arrow'))) return;
            if (event.key === 'Enter') { event.preventDefault(); confirm(); }
          }}
          placeholder="Dado"
          className="w-full rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1.5 text-xs text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
        />
      </label>
      <fieldset>
        <legend className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">Tipo</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {(['standard', 'custom'] as const).map((option) => (
            <label key={option} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${diceMode === option ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 text-[var(--dash-text-strong)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-text)]'}`}>
              <input type="radio" name={`note-dice-mode-${dicePos}`} value={option} checked={diceMode === option} onChange={() => selectMode(option)} className="accent-[var(--dash-accent)]" />
              {option === 'standard' ? 'Standard' : 'Custom'}
            </label>
          ))}
        </div>
      </fieldset>
      {diceMode === 'standard' ? <>
        <div key="standard-dice-value">
          <span className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">Valore</span>
          <div
            ref={formulaRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Valore"
            onKeyDown={onFormulaKeyDown}
            onPaste={onFormulaPaste}
            onInput={() => setError(null)}
            className="min-h-[3.2em] w-full resize-y whitespace-pre-wrap break-words rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1.5 font-mono text-xs text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
          />
        </div>
        {modifiers.length > 0 && (
          <div>
            <span className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">Modificatori</span>
            <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1">
              {modifiers.map((modifier) => (
                <Tooltip key={modifier.name}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertTag(modifier.name)}
                      className="truncate rounded-md px-2 py-1 text-left text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
                    >
                      {modifier.name}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="z-[10001]">{modifier.formula || modifier.value || '—'}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </> : <>
        <div key="custom-dice-picker">
          <span className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">Dado Custom</span>
          <div className="relative">
            <div
              ref={customPickerRef}
              data-note-custom-die-picker
              onScroll={(event) => setCustomScroll(measureCustomDiceScroll(event.currentTarget))}
              className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1 pr-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {customDiceLoading ? <p className="px-2 py-2 text-center text-[10px] text-[var(--dash-muted)]">Caricamento...</p> : <>
                {customDieDraft && !customDice.some((die) => die.id === customDieDraft.id) ? <div className="flex shrink-0 items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 px-1.5 py-1 text-xs">
                  <CustomDieLibraryIcon die={customDieDraft} size="compact" />
                  <span className="min-w-0 flex-1 truncate">{customDieDraft.name}</span>
                </div> : null}
                {customDice.map((die) => (
                  <button
                    key={die.id}
                    type="button"
                    aria-pressed={customDieDraft?.id === die.id}
                    onClick={() => { setCustomDieDraft(toCustomDieRollSnapshot(die)); setQuantity((current) => Math.min(current, die.sides === 100 ? 500 : 1000)); setError(null); }}
                    className={`flex shrink-0 items-center gap-2 rounded-md border px-1.5 py-1 text-left text-xs ${customDieDraft?.id === die.id ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/15' : 'border-transparent hover:bg-[var(--dash-surface-2)]'}`}
                  >
                    <CustomDieLibraryIcon die={die} size="compact" />
                    <span className="min-w-0 flex-1 truncate">{die.name}</span>
                    <span className="text-[10px] text-[var(--dash-muted)]">d{die.sides}</span>
                  </button>
                ))}
                {!customDice.length && !customDieDraft ? <p className="px-2 py-2 text-center text-[10px] text-[var(--dash-muted)]">Nessun dado Custom salvato.</p> : null}
              </>}
            </div>
            {customScroll.visible ? <span aria-hidden="true" data-note-custom-die-scrollbar className="pointer-events-none absolute bottom-1 right-1 top-1 w-1 rounded-full bg-[var(--dash-surface-2)]">
              <span className="absolute left-0 w-full rounded-full bg-[var(--dash-accent)]" style={{ top: `${customScroll.topPercent}%`, height: `${customScroll.heightPercent}%` }} />
            </span> : null}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">Quantità</span>
          <DiceNumericStepper value={quantity} onChange={setQuantity} min={1} max={customDieDraft?.sides === 100 ? 500 : 1000} integer fullWidth ariaLabel="quantità dadi Custom" />
        </label>
      </>}
      {error && <p role="alert" className="px-0.5 text-xs text-[var(--dash-danger-text)]">{error}</p>}
      <div className="mt-0.5 flex gap-1.5">
        <button
          type="button"
          onClick={confirm}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--dash-accent)] px-2 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)] transition-colors hover:brightness-110"
        >
          <Save className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Salva
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
        >
          <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Annulla
        </button>
      </div>
    </div>
  );
}

function DiceEditPanel({ top, left, name, modifiers, lookup, customDice, customDiceLoading, initialName, initialTitle, initialFormula, initialMode, initialQuantity, initialCustomDie, dicePos, onSave, onCancel }: {
  top: number;
  left: number;
  name: string;
  modifiers: ModifierSnapshot[];
  lookup: Map<string, ModifierSnapshot>;
  customDice: SavedCustomDie[];
  customDiceLoading: boolean;
  initialName: string;
  initialTitle: ModifierTitleFormat;
  initialFormula: string;
  initialMode: DiceMode;
  initialQuantity: number;
  initialCustomDie: CustomDieRollSnapshot | null;
  dicePos: number;
  onSave: (name: string, formula: string, title: ModifierTitleFormat, mode: DiceMode, quantity: number, customDie: CustomDieRollSnapshot | null) => void;
  onCancel: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState({ top, left });

  // Trascinamento dalla maniglia in testata (non dai bordi: un click appena
  // fuori chiuderebbe il pannello). Solo tasto sinistro, con clamp viewport.
  const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const root = rootRef.current;
    if (!root) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    try { root.setPointerCapture(event.pointerId); } catch { /* pointer gia' rilasciato */ }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || !root) return;
    setPos({
      top: Math.max(8, Math.min(event.clientY - drag.dy, window.innerHeight - root.offsetHeight - 8)),
      left: Math.max(8, Math.min(event.clientX - drag.dx, window.innerWidth - root.offsetWidth - 8)),
    });
  };
  const endDrag = () => { dragRef.current = null; };

  return (
    <div
      ref={rootRef}
      data-note-contextual-ui="true"
      data-note-dice-menu="true"
      role="dialog"
      aria-label={`Modifica ${name}`}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="max-h-[calc(100vh-16px)] w-[232px] overflow-y-auto rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        data-edit-drag-handle="true"
        onPointerDown={onHandlePointerDown}
        className="mb-1 flex cursor-grab touch-none items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </div>
      <DiceEditForm
        dicePos={dicePos}
        modifiers={modifiers}
        lookup={lookup}
        customDice={customDice}
        customDiceLoading={customDiceLoading}
        initialName={initialName}
        initialTitle={initialTitle}
        initialFormula={initialFormula}
        initialMode={initialMode}
        initialQuantity={initialQuantity}
        initialCustomDie={initialCustomDie}
        onSave={onSave}
        onCancel={onCancel}
      />
    </div>
  );
}

const DICE_MENU_WIDTH = 184;
const DICE_MENU_HEIGHT = 176;

export function NoteModifierMenu({ editor, editable }: NoteModifierMenuProps) {
  const portalContainer = usePortalContainer();
  const [request, setRequest] = useState<NoteModifierMenuRequest | null>(null);
  const [mode, setMode] = useState<MenuMode>('menu');

  const close = useCallback((refocus = true) => {
    setRequest(null);
    setMode('menu');
    // Il refocus ha senso solo per chiusure da tastiera o da azioni del menu:
    // al click fuori il focus deve seguire il punto cliccato, mai tornare
    // all'editor (lasciava un caret fantasma). Mai su editor non editable.
    if (refocus && editor.isEditable) editor.commands.focus();
  }, [editor]);

  // Apertura dal widget vanilla (CustomEvent su window).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<NoteModifierMenuRequest>).detail;
      setRequest(detail);
      setMode('menu');
    };
    window.addEventListener(NOTE_MODIFIER_MENU_EVENT, onOpen);
    return () => window.removeEventListener(NOTE_MODIFIER_MENU_EVENT, onOpen);
  }, []);

  // Se il Modificatore sparisce dal documento (cancellato altrove), chiudi.
  useEffect(() => {
    if (!editor || !request) return;
    const onTransaction = () => {
      if (!getModifierAt(editor.state, request.pos)) close();
    };
    editor.on('transaction', onTransaction);
    return () => { editor.off('transaction', onTransaction); };
  }, [editor, request, close]);

  // Chiusura su click fuori senza rubare il focus (il click sui puntini di un
  // altro Modificatore deve poter RIAPRIRE il menu allo stesso colpo, quindi
  // non chiude). Il pannello modifica porta gli stessi marcatori del menu,
  // quindi i click nei suoi campi non chiudono. Il menu titolo "/" del Nome
  // Dado e' fuori da entrambi: usarlo non deve chiudere.
  useEffect(() => {
    if (!request) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest('[data-note-modifier-menu="true"]')) return;
      if (target.closest('[data-note-modifier-title-menu="true"]')) return;
      if (target.closest('.tiptap-inline-modifier-widget')) return;
      close(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [request, close]);

  // Escape chiude e restituisce il focus all'editor.
  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, close]);

  if (!editable) return null;

  const startRename = () => {
    if (!request) return;
    window.dispatchEvent(new CustomEvent(NOTE_MODIFIER_RENAME_EVENT, { detail: { pos: request.pos } }));
    setRequest(null);
    setMode('menu');
  };

  const startEdit = () => {
    if (!request) return;
    setMode('edit');
  };

  const saveEdit = (nextValue: string, nextFormula: string) => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    setModifierAttrs(view.state, (tr) => view.dispatch(tr), request.pos, { value: nextValue, formula: nextFormula });
    close();
  };

  const runCompact = (compact: boolean) => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    setModifierCompactAt(view.state, (tr) => view.dispatch(tr), request.pos, compact);
    close();
  };

  const runDuplicate = () => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    duplicateModifierAt(view.state, (tr) => view.dispatch(tr), request.pos);
    close();
  };

  const runCopy = async () => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    await copyModifierToClipboard(view, request.pos);
    close();
  };

  const runDelete = () => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    deleteModifierAt(view.state, (tr) => view.dispatch(tr), request.pos);
    close();
  };

  if (!request) return null;

  const data = getModifierAt(editor.state, request.pos);
  if (!data) return null;

  // Modifica: finestra volante centrata nella tab, appena sotto l'elemento
  // (niente finestra dedicata), con Valore e Formula. Stessi marcatori del
  // menu cosi' i click dentro non chiudono e l'autofocus non fa blur; z-index
  // sopra gli altri pannelli e posizione vincolata alla viewport.
  if (mode === 'edit') {
    const EDIT_PANEL_WIDTH = 232;
    const domRect = editor.view.dom.getBoundingClientRect();
    const centeredLeft = Math.max(
      8,
      Math.min(
        domRect.left + (domRect.width - EDIT_PANEL_WIDTH) / 2,
        window.innerWidth - EDIT_PANEL_WIDTH - 8,
      ),
    );
    const belowTop = Math.max(8, Math.min(request.widgetBottom + 8, window.innerHeight - 320 - 8));
    const lookup = getModifierLookup(editor.view);
    const modifiers = [...lookup.values()].filter((modifier) => modifier.name !== data.name);
    return createPortal(
      <ModifierEditPanel
        top={belowTop}
        left={centeredLeft}
        name={data.name}
        modifiers={modifiers}
        lookup={lookup}
        initialValue={data.value}
        initialFormula={data.formula}
        onSave={saveEdit}
        onCancel={() => close()}
      />,
      portalContainer ?? document.body,
    );
  }

  const placed = placeFloatingNoteUI(
    { left: request.x, right: request.x + 2, top: request.y, bottom: request.y },
    MENU_WIDTH,
    MENU_HEIGHT,
    6,
  );

  const content: ReactNode = (
    <>
      <MenuAction label="Rinomina" icon={Pencil} onActivate={startRename} />
      <MenuAction label={data.compact ? 'Allarga' : 'Riduci'} icon={data.compact ? Maximize2 : Minimize2} onActivate={() => runCompact(!data.compact)} />
      <MenuAction label="Modifica" icon={Wrench} onActivate={startEdit} />
      <MenuAction label="Duplica" icon={Copy} onActivate={runDuplicate} />
      <MenuAction label="Copia" icon={Clipboard} onActivate={runCopy} />
      <div className="my-1 h-px bg-[var(--dash-border-soft)]" />
      <MenuAction label="Elimina" icon={Trash2} danger onActivate={runDelete} />
    </>
  );

  const menu = (
    <div
      data-note-contextual-ui="true"
      data-note-modifier-menu="true"
      role="menu"
      aria-label="Menu Modificatore"
      style={{ position: 'fixed', top: placed.top, left: placed.left, zIndex: 9997 }}
      className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg w-[184px]"
    >
      {content}
    </div>
  );

  return createPortal(menu, portalContainer ?? document.body);
}

// Bridge widget vanilla -> chat dadi: al click su un Modificatore con valore
// Menu contestuale del Dado: solo Modifica, Duplica, Copia ed Elimina (niente
// Rinomina, niente Riduci/Allarga, niente formato titolo).
export function NoteDiceMenu({ editor, editable }: NoteModifierMenuProps) {
  const portalContainer = usePortalContainer();
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const [request, setRequest] = useState<NoteModifierMenuRequest | null>(null);
  const [mode, setMode] = useState<MenuMode>('menu');
  const [customDice, setCustomDice] = useState<SavedCustomDie[]>([]);
  const [customDiceLoading, setCustomDiceLoading] = useState(false);

  const reloadCustomDice = useCallback(async () => {
    if (!user?.id || !activeCampaign?.id) {
      setCustomDice([]);
      return;
    }
    setCustomDiceLoading(true);
    try {
      const loaded = await loadCustomDice(activeCampaign.id, user.id);
      setCustomDice(loaded);
      refreshInlineCustomDiceSnapshots(editor.view.state, (transaction) => editor.view.dispatch(transaction), loaded);
    } catch (error) {
      console.error('Errore caricamento dadi Custom per le Note:', error);
      setCustomDice([]);
    } finally {
      setCustomDiceLoading(false);
    }
  }, [activeCampaign?.id, editor, user?.id]);

  useEffect(() => {
    if (mode === 'edit' && request) void reloadCustomDice();
  }, [mode, request, reloadCustomDice]);

  useEffect(() => {
    const onLibraryChanged = () => void reloadCustomDice();
    window.addEventListener(CUSTOM_DICE_LIBRARY_CHANGED_EVENT, onLibraryChanged);
    return () => window.removeEventListener(CUSTOM_DICE_LIBRARY_CHANGED_EVENT, onLibraryChanged);
  }, [reloadCustomDice]);

  const close = useCallback((refocus = true) => {
    setRequest(null);
    setMode('menu');
    if (refocus && editor.isEditable) editor.commands.focus();
  }, [editor]);

  // Apertura dal widget vanilla (CustomEvent su window).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<NoteModifierMenuRequest>).detail;
      setRequest(detail);
      setMode('menu');
    };
    window.addEventListener(NOTE_DICE_MENU_EVENT, onOpen);
    return () => window.removeEventListener(NOTE_DICE_MENU_EVENT, onOpen);
  }, []);

  // Se il Dado sparisce dal documento (cancellato altrove), chiudi.
  useEffect(() => {
    if (!editor || !request) return;
    const onTransaction = () => {
      if (!getDiceAt(editor.state, request.pos)) close();
    };
    editor.on('transaction', onTransaction);
    return () => { editor.off('transaction', onTransaction); };
  }, [editor, request, close]);

  // Il menu titolo "/" e' unico: se quello aperto e' del Nome di questo Dado,
  // il click fuori chiude prima solo lui (stessa sequenza del suo dismiss) e
  // il pannello resta aperto. Se appartiene ad altro, chiude il pannello.
  const diceTitleMenuOpenRef = useRef(false);
  useEffect(() => {
    const onTitleOpen = (event: Event) => {
      const detail = (event as CustomEvent<NoteModifierTitleMenuRequest>).detail;
      diceTitleMenuOpenRef.current = !!request && typeof detail?.pos === 'number' && detail.pos === request.pos;
    };
    const onTitleClosed = () => { diceTitleMenuOpenRef.current = false; };
    window.addEventListener(NOTE_MODIFIER_TITLE_MENU_EVENT, onTitleOpen);
    window.addEventListener(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, onTitleClosed);
    window.addEventListener(NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT, onTitleClosed);
    return () => {
      window.removeEventListener(NOTE_MODIFIER_TITLE_MENU_EVENT, onTitleOpen);
      window.removeEventListener(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, onTitleClosed);
      window.removeEventListener(NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT, onTitleClosed);
    };
  }, [request]);

  // Chiusura su click fuori senza rubare il focus (stesse regole del menu
  // Modificatore: i puntini di un altro elemento possono riaprire). Il menu
  // titolo "/" del Nome e' fuori dal pannello: sceglierne una voce non deve
  // chiuderlo.
  useEffect(() => {
    if (!request) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest('[data-note-dice-menu="true"]')) return;
      if (target.closest('[data-note-modifier-title-menu="true"]')) return;
      if (target.closest(DICE_WIDGET_SELECTOR)) return;
      if (diceTitleMenuOpenRef.current && document.querySelector('[data-note-modifier-title-menu="true"]')) {
        diceTitleMenuOpenRef.current = false;
        window.dispatchEvent(new CustomEvent<{ pos: number }>(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, { detail: { pos: request.pos } }));
        window.dispatchEvent(new CustomEvent<{ pos: number }>(NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT, { detail: { pos: request.pos } }));
        return;
      }
      close(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [request, close]);

  // Escape chiude e restituisce il focus all'editor.
  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, close]);

  if (!editable) return null;

  const startEdit = () => {
    if (!request) return;
    setMode('edit');
  };

  const saveEdit = (nextName: string, nextFormula: string, nextTitle: ModifierTitleFormat, nextMode: DiceMode, quantity: number, customDie: CustomDieRollSnapshot | null) => {
    if (!request) return;
    const { view } = editor;
    if (!getDiceAt(view.state, request.pos)) { close(); return; }
    setDiceAttrs(view.state, (tr) => view.dispatch(tr), request.pos, {
      name: nextName,
      formula: nextFormula,
      mode: nextMode,
      quantity,
      customDie,
      titleBold: nextTitle.bold,
      titleItalic: nextTitle.italic,
      titleUnderline: nextTitle.underline,
      titleStrike: nextTitle.strike,
      titleFontSize: nextTitle.fontSize,
      titleFontFamily: nextTitle.fontFamily,
      titleAlign: nextTitle.align,
    });
    close();
  };

  const runDuplicate = () => {
    if (!request) return;
    const { view } = editor;
    if (!getDiceAt(view.state, request.pos)) { close(); return; }
    duplicateDiceAt(view.state, (tr) => view.dispatch(tr), request.pos);
    close();
  };

  const runCopy = async () => {
    if (!request) return;
    const { view } = editor;
    if (!getDiceAt(view.state, request.pos)) { close(); return; }
    await copyDiceToClipboard(view, request.pos);
    close();
  };

  const runDelete = () => {
    if (!request) return;
    const { view } = editor;
    if (!getDiceAt(view.state, request.pos)) { close(); return; }
    deleteDiceAt(view.state, (tr) => view.dispatch(tr), request.pos);
    close();
  };

  if (!request) return null;

  const data = getDiceAt(editor.state, request.pos);
  if (!data) return null;

  // Modifica: stessa finestra volante del Modificatore (centrata nella tab,
  // sotto l'elemento), con Nome e Valore.
  if (mode === 'edit') {
    const EDIT_PANEL_WIDTH = 232;
    const domRect = editor.view.dom.getBoundingClientRect();
    const centeredLeft = Math.max(
      8,
      Math.min(
        domRect.left + (domRect.width - EDIT_PANEL_WIDTH) / 2,
        window.innerWidth - EDIT_PANEL_WIDTH - 8,
      ),
    );
    const belowTop = Math.max(8, Math.min(request.widgetBottom + 8, window.innerHeight - 320 - 8));
    const lookup = getModifierLookup(editor.view);
    const modifiers = [...lookup.values()];
    return createPortal(
      <DiceEditPanel
        top={belowTop}
        left={centeredLeft}
        name={data.name}
        modifiers={modifiers}
        lookup={lookup}
        customDice={customDice}
        customDiceLoading={customDiceLoading}
        initialName={data.name}
        initialTitle={{
          bold: data.titleBold,
          italic: data.titleItalic,
          underline: data.titleUnderline,
          strike: data.titleStrike,
          fontSize: data.titleFontSize,
          fontFamily: data.titleFontFamily,
          align: data.titleAlign,
        }}
        initialFormula={data.formula}
        initialMode={data.mode}
        initialQuantity={data.quantity}
        initialCustomDie={data.customDie}
        dicePos={request.pos}
        onSave={saveEdit}
        onCancel={() => close()}
      />,
      portalContainer ?? document.body,
    );
  }

  const placed = placeFloatingNoteUI(
    { left: request.x, right: request.x + 2, top: request.y, bottom: request.y },
    DICE_MENU_WIDTH,
    DICE_MENU_HEIGHT,
    6,
  );

  const menu = (
    <div
      data-note-contextual-ui="true"
      data-note-dice-menu="true"
      role="menu"
      aria-label="Menu Dado"
      style={{ position: 'fixed', top: placed.top, left: placed.left, zIndex: 9997 }}
      className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg w-[184px]"
    >
      <MenuAction label="Modifica" icon={Wrench} onActivate={startEdit} />
      <MenuAction label="Duplica" icon={Copy} onActivate={runDuplicate} />
      <MenuAction label="Copia" icon={Clipboard} onActivate={runCopy} />
      <div className="my-1 h-px bg-[var(--dash-border-soft)]" />
      <MenuAction label="Elimina" icon={Trash2} danger onActivate={runDelete} />
    </div>
  );

  return createPortal(menu, portalContainer ?? document.body);
}

// dado legge i dati correnti e chiede al contesto dadi di tirare. Fuori dalla
// sessione dadi (o senza dati) non fa nulla.
export function NoteModifierRollBridge({ editor }: { editor: Editor }) {
  const session = useOptionalDiceSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  useEffect(() => {
    const onRoll = (event: Event) => {
      const detail = (event as CustomEvent<NoteModifierRollRequest>).detail;
      const submit = sessionRef.current?.submitModifierRoll;
      if (typeof detail?.pos !== 'number' || !submit) return;
      const view = editorRef.current.view;
      // I tag "Nome" si risolvono sui valori correnti di tutta la nota. Vale
      // sia per il Modificatore sia per il Dado (stesso evento di tiro).
      const lookup = getModifierLookup(view);
      const resolveName = (refName: string) => {
        const entry = lookup.get(refName);
        return entry ? { value: entry.value, formula: entry.formula } : null;
      };
      try {
        const modifier = getModifierAt(editorRef.current.state, detail.pos);
        if (modifier) {
          submit({ name: modifier.name, expression: modifier.value, formula: modifier.formula, resolveName });
          return;
        }
        const dice = getDiceAt(editorRef.current.state, detail.pos);
        if (dice) {
          if (dice.mode === 'custom' && dice.customDie) {
            sessionRef.current?.submitInlineCustomDieRoll({
              name: dice.name,
              quantity: dice.quantity,
              customDie: dice.customDie,
            });
            return;
          }
          submit({ name: dice.name, expression: dice.formula, formula: dice.formula, resolveName });
        }
      } catch (error) {
        console.error('Errore tiro elemento Nota:', error);
      }
    };
    window.addEventListener(NOTE_MODIFIER_ROLL_EVENT, onRoll);
    return () => window.removeEventListener(NOTE_MODIFIER_ROLL_EVENT, onRoll);
  }, []);
  return null;
}

// Menu "/" dentro la rinomina del titolo del Modificatore: solo gruppo
// Testo, senza Elenco puntato / Elenco numerato / Citazione. Le voci riusano
// le icone dei comandi nota (stesse regole degli altri menu compatti).
export const TITLE_SLASH_COMMAND_IDS: readonly NoteCommandId[] = [
  'bold', 'italic', 'underline', 'strike', 'fontSize', 'fontFamily',
  'alignLeft', 'alignCenter', 'alignRight',
];

const TITLE_MENU_WIDTH = 224;
const TITLE_MENU_HEIGHT = 320;

interface TitleMenuState extends NoteModifierTitleMenuRequest {}

export function NoteModifierTitleMenu({ editable }: { editable: boolean }) {
  const portalContainer = usePortalContainer();
  const [request, setRequest] = useState<TitleMenuState | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [expanded, setExpanded] = useState<'fontSize' | 'fontFamily' | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<NoteModifierTitleMenuRequest>).detail;
      if (typeof detail?.pos !== 'number') return;
      setRequest({ ...detail });
      setHighlight(0);
    };
    const onClose = (event: Event) => {
      const detail = (event as CustomEvent<{ pos: number }>).detail;
      setRequest((current) => (current && detail && current.pos === detail.pos ? null : current));
      setExpanded(null);
    };
    window.addEventListener(NOTE_MODIFIER_TITLE_MENU_EVENT, onOpen);
    window.addEventListener(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(NOTE_MODIFIER_TITLE_MENU_EVENT, onOpen);
      window.removeEventListener(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, onClose);
    };
  }, []);

  const commands = useMemo(
    () => TITLE_SLASH_COMMAND_IDS
      .map((id) => NOTE_COMMANDS.find((command) => command.id === id))
      .filter((command): command is (typeof NOTE_COMMANDS)[number] => Boolean(command)),
    [],
  );

  const filtered = useMemo(() => {
    const query = (request?.query ?? '').trim().toLowerCase();
    if (!query) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(query));
  }, [commands, request]);

  useEffect(() => {
    setHighlight(0);
    setExpanded(null);
  }, [request?.query]);

  const apply = useCallback((commandId: NoteCommandId, value?: number | string) => {
    if (!request) return;
    const formatCommand: ModifierTitleFormatCommand | null =
      commandId === 'bold' ? 'bold'
      : commandId === 'italic' ? 'italic'
      : commandId === 'underline' ? 'underline'
      : commandId === 'strike' ? 'strike'
      : commandId === 'fontSize' ? 'fontSize'
      : commandId === 'fontFamily' ? 'fontFamily'
      : commandId === 'alignLeft' ? 'alignLeft'
      : commandId === 'alignCenter' ? 'alignCenter'
      : commandId === 'alignRight' ? 'alignRight'
      : null;
    if (!formatCommand) return;
    const detail: NoteModifierTitleFormatRequest = value === undefined
      ? { pos: request.pos, command: formatCommand }
      : { pos: request.pos, command: formatCommand, value };
    window.dispatchEvent(new CustomEvent(NOTE_MODIFIER_TITLE_FORMAT_EVENT, { detail }));
  }, [request]);

  const dismiss = useCallback(() => {
    if (!request) return;
    window.dispatchEvent(new CustomEvent(NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT, { detail: { pos: request.pos } }));
    setRequest(null);
    setExpanded(null);
  }, [request]);

  // Tastiera del menu titolo: frecce navigano, Invio applica, Escape chiude
  // ("/" resta testo, come lo slash menu dell'editor). Capture su window per
  // arrivare prima dei listener dell'editor.
  useEffect(() => {
    if (!request || !editable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.('[data-note-modifier-rename="true"]')) return;
      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      };
      if (event.key === 'Escape') {
        consume();
        if (expanded) setExpanded(null);
        else dismiss();
        return;
      }
      if (expanded === 'fontSize') {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          consume();
          setHighlight((current) => {
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            return (current + delta + FONT_SIZES.length) % FONT_SIZES.length;
          });
        } else if (event.key === 'Enter') {
          consume();
          apply('fontSize', FONT_SIZES[highlight % FONT_SIZES.length]);
        }
        return;
      }
      if (expanded === 'fontFamily') {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          consume();
          setHighlight((current) => {
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            return (current + delta + FONT_FAMILIES.length) % FONT_FAMILIES.length;
          });
        } else if (event.key === 'Enter') {
          consume();
          apply('fontFamily', FONT_FAMILIES[highlight % FONT_FAMILIES.length].label);
        }
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        consume();
        if (!filtered.length) return;
        setHighlight((current) => {
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          return (current + delta + filtered.length) % filtered.length;
        });
      } else if (event.key === 'Enter') {
        const command = filtered[highlight];
        if (!command) return;
        consume();
        if (command.id === 'fontSize' || command.id === 'fontFamily') setExpanded(command.id);
        else apply(command.id);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [request, editable, filtered, highlight, expanded, apply, dismiss]);

  if (!editable || !request) return null;

  const placed = placeFloatingNoteUI(
    { left: request.x, right: request.x + 2, top: request.y, bottom: request.y },
    TITLE_MENU_WIDTH,
    TITLE_MENU_HEIGHT,
    6,
  );

  const renderMainButton = (command: (typeof NOTE_COMMANDS)[number], index: number) => {
    const Icon = command.icon;
    const active = index === highlight && !expanded;
    return (
      <button
        key={command.id}
        type="button"
        role="menuitem"
        aria-label={command.label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          if (command.id === 'fontSize' || command.id === 'fontFamily') {
            setExpanded(command.id);
            setHighlight(0);
          } else {
            apply(command.id);
          }
        }}
        onMouseEnter={() => { setHighlight(index); }}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
          active
            ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
            : 'text-[var(--dash-text)] hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]'
        }`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{command.label}</span>
      </button>
    );
  };

  const secondary = expanded === 'fontSize' ? (
    <div className="p-1">
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setExpanded(null); setHighlight(0); }}
        className="mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Formato titolo
      </button>
      <div className="grid grid-cols-3 gap-1">
        {FONT_SIZES.map((size, index) => (
          <button
            key={size}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply('fontSize', size)}
            onMouseEnter={() => setHighlight(index)}
            className={`rounded-md px-2 py-1.5 text-sm ${index === highlight % FONT_SIZES.length ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'hover:bg-[var(--dash-surface-2)]'}`}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  ) : expanded === 'fontFamily' ? (
    <div className="p-1">
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setExpanded(null); setHighlight(0); }}
        className="mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Formato titolo
      </button>
      <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto pr-1">
        {FONT_FAMILIES.map(({ label, value }, index) => (
          <button
            key={label}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply('fontFamily', label)}
            onMouseEnter={() => setHighlight(index)}
            style={{ fontFamily: value }}
            className={`rounded-md px-2 py-1.5 text-left text-sm ${index === highlight % FONT_FAMILIES.length ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'hover:bg-[var(--dash-surface-2)]'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const menu = (
    <div
      data-note-contextual-ui="true"
      data-note-modifier-title-menu="true"
      role="menu"
      aria-label="Formato titolo"
      // Sopra anche al pannello Modifica (z 9999): dal Nome del Dado il menu
      // si apre sopra il pannello e deve restare cliccabile.
      style={{ position: 'fixed', top: placed.top, left: placed.left, zIndex: 10002 }}
      className="w-[224px] overflow-hidden rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="border-b border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-strong)]">
        Testo
      </div>
      {secondary ?? (
        <div className="p-1">
          {filtered.length ? filtered.map((command, index) => renderMainButton(command, index)) : (
            <div className="px-2 py-3 text-center text-xs text-[var(--dash-muted)]">Nessun formato trovato</div>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(menu, portalContainer ?? document.body);
}
