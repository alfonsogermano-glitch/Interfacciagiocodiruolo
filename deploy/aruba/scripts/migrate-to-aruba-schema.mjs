#!/usr/bin/env node
/** Lossless Supabase export -> definitive Aruba PostgreSQL migration. */
import pg from 'pg';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const EXPORT_PATH = process.env.SOURCE_EXPORT_PATH || './deploy/aruba/data/supabase-export.json';
const data = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8'));
const requiredEnv = name => {
  const value=process.env[name];
  if(!value)throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const CONFIG = {
  host: requiredEnv('PGHOST'),
  port: Number(requiredEnv('PGPORT')),
  database: requiredEnv('PGDATABASE'),
  user: requiredEnv('PGUSER'),
  password: requiredEnv('PGPASSWORD'),
};
const BINARY_ASSET_DIR = requiredEnv('BINARY_ASSET_DIR');
const binaryManifest = JSON.parse(fs.readFileSync(`${BINARY_ASSET_DIR}/manifest.json`,'utf8'));

const SOURCE_TABLES = [
  'profiles','campaigns','campaign_members','chapters','environments','scenes',
  'characters','npcs','monsters','clues','situations','chat_messages',
  'equipment_catalog','visual_assets','folders','dice_formulas','entity_notes',
];
const expectedTotal = SOURCE_TABLES.reduce((n, table) => n + (data[table]?.length || 0), 0);
const campaignById = new Map((data.campaigns || []).map(row => [row.id, row]));
const characterIds = new Set((data.characters || []).filter(row => row.campaign_id).map(row => row.id));
const noteIds = new Set((data.entity_notes || []).map(row => row.id));
const migrated = new Map();

function log(message) { console.log(`[MIGRATE] ${message}`); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return createHash('sha256').update(stableJson(value)).digest('hex'); }
function deterministicUuid(seed) {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function userUuid(value) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) return String(value).toLowerCase();
  return deterministicUuid(`hollowgate:legacy-user:${value}`);
}
function sourceId(table, row, ordinal) {
  if (row.id) return String(row.id);
  if (table === 'campaign_members') return `${row.campaign_id}:${row.profile_id}`;
  return deterministicUuid(`${table}:${ordinal}:${stableJson(row)}`);
}
function count(table) { migrated.set(table, (migrated.get(table) || 0) + 1); }
function mapRuleset(value) {
  const map = {'High School Cthulhu':'hsc','D&D 5e':'dnd5e','Pathfinder 2e':'pathfinder','Il Richiamo di Cthulhu 7ª ed.':'coc7e','Il Richiamo di Cthulhu Classic':'cocclassic','Regolamento personalizzato':'custom'};
  const normalized = map[value] || value;
  return ['hsc','dnd5e','pathfinder','coc7e','cocclassic','custom'].includes(normalized) ? normalized : 'custom';
}
function campaignOwner(campaignId) {
  const owner = campaignById.get(campaignId)?.owner_profile_id;
  if (!owner) throw new Error(`Campaign ${campaignId} has no source owner`);
  return owner;
}
function richContent(note) {
  if (note.content_rich && typeof note.content_rich === 'object') return note.content_rich;
  return { type:'doc', content: note.content ? [{type:'paragraph',content:[{type:'text',text:String(note.content)}]}] : [] };
}
function payload(row, additions = {}) { return {...row, ...additions}; }

async function archive(client, table, row, ordinal, targetTable, targetId, migrationNote = null) {
  const id = sourceId(table, row, ordinal);
  await client.query(`
    INSERT INTO hollowgate_vtt.migration_source_records
      (source_table,source_id,source_ordinal,source_payload,source_sha256,target_table,target_id,migration_note)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(source_table,source_id) DO UPDATE SET
      source_ordinal=EXCLUDED.source_ordinal,source_payload=EXCLUDED.source_payload,
      source_sha256=EXCLUDED.source_sha256,target_table=EXCLUDED.target_table,
      target_id=EXCLUDED.target_id,migration_note=EXCLUDED.migration_note,migrated_at=clock_timestamp()
  `, [table,id,ordinal,row,sha256(row),targetTable,String(targetId),migrationNote]);
  count(table);
}

