// Real embedded PostgreSQL (PGlite), in memory only. Not VPS/browser QA.
// Applies the actual dependency SQL to a fresh instance, not a production dump.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {createCampaignService} from '../../../apps/aruba-api/src/campaign-service.mjs';
import {createCampaignInviteService} from '../../../apps/aruba-api/src/campaign-invite-service.mjs';
import {createPlayerCharacterService} from '../../../apps/aruba-api/src/player-character-service.mjs';
import {campaignPlayerRequirements} from './compare-recovery-environments.mjs';

const sqlDir=fileURLToPath(new URL('../sql/',import.meta.url));
const sequence=['001','002','003','004','005','008','009','010','011','012',
  '015','016','026','027','028','029','030','033'];
const get=name=>readFileSync(sqlDir+'/'+name,'utf8');

test('actual schema chain + restricted API services support invite, join, scoped discovery and revocation',async()=>{
  const db=new PGlite();
  try{
    for(const number of sequence){
      const names=readdirSync(sqlDir).filter(file=>file.startsWith(number+'_')&&file.endsWith('.sql'));
      assert.equal(names.length,1,number+' must identify exactly one root migration');
      await db.exec(get(names[0]));
    }
    // Regression used by the failed staging rehearsal now runs with *all*
    // required foundation tables/routines. Its own fixtures roll back.
    await db.exec(get('test_vtt_campaign_invites.sql'));
    const after=await db.query('SELECT count(*)::int AS count FROM hollowgate_auth.users');
    assert.equal(after.rows[0].count,0);

    const owner='11111111-1111-4111-8111-111111111111';
    const player='22222222-2222-4222-8222-222222222222';
    const outsider='33333333-3333-4333-8333-333333333333';
    for(const [id,label] of [[owner,'owner'],[player,'player'],[outsider,'outsider']]){
      await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
        VALUES($1,$2,$3,'active',now(),'local')`,[id,`qa-${label}@example.invalid`,label]);
    }
    // Independent LOGIN with no shared runtime group membership; grant only
    // the schema + functions needed in this embedded harness. This is NOT a
    // replacement for applying/verifying 037 on the real staging DB.
    await db.exec('CREATE ROLE qa_recovery_app LOGIN NOINHERIT; GRANT USAGE ON SCHEMA hollowgate_vtt TO qa_recovery_app;');
    for(const {name,types} of campaignPlayerRequirements.routines){
      await db.exec(`GRANT EXECUTE ON FUNCTION ${name}(${types.join(',')}) TO qa_recovery_app;`);
    }
    await db.exec('SET ROLE qa_recovery_app;');
    const membership=await db.query(`SELECT count(*)::int AS count FROM pg_auth_members
      WHERE member='qa_recovery_app'::regrole`);
    assert.equal(membership.rows[0].count,0);
    await assert.rejects(()=>db.query('SELECT * FROM hollowgate_vtt.campaign_members'));
    const pool={query:(text,params)=>db.query(text,params)};
    const campaigns=createCampaignService({pool});
    const invites=createCampaignInviteService({pool});
    const playerCampaigns=createPlayerCharacterService({pool});
    const {campaign}=await campaigns.create(owner,{name:'QA Invites',description:'Isolated fixture',ruleset:'hsc'});
    const {campaign:privateCampaign}=await campaigns.create(outsider,{name:'Must remain hidden',description:'',ruleset:'hsc'});
    assert.notEqual(campaign.id,privateCampaign.id);
    assert.deepEqual((await playerCampaigns.listCampaigns(player)).campaigns,[]);
    await assert.rejects(()=>invites.rotate(player,campaign.id));
    const {invite}=await invites.rotate(owner,campaign.id);
    assert.equal((await invites.preview(player,invite.code)).campaign.id,campaign.id);
    assert.equal((await invites.join(player,invite.code)).campaign.id,campaign.id);
    assert.equal((await invites.join(player,invite.code)).campaign.id,campaign.id); // idempotent membership
    assert.deepEqual((await playerCampaigns.listCampaigns(player)).campaigns.map(c=>c.id),[campaign.id]);
    assert.deepEqual((await playerCampaigns.listCampaigns(outsider)).campaigns,[]);
    const replaced=await invites.rotate(owner,campaign.id);
    assert.notEqual(replaced.invite.code,invite.code);
    await assert.rejects(()=>invites.preview(player,invite.code));
    // Simulate an owner-approved revocation as DB fixture setup, not an API
    // feature claim (there is no revocation UI being certified here).
    await db.exec('RESET ROLE;');
    await db.query("UPDATE hollowgate_vtt.campaign_members SET status='revoked' WHERE campaign_id=$1 AND user_id=$2",[campaign.id,player]);
    await db.exec('SET ROLE qa_recovery_app;');
    assert.deepEqual((await playerCampaigns.listCampaigns(player)).campaigns,[]);
  }finally{await db.close();}
});
