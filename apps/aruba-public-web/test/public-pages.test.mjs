import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildPublicPages} from '../build.mjs';

// Frozen from archive/legacy-pre-aruba-20261122 (e9f31ab6), not from the
// Aruba candidate. Detect layout/text drift without needing Git tags in CI.
test('legal layout and default body remain identical to the archived original',async()=>{
 const digest=value=>createHash('sha256').update(value).digest('hex');
 const expected={
  'PrivacyPolicy.tsx':'e948a7a9af29edce06f4361686a8fe93901ef05c56ca544de780ed69fd0ec3e7',
  'DeleteData.tsx':'2fc8c14345f0cdc46765454a7f389bd2a402fad9b3094b7ff100590a6071401b',
 };
 for(const [file,bodyHash] of Object.entries(expected)){
  const source=(await readFile(new URL('../../../src/app/legal/'+file,import.meta.url),'utf8')).replaceAll('\r\n','\n');
  const styles=[...source.matchAll(/^const \w+Style: React\.CSSProperties = \{.*?^\};/gms)].map(m=>m[0]).join('\n');
  assert.equal(digest(styles),'cb81dace1cad3d80653e11d942f5c53a3f22a137cbb0074be06634a42723736a');
  const originalBody=source.slice(source.indexOf('  return ('))
   .replace('{storageProvider}','Supabase (infrastruttura cloud)')
   .replace('{socialProviders}','Google, Discord o Facebook').replace('{updatedAt}','giugno 2026');
  assert.equal(digest(originalBody),bodyHash,file+' differs from archived original body');
 }
});

test('public pages render actual original components, offline and without client scripts',async()=>{
 const temp=process.platform==='win32'&&process.env.LOCALAPPDATA?join(process.env.LOCALAPPDATA,'Temp','opencode'):tmpdir();
 const output=await mkdtemp(join(temp,'hg-public-pages-'));
 try{
  const manifest=await buildPublicPages(output);
  assert.deepEqual(manifest.pages.map(p=>p.path),['/privacy','/elimina-dati']);
  assert.match(manifest.originalStyles.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.originalStyles.sources.map(s=>s.source),
   ['src/styles/index.css','src/styles/fonts.css','src/styles/tailwind.css','src/styles/theme.css']);
  for(const page of manifest.pages){
   const html=await readFile(join(output,page.file),'utf8');
   assert.match(html,/<html lang="it">/);assert.match(html,/<h1 style=/);
   assert.match(html,/@layer base/);
   assert.match(html,/href="\/"/);assert.match(html,/mailto:/);
   assert.doesNotMatch(html,/<script|<iframe|supabase|fetch\(|localhost|127\.0\.0\.1/i);
   assert.equal(createHash('sha256').update(html).digest('hex'),page.sha256);
   assert.match(page.sourceSha256,/^[a-f0-9]{64}$/);
  }
  const privacy=await readFile(join(output,'privacy.html'),'utf8');
  assert.match(privacy,/Aruba \(database PostgreSQL\)/);assert.match(privacy,/Google o Discord/);
  assert.doesNotMatch(privacy,/Facebook/);assert.match(privacy,/href="\/elimina-dati"/);
  const removal=await readFile(join(output,'elimina-dati.html'),'utf8');
  assert.match(removal,/Richiesta cancellazione dati/);assert.match(removal,/entro 30 giorni/);
  const source=await readFile(fileURLToPath(new URL('../../../src/app/legal/PrivacyPolicy.tsx',import.meta.url)),'utf8');
  assert.match(source,/storageProvider = 'Supabase \(infrastruttura cloud\)'/);
  assert.match(source,/socialProviders = 'Google, Discord o Facebook'/);
 }finally{await rm(output,{recursive:true,force:true});}
});
