// This rehearsal creates one synthetic account ONLY in the restored database.
// It never calls the mail provider or prints credentials, identity or cookies.
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {hashPassword} from '/app/src/password.mjs';

if(process.env.PGDATABASE!=='hollowgate_release_smoke_20261120'||
  process.env.PGUSER!=='hollowgate_auth_app'||
  process.env.AUTH_PRODUCTION_ENABLED!=='true'||
  process.env.AUTH_OAUTH_ENABLED==='true'){
  console.error('SMOKE_DATABASE_O_RUOLO_NON_ISOLATI');process.exit(2);
}
const password=(await readFile(process.env.POSTGRES_PASSWORD_FILE,'utf8')).trim();
const pool=new Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
  user:process.env.PGUSER,database:process.env.PGDATABASE,password,max:1});
try{
  const email='qa-core-'+randomBytes(12).toString('hex')+'@example.invalid';
  const loginPassword=randomBytes(32).toString('base64url');
  const digest=createHash('sha256').update(randomBytes(32)).digest();
  const registered=await pool.query('SELECT hollowgate_auth.register_local_user($1,$2,$3,$4) AS created',
    [email,'QA Clone',await hashPassword(loginPassword),digest]);
  if(registered.rows[0]?.created!==true)throw new Error('QA registration failed');
  const verified=await pool.query('SELECT hollowgate_auth.confirm_local_email($1) AS confirmed',[digest]);
  if(verified.rows[0]?.confirmed!==true)throw new Error('QA verification failed');
  console.log('QA clone: registrazione e verifica OK');

  const base='http://127.0.0.1:3000';
  const login=await fetch(base+'/auth/login',{method:'POST',redirect:'error',
    headers:{Origin:'https://www.hollowgate.quest','Content-Type':'application/json'},
    body:JSON.stringify({email,password:loginPassword})});
  console.log('Login clone: HTTP '+login.status);
  if(login.status!==200)throw new Error('QA login failed');
  const cookie=login.headers.get('set-cookie')?.match(/^__Host-hg_session=[A-Za-z0-9_-]{43}/)?.[0];
  if(!cookie)throw new Error('QA session cookie missing');
  for(const path of ['/auth/me','/vtt/bootstrap','/vtt/campaigns']){
    const response=await fetch(base+path,{headers:{Cookie:cookie},redirect:'error'});
    console.log(path+': HTTP '+response.status);
    if(response.status!==200)throw new Error('QA route failed');
  }
}catch{
  console.error('SMOKE_CLONE_QA_FALLITO');process.exitCode=1;
}finally{await pool.end();}
