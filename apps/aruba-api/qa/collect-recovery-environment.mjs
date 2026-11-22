// Run inside the intended API container as its existing restricted role.
// stdin: bounded source inventory; stdout: allowlisted metadata ONLY.
// Never dumps process.env, Compose, SQL bodies, user rows or credentials.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export function selectRuntime(env,expected){
  const modes={
    staging:{database:'hollowgate_auth_test',role:'hollowgate_auth_staging_app',origin:'https://staging.hollowgate.quest'},
    production:{database:'hollowgate',role:'hollowgate_auth_app',origin:'https://www.hollowgate.quest'},
  };
  const target=modes[expected];
  if(!target||env.PGDATABASE!==target.database||env.PGUSER!==target.role||env.AUTH_ORIGIN!==target.origin||
    env[expected==='staging'?'AUTH_STAGING_ENABLED':'AUTH_PRODUCTION_ENABLED']!=='true'||
    env[expected==='staging'?'AUTH_PRODUCTION_ENABLED':'AUTH_STAGING_ENABLED']==='true')
    throw new Error('Unexpected recovery runtime');
  return {environment:expected,...target};
}
export function safeFlags(env,names){
  if(!Array.isArray(names)||names.length>100)throw new Error('Invalid flag inventory');
  return Object.fromEntries([...new Set(names)].sort().filter(name=>/^AUTH_[A-Z_]+_ENABLED$/.test(name))
    .map(name=>[name,env[name]===undefined?null:['true','false'].includes(env[name])?env[name]:'invalid']));
}
export function selectExpectedObjects(inventory){
  if(inventory?.schemaVersion!==1||inventory.scope!=='local-source-only'||!Array.isArray(inventory.migrations)||
    inventory.migrations.length>200)throw new Error('Invalid source inventory');
  const collect=key=>{
    const list=inventory.migrations.flatMap(m=>{
      if(!Array.isArray(m[key]))throw new Error('Invalid object list');
      return m[key];
    });
    if(list.length>3000||list.some(name=>typeof name!=='string'||
      !/^hollowgate_(?:auth|vtt)\.[a-z_][a-z0-9_]*$/.test(name)))throw new Error('Invalid schema name');
    return [...new Set(list)].sort();
  };
  return {tables:collect('createsTables'),routines:collect('declaresRoutines')};
}
export async function collectSnapshot(client,inventory,runtime,env){
  const expected=selectExpectedObjects(inventory);
  const flags=safeFlags(env,inventory.apiFlags);
  await client.query('BEGIN READ ONLY');
  try{
    await client.query("SET LOCAL statement_timeout = '8s'");
    const {rows:[identity]}=await client.query(`SELECT current_database() AS database,current_user AS role,
      (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AS elevated`);
    if(!identity||identity.database!==runtime.database||identity.role!==runtime.role||identity.elevated!==false)
      throw new Error('Unexpected database identity');
    const {rows:tables}=await client.query(`WITH expected(name) AS (SELECT unnest($1::text[]))
      SELECT e.name,c.relkind AS kind,c.oid IS NOT NULL AS present,
        CASE WHEN c.oid IS NULL THEN NULL ELSE has_table_privilege(current_user,c.oid,'SELECT') END AS can_select,
        CASE WHEN c.oid IS NULL THEN NULL ELSE has_table_privilege(current_user,c.oid,'INSERT') END AS can_insert,
        CASE WHEN c.oid IS NULL THEN NULL ELSE has_table_privilege(current_user,c.oid,'UPDATE') END AS can_update,
        CASE WHEN c.oid IS NULL THEN NULL ELSE has_table_privilege(current_user,c.oid,'DELETE') END AS can_delete,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum)
          FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) AS columns
      FROM expected e LEFT JOIN pg_namespace n ON n.nspname=split_part(e.name,'.',1)
      LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=split_part(e.name,'.',2)
      ORDER BY e.name`,[expected.tables]);
    const {rows:routines}=await client.query(`WITH expected(name) AS (SELECT unnest($1::text[]))
      SELECT e.name,p.oid IS NOT NULL AS present,p.prosecdef AS security_definer,
        CASE WHEN p.oid IS NULL THEN NULL ELSE md5(pg_get_functiondef(p.oid)) END AS definition_md5,
        CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege(current_user,p.oid,'EXECUTE') END AS can_execute,
        CASE WHEN p.oid IS NULL THEN NULL ELSE ARRAY(SELECT format_type(t,NULL)
          FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS args(t,ord) ORDER BY ord) END AS input_types
      FROM expected e LEFT JOIN pg_namespace n ON n.nspname=split_part(e.name,'.',1)
      LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=split_part(e.name,'.',2) AND p.prokind='f'
      ORDER BY e.name,p.oid`,[expected.routines]);
    return {schemaVersion:1,scope:'runtime-catalog-only',...runtime,flags,
      // An API container cannot attest which VTT compile flags built its JS.
      build:{originalNotesPanel:'unknown'},tables,routines,
      completeFeatureCertification:false};
  }finally{await client.query('ROLLBACK');}
}
async function main(){
  const [expected,...rest]=process.argv.slice(2);
  const runtime=selectRuntime(process.env,expected);
  if(rest.length)throw new Error('Unexpected arguments');
  let text='';
  for await(const chunk of process.stdin){text+=chunk;if(text.length>512000)throw new Error('Inventory too large');}
  const inventory=JSON.parse(text);
  selectExpectedObjects(inventory);
  const {Client}=await import('pg');
  const password=(await readFile(process.env.POSTGRES_PASSWORD_FILE,'utf8')).trim();
  const client=new Client({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
    database:runtime.database,user:runtime.role,password,connectionTimeoutMillis:5000,
    query_timeout:10000,application_name:'hollowgate-recovery-readonly'});
  try{
    await client.connect();
    const snapshot=await collectSnapshot(client,inventory,runtime,process.env);
    process.stdout.write(JSON.stringify(snapshot,null,2)+'\n');
  }finally{await client.end();}
}
if(process.argv[1]&&(process.argv[1]==='--recovery-eval'||pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)){
  main().catch(()=>{console.error('RECOVERY_SNAPSHOT_FAILED — no secrets or SQL error details printed');process.exitCode=1;});
}