async function migrateUsers(client) {
  for (const [i,row] of (data.profiles || []).entries()) {
    const email = String(row.email || `${row.id}@placeholder.local`).trim().toLowerCase();
    await client.query(`INSERT INTO hollowgate_auth.users
      (id,email,display_name,status,email_verified_at,source,source_created_at,created_at,updated_at)
      VALUES($1,$2,$3,'pending_reset',NULL,'supabase',$4,$4,$5)
      ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,
      source='supabase',source_created_at=EXCLUDED.source_created_at,updated_at=EXCLUDED.updated_at`,
      [userUuid(row.id),email,row.display_name || row.id,row.created_at || new Date(0),row.updated_at || row.created_at || new Date(0)]);
    await archive(client,'profiles',row,i,'hollowgate_auth.users',userUuid(row.id));
  }
}

async function ensureReferencedUsers(client) {
  const referenced = new Set();
  for (const row of data.campaigns || []) if (row.owner_profile_id) referenced.add(row.owner_profile_id);
  for (const row of data.campaign_members || []) if (row.profile_id) referenced.add(row.profile_id);
  for (const row of data.characters || []) if (row.owner_profile_id) referenced.add(row.owner_profile_id);
  for (const row of data.chat_messages || []) if (row.sender_id) referenced.add(row.sender_id);
  for (const row of data.entity_notes || []) if (row.owner_profile_id) referenced.add(row.owner_profile_id);
  const exported = new Set((data.profiles || []).map(row => row.id));
  for (const id of referenced) {
    if (exported.has(id)) continue;
    await client.query(`INSERT INTO hollowgate_auth.users
      (id,email,display_name,status,email_verified_at,source,source_created_at)
      VALUES($1,$2,$3,'pending_reset',NULL,'supabase',NULL)
      ON CONFLICT(id) DO NOTHING`,[userUuid(id),`recovered+${userUuid(id)}@placeholder.invalid`,`Utente recuperato ${String(id).slice(0,8)}`]);
    log(`Created locked recovery user for referenced profile ${id}`);
  }
}

async function migrateCampaigns(client) {
  for (const [i,row] of (data.campaigns || []).entries()) {
    if (!row.owner_profile_id) throw new Error(`Campaign ${row.id} has no owner_profile_id`);
    await client.query(`INSERT INTO hollowgate_vtt.campaigns
      (id,owner_id,name,description,ruleset,created_at,updated_at,last_opened_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(id) DO UPDATE SET owner_id=EXCLUDED.owner_id,name=EXCLUDED.name,
      description=EXCLUDED.description,ruleset=EXCLUDED.ruleset,updated_at=EXCLUDED.updated_at,last_opened_at=EXCLUDED.last_opened_at`,
      [row.id,userUuid(row.owner_profile_id),row.name || 'Campagna senza nome',row.description || '',mapRuleset(row.ruleset),row.created_at,row.updated_at,row.last_opened_at]);
    await archive(client,'campaigns',row,i,'hollowgate_vtt.campaigns',row.id);
  }
}

async function migrateMembers(client) {
  for (const [i,row] of (data.campaign_members || []).entries()) {
    if (!row.campaign_id || !row.profile_id) throw new Error(`Invalid campaign_members row ${i}`);
    const role = row.role === 'gm' ? 'gm' : 'player';
    await client.query(`INSERT INTO hollowgate_vtt.campaign_members(campaign_id,user_id,member_role,status,created_at)
      VALUES($1,$2,$3,'active',$4) ON CONFLICT(campaign_id,user_id) DO UPDATE SET member_role=EXCLUDED.member_role,status='active'`,
      [row.campaign_id,userUuid(row.profile_id),role,row.joined_at]);
    await archive(client,'campaign_members',row,i,'hollowgate_vtt.campaign_members',`${row.campaign_id}:${row.profile_id}`);
  }
}

async function ensureRecoveryCampaign(client, row) {
  const ownerId = userUuid(row.owner_profile_id);
  const id = deterministicUuid(`hollowgate:recovered-unassigned-content:${ownerId}`);
  await client.query(`INSERT INTO hollowgate_vtt.campaigns(id,owner_id,name,description,ruleset,created_at,updated_at)
    VALUES($1,$2,'[Recupero] Contenuti non assegnati','Campagna tecnica creata dalla migrazione per preservare contenuti originariamente senza campaign_id.','custom',$3,$3)
    ON CONFLICT(id) DO NOTHING`, [id,ownerId,row.created_at || new Date(0)]);
  return id;
}

