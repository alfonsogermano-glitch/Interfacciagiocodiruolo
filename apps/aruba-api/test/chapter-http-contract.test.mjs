import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('chapter HTTP routes remain staging opt-in, authenticated, and owner-derived',()=>{
 const auth=read('../src/auth-http.mjs');
 const entry=read('../src/index.mjs');
 assert.match(entry,/AUTH_VTT_CHAPTERS_ENABLED/);
 assert.match(entry,/createChapterService\(\{pool\}\)/);
 assert.match(entry,/signupService,campaigns,campaignInvites,chapters,scenes,narrativeContent,equipmentCatalog,campaignDocuments,campaignChat,diceFormulas,visualAssets,characters/);
 assert.match(auth,/chapters\.list\(user\.id,match\[1\]\)/);
 assert.match(auth,/chapters\.save\(user\.id,match\[1\],await readJson/);
 assert.match(auth,/chapters\.remove\(user\.id,match\[1\],match\[2\]\)/);
 assert.match(auth,/req\.headers\.origin!==origin/);
 assert.match(auth,/if\(!token\)return response\(res,401/);
});
