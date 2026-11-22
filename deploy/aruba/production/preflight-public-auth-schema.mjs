// Read-only database gate, run INSIDE the production API container as its
// restricted runtime role. Never prints emails, identities or SQL rows.
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';

if(process.env.PGDATABASE!=='hollowgate'||
   process.env.PGUSER!=='hollowgate_auth_app'||
   process.env.AUTH_PRODUCTION_ENABLED!=='true'||
   process.env.AUTH_ORIGIN!=='https://www.hollowgate.quest'){
  console.error('AUTH_PREFLIGHT_WRONG_RUNTIME');process.exit(2);
}

const tables=['hollowgate_auth.oauth_identities','hollowgate_auth.oauth_attempts',
  'hollowgate_auth.email_verifications'];
const functions=[
  'hollowgate_auth.begin_oauth(bytea,bytea,text,text,text,uuid,bytea)',
  'hollowgate_auth.consume_oauth(bytea,bytea,text)',
  'hollowgate_auth.finish_oauth(text,text,text,text,uuid)',
  'hollowgate_auth.register_local_user(text,text,text,bytea)',
  'hollowgate_auth.confirm_local_email(bytea)',
];
let pool;
try{
  const password=(await readFile(process.env.POSTGRES_PASSWORD_FILE,'utf8')).trim();
  pool=new Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
    user:process.env.PGUSER,database:process.env.PGDATABASE,password,max:1,
    connectionTimeoutMillis:3000});
  for(const table of tables){
    const {rows}=await pool.query(`SELECT to_regclass($1) IS NOT NULL AS present,
      has_table_privilege(current_user,$1,'INSERT') AS direct_insert`,[table]);
    if(rows[0]?.present!==true||rows[0]?.direct_insert!==false)
      throw new Error('table or restricted grant missing');
  }
  for(const signature of functions){
    const {rows}=await pool.query(`SELECT to_regprocedure($1) IS NOT NULL AS present,
      has_function_privilege(current_user,$1,'EXECUTE') AS callable`,[signature]);
    if(rows[0]?.present!==true||rows[0]?.callable!==true)
      throw new Error('function or execute grant missing');
  }
  const {rows}=await pool.query(`SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conname='rate_limit_buckets_action_check'
      AND conrelid='hollowgate_auth.rate_limit_buckets'::regclass`);
  if(rows.length!==1||!rows[0].definition.includes('oauth_start'))
    throw new Error('oauth rate limit action missing');
  console.log('AUTH_SCHEMA_PREFLIGHT_OK');
}catch{
  console.error('AUTH_SCHEMA_PREFLIGHT_FAILED');process.exitCode=1;
}finally{if(pool)await pool.end();}