async function migrateCharacters(client) {
  for (const [i,row] of (data.characters || []).entries()) {
    if (!row.owner_profile_id) throw new Error(`Character ${row.id} has no owner_profile_id`);
    const campaignId = row.campaign_id || await ensureRecoveryCampaign(client,row);
    // Aruba keeps physical character ownership with the campaign GM. Original
    // player ownership remains losslessly available in sourceRecord and is
    // represented at runtime through assignments/claims, never forged owner_id.
    const physicalOwnerId = row.campaign_id ? userUuid(campaignOwner(row.campaign_id)) : userUuid(row.owner_profile_id);
    const sheet = payload(row.sheet_data || {}, {sourceRecord:row,sourceCampaignId:row.campaign_id});
    const status = ['draft','active','archived'].includes(row.status) ? row.status : 'draft';
    await client.query(`INSERT INTO hollowgate_vtt.character_drafts(id,campaign_id,owner_id,name,status,sheet_data,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET campaign_id=EXCLUDED.campaign_id,
      owner_id=EXCLUDED.owner_id,name=EXCLUDED.name,status=EXCLUDED.status,sheet_data=EXCLUDED.sheet_data,updated_at=EXCLUDED.updated_at`,
      [row.id,campaignId,physicalOwnerId,row.name || 'Personaggio senza nome',status,sheet,row.created_at,row.updated_at]);
    characterIds.add(row.id);
    const migrationNote = !row.campaign_id ? `Recovered in generated campaign ${campaignId}` :
      (physicalOwnerId !== userUuid(row.owner_profile_id) ? `Physical owner normalized to campaign GM ${physicalOwnerId}; original owner retained in source payload` : null);
    await archive(client,'characters',row,i,'hollowgate_vtt.character_drafts',row.id,migrationNote);
  }
}

async function migrateDocuments(client, sourceTable, targetTable, rows, extra = row => ({})) {
  for (const [i,row] of rows.entries()) {
    if (!row.id || !row.campaign_id) throw new Error(`Invalid ${sourceTable} row ${i}`);
    const doc = payload(row, extra(row));
    await client.query(`INSERT INTO hollowgate_vtt.${targetTable}(id,campaign_id,payload) VALUES($1,$2,$3)
      ON CONFLICT(id,campaign_id) DO UPDATE SET payload=EXCLUDED.payload`, [row.id,row.campaign_id,doc]);
    await archive(client,sourceTable,row,i,`hollowgate_vtt.${targetTable}`,row.id);
  }
}

