import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FolderInput } from 'lucide-react';
import { DiceFormulaFolderRow } from './DiceFormulaFolderRow';
import { SavedDiceFormulaCard } from './SavedDiceFormulaCard';
import {
  MAX_DICE_FORMULA_FOLDER_DEPTH,
  canMoveDiceFormulaFolder,
  getDiceFormulaFolderDepth,
  getDiceLibraryNodes,
} from './diceFormulaLibrary.ts';
import type {
  DiceFormulaFolder,
  DiceLibraryNodeType,
  SavedDiceFormula,
} from './diceTypes.ts';

interface DiceFormulaLibraryTreeProps {
  campaignId: string;
  userId: string;
  formulas: SavedDiceFormula[];
  folders: DiceFormulaFolder[];
  onRollFormula: (formula: SavedDiceFormula) => void;
  onToggleSecret: (formula: SavedDiceFormula) => void;
  onEditFormula: (formula: SavedDiceFormula) => void;
  onDuplicateFormula: (formula: SavedDiceFormula) => void;
  onDeleteFormula: (formula: SavedDiceFormula) => void;
  onFormulaIconChange: (formula: SavedDiceFormula, iconName: string | null) => void;
  onCreateFolder: (parentFolderId: string | null) => void;
  onRenameFolder: (folder: DiceFormulaFolder) => void;
  onDeleteFolder: (folder: DiceFormulaFolder) => void;
  onFolderIconChange: (folder: DiceFormulaFolder, iconName: string | null) => void;
  onMoveNode: (
    nodeType: DiceLibraryNodeType,
    nodeId: string,
    destinationFolderId: string | null,
    destinationIndex: number,
  ) => void;
}

type DropPosition = 'before' | 'after' | 'inside' | 'root';
interface DraggedNode { kind: DiceLibraryNodeType; id: string; parentId: string | null }
interface DropTarget {
  kind: DiceLibraryNodeType | 'root';
  id: string;
  parentId: string | null;
  position: DropPosition;
}

const AUTO_OPEN_DELAY = 650;
const DRAG_GHOST_PALETTE_PROPERTIES = [
  '--dash-bg',
  '--dash-surface',
  '--dash-surface-2',
  '--dash-panel',
  '--dash-input',
  '--dash-border',
  '--dash-border-soft',
  '--dash-text',
  '--dash-text-strong',
  '--dash-muted',
  '--dash-accent',
] as const;

