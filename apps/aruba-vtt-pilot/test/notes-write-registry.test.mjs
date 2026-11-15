import test from 'node:test';
import assert from 'node:assert/strict';
import {registerArubaNoteWrite,awaitArubaNoteWrites,subscribeArubaNoteError}
 from '../src/ArubaNotesWriteRegistry.mjs';
test('closing waits for last character note save and rejects if it failed',async()=>{
 const c='a',e='b';let release;
 const wait=new Promise(resolve=>{release=resolve;});
 registerArubaNoteWrite(c,e,'n1',wait);
 let finished=false;
 const pending=awaitArubaNoteWrites(c,e).then(()=>{finished=true;});
 await Promise.resolve();assert.equal(finished,false);
 release();await pending;assert.equal(finished,true);
 let reject;
 const broken=new Promise((_,r)=>{reject=r;});
 const errors=[];const off=subscribeArubaNoteError(c,e,x=>errors.push(x));
 registerArubaNoteWrite(c,e,'n1',broken);
 const closing=assert.rejects(()=>awaitArubaNoteWrites(c,e),/non salvato/);
 reject(Error('Contenuto non salvato'));await closing;
 await Promise.resolve();
 assert.equal(errors.at(-1),'Contenuto non salvato');
 await assert.rejects(()=>awaitArubaNoteWrites(c,e),/non salvato/);
 off();
 const fixed=Promise.resolve();
 registerArubaNoteWrite(c,e,'n1',fixed);await fixed;
 await Promise.resolve();awaitArubaNoteWrites(c,e);
});
test('writes from separate character contexts never block each other',async()=>{
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 registerArubaNoteWrite('camp','character-A','note',pending);
 await awaitArubaNoteWrites('camp','character-B');
 release();await awaitArubaNoteWrites('camp','character-A');
});