async function migrateChapters(client) {
  await migrateDocuments(client,'chapters','chapter_documents',data.chapters || [], row => ({
    campaignId:row.campaign_id,isActive:row.is_active,nextChapterIds:row.next_chapter_ids,
    mapUrl:row.map_url,mapMetadata:row.map_metadata,locationMetadata:row.location_metadata,sourceEnvironment:row.source_environment,
  }));
}
async function migrateScenes(client) {
  for (const [i,row] of (data.scenes || []).entries()) {
    if (!row.id || !row.campaign_id || !row.chapter_id) throw new Error(`Invalid scenes row ${i}`);
    const doc = payload(row,{campaignId:row.campaign_id,chapterId:row.chapter_id,environmentId:row.environment_id,
      imageUrl:row.image_url,sortOrder:row.sort_order,nextSceneIds:row.next_scene_ids,mapRegions:row.map_regions,contextMetadata:row.context_metadata});
    await client.query(`INSERT INTO hollowgate_vtt.scene_documents(id,campaign_id,chapter_id,payload) VALUES($1,$2,$3,$4)
      ON CONFLICT(id,campaign_id) DO UPDATE SET chapter_id=EXCLUDED.chapter_id,payload=EXCLUDED.payload`,[row.id,row.campaign_id,row.chapter_id,doc]);
    await archive(client,'scenes',row,i,'hollowgate_vtt.scene_documents',row.id);
  }
}
async function migrateNarrative(client) {
  const groups = [['npcs','npcs'],['monsters','monsters'],['clues','clues'],['situations','events']];
  for (const [sourceTable,kind] of groups) for (const [i,row] of (data[sourceTable] || []).entries()) {
    if (!row.campaign_id && !row.owner_profile_id) throw new Error(`${sourceTable} ${row.id} has neither campaign nor owner`);
    const campaignId = row.campaign_id || await ensureRecoveryCampaign(client,row);
    const doc = payload(row,{campaignId,sourceCampaignId:row.campaign_id,chapterId:row.chapter_id || null,sceneId:row.scene_id || null,
      environmentId:row.environment_id || null,title:row.title || row.name || 'Senza titolo'});
    await client.query(`INSERT INTO hollowgate_vtt.narrative_content_documents(id,campaign_id,kind,payload) VALUES($1,$2,$3,$4)
      ON CONFLICT(id,campaign_id,kind) DO UPDATE SET payload=EXCLUDED.payload`,[row.id,campaignId,kind,doc]);
    await archive(client,sourceTable,row,i,'hollowgate_vtt.narrative_content_documents',row.id,row.campaign_id ? null : `Recovered in generated campaign ${campaignId}`);
  }
}
async function ensureReferencedEntities(client) {
  for (const row of data.entity_notes || []) {
    if (row.entity_type === 'character' && !characterIds.has(row.entity_id)) {
      const owner = userUuid(row.owner_profile_id || campaignOwner(row.campaign_id));
      await client.query(`INSERT INTO hollowgate_vtt.character_drafts
        (id,campaign_id,owner_id,name,status,sheet_data,created_at,updated_at)
        VALUES($1,$2,$3,$4,'active',$5,$6,$6) ON CONFLICT(id) DO NOTHING`,[
        row.entity_id,row.campaign_id,owner,`[Recupero] Personaggio ${row.entity_id.slice(0,8)}`,
        {recoveredPlaceholder:true,reason:'Referenced by an exported entity note; source character absent'},row.created_at,
      ]);
      characterIds.add(row.entity_id);
      log(`Created recovery character ${row.entity_id} for note ${row.id}`);
    }
    if (['npc','monster'].includes(row.entity_type)) {
      const kind = row.entity_type === 'npc' ? 'npcs' : 'monsters';
      const found = (data[kind] || []).some(entity => entity.id === row.entity_id);
      if (!found) {
        await client.query(`INSERT INTO hollowgate_vtt.narrative_content_documents(id,campaign_id,kind,payload)
          VALUES($1,$2,$3,$4) ON CONFLICT(id,campaign_id,kind) DO NOTHING`,[
          row.entity_id,row.campaign_id,kind,{id:row.entity_id,campaignId:row.campaign_id,title:`[Recupero] ${row.entity_type} ${row.entity_id.slice(0,8)}`,chapterId:null,sceneId:null,environmentId:null,recoveredPlaceholder:true,reason:'Referenced by an exported entity note; source entity absent'},
        ]);
        log(`Created recovery ${row.entity_type} ${row.entity_id} for note ${row.id}`);
      }
    }
  }
}
async function migrateLocations(client) {
  await migrateDocuments(client,'environments','locations',data.environments || [], row => ({campaignId:row.campaign_id,chapterId:row.chapter_id || null,parentLocationId:row.parent_location_id || null}));
}
async function migrateEquipment(client) {
  await migrateDocuments(client,'equipment_catalog','equipment_catalog_documents',data.equipment_catalog || [], row => ({campaignId:row.campaign_id,imageAssetId:row.image_asset_id || null}));
}

async function migrateChat(client) {
  for (const [i,row] of (data.chat_messages || []).entries()) {
    if (!row.sender_id) throw new Error(`Chat message ${row.id} has no sender_id`);
    const kind = ['message','roll','attachment'].includes(row.kind) ? row.kind : 'message';
    const chatPayload = {...(row.payload || {}),sourceSenderName:row.sender_name,sourceSenderAvatarUrl:row.sender_avatar_url};
    await client.query(`INSERT INTO hollowgate_vtt.campaign_chat_messages(id,campaign_id,sender_id,content,kind,payload,reactions,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,kind=EXCLUDED.kind,
      payload=EXCLUDED.payload,reactions=EXCLUDED.reactions`,[row.id,row.campaign_id,userUuid(row.sender_id),row.content || '',kind,chatPayload,JSON.stringify(Array.isArray(row.reactions)?row.reactions:[]),row.created_at]);
    await archive(client,'chat_messages',row,i,'hollowgate_vtt.campaign_chat_messages',row.id);
  }
}

async function migrateFolders(client) {
  for (const [i,row] of (data.folders || []).entries()) {
    const scope = row.entity_type === 'gm' ? 'gm' : 'shared';
    await client.query(`INSERT INTO hollowgate_vtt.campaign_note_folders(id,campaign_id,scope,parent_folder_id,name,icon,position,status,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET parent_folder_id=EXCLUDED.parent_folder_id,
      name=EXCLUDED.name,icon=EXCLUDED.icon,position=EXCLUDED.position,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`,
      [row.id,row.campaign_id,scope,row.parent_folder_id,row.name || 'Cartella',row.icon,row.position || 0,row.deleted_at?'archived':'active',row.created_at,row.updated_at]);
    await archive(client,'folders',row,i,'hollowgate_vtt.campaign_note_folders',row.id);
  }
}

