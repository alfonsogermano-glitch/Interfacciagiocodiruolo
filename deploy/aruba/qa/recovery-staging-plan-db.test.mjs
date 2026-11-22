// Local rehearsal of the exact assembler and clone-only SQL checks. No SSH.
// PGlite uses database "postgres": only the clone-name guards are substituted
// in this IN-MEMORY test copy. Deployment sources retain their strict guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';

const here=fileURLToPath(new URL('.',import.meta.url));
const sqlDir=fileURLToPath(new URL('../sql/',import.meta.url));
const read=name=>readFileSync(sqlDir+'/'+name,'utf8');
const localCloneCopy=name=>{
  const source=readFileSync(here+'/'+name,'utf8');
  const marker="current_database() <> 'hollowgate_stage_campaign_verify_20261121'";
  assert.equal(source.split(marker).length,2,'must have one immutable clone guard');
  return source.replace(marker,"current_database() <> 'postgres'");
};

test('audited eight-migration plan + clone grants + four regressions preserve existing social identities',async()=>{
  const assembly=spawnSync(process.platform==='win32'?'python':'python3',
    ['-B',here+'/assemble-staging-campaign-sql.py',sqlDir],{encoding:'utf8',timeout:10000});
  assert.equal(assembly.status,0,assembly.stderr);
  assert.equal((assembly.stdout.match(/-- SOURCE:/g)??[]).length,8);
  const db=new PGlite();
  try{
    for(const number of ['001','002','003','004','005','006','007','008','009','010','011','012','035','036']){
      const names=readdirSync(sqlDir).filter(file=>file.startsWith(number+'_')&&file.endsWith('.sql'));
      assert.equal(names.length,1,number);
      await db.exec(read(names[0]));
    }
    await db.exec(`CREATE ROLE hollowgate_auth_staging_app LOGIN NOINHERIT;
      GRANT USAGE ON SCHEMA hollowgate_auth,hollowgate_vtt TO hollowgate_auth_staging_app;
      INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
      VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','existing-social@example.invalid','Existing QA','active',now(),'local');
      INSERT INTO hollowgate_auth.oauth_identities(provider,subject,user_id)
      VALUES('google','embedded-existing-identity','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');`);
    const before=await db.query('SELECT id,email,status,email_verified_at FROM hollowgate_auth.users ORDER BY id');
    const identities=await db.query('SELECT provider,subject,user_id FROM hollowgate_auth.oauth_identities');
    await db.exec('BEGIN;');
    await db.exec(assembly.stdout);
    await db.exec(localCloneCopy('sync-staging-campaign-clone-grants.sql'));
    await db.exec('COMMIT;');
    for(const name of ['test_vtt_campaign_members.sql','test_vtt_joined_player_campaigns.sql','test_vtt_campaign_invites.sql']){
      await db.exec(read(name));
    }
    await db.exec(localCloneCopy('test-staging-campaign-clone-runtime.sql'));
    assert.deepEqual((await db.query('SELECT id,email,status,email_verified_at FROM hollowgate_auth.users ORDER BY id')).rows,before.rows);
    assert.deepEqual((await db.query('SELECT provider,subject,user_id FROM hollowgate_auth.oauth_identities')).rows,identities.rows);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM pg_auth_members
      WHERE member='hollowgate_auth_staging_app'::regrole`)).rows[0].count,0);
    // Verify the *unchanged* 037 refuses this embedded DB before any grants.
    const grantSource=read('037_staging_database_role.sql');
    await db.exec('BEGIN;');
    await assert.rejects(()=>db.exec(grantSource),/Dedicated staging role requires/);
    await db.exec('ROLLBACK;');
    // Embedded-only copy: this same role/grant program is exercised at the
    // fixture database name. Never write this adaptation into the VPS bundle.
    assert.equal(grantSource.split("current_database() <> 'hollowgate_auth_test'").length,2);
    const embeddedGrants=grantSource.replace("current_database() <> 'hollowgate_auth_test'", "current_database() <> 'postgres'")
      .replace('GRANT CONNECT ON DATABASE hollowgate_auth_test', 'GRANT CONNECT ON DATABASE postgres');
    await db.exec('BEGIN;');
    await db.exec(embeddedGrants);
    await db.exec('COMMIT;');
    await db.exec(localCloneCopy('test-staging-campaign-clone-runtime.sql'));
    assert.deepEqual((await db.query('SELECT id,email,status,email_verified_at FROM hollowgate_auth.users ORDER BY id')).rows,before.rows);
    assert.deepEqual((await db.query('SELECT provider,subject,user_id FROM hollowgate_auth.oauth_identities')).rows,identities.rows);
  }finally{await db.close();}
});
