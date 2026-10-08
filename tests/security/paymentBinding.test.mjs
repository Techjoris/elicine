import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import crypto from 'node:crypto';
import { proPrice, ownsSubscription, gatewayMatchesSubscription } from '../../api/_payment-security.js';
import { createSaspayHandler, getSaspayCredentials } from '../../api/saspay.js';
const USER='11111111-1111-1111-1111-111111111111';
const OTHER='22222222-2222-2222-2222-222222222222';
const sub={id:'sub_test',user_id:USER,email:'alice@example.com',plan:'monthly',amount:1300,currency:'XOF',payment_reference:'paid_session_123'};
test('gateway credentials never come from a user request',()=>{
  const saved={...process.env};
  for(const key of ['saspay_Backend','SASPAY_BACKEND','saspay_backend','SASPAY_SECRET_KEY','SASPAY_API_KEY'])delete process.env[key];
  try{assert.equal(getSaspayCredentials({headers:{authorization:'Bearer attacker','x-saspay-key':'attacker'},body:{apiKey:'attacker',secretKey:'attacker'}}).apiKey,'');}
  finally{for(const key of ['saspay_Backend','SASPAY_BACKEND','saspay_backend','SASPAY_SECRET_KEY','SASPAY_API_KEY']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
test('ownership and exact paid price/currency/reference are required',()=>{
  const proof={isSuccess:true,data:{id:'paid_session_123',amount:1300,currency:'XOF',customer_email:'alice@example.com'}};
  assert.equal(proPrice('XOF','monthly'),1300);
  assert.equal(ownsSubscription(sub,{id:OTHER}),false);
  assert.equal(gatewayMatchesSubscription(proof,sub),true);
  for(const data of [{amount:1},{currency:'EUR'},{id:'stolen_payment'},{customer_email:'mallory@example.com'}])assert.equal(gatewayMatchesSubscription({...proof,data:{...proof.data,...data}},sub),false);
});
const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;},end(){return this;}});
test('anonymous subscription reads and unsigned payment notifications are denied',async()=>{
  const handler=createSaspayHandler({database:null,authenticate:async()=>({isAuthenticated:false})});
  for(const action of ['init-subscription','get-subscription','verify-subscription']){
    const res=response();await handler({method:'POST',headers:{},socket:{remoteAddress:`payment-${action}`},query:{action},body:{email:'victim@example.com'}},res);assert.equal(res.code,401);
  }
  const res=response();await handler({method:'POST',headers:{},query:{action:'webhook'},body:{event:'transaction.success',data:{id:'paid_session_123',email:'victim@example.com',status:'PAID'}}},res);assert.equal(res.code,401);
});
test('webhook signatures use the exact original body, including whitespace',async()=>{
  const old=process.env.SASPAY_WEBHOOK_SECRET;
  process.env.SASPAY_WEBHOOK_SECRET='test-webhook-secret';
  const raw='{"event": "transaction.success",\n "data": {"id":"paid_session_123","status":"PAID"}}';
  const signature=crypto.createHmac('sha256','test-webhook-secret').update(raw).digest('hex');
  const db={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})};}};
  try{
    const res=response();
    await createSaspayHandler({database:db})({method:'POST',headers:{'x-webhook-signature':signature},query:{action:'webhook'},body:raw},res);
    assert.equal(res.code,200);
    assert.equal(res.body.status,'unknown_payment');
  }finally{if(old===undefined)delete process.env.SASPAY_WEBHOOK_SECRET;else process.env.SASPAY_WEBHOOK_SECRET=old;}
});
test('PostgreSQL payment activation is atomic, private and cannot extend a repeated payment',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '${USER}'::uuid $$;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create table profiles(id uuid primary key,email text,is_pro boolean default false,expires_at timestamptz,updated_at timestamptz);
      grant all on profiles to service_role;
      insert into auth.users values('${USER}','alice@example.com',now()),('${OTHER}','other@example.com',now());
      insert into profiles(id,email) values('${USER}','alice@example.com'),('${OTHER}','other@example.com');`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261008080535_secure_payment_binding.sql',import.meta.url),'utf8'));
    await db.exec(`insert into subscriptions(id,user_id,email,plan,currency,amount,payment_reference,payment_provider) values('sub_test','${USER}','alice@example.com','monthly','XOF',1300,'paid_session_123','saspay');`);
    await db.exec('set role authenticated');
    await assert.rejects(db.exec(`select complete_saspay_subscription('sub_test','paid_session_123')`),/permission denied/);
    await assert.rejects(db.exec(`select * from saspay_payment_events`),/permission denied/);
    await assert.rejects(db.exec(`update subscriptions set status='active'`),/permission denied/);
    await db.exec('reset role;set role service_role');
    await db.exec(`reset role; insert into auth.sessions values('33333333-3333-3333-3333-333333333333','${USER}',null); set role service_role;`);
    assert.equal((await db.query(`select is_active_auth_session('${USER}','33333333-3333-3333-3333-333333333333') as active`)).rows[0].active,true);
    await db.exec(`reset role; delete from auth.sessions; set role service_role;`);
    assert.equal((await db.query(`select is_active_auth_session('${USER}','33333333-3333-3333-3333-333333333333') as active`)).rows[0].active,false);
    await assert.rejects(db.exec(`select complete_saspay_subscription('sub_test','stolen_payment')`),/PAYMENT_BINDING_INVALID/);
    assert.equal((await db.query(`select complete_saspay_subscription('sub_test','paid_session_123') as result`)).rows[0].result.activated,true);
    const expires=(await db.query(`select expires_at from profiles where id='${USER}'`)).rows[0].expires_at;
    assert.equal((await db.query(`select complete_saspay_subscription('sub_test','paid_session_123') as result`)).rows[0].result.duplicate,true);
    assert.deepEqual((await db.query(`select expires_at from profiles where id='${USER}'`)).rows[0].expires_at,expires);
    assert.equal((await db.query(`select is_pro from profiles where id='${OTHER}'`)).rows[0].is_pro,false);
  }finally{await db.close();}
});
