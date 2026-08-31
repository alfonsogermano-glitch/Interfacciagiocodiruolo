import { useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderPlus, MoreVertical, Pencil, Shapes, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import { DiceLibraryIconPicker } from './DiceLibraryIconPicker';
import type { DiceFormulaFolder } from './diceTypes.ts';

interface DiceFormulaFolderRowProps {
  folder: DiceFormulaFolder;
  expanded: boolean;
  depth: number;
  canCreateSubfolder: boolean;
  onToggle: () => void;
  onCreateSubfolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onIconChange: (iconName: string | null) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: (event: DragEvent<HTMLElement>) => void;
}

const menuItemClass = 'focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]';

export function DiceFormulaFolderRow({
  folder,
  expanded,
  depth,
  canCreateSubfolder,
  onToggle,
  onCreateSubfolder,
  onRename,
  onDelete,
  onIconChange,
  onDragStart,
  onDragEnd,
}: DiceFormulaFolderRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const blockDragRef = useRef(false);

  const handlePointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    blockDragRef.current = Boolean(target?.closest('[data-no-dice-library-drag]'));
  };

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    if (blockDragRef.current) {
      event.preventDefault();
      return;
    }
    onDragStart(event);
  };

  const openIconPicker = () => {
    setMenuOpen(false);
    setIconPickerOpen(true);
  };

  return (
    <>
      <article
        data-dice-formula-folder
        data-dice-library-node="folder"
        data-dice-folder-depth={depth}
        draggable
        onPointerDownCapture={handlePointerDownCapture}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        className="flex min-h-12 items-center rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] transition-colors hover:border-[var(--dash-border-soft)]"
      >
        <button
          type="button"
          data-no-dice-library-drag
          onClick={onToggle}
          aria-label={expanded ? `Chiudi ${folder.name}` : `Apri ${folder.name}`}
          className="ml-1 rounded-md p-2 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">
            {folder.iconName ? <NoteIconGlyph name={folder.iconName} className="h-4.5 w-4.5" /> : <Folder className="h-4.5 w-4.5" />}
          </span>
          <span className="truncate text-sm font-semibold text-[var(--dash-text-strong)]">{folder.name}</span>
        </div>

        <div data-no-dice-library-drag className="mr-1 shrink-0">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="Menu cartella"
                className="rounded-md p-2 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[1000] min-w-52 border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)]">
              <DropdownMenuItem disabled={!canCreateSubfolder} onClick={onCreateSubfolder} className={menuItemClass}>
                <FolderPlus className="mr-2 h-4 w-4" />Nuova sottocartella
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRename} className={menuItemClass}>
                <Pencil className="mr-2 h-4 w-4" />Rinomina
              </DropdownMenuItem>
              <DropdownMenuItem data-dice-folder-icon onSelect={openIconPicker} className={menuItemClass}>
                <Shapes className="mr-2 h-4 w-4" />Icona
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[var(--dash-border)]" />
              <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:bg-[var(--dash-surface-2)] focus:text-red-400">
                <Trash2 className="mr-2 h-4 w-4" />Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>

      <DiceLibraryIconPicker
        open={iconPickerOpen}
        anchorRef={menuButtonRef}
        itemName={folder.name}
        selectedName={folder.iconName ?? null}
        onChoose={(iconName) => { onIconChange(iconName); setIconPickerOpen(false); }}
        onRemove={folder.iconName ? () => { onIconChange(null); setIconPickerOpen(false); } : undefined}
        onClose={() => setIconPickerOpen(false)}
      />
    </>
  );
}
