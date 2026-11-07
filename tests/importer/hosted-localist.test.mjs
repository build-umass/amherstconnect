import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hostedTransport,sourceFetch,resolveHostedMappings,runHostedSync,TARGET} from '../../scripts/importer/hosted-localist.mjs';
const approved=JSON.parse(readFileSync('scripts/importer/localist-local-catalog.json'));
const key=`x.${Buffer.from(JSON.stringify({role:'service_role',ref:'qcoqrutsrjfxcwhplrhi'})).toString('base64url')}.x`;
test('target and privileged project identity enforced',()=>{
 for(const u of ['http://localhost',TARGET+'/', 'https://other.supabase.co'])assert.throws(()=>hostedTransport(u,key));
 for(const k of ['', 'sb_publishable_invalid'])assert.throws(()=>hostedTransport(TARGET,k));
});
test('required categories fail, absent optional catalogs do not fail preflight',async()=>{
 const t=async p=>p.startsWith('categories?')?approved.catalog.categories.filter(c=>p.includes(c.slug)):[];
 const m=await resolveHostedMappings(approved,t);assert.equal(Object.keys(m.categories).length,8);assert.equal(Object.keys(m.venues).length,0);assert.equal(m.review.length,0);
 await assert.rejects(resolveHostedMappings(approved,async()=>[]));
});
test('deadline aborts in-flight reads and source requests without retries',async()=>{
 for(const mode of ['source','database']){
  let calls=0;const fetchImpl=(_u,o)=>{calls++;return new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(Error('abort')),{once:true}));};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30);
  const call=mode==='source'?sourceFetch(fetchImpl,{signal:controller.signal})('https://events.umass.edu'):hostedTransport(TARGET,key,fetchImpl,{signal:controller.signal})('categories');
  await assert.rejects(call);clearTimeout(timer);assert.equal(calls,1);
 }
});
test('cleanup failure retains original source failure and previous freshness',async()=>{
 const transport=async(p,o)=>{
  if(p.startsWith('localist_sync_runs'))return[{finished_at:'2026-01-01T00:00:00Z'}];
  if(p==='rpc/begin_localist_sync')return 'fake-run';
  if(p==='rpc/finish_localist_sync')throw Error('cleanup');
  if(p.startsWith('import_runs'))return [];
  return approved.catalog.categories.filter(c=>p.includes(c.slug));
 };
 const r=await runHostedSync({approved,transport,range:{start:'2026-11-03',end:'2026-11-04'},fetchImpl:async()=>({ok:false,status:400})});
 assert.equal(r.failurePhase,'source');assert.equal(r.cleanupFailed,true);assert.equal(r.lastSuccessfulSync,'2026-01-01T00:00:00Z');
});
test('read retries bounded, ordinary writes never retried, finalization replay safe',async()=>{
 let n=0;const t=hostedTransport(TARGET,key,async()=>{n++;return{ok:false,status:503};});await assert.rejects(t('categories'));assert.equal(n,3);
 n=0;await assert.rejects(t('rpc/begin_localist_sync',{method:'POST',body:{}}));assert.equal(n,1);
 n=0;const finish=hostedTransport(TARGET,key,async()=>{n++;if(n===1)throw Error('lost');return{ok:true,status:200,json:async()=>true};});assert.equal(await finish('rpc/finish_localist_sync',{method:'POST',body:{}}),true);assert.equal(n,2);
});