export function DiceFormulaLibraryTree({
  campaignId,
  userId,
  formulas,
  folders,
  onRollFormula,
  onToggleSecret,
  onEditFormula,
  onDuplicateFormula,
  onDeleteFormula,
  onFormulaIconChange,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onFolderIconChange,
  onMoveNode,
}: DiceFormulaLibraryTreeProps) {
  const storageKey = `dice-formula-folders:${campaignId}:${userId}`;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragged, setDragged] = useState<DraggedNode | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const autoOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoOpenFolderId = useRef<string | null>(null);
  const dragGhostRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown;
      setExpandedIds(new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []));
    } catch {
      setExpandedIds(new Set());
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expandedIds]));
    } catch {
      // localStorage can be unavailable in private/browser-restricted contexts.
    }
  }, [expandedIds, storageKey]);

  useEffect(() => () => {
    if (autoOpenTimer.current) clearTimeout(autoOpenTimer.current);
    dragGhostRef.current?.remove();
  }, []);

  const setExpanded = (folderId: string, expanded: boolean) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(folderId); else next.delete(folderId);
      return next;
    });
  };

  const clearAutoOpen = () => {
    if (autoOpenTimer.current) clearTimeout(autoOpenTimer.current);
    autoOpenTimer.current = null;
    autoOpenFolderId.current = null;
  };

  const scheduleAutoOpen = (folderId: string) => {
    if (expandedIds.has(folderId) || autoOpenFolderId.current === folderId) return;
    clearAutoOpen();
    autoOpenFolderId.current = folderId;
    autoOpenTimer.current = setTimeout(() => {
      setExpanded(folderId, true);
      autoOpenTimer.current = null;
      autoOpenFolderId.current = null;
    }, AUTO_OPEN_DELAY);
  };

  const startDrag = (
    event: DragEvent<HTMLElement>,
    kind: DiceLibraryNodeType,
    id: string,
    parentId: string | null,
  ) => {
    setDragged({ kind, id, parentId });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${kind}:${id}`);

    const source = event.currentTarget;
    const sourceStyle = window.getComputedStyle(source);
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.setAttribute('data-dice-library-drag-ghost', 'true');
    ghost.style.position = 'fixed';
    ghost.style.left = '-10000px';
    ghost.style.top = '-10000px';
    ghost.style.width = `${source.getBoundingClientRect().width}px`;
    ghost.style.opacity = '0.95';
    ghost.style.pointerEvents = 'none';
    ghost.style.backgroundColor = sourceStyle.backgroundColor;
    ghost.style.color = sourceStyle.color;
    ghost.style.borderColor = sourceStyle.borderColor;
    for (const property of DRAG_GHOST_PALETTE_PROPERTIES) {
      const value = sourceStyle.getPropertyValue(property);
      if (value) ghost.style.setProperty(property, value);
    }
    ghost.style.boxShadow = '0 14px 32px rgba(0,0,0,.35)';
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 24, 24);
    dragGhostRef.current = ghost;
    source.classList.add('opacity-65');
  };

  const endDrag = (event: DragEvent<HTMLElement>) => {
    clearAutoOpen();
    event.currentTarget.classList.remove('opacity-65');
    dragGhostRef.current?.remove();
    dragGhostRef.current = null;
    setDragged(null);
    setDropTarget(null);
  };

  const validDestination = (destinationParentId: string | null): boolean => {
    if (!dragged) return false;
    if (dragged.kind === 'formula') return true;
    return canMoveDiceFormulaFolder(dragged.id, destinationParentId, folders);
  };

  const handleNodeDragOver = (
    event: DragEvent<HTMLDivElement>,
    targetKind: DiceLibraryNodeType,
    targetId: string,
    targetParentId: string | null,
  ) => {
    if (!dragged || (dragged.kind === targetKind && dragged.id === targetId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = (event.clientY - rect.top) / Math.max(rect.height, 1);
    let position: DropPosition;
    let destinationParentId = targetParentId;

    if (targetKind === 'folder' && relativeY >= 0.25 && relativeY <= 0.75) {
      position = 'inside';
      destinationParentId = targetId;
    } else {
      position = relativeY < 0.5 ? 'before' : 'after';
    }

    if (!validDestination(destinationParentId)) {
      clearAutoOpen();
      setDropTarget(null);
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget({ kind: targetKind, id: targetId, parentId: targetParentId, position });

    if (position === 'inside' && targetKind === 'folder') scheduleAutoOpen(targetId);
    else clearAutoOpen();
  };

  const destinationIndexFor = (target: DropTarget): { parentId: string | null; index: number } | null => {
    if (!dragged) return null;
    if (target.position === 'root') {
      const rootNodes = getDiceLibraryNodes(formulas, folders, null)
        .filter((node) => !(node.kind === dragged.kind && node.id === dragged.id));
      return { parentId: null, index: rootNodes.length };
    }
    if (target.position === 'inside') {
      const children = getDiceLibraryNodes(formulas, folders, target.id)
        .filter((node) => !(node.kind === dragged.kind && node.id === dragged.id));
      return { parentId: target.id, index: children.length };
    }

    const siblings = getDiceLibraryNodes(formulas, folders, target.parentId)
      .filter((node) => !(node.kind === dragged.kind && node.id === dragged.id));
    const targetIndex = siblings.findIndex((node) => node.kind === target.kind && node.id === target.id);
    if (targetIndex < 0) return null;
    return { parentId: target.parentId, index: targetIndex + (target.position === 'after' ? 1 : 0) };
  };

  const drop = (event: DragEvent<HTMLDivElement>, target: DropTarget) => {
    event.preventDefault();
    clearAutoOpen();
    if (!dragged) return;
    const destination = destinationIndexFor(target);
    if (!destination || !validDestination(destination.parentId)) return;
    onMoveNode(dragged.kind, dragged.id, destination.parentId, destination.index);
    setDragged(null);
    setDropTarget(null);
  };

  const indicatorClass = (targetKind: DiceLibraryNodeType, targetId: string, position: 'before' | 'after') =>
    dropTarget?.kind === targetKind && dropTarget.id === targetId && dropTarget.position === position
      ? 'h-0.5 bg-[var(--dash-accent)] opacity-100'
      : 'h-0.5 opacity-0';

  const renderLevel = (parentId: string | null, depth: number) => {
    const nodes = getDiceLibraryNodes(formulas, folders, parentId);
    return nodes.map((node) => {
      const isInsideTarget = dropTarget?.kind === node.kind && dropTarget.id === node.id && dropTarget.position === 'inside';
      const content = node.kind === 'formula' ? (
        <SavedDiceFormulaCard
          formula={node.formula}
          draggable
          onDragStart={(event) => startDrag(event, 'formula', node.id, node.parentId)}
          onDragEnd={endDrag}
          onRoll={() => onRollFormula(node.formula)}
          onToggleSecret={() => onToggleSecret(node.formula)}
          onEdit={() => onEditFormula(node.formula)}
          onDuplicate={() => onDuplicateFormula(node.formula)}
          onDelete={() => onDeleteFormula(node.formula)}
          onIconChange={(iconName) => onFormulaIconChange(node.formula, iconName)}
        />
      ) : (
        <DiceFormulaFolderRow
          folder={node.folder}
          depth={depth + 1}
          expanded={expandedIds.has(node.id)}
          canCreateSubfolder={getDiceFormulaFolderDepth(node.id, folders) < MAX_DICE_FORMULA_FOLDER_DEPTH}
          onToggle={() => setExpanded(node.id, !expandedIds.has(node.id))}
          onCreateSubfolder={() => { setExpanded(node.id, true); onCreateFolder(node.id); }}
          onRename={() => onRenameFolder(node.folder)}
          onDelete={() => onDeleteFolder(node.folder)}
          onIconChange={(iconName) => onFolderIconChange(node.folder, iconName)}
          onDragStart={(event) => startDrag(event, 'folder', node.id, node.parentId)}
          onDragEnd={endDrag}
        />
      );

      return (
        <div key={`${node.kind}:${node.id}`} data-dice-library-tree-node data-dice-library-level={depth}>
          <div className={indicatorClass(node.kind, node.id, 'before')} />
          <div
            onDragOver={(event) => handleNodeDragOver(event, node.kind, node.id, node.parentId)}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (!nextTarget || !event.currentTarget.contains(nextTarget)) clearAutoOpen();
            }}
            onDrop={(event) => drop(event, {
              kind: node.kind,
              id: node.id,
              parentId: node.parentId,
              position: dropTarget?.kind === node.kind && dropTarget.id === node.id ? dropTarget.position : 'after',
            })}
            style={{ marginLeft: `${Math.min(depth, MAX_DICE_FORMULA_FOLDER_DEPTH) * 14}px` }}
            className={isInsideTarget ? 'rounded-xl ring-2 ring-[var(--dash-accent)] ring-offset-1 ring-offset-transparent' : ''}
          >
            {content}
          </div>
          <div className={indicatorClass(node.kind, node.id, 'after')} />
          {node.kind === 'folder' && expandedIds.has(node.id) && renderLevel(node.id, depth + 1)}
        </div>
      );
    });
  };

  const rootDropActive = dropTarget?.position === 'root';

  return (
    <div data-dice-formula-library-tree>
      <div className="space-y-1.5">{renderLevel(null, 0)}</div>
      {dragged && (
        <div
          data-dice-library-root-drop
          onDragOver={(event) => {
            if (!validDestination(null)) return;
            event.preventDefault();
            clearAutoOpen();
            setDropTarget({ kind: 'root', id: 'root', parentId: null, position: 'root' });
          }}
          onDrop={(event) => drop(event, { kind: 'root', id: 'root', parentId: null, position: 'root' })}
          className={`mt-2 flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors ${rootDropActive ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)] text-[var(--dash-text)]' : 'border-[var(--dash-border)] text-[var(--dash-muted)]'}`}
        >
          <FolderInput className="h-4 w-4" />
          Sposta nella root
        </div>
      )}
    </div>
  );
}
