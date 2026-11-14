#!/usr/bin/env node
// Read-only chapter schema readiness probe. No migrations or grants are executed.
import pg from 'pg';
const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,max:1});
const checks=[
 ['campaigns table',`SELECT to_regclass('hollowgate_vtt.campaigns') IS NOT NULL AS ready`],
 ['chapter documents table',`SELECT to_regclass('hollowgate_vtt.chapter_documents') IS NOT NULL AS ready`],
 ['chapter read privilege',`SELECT has_table_privilege(current_user,'hollowgate_vtt.chapter_documents','SELECT') AS ready`],
 ['chapter insert privilege',`SELECT has_table_privilege(current_user,'hollowgate_vtt.chapter_documents','INSERT') AS ready`],
 ['chapter update privilege',`SELECT has_table_privilege(current_user,'hollowgate_vtt.chapter_documents','UPDATE') AS ready`],
 ['chapter delete privilege',`SELECT has_table_privilege(current_user,'hollowgate_vtt.chapter_documents','DELETE') AS ready`],
 ['campaign owner read privilege',`SELECT has_column_privilege(current_user,'hollowgate_vtt.campaigns','owner_id','SELECT') AS ready`],
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