async function insertCampaignNote(client, row, parentId, note = null, forceActive = false) {
  const owner = userUuid(row.owner_profile_id || campaignOwner(row.campaign_id));
  const folderId = parentId ? null : row.folder_id;
  await client.query(`INSERT INTO hollowgate_vtt.campaign_notes
    (id,campaign_id,creator_id,parent_note_id,title,content_rich,position,visibility,status,scope,folder_id,title_icon,tab_order,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'shared',$10,$11,$12,$13,$14)
    ON CONFLICT(id) DO UPDATE SET parent_note_id=EXCLUDED.parent_note_id,title=EXCLUDED.title,content_rich=EXCLUDED.content_rich,
    position=EXCLUDED.position,visibility=EXCLUDED.visibility,status=EXCLUDED.status,folder_id=EXCLUDED.folder_id,
    title_icon=EXCLUDED.title_icon,tab_order=EXCLUDED.tab_order,updated_at=EXCLUDED.updated_at`,
    [row.id,row.campaign_id,owner,parentId,row.tab_name || 'Nota',richContent(row),row.position || 0,
      row.visibility === 'private'?'private':'all',forceActive?'active':(row.deleted_at?'archived':'active'),folderId,row.title_icon,row.tab_order?JSON.stringify(row.tab_order):null,row.created_at,row.updated_at]);
  return note;
}

async function migrateNotes(client) {
  const rows = data.entity_notes || [];
  const roots = rows.filter(row => row.entity_type === 'campaign');
  const children = rows.filter(row => row.entity_type === 'note');
  const others = rows.filter(row => !['campaign','note'].includes(row.entity_type));
  // Roots must be active while child inserts run because the Aruba trigger
  // validates the parent. Their original archived state is restored below.
  for (const row of roots) await insertCampaignNote(client,row,null,null,true);
  for (const row of children) await insertCampaignNote(client,row,noteIds.has(row.entity_id) ? row.entity_id : null);
  for (const row of roots.filter(row => row.deleted_at)) {
    await client.query(`UPDATE hollowgate_vtt.campaign_notes SET status='archived',updated_at=$2 WHERE id=$1`,[row.id,row.updated_at]);
  }
  for (const row of others) {
    const owner = userUuid(row.owner_profile_id || campaignOwner(row.campaign_id));
    if (row.entity_type === 'character' && characterIds.has(row.entity_id)) {
      await client.query(`INSERT INTO hollowgate_vtt.entity_notes
        (id,campaign_id,character_id,owner_id,tab_name,content,content_rich,position,hidden,visibility,status,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,
        content_rich=EXCLUDED.content_rich,position=EXCLUDED.position,hidden=EXCLUDED.hidden,visibility=EXCLUDED.visibility,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`,
        [row.id,row.campaign_id,row.entity_id,owner,row.tab_name || 'Nota',row.content || '',row.content_rich,row.position || 0,!!row.hidden,row.visibility==='private'?'private':'all',row.deleted_at?'archived':'active',row.created_at,row.updated_at]);
    } else if (['npc','monster'].includes(row.entity_type)) {
      const kind = row.entity_type === 'npc' ? 'npcs' : 'monsters';
      await client.query(`INSERT INTO hollowgate_vtt.narrative_entity_notes
        (id,campaign_id,kind,entity_id,owner_id,tab_name,content,content_rich,position,hidden,visibility,status,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,
        content_rich=EXCLUDED.content_rich,position=EXCLUDED.position,hidden=EXCLUDED.hidden,visibility=EXCLUDED.visibility,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`,
        [row.id,row.campaign_id,kind,row.entity_id,owner,row.tab_name || 'Nota',row.content || '',row.content_rich,row.position || 0,!!row.hidden,row.visibility==='private'?'private':'all',row.deleted_at?'archived':'active',row.created_at,row.updated_at]);
    } else {
      await insertCampaignNote(client,row,null,'Recovered from missing source entity');
    }
  }
  for (const [i,row] of rows.entries()) {
    let target = 'hollowgate_vtt.campaign_notes'; let note = null;
    if (row.entity_type === 'character' && characterIds.has(row.entity_id)) target='hollowgate_vtt.entity_notes';
    else if (['npc','monster'].includes(row.entity_type)) target='hollowgate_vtt.narrative_entity_notes';
    else if (!['campaign','note'].includes(row.entity_type)) note='Recovered through a generated placeholder for the absent referenced entity';
    else if (row.entity_type === 'note' && !noteIds.has(row.entity_id)) note='Recovered as root campaign note because the referenced parent is absent';
    await archive(client,'entity_notes',row,i,target,row.id,note);
  }
}

