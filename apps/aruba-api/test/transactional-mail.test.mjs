import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransactionalMailer,createPasswordActionEmail} from '../src/transactional-mail.mjs';

test('Resend adapter uses configured domain and idempotency without leaking key',async()=>{
  let request;
  const mailer=createTransactionalMailer({apiKey:'re_test_mock_only',fetchImpl:async(url,options)=>{
    request={url,...options};
    return {ok:true,json:async()=>({id:'mock-id'})};
  }});
  const result=await mailer.send({to:'tester@example.org',subject:'Test',text:'Only in CI',idempotencyKey:'test-event-001'});
  assert.equal(result.messageId,'mock-id');
  assert.equal(request.url,'https://api.resend.com/emails');
  assert.equal(request.headers.Authorization,'Bearer re_test_mock_only');
  assert.equal(request.headers['Idempotency-Key'],'test-event-001');
  assert.deepEqual(JSON.parse(request.body),{from:'Hollowgate <no-reply@hollowgate.quest>',to:['tester@example.org'],subject:'Test',text:'Only in CI'});
});
test('provider failure is generic, never includes credentials',async()=>{
  const mailer=createTransactionalMailer({apiKey:'re_test_mock_only',fetchImpl:async()=>({ok:false,status:403,text:async()=>('secret diagnostics')})});
  await assert.rejects(()=>mailer.send({to:'tester@example.org',subject:'Test',text:'Text',idempotencyKey:'test-event-002'}),err=>{
    assert.equal(err.message,'Mail provider rejected request');
    return true;
  });
});
test('password link accepts only random token and HTTPS origin',()=>{
  const token='x'.repeat(43);
  const result=createPasswordActionEmail({purpose:'password_reset',token});
  assert.match(result.subject,/Hollowgate/);
  assert.match(result.text,/scade dopo 30 minuti/);
  assert.match(result.text,/https:\/\/staging\.hollowgate\.quest\/account\/password/);
  assert.doesNotMatch(result.text,/password=/);
  assert.throws(()=>createPasswordActionEmail({purpose:'password_reset',token:'bad'}));
  assert.throws(()=>createPasswordActionEmail({purpose:'password_reset',token,baseUrl:'http://localhost'}));
  assert.throws(()=>createPasswordActionEmail({purpose:'admin',token}));
});
test('no network occurs when only constructing a mailer',()=>{
  createTransactionalMailer({apiKey:'re_test_mock_only',fetchImpl:()=>{throw new Error('must not send')}});
});
