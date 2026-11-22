import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {localLandingPlugin} from '../local-landing-plugin.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const plugin=localLandingPlugin({root});
let middleware;
plugin.configureServer({middlewares:{use(fn){middleware=fn;}}});
async function request(url,method='GET'){
  const headers={};let body;let next=false;
  const res={setHeader(name,value){headers[name]=value;},end(value){body=value;}};
  await middleware({url,method},res,()=>{next=true;});
  return {headers,body:body?.toString('utf8'),next};
}
test('local root and auth pages use the production landing without preview mode',async()=>{
  for(const path of ['/','/login','/forgot-password','/account/password']){
    const response=await request(path);
    assert.match(response.body,/id="landing"/);
    assert.doesNotMatch(response.body,/hollowgate-preview/);
    assert.equal(response.headers['Cache-Control'],'no-store');
  }
});
test('auth assets are same-origin; VTT and API routes pass to Vite/proxy',async()=>{
  assert.match((await request('/auth-ui/app.mjs?v=10')).body,/createAuthApi/);
  assert.match((await request('/auth-ui/styles.css')).body,/feature-grid/);
  for(const path of ['/auth/login','/vtt/','/vtt/campaigns'])
    assert.equal((await request(path)).next,true);
});
test('private historical media is served only when present in the local manifest',async(t)=>{
  const manifest=resolve(root,'../../deploy/aruba/data/legacy-public-media/manifest.json');
  if(!existsSync(manifest))return t.skip('private media bundle unavailable on this machine');
  const item=JSON.parse(readFileSync(manifest,'utf8')).items[0];
  const response=await request(item.publicPath);
  assert.equal(response.headers['Content-Type'],item.contentType);
  assert.ok(response.body.length>0);
  assert.equal((await request('/vtt/migrated-media/not-in-manifest.png')).next,true);
});
