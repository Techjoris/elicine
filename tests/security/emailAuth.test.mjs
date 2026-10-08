import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailAuth, RESET_EMAIL_MESSAGE } from '../../src/lib/emailAuth.js';
import { createAuthHandler } from '../../api/auth.js';

function client(overrides={}) {
  const calls=[];
  const auth={
    signUp:async body=>{calls.push(['signup',body]);return {data:{user:{id:'member'},session:null}};},
    signInWithPassword:async body=>{calls.push(['login',body]);return {error:{code:'invalid_credentials',message:'Invalid login credentials'}};},
    resend:async body=>{calls.push(['resend',body]);return {error:null};},
    resetPasswordForEmail:async(...body)=>{calls.push(['recover',...body]);return {error:null};},
    getUser:async()=>({data:{user:{id:'member',email_confirmed_at:'2026-10-08'}}}),
    updateUser:async body=>{calls.push(['update',body]);return {error:null};},
    signOut:async body=>{calls.push(['logout',body]);return {error:null};},
    ...overrides
  };
  return { auth, calls };
}
const origin=()=> 'https://elicine.vercel.app';
test('signup sends the confirmation request and exposes neither a session nor a local account',async()=>{
  const db=client(); const result=await createEmailAuth(db,origin).register(' Alice@Example.com ','SecurePass9','Alice');
  assert.deepEqual(result,{success:true,pendingVerification:true});
  assert.equal(db.calls[0][1].email,'alice@example.com');
  assert.equal(db.calls[0][1].options.emailRedirectTo,'https://elicine.vercel.app/');
});
test('unexpected autoconfirm response cannot open a signup session',async()=>{
  const db=client({signUp:async()=>({data:{user:{id:'member'},session:{access_token:'unsafe'}}})});
  assert.equal((await createEmailAuth(db,origin).register('a@b.com','SecurePass9','Alice')).pendingVerification,true);
  assert.deepEqual(db.calls,[['logout',{scope:'local'}]]);
});
test('wrong or short passwords are checked by Auth and propose email recovery',async()=>{
  const db=client(); const result=await createEmailAuth(db,origin).login('alice@example.com','wrong');
  assert.equal(db.calls[0][0],'login');
  assert.equal(result.errorCode,'invalid_credentials');
  assert.match(result.error,/réinitialiser/);
});
test('unconfirmed email is refused, while a confirmed password account signs in',async()=>{
  for(const confirmed of [null,'2026-10-08']) {
    const db=client({signInWithPassword:async()=>({data:{user:{id:'member',email_confirmed_at:confirmed},session:{access_token:'test'}}})});
    const result=await createEmailAuth(db,origin).login('alice@example.com','password');
    assert.equal(result.success,Boolean(confirmed));
    if(!confirmed)assert.equal(result.errorCode,'email_not_confirmed');
  }
});
test('resend is a real Supabase resend and provider failures never simulate an email',async()=>{
  const db=client(); assert.equal((await createEmailAuth(db,origin).resendConfirmation('alice@example.com')).success,true);
  assert.equal(db.calls[0][0],'resend');
  const broken=client({resend:async()=>({error:{code:'over_email_send_rate_limit'}})});
  assert.equal((await createEmailAuth(broken,origin).resendConfirmation('alice@example.com')).success,false);
});
test('recovery requests use the reset route and never reveal whether an account exists',async()=>{
  const db=client(); const flow=createEmailAuth(db,origin);
  for(const email of ['member@example.com','unknown@example.com'])assert.equal((await flow.requestPasswordReset(email)).message,RESET_EMAIL_MESSAGE);
  assert.equal(db.calls[0][2].redirectTo,'https://elicine.vercel.app/update-password');
});
test('an expired or absent recovery session cannot change a password',async()=>{
  const db=client({getUser:async()=>({data:{user:null},error:{code:'session_not_found'}})});
  assert.equal((await createEmailAuth(db,origin).updatePassword('SecurePass9')).success,false);
  assert.equal(db.calls.length,0);
});
test('successful recovery changes the password and revokes refresh sessions on every device',async()=>{
  const db=client(); assert.equal((await createEmailAuth(db,origin).updatePassword('SecurePass9')).success,true);
  assert.deepEqual(db.calls,[['update',{password:'SecurePass9'}],['logout',{scope:'global'}]]);
});
test('legacy send-verification API really calls Supabase and does not claim fake delivery',async()=>{
  const db=client(); const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};
  await createAuthHandler(()=>db,origin)({method:'POST',headers:{},socket:{remoteAddress:'auth-test'},query:{action:'send-verification'},body:{email:'alice@example.com',messageId:'fake'}},res);
  assert.equal(res.code,200); assert.equal(db.calls[0][0],'resend'); assert.equal(res.body.messageId,undefined);
});
