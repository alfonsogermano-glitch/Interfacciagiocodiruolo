// Catalog/flag comparison only: cannot authorize a deploy or certify gameplay.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const routine=(name,...types)=>({name:'hollowgate_vtt.'+name,types});
export const campaignPlayerRequirements={
  flags:['CAMPAIGNS','CAMPAIGN_INVITES','CHARACTERS','CAMPAIGN_ROSTER',
    'CHARACTER_AVAILABILITY','CHARACTER_ASSIGNMENTS','PLAYER_CHARACTERS']
    .map(name=>'AUTH_VTT_'+name+'_ENABLED'),
  tables:{
    'hollowgate_auth.users':['id','status','email_verified_at'],
    'hollowgate_vtt.campaigns':['id','owner_id','name','ruleset'],
    'hollowgate_vtt.campaign_members':['campaign_id','user_id','member_role','status','created_at','updated_at'],
    'hollowgate_vtt.campaign_invites':['campaign_id','code_digest','expires_at'],
    'hollowgate_vtt.character_drafts':['id','campaign_id','owner_id','status','sheet_data','available_for_players'],
    'hollowgate_vtt.character_player_assignments':['campaign_id','character_id','player_id'],
  },
  routines:[
    routine('list_owned_campaigns','uuid'),routine('create_owned_campaign','uuid','text','text','text'),
    routine('campaign_member_role','uuid','uuid'),
    routine('rotate_owned_campaign_invite','uuid','uuid','bytea','timestamp with time zone'),
    routine('preview_campaign_invite','uuid','bytea'),routine('join_campaign_by_invite','uuid','bytea'),
    routine('list_owned_campaign_roster','uuid','uuid'),
    routine('list_owned_character_availability','uuid','uuid'),
    routine('set_owned_character_availability','uuid','uuid','uuid','boolean'),
    routine('list_owned_character_player_assignments','uuid','uuid'),
    routine('set_owned_character_player_assignment','uuid','uuid','uuid','uuid'),
    routine('list_joined_player_campaigns','uuid'),
    routine('list_assigned_player_character_sheets','uuid','uuid'),
  ],
};
export function validateSnapshot(snapshot){
  const expected=snapshot?.environment==='staging'
    ?{database:'hollowgate_auth_test',role:'hollowgate_auth_staging_app',origin:'https://staging.hollowgate.quest'}
    :snapshot?.environment==='production'
      ?{database:'hollowgate',role:'hollowgate_auth_app',origin:'https://www.hollowgate.quest'}:null;
  if(!expected||snapshot.schemaVersion!==1||snapshot.scope!=='runtime-catalog-only'||
    Object.entries(expected).some(([key,value])=>snapshot[key]!==value)||
    !snapshot.flags||typeof snapshot.flags!=='object'||!Array.isArray(snapshot.tables)||
    !Array.isArray(snapshot.routines)||snapshot.tables.length>1000||snapshot.routines.length>3000)
    throw new Error('Invalid recovery snapshot');
  const name=/^hollowgate_(?:auth|vtt)\.[a-z_][a-z0-9_]*$/;
  if(snapshot.tables.some(row=>!name.test(row.name)||typeof row.present!=='boolean'||!Array.isArray(row.columns))||
    snapshot.routines.some(row=>!name.test(row.name)||typeof row.present!=='boolean'||
      (row.present&&!Array.isArray(row.input_types))))throw new Error('Invalid catalog metadata');
  return snapshot;
}
export function assessCampaignPlayer(input){
  const snapshot=validateSnapshot(input),blockers=[];
  for(const flag of campaignPlayerRequirements.flags){
    if(snapshot.flags[flag]!=='true')blockers.push({kind:'flag-disabled-or-unknown',name:flag});
  }
  for(const [table,columns] of Object.entries(campaignPlayerRequirements.tables)){
    const matches=snapshot.tables.filter(row=>row.name===table&&row.present&&['r','p'].includes(row.kind));
    if(matches.length!==1){blockers.push({kind:'table-missing-or-ambiguous',name:table});continue;}
    const actual=new Set(matches[0].columns.map(column=>column.name));
    for(const column of columns)if(!actual.has(column))blockers.push({kind:'column-missing',name:table+'.'+column});
    // The next flow must use restricted routines, never direct membership or
    // invite writes. Privilege absence is required, not merely assumed.
    if(['hollowgate_vtt.campaign_members','hollowgate_vtt.campaign_invites'].includes(table)){
      for(const privilege of ['can_select','can_insert','can_update','can_delete']){
        if(matches[0][privilege]!==false)blockers.push({kind:'direct-table-grant-or-unknown',name:table,privilege});
      }
    }
  }
  for(const required of campaignPlayerRequirements.routines){
    const matches=snapshot.routines.filter(row=>row.name===required.name&&row.present&&
      JSON.stringify(row.input_types)===JSON.stringify(required.types));
    const signature=required.name+'('+required.types.join(',')+')';
    if(matches.length!==1)blockers.push({kind:'routine-signature-missing-or-ambiguous',name:signature});
    else if(matches[0].can_execute!==true||matches[0].security_definer!==true)
      blockers.push({kind:'routine-grant-or-security-missing',name:signature});
  }
  return {environment:snapshot.environment,flow:'campaign-invite-player',
    status:blockers.length?'blocked':'catalog-checks-passed-browser-qa-required',blockers,
    completeFeatureCertification:false,
    remaining:['Runtime flags and catalog metadata do not prove installed function behavior.',
      'Test create/invite/join/player visibility/revocation against the actual API and browser.',
      'No migration or feature flag change is authorized by this report.']};
}
export function compareSnapshots(leftInput,rightInput){
  const left=validateSnapshot(leftInput),right=validateSnapshot(rightInput);
  if(left.environment===right.environment)throw new Error('Expected different environments');
  const flagNames=[...new Set([...Object.keys(left.flags),...Object.keys(right.flags)])]
    .filter(name=>/^AUTH_[A-Z_]+_ENABLED$/.test(name)).sort();
  const flagState=(snapshot,name)=>['true','false'].includes(snapshot.flags[name])?snapshot.flags[name]:
    snapshot.flags[name]==null?'unset':'invalid';
  const key=row=>row.name+'('+row.input_types?.join(',')+')';
  const definitions=new Map(right.routines.filter(row=>row.present).map(row=>[key(row),row]));
  const routineDefinitionDrift=left.routines.filter(row=>row.present&&/^[a-f0-9]{32}$/.test(row.definition_md5??''))
    .filter(row=>{const other=definitions.get(key(row));return other&&/^[a-f0-9]{32}$/.test(other.definition_md5??'')&&row.definition_md5!==other.definition_md5;})
    .map(row=>key(row)).sort();
  return {schemaVersion:1,scope:'catalog-and-flags-only',certified:false,
    environments:[assessCampaignPlayer(left),assessCampaignPlayer(right)],
    flagDrift:flagNames.filter(name=>flagState(left,name)!==flagState(right,name))
      .map(name=>({name,[left.environment]:flagState(left,name),[right.environment]:flagState(right,name)})),
    routineDefinitionDrift,
    buildEvidence:{staging:'not-established-by-api-snapshot',production:'not-established-by-api-snapshot'},
    limitation:'Definition hashes detect drift, not correct authorization or semantic equivalence.'};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    if(process.argv.length!==4)throw new Error('Expected two snapshot files');
    const inputs=process.argv.slice(2).map(file=>{
      const data=readFileSync(file,'utf8');if(data.length>4000000)throw new Error('Snapshot too large');
      return JSON.parse(data);
    });
    const report=compareSnapshots(...inputs);
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(report.environments.some(environment=>environment.status==='blocked'))process.exitCode=1;
  }catch{console.error('RECOVERY_COMPARISON_FAILED — expected two valid sanitized runtime snapshots');process.exitCode=2;}
}
