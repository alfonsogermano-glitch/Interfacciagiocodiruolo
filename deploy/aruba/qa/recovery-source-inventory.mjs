// Read-only source inventory. Never connects to Docker, PostgreSQL or HTTP.
// A lexical reference is NOT proof that a feature is implemented/deployed.
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const defaultRepo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const unique=items=>[...new Set(items)].sort();
const slash=value=>value.replaceAll('\\','/');
export function inspectSql(source){
  // Sufficient for our unquoted hollowgate_* identifiers. Not a PostgreSQL
  // parser: dynamic SQL, overload resolution and conditional DDL need review.
  const sql=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'');
  const names=pattern=>unique([...sql.matchAll(pattern)].map(match=>match[1].toLowerCase()));
  return {
    createsTables:names(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(hollowgate_\w+\.\w+)/gi),
    declaresRoutines:names(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(hollowgate_\w+\.\w+)\s*\(/gi),
    relationReferences:names(/\b(?:FROM|JOIN|UPDATE|INTO|REFERENCES|TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(hollowgate_\w+\.\w+)/gi),
    routineReferences:names(/\b(hollowgate_\w+\.\w+)\s*\(/gi),
  };
}
function filesUnder(directory){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(directory,entry.name);
    return entry.isDirectory()?filesUnder(file):entry.isFile()?[file]:[];
  });
}
export function buildSourceInventory(repo=defaultRepo){
  const read=relative=>readFileSync(path.join(repo,relative),'utf8');
  const sqlRoot=path.join(repo,'deploy/aruba/sql');
  const migrations=filesUnder(sqlRoot).filter(file=>/^\d{3}_.+\.sql$/.test(path.basename(file)))
    .sort().map(file=>({file:slash(path.relative(repo,file)),...inspectSql(readFileSync(file,'utf8'))}));
  const creators=new Map();
  for(const migration of migrations)for(const table of migration.createsTables){
    creators.set(table,[...(creators.get(table)??[]),migration.file]);
  }
  for(const migration of migrations){
    migration.tableDependencies=unique(migration.relationReferences
      .filter(table=>!migration.createsTables.includes(table))
      .flatMap(table=>creators.get(table)??[]).filter(file=>file!==migration.file));
    migration.unresolvedRelationReferences=migration.relationReferences
      .filter(table=>!creators.has(table));
  }
  const services=filesUnder(path.join(repo,'apps/aruba-api/src')).filter(file=>file.endsWith('.mjs'))
    .sort().map(file=>({file:slash(path.relative(repo,file)),
      sqlRoutineNames:unique([...readFileSync(file,'utf8').matchAll(/\b(hollowgate_\w+\.\w+)\s*\(/g)].map(m=>m[1]))}))
    .filter(service=>service.sqlRoutineNames.length);
  const index=read('apps/aruba-api/src/index.mjs');
  const vite=read('apps/aruba-vtt-pilot/vite.config.mjs');
  const originalApp=read('src/app/App.tsx');
  const pilot=read('apps/aruba-vtt-pilot/src/main.tsx');
  return {
    schemaVersion:1,scope:'local-source-only',certified:false,
    limitations:[
      'Not a deployment manifest or migration runner; no SQL has been executed.',
      'Dependencies cover lexical relation references only, not all routines/columns/ACLs.',
      'Migration numbers in different subdirectories are independent; do not sort and apply blindly.',
      'Original source includes existing local changes; not an immutable historical UI baseline.',
      'Flags, files and passing unit tests do not prove live data access or graphical parity.',
    ],
    apiFlags:unique([...index.matchAll(/process\.env\.(AUTH_[A-Z_]+)/g)].map(m=>m[1])),
    buildFlags:unique([...vite.matchAll(/process\.env\.(HG_[A-Z_]+)/g)].map(m=>m[1])),
    explicitOriginalPublicRoutes:unique([...originalApp.matchAll(/path === ['"]([^'"]+)['"]/g)].map(m=>m[1])),
    pilotSectionIds:unique([...pilot.matchAll(/\bid:'([^']+)',label:/g)].map(m=>m[1])),
    migrations,services,
  };
}
export function schemaProbeSql(inventory){
  const tables=unique(inventory.migrations.flatMap(m=>m.createsTables));
  const routines=unique(inventory.migrations.flatMap(m=>m.declaresRoutines));
  // These names come only from bounded source identifier regexes, never input
  // values. Queries inspect catalogs, not application rows, tokens or secrets.
  const values=items=>items.map(name=>`('${name}')`).join(',\n');
  return `-- Read-only presence probe; run separately in the intended DB.\n`+
    `-- Routine NAME presence only: not a signature/body/grant certification.\n`+
    `BEGIN READ ONLY;\n`+
    `WITH expected(name) AS (VALUES ${values(tables)})\n`+
    `SELECT current_database() AS database, name AS relation,\n`+
    `to_regclass(name) IS NOT NULL AS present FROM expected ORDER BY name;\n`+
    `WITH expected(name) AS (VALUES ${values(routines)})\n`+
    `SELECT current_database() AS database, name AS routine, EXISTS (\n`+
    `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace\n`+
    `WHERE n.nspname||'.'||p.proname=expected.name) AS present\n`+
    `FROM expected ORDER BY name;\nROLLBACK;\n`;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  if(args.length>1||args.some(arg=>arg!=='--schema-probe')){
    console.error('Usage: node recovery-source-inventory.mjs [--schema-probe]');process.exitCode=2;
  }else{
    const inventory=buildSourceInventory();
    process.stdout.write(args.includes('--schema-probe')?schemaProbeSql(inventory):JSON.stringify(inventory,null,2)+'\n');
  }
}
