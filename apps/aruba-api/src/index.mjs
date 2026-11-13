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
import {createCampaignService} from './campaign-service.mjs';
import {createCampaignRosterService} from './campaign-roster-service.mjs';
import {createCharacterService} from './character-service.mjs';
import {createCharacterAvailabilityService} from './character-availability-service.mjs';
import {createCharacterAssignmentService} from './character-assignment-service.mjs';
import {createPlayerCharacterService} from './player-character-service.mjs';
import {createCharacterPortraitService} from './character-portrait-service.mjs';
import {createEntityNotesService} from './entity-notes-service.mjs';
import {createCampaignNotesService} from './campaign-notes-service.mjs';
import {createCampaignFoldersService} from './campaign-folders-service.mjs';

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

  // Never enable auth on the main API, on another database, or with an owner role.
  let authHandler = null;
  if (process.env.AUTH_STAGING_ENABLED === 'true') {
    if (process.env.PGDATABASE !== 'hollowgate_auth_test' ||
        process.env.PGUSER !== 'hollowgate_auth_app') {
      throw new Error('Auth staging requires the dedicated test database and restricted user');
    }
    const keyPath = required('AUTH_RATE_LIMIT_KEY_FILE');
    const hmacKey = await readFile(keyPath);
    if (hmacKey.length < 32) throw new Error('Auth rate-limit key is too short');
    const origin = required('AUTH_ORIGIN');
    const login = createLoginService({pool, verifyPassword, hmacKey});
    const {getSessionUser, revokeSession} = createSessionRepository({pool});
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
      passwordReset = createPasswordResetService({pool,mailer:await getMailer(),hmacKey});
    } else if (resetFlag && resetFlag !== 'false') {
      throw new Error('Unsupported AUTH_PASSWORD_RESET_ENABLED value');
    }
    const signupFlag=process.env.AUTH_SIGNUP_ENABLED;
    if (signupFlag === 'true') {
      signupService=createSignupService({pool,mailer:await getMailer(),hmacKey});
    } else if (signupFlag && signupFlag !== 'false') {
      throw new Error('Unsupported AUTH_SIGNUP_ENABLED value');
    }
    // Campaigns are disabled unless explicitly opted in AND migration 008
    // has been applied to the disposable test database.
    const campaignsFlag=process.env.AUTH_VTT_CAMPAIGNS_ENABLED;
    if (campaignsFlag && campaignsFlag !== 'false' && campaignsFlag !== 'true')
      throw new Error('Unsupported AUTH_VTT_CAMPAIGNS_ENABLED value');
    const campaigns=campaignsFlag==='true'?createCampaignService({pool}):null;
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
    authHandler = createAuthHttpHandler({origin, login, getSessionUser, revokeSession, passwordReset,signupService,campaigns,characters,entityNotes,campaignNotes,campaignFolders,notesPanelEnabled,campaignRoster,characterAvailability,characterAssignments,playerCharacters,characterPortraits});
  } else if (process.env.AUTH_VTT_CHARACTER_PORTRAITS_ENABLED === 'true') {
    throw new Error('Portrait storage requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_PLAYER_CHARACTERS_ENABLED === 'true') {
    throw new Error('Player character reads require dedicated auth staging');
  } else if (process.env.AUTH_VTT_CHARACTER_ASSIGNMENTS_ENABLED === 'true') {
    throw new Error('Character assignments require dedicated auth staging');
  } else if (process.env.AUTH_VTT_CHARACTER_AVAILABILITY_ENABLED === 'true') {
    throw new Error('Character availability requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_CAMPAIGN_ROSTER_ENABLED === 'true') {
    throw new Error('Campaign roster requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_ORIGINAL_NOTES_PANEL_ENABLED === 'true') {
    throw new Error('Original Notes panel requires dedicated auth staging');
  } else if (process.env.AUTH_VTT_CAMPAIGN_NOTE_FOLDERS_ENABLED === 'true') {
    throw new Error('Campaign Note folders require dedicated staging');
  } else if (process.env.AUTH_VTT_CAMPAIGN_NOTES_ENABLED === 'true') {
    throw new Error('Campaign notes require dedicated staging');
  } else if (process.env.AUTH_VTT_ENTITY_NOTES_ENABLED === 'true') {
    throw new Error('Entity notes require dedicated staging');
  } else if (process.env.AUTH_VTT_CHARACTERS_ENABLED === 'true') {
    throw new Error('Characters require staging');
  } else if (process.env.AUTH_VTT_CAMPAIGNS_ENABLED === 'true') {
    throw new Error('Campaigns require dedicated staging');
  } else if (process.env.AUTH_SIGNUP_ENABLED === 'true') {
    throw new Error('Signup requires dedicated auth staging');
  } else if (process.env.AUTH_PASSWORD_RESET_ENABLED === 'true') {
    throw new Error('Password reset requires dedicated auth staging');
  } else if (process.env.AUTH_STAGING_ENABLED) {
    throw new Error('Unsupported AUTH_STAGING_ENABLED value');
  }

  const app = createApp({ checkDatabase: () => pool.query('SELECT 1'), authHandler });
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, '0.0.0.0', () => console.log('Hollowgate API listening'));

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
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
