import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createApp } from './app.mjs';
import { verifyPassword } from './password.mjs';
import { createLoginService } from './login-service.mjs';
import { createSessionRepository } from './session-repository.mjs';
import { createAuthHttpHandler } from './auth-http.mjs';
import { createPasswordResetService } from './password-reset-service.mjs';
import { createTransactionalMailer } from './transactional-mail.mjs';
import {createSignupService} from './signup-service.mjs';
import {createOAuthService} from './oauth-service.mjs';
import {createCampaignService} from './campaign-service.mjs';
import {createCampaignInviteService} from './campaign-invite-service.mjs';
import {createChapterService} from './chapter-service.mjs';
import {createSceneService} from './scene-service.mjs';
import {createNarrativeContentService} from './narrative-content-service.mjs';
import {createEquipmentCatalogService} from './equipment-catalog-service.mjs';
import {createCampaignDocumentService} from './campaign-document-service.mjs';
import {createCampaignChatService} from './campaign-chat-service.mjs';
import {createDiceFormulaService} from './dice-formula-service.mjs';
import {createVisualAssetService} from './visual-asset-service.mjs';
import {createCampaignRosterService} from './campaign-roster-service.mjs';
import {createCharacterService} from './character-service.mjs';
import {createCharacterAvailabilityService} from './character-availability-service.mjs';
import {createCharacterAssignmentService} from './character-assignment-service.mjs';
import {createPlayerCharacterService} from './player-character-service.mjs';
import {createCharacterClaimService} from './character-claim-service.mjs';
import {createLogicalCharacterService} from './logical-character-service.mjs';
import {configureNativeCatalog} from './native-catalog-startup.mjs';
import {configureLogicalCharacterCatalog,requireLogicalCharacterSafety} from './logical-character-catalog-startup.mjs';
import {createGameSessionBootstrap} from './game-session-bootstrap.mjs';
import {createCharacterPortraitService} from './character-portrait-service.mjs';
import {createEntityNotesService} from './entity-notes-service.mjs';
import {createNarrativeEntityNotesService} from './narrative-entity-notes-service.mjs';
import {createCampaignNotesService} from './campaign-notes-service.mjs';
import {createCampaignFoldersService} from './campaign-folders-service.mjs';
import {createSignalingIdentityService} from './signaling-identity-service.mjs';
import {createSignalingWebSocketGateway} from './signaling-websocket-gateway.mjs';
import {createTurnCredentialService,parseTurnSharedSecret} from './turn-credential-service.mjs';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error('Missing required environment variable: ' + name);
  return value;
};

