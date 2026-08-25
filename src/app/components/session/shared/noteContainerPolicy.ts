import type { Node as PMNode, ResolvedPos, Slice } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';

export type NoteStructuralContainer = 'textBox' | 'collapseBlock' | 'table';
export type NoteContainerRejection = 'max-depth' | 'table-in-table' | 'table-clipboard-in-table' | 'collapse-summary';
export type NoteContainerDecision = { allowed: true } | { allowed: false; reason: NoteContainerRejection };

const STRUCTURAL_TYPES = new Set<NoteStructuralContainer>(['textBox', 'collapseBlock', 'table']);

function isStructuralType(typeName: string): typeName is NoteStructuralContainer {
  return STRUCTURAL_TYPES.has(typeName as NoteStructuralContainer);
}

export function getStructuralDepth($pos: ResolvedPos): number {
  let depth = 0;
  for (let index = 0; index <= $pos.depth; index += 1) {
    if (isStructuralType($pos.node(index).type.name)) depth += 1;
  }
  return depth;
}

export function isInsideNoteTable($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'table') return true;
  }
  return false;
}

export function validateTableClipboardTarget($target: ResolvedPos, isTableClipboard: boolean): NoteContainerDecision {
  if (isTableClipboard && isInsideNoteTable($target)) {
    return { allowed: false, reason: 'table-clipboard-in-table' };
  }
  return { allowed: true };
}

export function isInsideCollapseSummary($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'collapseSummary') return true;
  }
  return false;
}

export function canInsertNoteContainer($pos: ResolvedPos, type: NoteStructuralContainer): NoteContainerDecision {
  if (isInsideCollapseSummary($pos)) return { allowed: false, reason: 'collapse-summary' };
  if (type === 'table' && isInsideNoteTable($pos)) return { allowed: false, reason: 'table-in-table' };
  if (getStructuralDepth($pos) >= 2) return { allowed: false, reason: 'max-depth' };
  return { allowed: true };
}

export function analyzeStructuralSubtree(node: PMNode): {
  maxRelativeDepth: number;
  containsTable: boolean;
  containsNestedTable: boolean;
} {
  let maxRelativeDepth = 0;
  let containsTable = false;
  let containsNestedTable = false;

  const visit = (current: PMNode, structuralDepth: number, tableDepth: number) => {
    const typeName = current.type.name;
    const structural = isStructuralType(typeName);
    const nextStructuralDepth = structural ? structuralDepth + 1 : structuralDepth;
    const isTable = typeName === 'table';

    if (structural) maxRelativeDepth = Math.max(maxRelativeDepth, nextStructuralDepth);
    if (isTable) {
      containsTable = true;
      if (tableDepth > 0) containsNestedTable = true;
    }

    const nextTableDepth = isTable ? tableDepth + 1 : tableDepth;
    current.forEach((child) => visit(child, nextStructuralDepth, nextTableDepth));
  };

  visit(node, 0, 0);
  return { maxRelativeDepth, containsTable, containsNestedTable };
}

export function canInsertStructuralSubtree($target: ResolvedPos, node: PMNode): NoteContainerDecision {
  if (isInsideCollapseSummary($target)) return { allowed: false, reason: 'collapse-summary' };
  const analysis = analyzeStructuralSubtree(node);
  if (analysis.containsNestedTable || (analysis.containsTable && isInsideNoteTable($target))) {
    return { allowed: false, reason: 'table-in-table' };
  }
  if (getStructuralDepth($target) + analysis.maxRelativeDepth > 2) {
    return { allowed: false, reason: 'max-depth' };
  }
  return { allowed: true };
}


/**
 * Validate the exact document ProseMirror would produce for the current
 * selection and Slice. Open Slice wrappers are context only, so inspecting the
 * raw Slice tree can mistake a partial selection inside TextBox/Collapse for
 * copying the structural container itself.
 */
export function validateStructuralReplacement(state: EditorState, slice: Slice): NoteContainerDecision {
  return validateNoteContainerDocument(state.tr.replaceSelection(slice).doc);
}

export function validateNoteContainerDocument(doc: PMNode): NoteContainerDecision {
  const analysis = analyzeStructuralSubtree(doc);
  if (analysis.containsNestedTable) return { allowed: false, reason: 'table-in-table' };
  if (analysis.maxRelativeDepth > 2) return { allowed: false, reason: 'max-depth' };

  let collapseSummaryViolation = false;
  const visit = (node: PMNode, insideSummary: boolean) => {
    if (collapseSummaryViolation) return;
    const nextInsideSummary = insideSummary || node.type.name === 'collapseSummary';
    if (insideSummary && isStructuralType(node.type.name)) {
      collapseSummaryViolation = true;
      return;
    }
    node.forEach((child) => visit(child, nextInsideSummary));
  };
  visit(doc, false);
  return collapseSummaryViolation ? { allowed: false, reason: 'collapse-summary' } : { allowed: true };
}
