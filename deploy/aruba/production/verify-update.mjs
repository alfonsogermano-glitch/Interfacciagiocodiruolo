// Local-only update checks. No SSH, credentials, packaging or deployment.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const id=new Date().toISOString().replace(/[:.]/g,'-');
const output=join(root,'.local','update-checks',id);
mkdirSync(output,{recursive:true});
const report={status:'BLOCKED',steps:[],releaseReady:false,
 remaining:['VPS configuration equivalence','isolated PostgreSQL restore',
 'private acceptance and browser tests','reviewed promotion/rollback runner']};
const testFiles=folder=>readdirSync(join(root,folder)).filter(n=>n.endsWith('.test.mjs'))
 .sort().map(n=>resolve(root,folder,n));
function run(name,command,args,cwd=root,env={}){
 console.log(`CHECK ${name}`);
 const result=spawnSync(command,args,{cwd,env:{...process.env,...env},
  encoding:'utf8',maxBuffer:32*1024*1024,shell:false});
 writeFileSync(join(output,name+'.log'),
  (result.stdout??'')+(result.stderr??'')+(result.error?'\n'+result.error.message:''));
 const passed=result.status===0&&!result.signal&&!result.error;
 report.steps.push({name,passed,exitCode:result.status,signal:result.signal??null});
 writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(`${passed?'PASS':'FAIL'} ${name}`);
 if(!passed)throw Error(name+' failed; deployment remains blocked');
 return result.stdout;
}
try{
 report.commit=run('commit','git',['rev-parse','HEAD']).trim();
 run('api',process.execPath,['--test','--test-reporter=tap',
  ...testFiles('apps/aruba-api/test')]);
 run('frontend',process.execPath,['--test','--test-reporter=tap',
  ...testFiles('apps/aruba-vtt-pilot/test')]);
 run('historical-db',process.execPath,['--test','--test-reporter=tap',
  'deploy/aruba/qa/storico-png-mostri-db.test.mjs']);
 run('catalog-db',process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',
  ...['unassigned-catalog-db','catalog-notes-duplication-db','catalog-assign-copy-db',
   'native-catalog-lifecycle-db','logical-character-catalog-db','character-lifecycle-db',
   'native-campaign-catalog-db'].map(name=>'deploy/aruba/qa/'+name+'.test.mjs')]);
 const app=join(root,'apps','aruba-vtt-pilot');
 const vite=join(root,'node_modules','vite','bin','vite.js');
 run('public-build',process.execPath,[vite,'build','--config','vite.config.mjs',
  '--outDir',join(output,'public')],app,{HG_CATALOG_CONTRACT:''});
 run('contract-build',process.execPath,[vite,'build','--config','vite.config.mjs',
  '--outDir',join(output,'contract')],app,{HG_CATALOG_CONTRACT:'1'});
 report.status='LOCAL_CHECKS_PASSED_NOT_RELEASE_READY';
}catch(error){
 console.error(error.message);
 process.exitCode=1;
}finally{
 writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
 console.log('REPORT '+join(output,'report.json'));
 console.log('No VPS changes. Release is NOT authorized by this report.');
}
