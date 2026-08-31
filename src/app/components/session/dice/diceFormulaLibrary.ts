import type {
  DiceFormulaFolder,
  DiceLibraryNodeType,
  SavedDiceFormula,
} from './diceTypes.ts';

export const MAX_DICE_FORMULA_FOLDER_DEPTH = 5;

export type DiceLibraryNode =
  | {
      kind: 'formula';
      id: string;
      parentId: string | null;
      sortOrder: number;
      formula: SavedDiceFormula;
    }
  | {
      kind: 'folder';
      id: string;
      parentId: string | null;
      sortOrder: number;
      folder: DiceFormulaFolder;
    };

function compareNodes(a: DiceLibraryNode, b: DiceLibraryNode): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
  return a.id.localeCompare(b.id);
}

export function getDiceLibraryNodes(
  formulas: SavedDiceFormula[],
  folders: DiceFormulaFolder[],
  parentId: string | null,
): DiceLibraryNode[] {
  return [
    ...formulas
      .filter((formula) => formula.folderId === parentId)
      .map((formula): DiceLibraryNode => ({
        kind: 'formula',
        id: formula.id,
        parentId: formula.folderId,
        sortOrder: formula.sortOrder,
        formula,
      })),
    ...folders
      .filter((folder) => folder.parentFolderId === parentId)
      .map((folder): DiceLibraryNode => ({
        kind: 'folder',
        id: folder.id,
        parentId: folder.parentFolderId,
        sortOrder: folder.sortOrder,
        folder,
      })),
  ].sort(compareNodes);
}

export function getDiceFormulaFolderDepth(
  folderId: string,
  folders: DiceFormulaFolder[],
): number {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<string>();
  let current = byId.get(folderId);
  let depth = 0;

  while (current) {
    if (seen.has(current.id)) return MAX_DICE_FORMULA_FOLDER_DEPTH + 1;
    seen.add(current.id);
    depth += 1;
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }

  return depth;
}

export function getDiceFormulaFolderSubtreeHeight(
  folderId: string,
  folders: DiceFormulaFolder[],
): number {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentFolderId) continue;
    const list = children.get(folder.parentFolderId) ?? [];
    list.push(folder.id);
    children.set(folder.parentFolderId, list);
  }

  const visit = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return MAX_DICE_FORMULA_FOLDER_DEPTH + 1;
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const nested = children.get(id) ?? [];
    if (nested.length === 0) return 1;
    return 1 + Math.max(...nested.map((childId) => visit(childId, nextSeen)));
  };

  return visit(folderId, new Set());
}

export function canMoveDiceFormulaFolder(
  folderId: string,
  destinationParentId: string | null,
  folders: DiceFormulaFolder[],
): boolean {
  if (destinationParentId === folderId) return false;

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let currentId = destinationParentId;
  const seen = new Set<string>();
  while (currentId) {
    if (currentId === folderId) return false;
    if (seen.has(currentId)) return false;
    seen.add(currentId);
    currentId = byId.get(currentId)?.parentFolderId ?? null;
  }

  const destinationDepth = destinationParentId
    ? getDiceFormulaFolderDepth(destinationParentId, folders)
    : 0;
  const subtreeHeight = getDiceFormulaFolderSubtreeHeight(folderId, folders);
  return destinationDepth + subtreeHeight <= MAX_DICE_FORMULA_FOLDER_DEPTH;
}

function normalizeLevel(
  formulas: SavedDiceFormula[],
  folders: DiceFormulaFolder[],
  parentId: string | null,
): void {
  getDiceLibraryNodes(formulas, folders, parentId).forEach((node, index) => {
    if (node.kind === 'formula') {
      const formula = formulas.find((item) => item.id === node.id);
      if (formula) formula.sortOrder = index;
    } else {
      const folder = folders.find((item) => item.id === node.id);
      if (folder) folder.sortOrder = index;
    }
  });
}

export function applyDiceLibraryMove(
  formulas: SavedDiceFormula[],
  folders: DiceFormulaFolder[],
  nodeType: DiceLibraryNodeType,
  nodeId: string,
  destinationParentId: string | null,
  destinationIndex: number,
): { formulas: SavedDiceFormula[]; folders: DiceFormulaFolder[] } {
  const nextFormulas = formulas.map((formula) => ({ ...formula }));
  const nextFolders = folders.map((folder) => ({ ...folder }));

  const sourceParentId = nodeType === 'formula'
    ? nextFormulas.find((formula) => formula.id === nodeId)?.folderId
    : nextFolders.find((folder) => folder.id === nodeId)?.parentFolderId;

  if (sourceParentId === undefined) return { formulas: nextFormulas, folders: nextFolders };

  if (nodeType === 'formula') {
    const formula = nextFormulas.find((item) => item.id === nodeId);
    if (!formula) return { formulas: nextFormulas, folders: nextFolders };
    formula.folderId = destinationParentId;
    formula.sortOrder = Number.MAX_SAFE_INTEGER;
  } else {
    const folder = nextFolders.find((item) => item.id === nodeId);
    if (!folder) return { formulas: nextFormulas, folders: nextFolders };
    folder.parentFolderId = destinationParentId;
    folder.sortOrder = Number.MAX_SAFE_INTEGER;
  }

  if (sourceParentId !== destinationParentId) {
    normalizeLevel(nextFormulas, nextFolders, sourceParentId);
  }

  const destinationNodes = getDiceLibraryNodes(nextFormulas, nextFolders, destinationParentId)
    .filter((node) => !(node.kind === nodeType && node.id === nodeId));
  const insertAt = Math.max(0, Math.min(destinationIndex, destinationNodes.length));
  const moved = nodeType === 'formula'
    ? nextFormulas.find((formula) => formula.id === nodeId)
    : nextFolders.find((folder) => folder.id === nodeId);

  if (!moved) return { formulas: nextFormulas, folders: nextFolders };

  destinationNodes.splice(insertAt, 0, nodeType === 'formula'
    ? {
        kind: 'formula',
        id: moved.id,
        parentId: destinationParentId,
        sortOrder: insertAt,
        formula: moved as SavedDiceFormula,
      }
    : {
        kind: 'folder',
        id: moved.id,
        parentId: destinationParentId,
        sortOrder: insertAt,
        folder: moved as DiceFormulaFolder,
      });

  destinationNodes.forEach((node, index) => {
    if (node.kind === 'formula') {
      const formula = nextFormulas.find((item) => item.id === node.id);
      if (formula) formula.sortOrder = index;
    } else {
      const folder = nextFolders.find((item) => item.id === node.id);
      if (folder) folder.sortOrder = index;
    }
  });

  return { formulas: nextFormulas, folders: nextFolders };
}

export function getDiceFormulaFolderDirectContentCount(
  folderId: string,
  formulas: SavedDiceFormula[],
  folders: DiceFormulaFolder[],
): number {
  return formulas.filter((formula) => formula.folderId === folderId).length
    + folders.filter((folder) => folder.parentFolderId === folderId).length;
}
