import {readFileSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {Client} from 'pg';
import {hashPassword,validateNewPassword} from './src/password.mjs';

// The only write target is the named, loopback-bound disposable test container.
const port=execFileSync('docker',['port','hg-notes-real-pg','5432/tcp'],{encoding:'utf8'}).trim();
if(!/^127\.0\.0\.1:(15432|15433)$/.test(port))throw new Error('Database locale non isolato');
const input=await new Promise((resolve,reject)=>{
  let text='';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',part=>{text+=part;if(text.length>2048)reject(new Error('Input troppo grande'));});
  process.stdin.on('end',()=>resolve(text));
});
const {email,password}=JSON.parse(input);
validateNewPassword(password);
if(typeof email!=='string'||email.length>320||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
  throw new Error('Indirizzo email non valido');
const address=email.toLowerCase().trim();
const client=new Client({host:'127.0.0.1',port:Number(port.split(':')[1]),
  user:'hollowgate_auth_app',database:'hollowgate_auth_test',
  password:readFileSync(new URL('./password.txt',import.meta.url),'utf8').trim()});
try{
  await client.connect();
  const user=await client.query('SELECT id FROM hollowgate_auth.users WHERE email=$1',[address]);
  if(user.rowCount!==1)throw new Error('Utente non presente nella copia locale. Nessuna modifica eseguita.');
  const hash=await hashPassword(password);
  // No password, hash or user address appears in process arguments or output.
  const sql=`BEGIN;
    UPDATE hollowgate_auth.users SET status='active',email_verified_at=now()
      WHERE id='${user.rows[0].id}'::uuid;
    INSERT INTO hollowgate_auth.password_credentials(user_id,password_hash)
      VALUES ('${user.rows[0].id}'::uuid,'${hash}')
      ON CONFLICT (user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,changed_at=now();
    DELETE FROM hollowgate_auth.sessions WHERE user_id='${user.rows[0].id}'::uuid;
    COMMIT;`;
  await new Promise((resolve,reject)=>{
    const p=spawn('docker',['exec','-i','hg-notes-real-pg','psql','-q','-v','ON_ERROR_STOP=1',
      '-U','postgres','-d','hollowgate_auth_test'],{stdio:['pipe','ignore','ignore']});
    p.on('error',reject);
    p.on('close',code=>code===0?resolve():reject(new Error('Impossibile attivare il login di test')));
    p.stdin.end(sql);
  });
  console.log('Login di test abilitato solo nel database locale.');
}finally{await client.end().catch(()=>{});}
