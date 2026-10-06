import { withLocalContent, localRow, type ContentRow, type ContentTables } from './localContentStore';

function splitTopLevel(value: string): string[] {
  const values: string[] = []; let depth = 0; let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) { values.push(value.slice(start, i)); start = i + 1; }
  }
  values.push(value.slice(start)); return values;
}
function matches(value: any, expression: string): boolean {
  const dot = expression.indexOf('.'); const op = expression.slice(0, dot); const target = expression.slice(dot + 1);
  if (op === 'not') return !matches(value, target);
  if (op === 'eq') return String(value) === target;
  if (op === 'neq') return String(value) !== target;
  if (op === 'is') return target === 'null' ? value == null : String(value) === target;
  if (op === 'in') return splitTopLevel(target.slice(1, -1)).map((v) => v.replace(/^"|"$/g, '')).includes(String(value));
  if (op === 'gt') return value > target;
  if (op === 'gte') return value >= target;
  if (op === 'lt') return value < target;
  if (op === 'lte') return value <= target;
  if (op === 'like' || op === 'ilike') {
    const regex = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${regex}$`, op === 'ilike' ? 'i' : '').test(String(value ?? ''));
  }
  if (op === 'cs') { const expected = JSON.parse(target); return Array.isArray(value) && expected.every((v: unknown) => value.includes(v)); }
  throw new Error(`Filtro locale non supportato: ${op}`);
}
function logical(row: ContentRow, group: string, and: boolean): boolean {
  const terms = splitTopLevel(group.replace(/^\(|\)$/g, ''));
  const test = (term: string): boolean => {
    if (term.startsWith('and(')) return logical(row, term.slice(3), true);
    if (term.startsWith('or(')) return logical(row, term.slice(2), false);
    const dot = term.indexOf('.'); return matches(row[term.slice(0, dot)], term.slice(dot + 1));
  };
  return and ? terms.every(test) : terms.some(test);
}
function filtered(row: ContentRow, params: URLSearchParams): boolean {
  return [...params].every(([key, value]) => {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) return true;
    if (key === 'or' || key === 'and') return logical(row, value, key === 'and');
    return matches(row[key], value);
  });
}
function project(row: ContentRow, selection: string | null): ContentRow {
  if (!selection || selection === '*') return row;
  if (selection.includes('(')) throw new Error('Join non disponibile per contenuti locali');
  return Object.fromEntries(selection.split(',').map((column) => [column, row[column]]));
}

export async function localRest(request: Request, owner: string): Promise<Response> {
  const url = new URL(request.url); const table = url.pathname.split('/rest/v1/')[1];
  const method = request.method; const params = url.searchParams;
  const input = ['POST', 'PATCH'].includes(method) ? await request.json() : null;
  try {
    const result = await withLocalContent(owner, !['GET', 'HEAD'].includes(method), (tables) => {
      const all = tables[table] ?? []; let rows = all.filter((row) => filtered(row, params));
      if (method === 'POST') {
        const conflict = (params.get('on_conflict') ?? 'id').split(',');
        const resolution = request.headers.get('prefer') ?? '';
        rows = [];
        for (const raw of Array.isArray(input) ? input : [input]) {
          const previous = all.find((row) => conflict.every((key) => raw[key] !== undefined && row[key] === raw[key]));
          if (previous && resolution.includes('ignore-duplicates')) continue;
          if (previous && !resolution.includes('merge-duplicates')) throw new Error('Elemento già esistente');
          const row = previous ? Object.assign(previous, raw) : localRow(table, raw);
          if (!previous) all.push(row);
          rows.push(row);
        }
        tables[table] = all;
      } else if (method === 'PATCH') {
        rows.forEach((row) => Object.assign(row, input));
      } else if (method === 'DELETE') {
        tables[table] = all.filter((row) => !rows.includes(row));
      } else if (method !== 'GET' && method !== 'HEAD') throw new Error(`Metodo locale non supportato: ${method}`);
      const count = rows.length;
      const orders = splitTopLevel(params.get('order') ?? '').filter(Boolean);
      rows.sort((a, b) => {
        for (const order of orders) {
          const [field, direction] = order.split('.');
          if (a[field] === b[field]) continue;
          const comparison = a[field] == null ? -1 : b[field] == null ? 1 : a[field] < b[field] ? -1 : 1;
          return direction === 'desc' ? -comparison : comparison;
        }
        return 0;
      });
      const offset = Number(params.get('offset') ?? 0); const limit = Number(params.get('limit') ?? rows.length);
      return { rows: rows.slice(offset, offset + limit).map((row) => project(row, params.get('select'))), count };
    });
    const singular = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
    if (singular && result.rows.length !== 1) return Response.json({ code: 'PGRST116', details: `The result contains ${result.rows.length} rows`, message: 'Expected a single row' }, { status: 406 });
    const headers = { 'content-range': `0-${Math.max(0, result.rows.length - 1)}/${result.count}` };
    return method === 'HEAD' ? new Response(null, { headers }) : Response.json(singular ? result.rows[0] : result.rows, { headers });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : 'Errore archivio locale', code: 'LOCAL_STORAGE_ERROR' }, { status: 400 });
  }
}

export async function localContentRpc(name: string, args: ContentRow, owner: string): Promise<Response> {
  try {
    const data = await withLocalContent(owner, true, (tables: ContentTables) => {
      const folders = tables.dice_formula_folders ??= [];
      const formulas = tables.dice_formulas ??= [];
      if (name === 'create_dice_formula_folder') {
        const folder = localRow('dice_formula_folders', { campaign_id: args.p_campaign_id, owner_profile_id: args.p_owner_profile_id, parent_folder_id: args.p_parent_folder_id, name: args.p_name, icon_name: args.p_icon_name });
        folders.push(folder); return folder;
      }
      if (name === 'move_dice_library_node') {
        const folderNode = args.p_node_type === 'folder';
        const collection = folderNode ? folders : args.p_node_type === 'custom-die' ? (tables.dice_custom_dice ??= []) : formulas;
        const node = collection.find((row) => row.id === args.p_node_id);
        if (!node) throw new Error('Elemento non trovato');
        const field = folderNode ? 'parent_folder_id' : 'folder_id';
        const destination = args.p_destination_folder_id;
        if (destination) {
          let parent = folders.find((row) => row.id === destination);
          if (!parent || parent.campaign_id !== node.campaign_id || parent.owner_profile_id !== node.owner_profile_id) throw new Error('Cartella non valida');
          while (parent) {
            if (parent.id === node.id) throw new Error('Spostamento circolare non consentito');
            parent = folders.find((row) => row.id === parent!.parent_folder_id);
          }
        }
        node[field] = destination;
        const siblings = [...folders.filter((row) => row.parent_folder_id === destination && row.id !== node.id), ...formulas.filter((row) => row.folder_id === destination && row.id !== node.id), ...(tables.dice_custom_dice ?? []).filter((row) => row.folder_id === destination && row.id !== node.id)]
          .filter((row) => row.campaign_id === node.campaign_id && row.owner_profile_id === node.owner_profile_id).sort((a, b) => a.sort_order - b.sort_order);
        siblings.splice(Math.max(0, args.p_destination_index), 0, node);
        siblings.forEach((row, index) => { row.sort_order = index; }); return null;
      }
      if (name === 'delete_dice_formula_folder') {
        const root = folders.find((row) => row.id === args.p_folder_id);
        if (!root) return null;
        if (!args.p_delete_contents) {
          folders.filter((row) => row.parent_folder_id === root.id).forEach((row) => { row.parent_folder_id = root.parent_folder_id; });
          formulas.filter((row) => row.folder_id === root.id).forEach((row) => { row.folder_id = root.parent_folder_id; });
          (tables.dice_custom_dice ?? []).filter((row) => row.folder_id === root.id).forEach((row) => { row.folder_id = root.parent_folder_id; });
          tables.dice_formula_folders = folders.filter((row) => row.id !== root.id);
        } else {
          const ids = new Set([root.id]); let count = 0;
          while (ids.size !== count) { count = ids.size; folders.filter((row) => ids.has(row.parent_folder_id)).forEach((row) => ids.add(row.id)); }
          tables.dice_formula_folders = folders.filter((row) => !ids.has(row.id));
          tables.dice_formulas = formulas.filter((row) => !ids.has(row.folder_id));
          tables.dice_custom_dice = (tables.dice_custom_dice ?? []).filter((row) => !ids.has(row.folder_id));
        }
        return null;
      }
      if (name === 'set_entity_note_title_icon') {
        const note = (tables.entity_notes ?? []).find((row) => row.id === args.p_note_id);
        if (!note) throw new Error('Nota non trovata');
        note.title_icon = args.p_title_icon; return null;
      }
      throw new Error(`Operazione locale non supportata: ${name}`);
    });
    return Response.json(data);
  } catch (error) { return Response.json({ message: String(error) }, { status: 400 }); }
}
