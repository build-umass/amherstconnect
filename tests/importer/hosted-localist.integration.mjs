import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{execFileSync}from'node:child_process';
import{localConnection}from'../../scripts/importer/local-connection.mjs';
import{createLocalTransport,prepareRecord,payloadHash}from'../../scripts/importer/importer.mjs';
import{adaptLocalistRecords}from'../../scripts/importer/localist.mjs';
import{hostedTransport,runHostedSync,resolveHostedMappings,TARGET}from'../../scripts/importer/hosted-localist.mjs';
const approved=JSON.parse(readFileSync('scripts/importer/localist-local-catalog.json'));
const range={start:'2026-11-03',end:'2026-11-04'};
test('real pagination, adapter, mapping, fenced REST writes and recovery',async()=>{
 const c=localConnection(),key=c.SERVICE_ROLE_KEY??c.SECRET_KEY,local=createLocalTransport(c.API_URL,key);
 for(const row of approved.catalog.categories){if(!(await local('categories?id=eq.'+row.id)).length)await local('categories',{method:'POST',body:row});}
 const encoded=`x.${Buffer.from(JSON.stringify({role:'service_role',ref:'qcoqrutsrjfxcwhplrhi'})).toString('base64url')}.x`;
 let loseFinish=false,failSecond=false,writes=0;
 const dbFetch=async(url,opts)=>{
  assert.equal(new URL(url).origin,TARGET);
  const path=new URL(url).pathname;
  if(path.endsWith('hosted_import_event_record')&&failSecond&&++writes===2)throw Error('write interrupted');
  const r=await fetch(c.API_URL+path+new URL(url).search,{...opts,headers:{...opts.headers,apikey:key,Authorization:'Bearer '+key}});
  if(path.endsWith('finish_localist_sync')&&loseFinish&&r.ok){loseFinish=false;await r.text();throw Error('response lost after commit');}
  return r;
 };
 const transport=hostedTransport(TARGET,encoded,dbFetch);
 const make=id=>{
  const raw=structuredClone(JSON.parse(readFileSync('tests/fixtures/localist/normal.json')).events[0].event);
  const [ruleId,rule]=Object.entries(approved.localistFilters).find(([k,r])=>k.startsWith('event_types:')&&r.categoryLabel);
  raw.id=id;raw.title='Fictional A10 source record '+id;raw.groups=[];raw.filters={event_types:[{id:ruleId.split(':').at(-1),name:rule.label}]};
  raw.experience='virtual';raw.stream_url='https://example.test/live';raw.venue_id=null;raw.location_name=null;raw.location=null;
  raw.event_instances[0].event_instance.id=id*10;return raw;
 };
 const source=(pages,total=pages.length)=>async url=>{
  const page=Number(new URL(url).searchParams.get('page'));const events=pages[page-1];
  if(events==='fail')return{ok:false,status:400};
  return{ok:true,status:200,json:async()=>({events:events.map(event=>({event})),page:{current:page,total}})};
 };
 const run=fetchImpl=>runHostedSync({approved,transport,range,fetchImpl});
 const good=make(910001),bad=make(910002);bad.groups=[{id:999999,name:'Unmapped test organizer'}];
 const first=await run(source([[good],[bad]]));assert.equal(first.status,'completed',JSON.stringify(first));assert.equal(first.counts.created,1);assert.equal(first.counts.rejected,1);assert.ok(first.mappingReview.length);assert.ok(first.lastSuccessfulSync);
 const event=await local('events?external_id=eq.910001');const occ=await local('event_occurrences?event_id=eq.'+event[0].id);
 const repeat=await run(source([[good],[bad]]));assert.equal(repeat.counts.unchanged,1);assert.deepEqual(await local('events?external_id=eq.910001'),event);assert.deepEqual(await local('event_occurrences?event_id=eq.'+event[0].id),occ);
 const previous=repeat.lastSuccessfulSync;
 const incomplete=await run(source([[make(910003)],'fail']));assert.equal(incomplete.status,'failed');assert.equal(incomplete.lastSuccessfulSync,previous);assert.equal((await local('events?external_id=eq.910003')).length,0);
 const cap=await run(source([[good]],21));assert.equal(cap.status,'failed');assert.equal(cap.lastSuccessfulSync,previous);
 const empty=await run(source([[]],0));assert.equal(empty.status,'completed');assert.equal(empty.classification,'valid-empty');
 loseFinish=true;const lost=await run(source([[good]]));assert.equal(lost.status,'completed');assert.equal(loseFinish,false);
 failSecond=true;writes=0;const partial=await run(source([[make(910004),make(910005)]]));failSecond=false;assert.equal(partial.status,'failed');assert.equal(partial.counts.created,1);assert.equal(partial.lastSuccessfulSync,lost.lastSuccessfulSync);
 // Use real validated content and a valid hash, not a request that can fail
 // independently of the lease. Establish both RPCs work while the lease is active.
 const old=await transport('rpc/begin_localist_sync',{method:'POST',body:{}});
 const oldRun=(await local('import_runs',{method:'POST',body:{source_type:'localist',sync_id:old}}))[0].id;
 const mapped=await resolveHostedMappings(approved,local);
 const adapted=adaptLocalistRecords([make(910006)],new Date().toISOString(),mapped);
 assert.equal(adapted.rejected.length,0);assert.equal(adapted.drafts.length,1);
 const prepared=prepareRecord(adapted.drafts[0],mapped);assert.ok(prepared.draft);assert.ok(prepared.mapping);
 const body=(draft,index)=>({p_run_id:oldRun,p_record_index:index,p_draft:draft,p_mapping:prepared.mapping,p_payload_hash:payloadHash(draft),p_failure:null});
 const active=body(prepared.draft,0);
 const positive=await local('rpc/hosted_import_event_record',{method:'POST',body:{p_sync_id:old,...active}});
 assert.equal(positive.outcome,'created','valid wrapper request succeeds before lease expiry');
 const changed=structuredClone(prepared.draft);changed.title+=' active update';changed.sourceUpdatedAt='2026-11-03T00:00:00Z';
 const originalPositive=await local('rpc/import_event_record',{method:'POST',body:body(changed,1)});
 assert.equal(originalPositive.outcome,'updated','original A08 RPC works for a valid active linked run');
 const attack=structuredClone(changed);attack.title='Must never overwrite active content';attack.sourceUpdatedAt='2026-11-04T00:00:00Z';
 assert.ok(prepareRecord(attack,mapped).draft,'stale-owner write is otherwise valid');
 const staleBody=body(attack,2);assert.match(staleBody.p_payload_hash,/^[a-f0-9]{64}$/);
 const snapshot=async()=>({
  events:await local('events?order=id'),
  occurrences:await local('event_occurrences?order=id'),
  state:await local('event_import_state?order=source_type,external_id'),
  outcomes:await local('event_import_records?order=id'),
  run:await local('import_runs?id=eq.'+oldRun),
 });
 const before=await snapshot();
 const expectLeaseLoss=async(path,requestBody,method='POST')=>{
  const response=await fetch(c.API_URL+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(requestBody)});
  const error=await response.json();assert.equal(response.ok,false);
  assert.equal(error.code,'55P03','must fail specifically because the lease was lost');
  assert.equal(error.message,'Localist lease lost');
 };
 execFileSync('node_modules/.bin/supabase',['db','query','--local','--output','json',`update public.localist_sync_runs set lease_until=now()-interval '1 second' where id='${old}'`],{stdio:['ignore','pipe','pipe']});
 for(const phase of ['expired before replacement','replaced owner']){
  if(phase==='replaced owner'){
   const replacement=await transport('rpc/begin_localist_sync',{method:'POST',body:{}});
   // Keep the replacement live while probing the previous owner.
   await expectLeaseLoss('rpc/hosted_import_event_record',{p_sync_id:old,...staleBody});
   await expectLeaseLoss('rpc/import_event_record',staleBody);
   await expectLeaseLoss('import_runs?id=eq.'+oldRun,{status:'failed',finished_at:new Date().toISOString()},'PATCH');
   assert.deepEqual(await snapshot(),before,phase+': every event/occurrence/state/outcome and old run preserved');
   await transport('rpc/finish_localist_sync',{method:'POST',body:{p_id:replacement,p_status:'failed',p_counts:{}}});
  }else{
   await expectLeaseLoss('rpc/hosted_import_event_record',{p_sync_id:old,...staleBody});
   await expectLeaseLoss('rpc/import_event_record',staleBody);
   await expectLeaseLoss('import_runs?id=eq.'+oldRun,{status:'failed',finished_at:new Date().toISOString()},'PATCH');
   assert.deepEqual(await snapshot(),before,phase+': every event/occurrence/state/outcome and old run preserved');
  }
 }
});
