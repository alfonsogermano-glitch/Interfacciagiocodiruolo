import type { JSONContent } from '@tiptap/core';

const STRUCTURAL = new Set(['textBox', 'collapseBlock', 'table']);
const ORDINARY_BLOCKS = new Set([
  'paragraph', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'horizontalRule', 'image',
]);

interface LegacyContext {
  structuralDepth: number;
  insideTable: boolean;
  destination: 'doc' | 'container' | 'tableCell';
}

function summaryAsParagraph(summary: JSONContent | undefined): JSONContent[] {
  if (!summary) return [];
  const content = summary.content ?? [];
  return content.length ? [{ type: 'paragraph', content }] : [];
}

function sanitizeOrdinary(node: JSONContent): JSONContent {
  // Ordinary blocks were already valid in the previous Note schema. Keep
  // their internal TipTap structure/marks intact so migration never strips
  // formatting merely because a surrounding structural wrapper was stale.
  return node;
}

function sanitizeNode(node: JSONContent, context: LegacyContext): JSONContent[] {
  const type = node.type ?? '';

  if (ORDINARY_BLOCKS.has(type)) return [sanitizeOrdinary(node)];

  if (type === 'collapseSummary') return summaryAsParagraph(node);

  if (type === 'textBox') {
    if (context.structuralDepth >= 2) {
      return (node.content ?? []).flatMap((child) => sanitizeNode(child, context));
    }
    const next: LegacyContext = { ...context, structuralDepth: context.structuralDepth + 1, destination: 'container' };
    const content = (node.content ?? []).flatMap((child) => sanitizeNode(child, next));
    return [{ ...node, content: content.length ? content : [{ type: 'paragraph' }] }];
  }

  if (type === 'collapseBlock') {
    const summary = (node.content ?? []).find((child) => child.type === 'collapseSummary');
    const body = (node.content ?? []).find((child) => child.type === 'collapseBody');
    if (context.structuralDepth >= 2) {
      return [
        ...summaryAsParagraph(summary),
        ...(body?.content ?? []).flatMap((child) => sanitizeNode(child, context)),
      ];
    }
    const next: LegacyContext = { ...context, structuralDepth: context.structuralDepth + 1, destination: 'container' };
    const bodyContent = (body?.content ?? []).flatMap((child) => sanitizeNode(child, next));
    return [{
      ...node,
      content: [
        summary ? { ...summary, content: summary.content ?? [] } : { type: 'collapseSummary', content: [] },
        { type: 'collapseBody', content: bodyContent.length ? bodyContent : [{ type: 'paragraph' }] },
      ],
    }];
  }

  if (type === 'table') {
    // Table-in-Table and structural depth >2 are malformed persisted legacy
    // states. Unwrap only the invalid table scaffolding and salvage readable
    // descendants at the nearest legal level.
    if (context.insideTable || context.structuralDepth >= 2) {
      return (node.content ?? []).flatMap((row) =>
        (row.content ?? []).flatMap((cell) =>
          (cell.content ?? []).flatMap((child) => sanitizeNode(child, context)),
        ),
      );
    }
    const nextDepth = context.structuralDepth + 1;
    const rows = (node.content ?? []).map((row) => ({
      ...row,
      content: (row.content ?? []).map((cell) => ({
        ...cell,
        content: (() => {
          const next: LegacyContext = { structuralDepth: nextDepth, insideTable: true, destination: 'tableCell' };
          const content = (cell.content ?? []).flatMap((child) => sanitizeNode(child, next));
          return content.length ? content : [{ type: 'paragraph' }];
        })(),
      })),
    }));
    return [{ ...node, content: rows }];
  }

  if (type === 'collapseBody' || type === 'tableRow' || type === 'tableCell' || type === 'tableHeader' || type === 'row') {
    return (node.content ?? []).flatMap((child) => sanitizeNode(child, context));
  }

  // Unknown legacy layout wrapper: keep readable block descendants rather
  // than allowing TipTap to replace the complete Note with an empty doc.
  return (node.content ?? []).flatMap((child) => sanitizeNode(child, context));
}

export function flattenRemovedLayoutNodes(doc: JSONContent): JSONContent {
  const context: LegacyContext = { structuralDepth: 0, insideTable: false, destination: 'doc' };
  return {
    ...doc,
    type: 'doc',
    content: (doc.content ?? []).flatMap((child) => sanitizeNode(child, context)),
  };
}

export function isLegacyStructuralType(typeName: string): boolean {
  return STRUCTURAL.has(typeName);
}
