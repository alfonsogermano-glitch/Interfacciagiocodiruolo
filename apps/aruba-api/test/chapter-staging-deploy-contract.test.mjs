import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../../deploy/aruba/scripts/apply-chapter-staging-schema.sh',import.meta.url),'utf8');
test('chapter schema deployment is explicit and staging-only',()=>{
 assert.match(source,/CHAPTER_STAGING_MIGRATION_CONFIRM/);
 assert.match(source,/hollowgate_auth_test/);
 assert.match(source,/feature\/aruba-api-foundation/);
 assert.match(source,/ON_ERROR_STOP=1/);
 assert.doesNotMatch(source,/\-d\s+(?:hollowgate_prod|hollowgate_production)\b/);
 assert.doesNotMatch(source,/AUTH_VTT_CHAPTERS_ENABLED=true/);
});
