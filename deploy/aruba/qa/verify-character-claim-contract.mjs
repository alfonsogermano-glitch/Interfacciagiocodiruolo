import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const contract=JSON.parse(readFileSync(path.join(root,'deploy/aruba/qa/character-claim-contract.json'),'utf8'));
const failures=[];
const check=(value,message)=>{if(!value)failures.push(message);};
check(contract.schemaVersion===1,'Unsupported claim contract schema');
check(['blocked','verified'].includes(contract.status),'Invalid claim contract status');
check(contract.activationPolicy?.allowPartialCapability===false,'Partial claim capability must remain forbidden');
check(contract.activationPolicy?.requiresRealPostgres===true,'Real PostgreSQL proof is mandatory');
check(contract.activationPolicy?.requiresTwoBrowserAccounts===true,'Two-account race proof is mandatory');
const ids=new Set();
for(const boundary of contract.requiredBoundaries??[]){
 check(typeof boundary.id==='string'&&!ids.has(boundary.id),'Invalid or duplicate claim boundary: '+boundary.id);
 ids.add(boundary.id);
 check(['missing','implemented-unverified','verified'].includes(boundary.state),'Invalid boundary state: '+boundary.id);
 check(typeof boundary.evidence==='string'&&boundary.evidence.length>30,'Missing boundary evidence: '+boundary.id);
 if(boundary.source)check(existsSync(path.join(root,boundary.source)),'Missing claim source: '+boundary.source);
}
check(ids.size===9,'Expected nine atomic claim boundaries, got '+ids.size);
if(contract.status==='verified'){
 for(const boundary of contract.requiredBoundaries)check(boundary.state==='verified','Claim verified with incomplete boundary: '+boundary.id);
}
if(process.argv.includes('--release')){
 check(contract.status==='verified','CHARACTER CLAIM RELEASE BLOCKED');
 for(const boundary of contract.requiredBoundaries)check(boundary.state==='verified','UNVERIFIED CLAIM BOUNDARY: '+boundary.id);
}
if(failures.length){console.error('CHARACTER CLAIM CONTRACT FAILED ('+failures.length+')');for(const failure of failures)console.error(' - '+failure);process.exitCode=1;}
else console.log('CHARACTER CLAIM CONTRACT VALID: '+ids.size+' atomic boundaries; status '+contract.status+'.');
