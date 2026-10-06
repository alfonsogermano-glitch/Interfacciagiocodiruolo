import { withLocalContent, localRow, type ContentRow, type ContentTables } from './localContentStore';

const active = (rows: ContentRow[]) => rows.filter((row) => !row.deleted_at);
const noteTypes = new Set(['campaign', 'note']);
const trashFolderTypes = new Set(['gmnotes', 'campaignnotes']);
const camelToSnake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const snakePatch = (value: ContentRow) => Object.fromEntries(Object.entries(value).map(([key, item]) => [camelToSnake(key), item]));

function descendants(folders: ContentRow[], id: string): Set<string> {
  const ids = new Set([id]); let size = 0;
  while (size !== ids.size) { size = ids.size; folders.filter((row) => ids.has(row.parent_folder_id)).forEach((row) => ids.add(row.id)); }
  return ids;
}
function requireRow(rows: ContentRow[], id: string): ContentRow {
  const row = rows.find((item) => item.id === id);
  if (!row) throw new Error('Elemento non trovato nell’archivio locale');
  return row;
}
function counts(tables: ContentTables, campaignId: string) {
  return Object.fromEntries(['characters', 'npcs', 'monsters'].map((table) => [table, active(tables[table] ?? []).filter((row) => row.campaign_id === campaignId).length]));
}

