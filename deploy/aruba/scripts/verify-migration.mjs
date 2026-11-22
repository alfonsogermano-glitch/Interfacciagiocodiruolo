#!/usr/bin/env node
/** Exact source-to-target verification for the definitive Aruba migration. */
import pg from 'pg';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const path = process.env.SOURCE_EXPORT_PATH || './deploy/aruba/data/supabase-export.json';
const source = JSON.parse(fs.readFileSync(path,'utf8'));
const tables = ['profiles','campaigns','campaign_members','chapters','environments','scenes','characters','npcs','monsters','clues','situations','chat_messages','equipment_catalog','visual_assets','folders','dice_formulas','entity_notes'];
const requiredEnv=name=>{const value=process.env[name];if(!value)throw new Error(`Missing required environment variable: ${name}`);return value;};
const config = {host:requiredEnv('PGHOST'),port:Number(requiredEnv('PGPORT')),database:requiredEnv('PGDATABASE'),user:requiredEnv('PGUSER'),password:requiredEnv('PGPASSWORD')};
function stable(value){if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;return JSON.stringify(value);}
function hash(value){return createHash('sha256').update(stable(value)).digest('hex');}
function uuid(seed){const b=createHash('sha256').update(seed).digest().subarray(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function userUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'')?String(value).toLowerCase():uuid(`hollowgate:legacy-user:${value}`);}
function id(table,row,i){if(row.id)return String(row.id);if(table==='campaign_members')return `${row.campaign_id}:${row.profile_id}`;return String(i);}
async function ids(client,sql,params=[]){return new Set((await client.query(sql,params)).rows.map(row=>String(row.id)));}
function requireIds(label,expected,actual){const missing=expected.filter(value=>!actual.has(String(value)));if(missing.length)throw new Error(`${label}: ${missing.length} missing IDs: ${missing.slice(0,10).join(', ')}`);}

async function main(){
 const expected=tables.reduce((n,t)=>n+(source[t]?.length||0),0);
 if(expected!==339)throw new Error(`Export has ${expected} records, expected 339`);
 const client=new pg.Client(config);await client.connect();
 try{
  const ledger=(await client.query('SELECT source_table,source_id,source_ordinal,source_payload,source_sha256,target_table,target_id FROM hollowgate_vtt.migration_source_records ORDER BY source_table,source_ordinal')).rows;
  if(ledger.length!==expected)throw new Error(`Ledger has ${ledger.length}/${expected} records`);
  const byKey=new Map(ledger.map(row=>[`${row.source_table}:${row.source_id}`,row]));
  for(const table of tables)for(const [i,row] of (source[table]||[]).entries()){
   const key=`${table}:${id(table,row,i)}`;const saved=byKey.get(key);
   if(!saved)throw new Error(`Ledger missing ${key}`);
   const digest=hash(row);if(saved.source_sha256!==digest||hash(saved.source_payload)!==digest)throw new Error(`Lossless payload check failed for ${key}`);
  }
  requireIds('profiles',source.profiles.map(x=>userUuid(x.id)),await ids(client,'SELECT id FROM hollowgate_auth.users'));
  requireIds('campaigns',source.campaigns.map(x=>x.id),await ids(client,'SELECT id FROM hollowgate_vtt.campaigns'));
  requireIds('characters',source.characters.map(x=>x.id),await ids(client,'SELECT id FROM hollowgate_vtt.character_drafts'));
  requireIds('chapters',source.chapters.map(x=>x.id),await ids(client,'SELECT id FROM hollowgate_vtt.chapter_documents'));
  requireIds('environments',source.environments.map(x=>x.id),await ids(client,'SELECT id FROM hollowgate_vtt.locations'));
  requireIds('scenes',source.scenes.map(x=>x.id),await ids(client,'SELECT id FROM hollowgate_vtt.scene_documents'));
  requireIds('equipment',source.equipment_catalog.map(x=>x.id),await ids(client,'SELECT id FROM hollowgate_vtt.equipment_catalog_documents'));
  requireIds('chat',source.chat_messages.map(x=>x.id),await ids(client,'SELECT id FROM hollowgate_vtt.campaign_chat_messages'));
  requireIds('assets',source.visual_assets.map(x=>x.id),await ids(client,'SELECT id FROM hollowgate_vtt.visual_assets'));
  requireIds('folders',source.folders.map(x=>x.id),await ids(client,'SELECT id FROM hollowgate_vtt.campaign_note_folders'));
  const narrative=[...source.npcs,...source.monsters,...source.clues,...source.situations].map(x=>x.id);
  requireIds('narrative',narrative,await ids(client,'SELECT id FROM hollowgate_vtt.narrative_content_documents'));
  const routed=new Map(ledger.filter(x=>x.source_table==='entity_notes').map(x=>[x.target_table,x.target_id]));
  for(const target of ['hollowgate_vtt.campaign_notes','hollowgate_vtt.entity_notes','hollowgate_vtt.narrative_entity_notes']){
   const expectedIds=ledger.filter(x=>x.source_table==='entity_notes'&&x.target_table===target).map(x=>x.target_id);
   const table=target.split('.')[1];requireIds(`notes -> ${table}`,expectedIds,await ids(client,`SELECT id FROM hollowgate_vtt.${table}`));
  }
  const members=await ids(client,"SELECT campaign_id::text||':'||user_id::text AS id FROM hollowgate_vtt.campaign_members");
  requireIds('campaign members',source.campaign_members.map(x=>`${x.campaign_id}:${userUuid(x.profile_id)}`),members);
  const binary=(await client.query('SELECT count(*)::int AS n FROM hollowgate_vtt.visual_assets WHERE octet_length(source_data)>0 AND octet_length(thumbnail_data)>0')).rows[0].n;
  if(binary!==source.visual_assets.length)throw new Error(`Binary assets: ${binary}/${source.visual_assets.length}`);
  console.log(`[VERIFY] OK: ${expected}/${expected} source records, exact payload hashes, operational IDs and ${binary} binary assets verified.`);
 }finally{await client.end();}
}
main().catch(error=>{console.error(`[VERIFY] FAILED: ${error.message}`);process.exitCode=1;});
