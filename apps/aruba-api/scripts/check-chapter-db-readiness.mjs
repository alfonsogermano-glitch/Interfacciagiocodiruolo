#!/usr/bin/env node
// Read-only chapter schema readiness probe. No migrations or grants are executed.
import pg from 'pg';
const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,max:1});
const checks=[
 ['runtime role identity',`SELECT current_user='hollowgate_api_runtime' AS ready`],
 ['campaigns table',`SELECT to_regclass('hollowgate_vtt.campaigns') IS NOT NULL AS ready`],
 ['chapter documents table',`SELECT to_regclass('hollowgate_vtt.chapter_documents') IS NOT NULL AS ready`],
 ['chapter table SELECT revoked',`SELECT NOT has_table_privilege(current_user,'hollowgate_vtt.chapter_documents','SELECT') AS ready`],
 ['chapter table INSERT revoked',`SELECT NOT has_table_privilege(current_user,'hollowgate_vtt.chapter_documents','INSERT') AS ready`],
 ['chapter table UPDATE revoked',`SELECT NOT has_table_privilege(current_user,'hollowgate_vtt.chapter_documents','UPDATE') AS ready`],
 ['chapter table DELETE revoked',`SELECT NOT has_table_privilege(current_user,'hollowgate_vtt.chapter_documents','DELETE') AS ready`],
 ['campaign owner column SELECT revoked',`SELECT NOT has_column_privilege(current_user,'hollowgate_vtt.campaigns','owner_id','SELECT') AS ready`],
 ['chapter routine 1',`SELECT has_function_privilege(current_user,'hollowgate_vtt.chapter_owner_authorized(uuid,uuid)','EXECUTE') AS ready`],
 ['chapter routine 2',`SELECT has_function_privilege(current_user,'hollowgate_vtt.list_owned_chapter_documents(uuid,uuid)','EXECUTE') AS ready`],
 ['chapter routine 3',`SELECT has_function_privilege(current_user,'hollowgate_vtt.list_owned_chapter_links(uuid,uuid,uuid[])','EXECUTE') AS ready`],
 ['chapter routine 4',`SELECT has_function_privilege(current_user,'hollowgate_vtt.save_owned_chapter_document(uuid,uuid,uuid,jsonb)','EXECUTE') AS ready`],
 ['chapter routine 5',`SELECT has_function_privilege(current_user,'hollowgate_vtt.delete_owned_chapter_document(uuid,uuid,uuid)','EXECUTE') AS ready`],
];
let failed=false;
try{
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required for read-only staging probe');
 for(const [name,sql] of checks){
  try{
   const result=await pool.query(sql);
   const ok=result.rows[0]?.ready===true;
   process.stdout.write((ok?'PASS ':'FAIL ')+name+'\n');
   if(!ok)failed=true;
  }catch(error){
   failed=true;
   process.stdout.write('FAIL '+name+' ('+(error.code??'query-error')+')\n');
  }
 }
} catch(error){failed=true;process.stderr.write(error.message+'\n');}
finally{await pool.end();}
if(failed)process.exitCode=1;