export async function localCampaignApi(request: Request, owner: string): Promise<Response> {
  const url = new URL(request.url); const path = url.pathname.split('/make-server-771c5bfd/')[1];
  const [resource, id, operation, childId] = path.split('/');
  const method = request.method;
  const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await request.json().catch(() => ({})) : {};
  const campaignId = id === 'unassigned' || id === 'null' ? null : id;
  try {
    const result = await withLocalContent(owner, method !== 'GET', (tables) => {
      const campaigns = tables.campaigns ??= [];
      const notes = tables.entity_notes ??= [];
      const folders = tables.folders ??= [];
      const characters = tables.characters ??= [];
      const now = new Date().toISOString();
      if (resource === 'campaigns') {
        if (id === 'joined') return { campaigns: [] };
        if (id === 'overview') return { campaigns: active(campaigns).map((row) => ({ ...row, ...counts(tables, row.id), memberCount: 0 })) };
        if (id === 'join' || id === 'invite-preview' || operation === 'invite-code' || operation === 'invite-by-name' || operation === 'remove-player') {
          throw new Error('Inviti e partecipazione di altri utenti richiedono una campagna Cloud');
        }
        if (!id && method === 'GET') return { campaigns: active(campaigns) };
        if (!id && method === 'POST') {
          if (!body.name?.trim()) throw new Error('Il nome della campagna è obbligatorio');
          const campaign = { ...body, id: body.id ?? crypto.randomUUID(), name: body.name.trim(), ownerId: owner, owner_profile_id: owner, ruleset: body.ruleset ?? 'hsc', description: body.description ?? '', inviteCode: '', createdAt: now, updatedAt: now, deleted_at: null };
          campaigns.push(campaign); return { campaign };
        }
        if (operation === 'notes') {
          if (method === 'GET') return { notes: active(notes).filter((row) => row.campaign_id === campaignId && row.entity_type === url.searchParams.get('entityType') && row.entity_id === url.searchParams.get('entityId')).sort((a, b) => a.position - b.position) };
          if (method === 'POST') {
            if (!body.entityType || !body.entityId || !body.tabName) throw new Error('Campi nota obbligatori mancanti');
            const note = localRow('entity_notes', { campaign_id: campaignId, entity_type: body.entityType, entity_id: body.entityId, tab_name: body.tabName, owner_profile_id: owner, position: active(notes).filter((row) => row.entity_type === body.entityType && row.entity_id === body.entityId).length, hidden: body.hidden ?? false, folder_id: body.folderId ?? null, visibility: body.visibility ?? 'all' });
            notes.push(note); return { note };
          }
        }
        if (operation === 'folders') {
          if (method === 'GET') return { folders: active(folders).filter((row) => row.campaign_id === campaignId && row.entity_type === url.searchParams.get('entityType')).sort((a, b) => a.position - b.position) };
          if (method === 'POST') {
            const folder = localRow('folders', { campaign_id: campaignId, entity_type: body.entityType, name: body.name, parent_folder_id: body.parentFolderId ?? null, position: folders.length });
            if (folder.parent_folder_id) requireRow(folders, folder.parent_folder_id);
            folders.push(folder); return { folder };
          }
        }
        if (operation === 'trash') {
          const trashedNotes = notes.filter((row) => row.campaign_id === campaignId && row.deleted_at && noteTypes.has(row.entity_type));
          const trashedFolders = folders.filter((row) => row.campaign_id === campaignId && row.deleted_at && trashFolderTypes.has(row.entity_type));
          if (method === 'GET') return { notes: trashedNotes, folders: trashedFolders };
          if (childId === 'restore-all') [...trashedNotes, ...trashedFolders].forEach((row) => { row.deleted_at = null; });
          else if (childId === 'empty') {
            tables.entity_notes = notes.filter((row) => !trashedNotes.includes(row));
            tables.folders = folders.filter((row) => !trashedFolders.includes(row));
          } else throw new Error('Operazione cestino non supportata');
          return { success: true };
        }
        if (operation === 'characters' || operation === 'available-characters') {
          if (method === 'GET') return { characters: active(characters).filter((row) => row.campaign_id === campaignId && (operation !== 'available-characters' || row.available_for_players)).map((row) => ({ ...row, owner_display_name: row.owner_display_name ?? 'Utente locale' })) };
          if (method === 'PUT' && childId) {
            const row = requireRow(characters, childId);
            if (row.campaign_id !== campaignId) throw new Error('Campagna del personaggio non valida');
            const patch = body.character ?? body;
            Object.assign(row, snakePatch(patch), { sheet_data: { ...row.sheet_data, ...patch }, updated_at: now });
            return { character: row };
          }
        }
        if (operation === 'member-names') return { members: [], names: {} };
        if (operation === 'members') return { members: [] };
        if (operation === 'entity-counts') return counts(tables, id);
        const campaign = requireRow(active(campaigns), id);
        if (operation === 'session') { campaign.sessionActive = !!body.active; campaign.sessionActivatedAt = now; return { campaign }; }
        if (operation === 'open') { campaign.lastOpenedAt = now; return { campaign }; }
        if (method === 'PUT') {
          if (body.ruleset && body.ruleset !== campaign.ruleset && Object.values(counts(tables, id)).some((count) => count > 0)) throw new Error('Non puoi cambiare regole di una campagna contenente schede');
          Object.assign(campaign, body, { id, ownerId: owner, updatedAt: now }); return { campaign };
        }
        if (method === 'DELETE') { campaign.deleted_at = now; return { success: true }; }
      }
      if (resource === 'notes') {
        const note = requireRow(notes, id);
        if (operation === 'restore') { note.deleted_at = null; if (note.folder_id && folders.find((row) => row.id === note.folder_id)?.deleted_at) note.folder_id = null; notes.filter((row) => row.entity_type === 'note' && row.entity_id === id).forEach((row) => { row.deleted_at = null; }); return { success: true }; }
        if (method === 'PUT') {
          if (body.hidden !== undefined && body.hidden !== note.hidden && body.folderId === undefined) note.folder_id = null;
          Object.assign(note, snakePatch(body), { updated_at: now }); return { note };
        }
        if (method === 'DELETE') {
          const children = notes.filter((row) => row.entity_type === 'note' && row.entity_id === id);
          if (operation !== 'purge' && noteTypes.has(note.entity_type)) [note, ...children].forEach((row) => { row.deleted_at = now; });
          else tables.entity_notes = notes.filter((row) => row !== note && !children.includes(row));
          return { success: true };
        }
      }
      if (resource === 'folders') {
        const folder = requireRow(folders, id);
        if (operation === 'restore') { folder.deleted_at = null; if (folder.parent_folder_id && folders.find((row) => row.id === folder.parent_folder_id)?.deleted_at) folder.parent_folder_id = null; return { success: true }; }
        if (method === 'PUT') {
          if (body.parentFolderId) {
            const parent = requireRow(folders, body.parentFolderId);
            if (parent.campaign_id !== folder.campaign_id || parent.entity_type !== folder.entity_type || descendants(folders, id).has(parent.id)) throw new Error('Spostamento cartella non valido');
          }
          Object.assign(folder, snakePatch(body), { updated_at: now }); return { folder };
        }
        if (method === 'DELETE') {
          const cascade = operation === 'cascade' || operation === 'purge';
          const ids = cascade ? descendants(folders, id) : new Set([id]);
          if (operation !== 'purge' && trashFolderTypes.has(folder.entity_type)) {
            folders.filter((row) => ids.has(row.id)).forEach((row) => { row.deleted_at = now; });
            if (cascade) notes.filter((row) => ids.has(row.folder_id)).forEach((row) => { row.deleted_at = now; notes.filter((child) => child.entity_id === row.id).forEach((child) => { child.deleted_at = now; }); });
            else notes.filter((row) => row.folder_id === id).forEach((row) => { row.folder_id = null; });
          } else {
            tables.folders = folders.filter((row) => !ids.has(row.id));
            for (const table of ['entity_notes', 'characters', 'npcs', 'monsters']) {
              const rows = tables[table] ?? [];
              if (cascade) tables[table] = rows.filter((row) => !ids.has(row.folder_id));
              else rows.filter((row) => row.folder_id === id).forEach((row) => { row.folder_id = null; });
            }
          }
          if (!cascade) folders.filter((row) => row.parent_folder_id === id).forEach((row) => { row.parent_folder_id = folder.parent_folder_id; });
          return { success: true };
        }
      }
      if (resource === 'characters') {
        const row = requireRow(characters, id);
        if (method === 'DELETE') {
          tables.characters = characters.filter((item) => item.id !== id);
          const childIds = new Set(notes.filter((note) => note.entity_type === 'character' && note.entity_id === id).map((note) => note.id));
          tables.entity_notes = notes.filter((note) => !childIds.has(note.id) && !childIds.has(note.entity_id));
          return { success: true };
        }
        if (operation === 'assign-campaign') { row.campaign_id = body.campaignId ?? null; row.folder_id = null; return { character: row }; }
        if (operation === 'availability') { row.available_for_players = !!body.available; return { character: row }; }
        if (operation === 'folder') { row.folder_id = body.folderId ?? null; return { success: true }; }
        if (operation === 'copy-to-campaign') {
          const copy = localRow('characters', { ...row, id: crypto.randomUUID(), campaign_id: body.campaignId, owner_profile_id: owner, folder_id: null });
          characters.push(copy); return { character: copy };
        }
        if (operation === 'claim' || operation === 'release') throw new Error('Richieste fra utenti disponibili solo in Cloud');
      }
      throw new Error(`Percorso non disponibile in modalità Locale: ${path}`);
    });
    return Response.json(result);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Errore archivio locale' }, { status: 400 }); }
}