function decodeDataUrl(value) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(value || '');
  if (!match) return null;
  return {mime:match[1].toLowerCase(),data:Buffer.from(match[2],'base64')};
}
function loadBinary(assetId, kind, campaignId) {
  const descriptor=binaryManifest.assets?.[assetId]?.[kind];
  const manifestCampaign=binaryManifest.assets?.[assetId]?.campaignId;
  if(!descriptor||manifestCampaign!==campaignId||!/^[0-9a-f]{64}$/.test(descriptor.sha256||''))
    throw new Error(`Asset ${assetId} ${kind}: missing or invalid packaged binary`);
  const bytes=fs.readFileSync(`${BINARY_ASSET_DIR}/${descriptor.file}`);
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==descriptor.bytes||digest!==descriptor.sha256)
    throw new Error(`Asset ${assetId} ${kind}: packaged binary integrity failure`);
  return {mime:descriptor.mime,data:bytes};
}
async function migrateAssets(client) {
  for (const [i,row] of (data.visual_assets || []).entries()) {
    const source = loadBinary(row.id,'source',row.campaign_id);
    const thumbnail = loadBinary(row.id,'thumbnail',row.campaign_id);
    await client.query(`INSERT INTO hollowgate_vtt.visual_assets
      (id,campaign_id,name,asset_type,source_mime,source_data,thumbnail_mime,thumbnail_data,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id,campaign_id) DO UPDATE SET name=EXCLUDED.name,
      asset_type=EXCLUDED.asset_type,source_mime=EXCLUDED.source_mime,source_data=EXCLUDED.source_data,
      thumbnail_mime=EXCLUDED.thumbnail_mime,thumbnail_data=EXCLUDED.thumbnail_data`,
      [row.id,row.campaign_id,row.name || 'Asset senza nome',row.type || 'image',source.mime,source.data,thumbnail.mime,thumbnail.data,row.created_at]);
    await archive(client,'visual_assets',row,i,'hollowgate_vtt.visual_assets',row.id);
  }
}

async function migrateDice(client) {
  for (const [i,row] of (data.dice_formulas || []).entries()) {
    throw new Error(`dice_formulas contains unsupported source row ${i} (${row.id || 'no id'}); define its definitive contract before migration`);
  }
}

async function verifyInTransaction(client) {
  const ledger = Number((await client.query('SELECT count(*) AS n FROM hollowgate_vtt.migration_source_records')).rows[0].n);
  if (ledger !== expectedTotal) throw new Error(`Source ledger mismatch: ${ledger}/${expectedTotal}`);
  for (const table of SOURCE_TABLES) {
    const expected = data[table]?.length || 0;
    const actual = migrated.get(table) || 0;
    if (actual !== expected) throw new Error(`${table}: migrated ${actual}/${expected}`);
  }
  const duplicate = await client.query(`SELECT source_table,source_id FROM hollowgate_vtt.migration_source_records GROUP BY 1,2 HAVING count(*)<>1`);
  if (duplicate.rowCount) throw new Error('Duplicate source records in migration ledger');
}

async function main() {
  if (expectedTotal !== 339) throw new Error(`Unexpected export size: ${expectedTotal}; expected 339`);
  const client = new pg.Client(CONFIG);
  try {
    await client.connect();
    await client.query('BEGIN');
    await migrateUsers(client);
    await ensureReferencedUsers(client);
    await migrateCampaigns(client);
    await migrateMembers(client);
    await migrateCharacters(client);
    await migrateChapters(client);
    await migrateLocations(client);
    await migrateScenes(client);
    await migrateNarrative(client);
    await ensureReferencedEntities(client);
    await migrateEquipment(client);
    await migrateChat(client);
    await migrateFolders(client);
    await migrateNotes(client);
    await migrateAssets(client);
    await migrateDice(client);
    await verifyInTransaction(client);
    await client.query('COMMIT');
    log(`Migration complete: ${expectedTotal}/${expectedTotal} source records mapped and archived losslessly.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[MIGRATE] FAILED: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