async function main() {
  const password = (await readFile(required('POSTGRES_PASSWORD_FILE'), 'utf8')).trim();
  if (!password) throw new Error('Empty database password file');

  const pool = new Pool({
    host: required('PGHOST'),
    port: Number(process.env.PGPORT ?? 5432),
    user: required('PGUSER'),
    database: required('PGDATABASE'),
    password,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', () => { /* idle connection error: readiness endpoint reports status */ });

  // Authentication is enabled only in one explicitly selected runtime mode.
  // Staging retains its fixed disposable database guard. Production requires
  // the restricted application principal, a non-test database and the exact
  // public HTTPS origin; an owner/superuser connection is never accepted.
  let authHandler = null;
  let signalingIdentity = null;
  let turnCredentials = null;
  const stagingEnabled=process.env.AUTH_STAGING_ENABLED === 'true';
  const productionEnabled=process.env.AUTH_PRODUCTION_ENABLED==='true';
  if(stagingEnabled&&productionEnabled)throw new Error('Select exactly one auth runtime mode');
  if (stagingEnabled || productionEnabled) {
    const origin = required('AUTH_ORIGIN');
    if(stagingEnabled&&(process.env.PGDATABASE !== 'hollowgate_auth_test'||
      (process.env.PGUSER !== 'hollowgate_auth_app'&&
       process.env.PGUSER !== 'hollowgate_auth_staging_app')))
      throw new Error('Auth staging requires the dedicated test database and restricted user');
    if(stagingEnabled&&process.env.AUTH_OAUTH_ENABLED==='true'&&
      process.env.PGUSER!=='hollowgate_auth_staging_app')
      throw new Error('OAuth staging requires its isolated database login');
    if(productionEnabled&&(process.env.PGDATABASE==='hollowgate_auth_test'||
      process.env.PGUSER!=='hollowgate_auth_app'||origin!=='https://www.hollowgate.quest'))
      throw new Error('Auth production requires the restricted production database and exact public origin');
    const keyPath = required('AUTH_RATE_LIMIT_KEY_FILE');
    const hmacKey = await readFile(keyPath);
    if (hmacKey.length < 32) throw new Error('Auth rate-limit key is too short');
    const login = createLoginService({pool, verifyPassword, hmacKey});
    const {getSessionUser, revokeSession} = createSessionRepository({pool});
    const oauthFlag=process.env.AUTH_OAUTH_ENABLED;
    if(oauthFlag&&!['true','false'].includes(oauthFlag))throw new Error('Unsupported AUTH_OAUTH_ENABLED value');
    const oauth=oauthFlag==='true'?createOAuthService({pool,origin,getSessionUser,hmacKey,
      providers:{
        google:{clientId:required('GOOGLE_OAUTH_CLIENT_ID'),
          clientSecret:(await readFile(required('GOOGLE_OAUTH_CLIENT_SECRET_FILE'),'utf8')).trim()},
        discord:{clientId:required('DISCORD_OAUTH_CLIENT_ID'),
          clientSecret:(await readFile(required('DISCORD_OAUTH_CLIENT_SECRET_FILE'),'utf8')).trim()},
      },
    }):null;
    let passwordReset = null;
    let signupService = null;
    let mailer = null;
    const getMailer = async () => {
      if (!mailer) {
        const key = (await readFile(required('RESEND_API_KEY_FILE'), 'utf8')).trim();
        mailer = createTransactionalMailer({apiKey:key});
      }
      return mailer;
    };
    const resetFlag = process.env.AUTH_PASSWORD_RESET_ENABLED;
    if (resetFlag === 'true') {
      // Both the mail secret and the PostgreSQL migration 006 must be
      // provisioned explicitly in staging before setting this flag.
      passwordReset = createPasswordResetService({pool,mailer:await getMailer(),hmacKey,baseUrl:origin});
    } else if (resetFlag && resetFlag !== 'false') {
      throw new Error('Unsupported AUTH_PASSWORD_RESET_ENABLED value');
    }
    const signupFlag=process.env.AUTH_SIGNUP_ENABLED;
    if (signupFlag === 'true') {
      signupService=createSignupService({pool,mailer:await getMailer(),hmacKey,baseUrl:origin});
    } else if (signupFlag && signupFlag !== 'false') {
      throw new Error('Unsupported AUTH_SIGNUP_ENABLED value');
    }
    // Campaigns are disabled unless explicitly opted in AND migration 008
    // has been applied to the disposable test database.
    const campaignsFlag=process.env.AUTH_VTT_CAMPAIGNS_ENABLED;
    if (campaignsFlag && campaignsFlag !== 'false' && campaignsFlag !== 'true')
      throw new Error('Unsupported AUTH_VTT_CAMPAIGNS_ENABLED value');
    const campaigns=campaignsFlag==='true'?createCampaignService({pool}):null;
    const invitesFlag=process.env.AUTH_VTT_CAMPAIGN_INVITES_ENABLED;
    if(invitesFlag&&!['true','false'].includes(invitesFlag))
      throw new Error('Unsupported AUTH_VTT_CAMPAIGN_INVITES_ENABLED value');
    if(invitesFlag==='true'&&!campaigns)throw new Error('Campaign invites require staging campaigns');
    // Requires migration 033 and remains disabled until its SQL regression passes.
    const campaignInvites=invitesFlag==='true'?createCampaignInviteService({pool}):null;
    const chaptersFlag=process.env.AUTH_VTT_CHAPTERS_ENABLED;
    if(chaptersFlag&&!['true','false'].includes(chaptersFlag))
      throw new Error('Unsupported AUTH_VTT_CHAPTERS_ENABLED value');
    if(chaptersFlag==='true'&&!campaigns)
      throw new Error('Chapters require staging campaigns');
    // Requires chapter_documents SQL and an explicit staging opt-in.
    const chapters=chaptersFlag==='true'?createChapterService({pool}):null;
    const scenesFlag=process.env.AUTH_VTT_SCENES_ENABLED;
    if(scenesFlag&&!['true','false'].includes(scenesFlag))
      throw new Error('Unsupported AUTH_VTT_SCENES_ENABLED value');
    if(scenesFlag==='true'&&!chapters)
      throw new Error('Scenes require staging chapters');
    // Requires scenes/001_scene_documents.sql and a deliberate staging opt-in.
    const scenes=scenesFlag==='true'?createSceneService({pool}):null;
    const narrativeFlag=process.env.AUTH_VTT_NARRATIVE_CONTENT_ENABLED;
    if(narrativeFlag&&!['true','false'].includes(narrativeFlag))
      throw new Error('Unsupported AUTH_VTT_NARRATIVE_CONTENT_ENABLED value');
    if(narrativeFlag==='true'&&!scenes)
      throw new Error('Narrative content requires staging chapters and scenes');
    const narrativeContent=narrativeFlag==='true'?createNarrativeContentService({pool}):null;
    const equipmentFlag=process.env.AUTH_VTT_EQUIPMENT_CATALOG_ENABLED;
    if(equipmentFlag&&!['true','false'].includes(equipmentFlag))throw new Error('Unsupported AUTH_VTT_EQUIPMENT_CATALOG_ENABLED value');
    if(equipmentFlag==='true'&&!campaigns)throw new Error('Equipment catalog requires staging campaigns');
    const equipmentCatalog=equipmentFlag==='true'?createEquipmentCatalogService({pool}):null;
    const documentFlag=process.env.AUTH_VTT_CAMPAIGN_DOCUMENTS_ENABLED;
    if(documentFlag&&!['true','false'].includes(documentFlag))throw new Error('Unsupported AUTH_VTT_CAMPAIGN_DOCUMENTS_ENABLED value');
    if(documentFlag==='true'&&!campaigns)throw new Error('Campaign documents require staging campaigns');
    const campaignDocuments=documentFlag==='true'?createCampaignDocumentService({pool}):null;
    const chatFlag=process.env.AUTH_VTT_CAMPAIGN_CHAT_ENABLED;
    if(chatFlag&&!['true','false'].includes(chatFlag))throw new Error('Unsupported AUTH_VTT_CAMPAIGN_CHAT_ENABLED value');
    if(chatFlag==='true'&&!campaigns)throw new Error('Campaign chat requires staging campaigns');
    const campaignChat=chatFlag==='true'?createCampaignChatService({pool}):null;
    const diceFormulaFlag=process.env.AUTH_VTT_DICE_FORMULAS_ENABLED;
    if(diceFormulaFlag&&!['true','false'].includes(diceFormulaFlag))throw new Error('Unsupported AUTH_VTT_DICE_FORMULAS_ENABLED value');
    if(diceFormulaFlag==='true'&&!campaigns)throw new Error('Dice formulas require staging campaigns');
    const diceFormulas=diceFormulaFlag==='true'?createDiceFormulaService({pool}):null;
    const visualAssetFlag=process.env.AUTH_VTT_VISUAL_ASSETS_ENABLED;
    if(visualAssetFlag&&!['true','false'].includes(visualAssetFlag))throw new Error('Unsupported AUTH_VTT_VISUAL_ASSETS_ENABLED value');
    if(visualAssetFlag==='true'&&!campaigns)throw new Error('Visual assets require staging campaigns');
    const visualAssets=visualAssetFlag==='true'?createVisualAssetService({pool}):null;
    const rosterFlag=process.env.AUTH_VTT_CAMPAIGN_ROSTER_ENABLED;
    if(rosterFlag&&!['true','false'].includes(rosterFlag))
      throw new Error('Unsupported AUTH_VTT_CAMPAIGN_ROSTER_ENABLED value');
    if(rosterFlag==='true'&&!campaigns)
      throw new Error('Campaign roster requires staging campaigns');
    // Requires migration 026, disabled by default until explicit opt-in.
    const campaignRoster=rosterFlag==='true'?createCampaignRosterService({pool}):null;
    const characterFlag=process.env.AUTH_VTT_CHARACTERS_ENABLED;
    if(characterFlag && characterFlag!=='false' && characterFlag!=='true')
      throw new Error('Unsupported AUTH_VTT_CHARACTERS_ENABLED value');
    if(characterFlag==='true' && !campaigns)throw new Error('Characters require campaigns');
    const characters=characterFlag==='true'?createCharacterService({pool}):null;
    const logicalFlag=process.env.AUTH_VTT_CHARACTER_LOGIC_ENABLED;
    if(logicalFlag&&!['true','false'].includes(logicalFlag))
      throw new Error('Unsupported AUTH_VTT_CHARACTER_LOGIC_ENABLED value');
    if(logicalFlag==='true'&&!characters)
      throw new Error('Character logical ownership requires staging characters');
    const logicalCharacters=logicalFlag==='true'?createLogicalCharacterService({pool}):null;
    if(logicalCharacters)await requireLogicalCharacterSafety({pool});
    const logicalCatalog=await configureLogicalCharacterCatalog({
      flag:process.env.AUTH_VTT_CHARACTER_CATALOG_ENABLED,logicalCharacters,pool});
    if(logicalCatalog)logicalCharacters.catalog=logicalCatalog;
    const {unassignedCatalog,unassignedCatalogNotes,nativeCatalog,nativeCatalogNotes}=await configureNativeCatalog({
      flag:process.env.AUTH_VTT_NATIVE_CATALOG_ENABLED,authEnabled:true,campaigns,pool});
    const availabilityFlag=process.env.AUTH_VTT_CHARACTER_AVAILABILITY_ENABLED;
    if(availabilityFlag&&!['true','false'].includes(availabilityFlag))
      throw new Error('Unsupported AUTH_VTT_CHARACTER_AVAILABILITY_ENABLED value');
    if(availabilityFlag==='true'&&!characters)
      throw new Error('Availability requires staging characters');
    // Requires migration 027. Staging opt-in only, no player claiming.
    const characterAvailability=availabilityFlag==='true'?
      createCharacterAvailabilityService({pool}):null;
    const assignmentsFlag=process.env.AUTH_VTT_CHARACTER_ASSIGNMENTS_ENABLED;
    if(assignmentsFlag&&!['true','false'].includes(assignmentsFlag))
      throw new Error('Unsupported AUTH_VTT_CHARACTER_ASSIGNMENTS_ENABLED value');
    if(assignmentsFlag==='true'&&(!characters||!campaignRoster||!characterAvailability))
      throw new Error('Character assignments require characters, roster and availability');
    // Opt-in only after SQL 028 is installed in isolated staging.
    const characterAssignments=assignmentsFlag==='true'?
      createCharacterAssignmentService({pool}):null;
    const playerCharactersFlag=process.env.AUTH_VTT_PLAYER_CHARACTERS_ENABLED;
    if(playerCharactersFlag&&!['true','false'].includes(playerCharactersFlag))
      throw new Error('Unsupported AUTH_VTT_PLAYER_CHARACTERS_ENABLED value');
    if(playerCharactersFlag==='true'&&!characterAssignments)
      throw new Error('Player character reads require assignments');
    // Staging-only, explicit opt-in after migration 029.
    const playerCharacters=playerCharactersFlag==='true'?
      createPlayerCharacterService({pool}):null;
    const claimsFlag=process.env.AUTH_VTT_CHARACTER_CLAIMS_ENABLED;
    if(claimsFlag&&!['true','false'].includes(claimsFlag))
      throw new Error('Unsupported AUTH_VTT_CHARACTER_CLAIMS_ENABLED value');
    if(claimsFlag==='true'&&(!playerCharacters||!characterAssignments))
      throw new Error('Character claims require player reads and assignments');
    // Requires migration 034 and remains off until real PostgreSQL race proof.
    const characterClaims=claimsFlag==='true'?createCharacterClaimService({pool}):null;
    const portraitsFlag=process.env.AUTH_VTT_CHARACTER_PORTRAITS_ENABLED;
    if(portraitsFlag&&!['true','false'].includes(portraitsFlag))
      throw new Error('Unsupported AUTH_VTT_CHARACTER_PORTRAITS_ENABLED value');
    if(portraitsFlag==='true'&&(!characters||!characterAssignments))
      throw new Error('Portraits require characters and assignments');
    // Requires 031: opt-in after disposable PostgreSQL security tests.
    const characterPortraits=portraitsFlag==='true'?
      createCharacterPortraitService({pool}):null;
    const entityNotesFlag=process.env.AUTH_VTT_ENTITY_NOTES_ENABLED;
    if(entityNotesFlag && !['true','false'].includes(entityNotesFlag))
      throw new Error('Unsupported AUTH_VTT_ENTITY_NOTES_ENABLED value');
    if(entityNotesFlag==='true' && !characters)throw new Error('Entity notes require staging characters');
    const entityNotes=entityNotesFlag==='true'?createEntityNotesService({pool}):null;
    const narrativeEntityNotesFlag=process.env.AUTH_VTT_NARRATIVE_ENTITY_NOTES_ENABLED;
    if(narrativeEntityNotesFlag&&!['true','false'].includes(narrativeEntityNotesFlag))
      throw new Error('Unsupported AUTH_VTT_NARRATIVE_ENTITY_NOTES_ENABLED value');
    if(narrativeEntityNotesFlag==='true'&&!narrativeContent)
      throw new Error('Narrative entity notes require narrative content');
    const narrativeEntityNotes=narrativeEntityNotesFlag==='true'?createNarrativeEntityNotesService({pool}):null;
    const campaignNotesFlag=process.env.AUTH_VTT_CAMPAIGN_NOTES_ENABLED;
    if(campaignNotesFlag && !['true','false'].includes(campaignNotesFlag))
      throw new Error('Unsupported AUTH_VTT_CAMPAIGN_NOTES_ENABLED value');
    if(campaignNotesFlag==='true' && !campaigns)
      throw new Error('Campaign notes require staging campaigns');
    const campaignNotes=campaignNotesFlag==='true'?createCampaignNotesService({pool}):null;
    const campaignFoldersFlag=process.env.AUTH_VTT_CAMPAIGN_NOTE_FOLDERS_ENABLED;
    if(campaignFoldersFlag && !['true','false'].includes(campaignFoldersFlag))
      throw new Error('Unsupported AUTH_VTT_CAMPAIGN_NOTE_FOLDERS_ENABLED value');
    if(campaignFoldersFlag==='true' && !campaignNotes)
      throw new Error('Campaign Note folders require campaign Notes');
    const campaignFolders=campaignFoldersFlag==='true'?createCampaignFoldersService({pool}):null;
    const notesPanelFlag=process.env.AUTH_VTT_ORIGINAL_NOTES_PANEL_ENABLED;
    if(notesPanelFlag && !['true','false'].includes(notesPanelFlag))
      throw new Error('Unsupported AUTH_VTT_ORIGINAL_NOTES_PANEL_ENABLED value');
    if(notesPanelFlag==='true' && (!campaignNotes||!campaignFolders))
      throw new Error('Original Notes panel requires campaign Notes and folders');
    const notesPanelEnabled=notesPanelFlag==='true';
    // Staging-only WebRTC signaling: opt-in, not game data transport.
    const signalingFlag=process.env.AUTH_VTT_SIGNALING_ENABLED;
    if(signalingFlag&&!['true','false'].includes(signalingFlag))
      throw new Error('Unsupported AUTH_VTT_SIGNALING_ENABLED value');
    if(signalingFlag==='true'){
      if(!campaigns)throw new Error('Signaling requires staging campaigns and SQL 016');
      signalingIdentity=createSignalingIdentityService({getSessionUser,pool,campaigns});
    }
    const gameSessionFlag=process.env.AUTH_VTT_GAME_SESSION_ENABLED;
    if(gameSessionFlag&&!['true','false'].includes(gameSessionFlag))
      throw new Error('Unsupported AUTH_VTT_GAME_SESSION_ENABLED value');
    if(gameSessionFlag==='true'&&!signalingIdentity)
      throw new Error('Game sessions require authenticated signaling');
    const gameSessionBootstrap=gameSessionFlag==='true'?
      createGameSessionBootstrap({campaigns,playerCharacters,pool}):null;
    const turnFlag=process.env.AUTH_VTT_TURN_ENABLED;
    if(turnFlag&&!['true','false'].includes(turnFlag))
      throw new Error('Unsupported AUTH_VTT_TURN_ENABLED value');
    if(turnFlag==='true'){
      if(!signalingIdentity)throw new Error('TURN requires authenticated staging signaling');
      const secret=parseTurnSharedSecret(await readFile(required('TURN_SHARED_SECRET_FILE')));
      const urls=required('TURN_URLS').split(',').map(x=>x.trim());
      // Must match separately provisioned coturn use-auth-secret configuration.
      // No default relay address, password or production activation.
      turnCredentials=createTurnCredentialService({
        identity:signalingIdentity,sharedSecret:secret,urls,
      });
    }
    authHandler = createAuthHttpHandler({origin, login, getSessionUser, revokeSession, oauth,passwordReset,signupService,campaigns,campaignInvites,chapters,scenes,narrativeContent,equipmentCatalog,campaignDocuments,campaignChat,diceFormulas,visualAssets,characters,entityNotes,narrativeEntityNotes,campaignNotes,campaignFolders,notesPanelEnabled,campaignRoster,characterAvailability,characterAssignments,playerCharacters,characterClaims,characterPortraits,logicalCharacters,unassignedCatalog,unassignedCatalogNotes,nativeCatalog,nativeCatalogNotes,turnCredentials,gameSessionBootstrap});
  } else if (process.env.AUTH_VTT_NATIVE_CATALOG_ENABLED === 'true') {
    throw new Error('Native catalog requires authenticated runtime');
  } else if (process.env.AUTH_VTT_CHARACTER_CATALOG_ENABLED === 'true') {
    throw new Error('Character catalog requires authenticated runtime');
  } else if (process.env.AUTH_VTT_NARRATIVE_CONTENT_ENABLED === 'true') {
    throw new Error('Narrative content requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_SCENES_ENABLED === 'true') {
    throw new Error('Scenes require dedicated auth staging');
  } else if (process.env.AUTH_VTT_CHAPTERS_ENABLED === 'true') {
    throw new Error('Chapters require dedicated auth staging');
  } else if (process.env.AUTH_VTT_TURN_ENABLED === 'true') {
    throw new Error('TURN requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_SIGNALING_ENABLED === 'true') {
    throw new Error('Signaling requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_CHARACTER_PORTRAITS_ENABLED === 'true') {
    throw new Error('Portrait storage requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_CHARACTER_CLAIMS_ENABLED === 'true') {
    throw new Error('Character claims require dedicated auth staging');
  } else if (process.env.AUTH_VTT_PLAYER_CHARACTERS_ENABLED === 'true') {
    throw new Error('Player character reads require dedicated auth staging');
  } else if (process.env.AUTH_VTT_CHARACTER_ASSIGNMENTS_ENABLED === 'true') {
    throw new Error('Character assignments require dedicated auth staging');
  } else if (process.env.AUTH_VTT_CHARACTER_AVAILABILITY_ENABLED === 'true') {
    throw new Error('Character availability requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_CHARACTER_LOGIC_ENABLED === 'true') {
    throw new Error('Character logical ownership requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_CAMPAIGN_ROSTER_ENABLED === 'true') {
    throw new Error('Campaign roster requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_ORIGINAL_NOTES_PANEL_ENABLED === 'true') {
    throw new Error('Original Notes panel requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_CAMPAIGN_NOTE_FOLDERS_ENABLED === 'true') {
    throw new Error('Campaign Note folders require dedicated staging');
  } else if (process.env.AUTH_VTT_CAMPAIGN_NOTES_ENABLED === 'true') {
    throw new Error('Campaign notes require dedicated staging');
  } else if (process.env.AUTH_VTT_NARRATIVE_ENTITY_NOTES_ENABLED === 'true') {
    throw new Error('Narrative entity notes require dedicated auth staging');
  } else if (process.env.AUTH_VTT_ENTITY_NOTES_ENABLED === 'true') {
    throw new Error('Entity notes require dedicated staging');
  } else if (process.env.AUTH_VTT_CHARACTERS_ENABLED === 'true') {
    throw new Error('Characters require staging');
  } else if (process.env.AUTH_VTT_CAMPAIGNS_ENABLED === 'true') {
    throw new Error('Campaigns require dedicated staging');
  } else if (process.env.AUTH_SIGNUP_ENABLED === 'true') {
    throw new Error('Signup requires dedicated auth staging');
  } else if (process.env.AUTH_OAUTH_ENABLED === 'true') {
    throw new Error('OAuth requires dedicated auth staging');
  } else if (process.env.AUTH_PASSWORD_RESET_ENABLED === 'true') {
    throw new Error('Password reset requires dedicated auth staging');
  } else if (process.env.AUTH_STAGING_ENABLED) {
    throw new Error('Unsupported AUTH_STAGING_ENABLED value');
  } else if (process.env.AUTH_PRODUCTION_ENABLED) {
    throw new Error('Unsupported AUTH_PRODUCTION_ENABLED value');
  }

  const app = createApp({ checkDatabase: () => pool.query('SELECT 1'), authHandler });
  const signalingGateway=signalingIdentity?createSignalingWebSocketGateway({
    server:app,origin:required('AUTH_ORIGIN'),identity:signalingIdentity,
  }):null;
  const port = Number(process.env.PORT ?? 3000);
    app.listen(port, process.env.API_BIND_HOST??'0.0.0.0', () => console.log('Hollowgate API listening'));

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    signalingGateway?.close();
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    app.close(async () => {
      try {
        await pool.end();
        process.exitCode = 0;
      } catch {
        process.exitCode = 1;
      }
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
main().catch((error) => {
  console.error('Failed to start Hollowgate API:', error.message);
  process.exitCode = 1;
});
