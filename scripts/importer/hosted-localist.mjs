import assert from 'node:assert/strict';
import { fetchLocalistEvents } from '../../shared/adapters/localist.ts';
import { adaptLocalistRecords } from './localist.mjs';
import { importDrafts, prepareRecord, normalizeLabel } from './importer.mjs';
export const TARGET = 'https://qcoqrutsrjfxcwhplrhi.supabase.co';
const transient = new Set([408,429,500,502,503,504]);
export function sourceFetch(fetchImpl=fetch, { signal=AbortSignal.timeout(600000), delay=ms=>new Promise(r=>setTimeout(r,ms)) }={}) {
 return async(url,options={})=>{
  const combined=AbortSignal.any([signal,options.signal??signal]);
  for(let attempt=0;;attempt++){
   combined.throwIfAborted();
   let response;
   try{response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.any([combined,AbortSignal.timeout(20000)])});}
   catch{combined.throwIfAborted();if(attempt>=2)throw Error('Request interrupted');await Promise.race([delay(500*2**attempt),new Promise((_,reject)=>combined.addEventListener('abort',()=>reject(Error('Deadline exceeded')),{once:true}))]);continue;}
   combined.throwIfAborted();
   if(!transient.has(response.status)||attempt>=2)return response;
   await Promise.race([delay(500*2**attempt),new Promise((_,reject)=>combined.addEventListener('abort',()=>reject(Error('Deadline exceeded')),{once:true}))]);
  }
 };
}
export function hostedTransport(url,key,fetchImpl=fetch,{signal=AbortSignal.timeout(600000)}={}){
 assert.equal(url,TARGET,'Only approved dev target allowed');
 let payload;try{payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));}catch{}
 assert.ok(payload?.role==='service_role'&&payload.ref==='qcoqrutsrjfxcwhplrhi','Project-scoped server credential required');
 let recoverySignal;
 const call=async(path,{method='GET',body,recovery=false}={})=>{
  assert.ok(/^(categories|organizations|venues|import_runs|event_import_records|localist_sync_runs|rpc\/(begin_localist_sync|finish_localist_sync|hosted_import_event_record))(\?|$)/.test(path),'Unexpected hosted operation');
  const cleanup=path==='rpc/finish_localist_sync';
  if(cleanup||recovery)recoverySignal??=AbortSignal.timeout(15000);
  const budget=(cleanup||recovery)?recoverySignal:signal;
  // Idempotent finalization alone is safe to replay after a lost response.
  const request=(method==='GET'||cleanup)?sourceFetch(fetchImpl,{signal:budget}):fetchImpl;
  const r=await request(`${url}/rest/v1/${path}`,{method,redirect:'error',signal:AbortSignal.any([budget,AbortSignal.timeout(20000)]),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok)throw Error(`Hosted request failed (${r.status}); response withheld`);
  return r.status===204?null:r.json();
 };
 call.recover=(path,opts={})=>call(path,{...opts,recovery:true});
 return call;
}
export async function resolveHostedMappings(approved,transport,candidates=null){
 assert.equal(approved.source,'https://events.umass.edu/api/2/events');
 assert.equal(approved.primaryCategoryPolicy,'single-event-type-or-single-category');
 const labels=['talks & lectures','workshops & classes','arts & culture','sports & recreation','career & networking','health & wellness','social & community','food & drink'];
 assert.deepEqual(Object.keys(approved.categories).sort(),labels.sort());
 const result=structuredClone(approved);delete result.catalog;delete result.localOnly;
 result.review=[];
 for(const table of ['categories','organizations','venues']){
  result[table]={};
  const identities=table==='categories'?Object.keys(approved.categories):[...new Set((candidates??[]).flatMap(d=>table==='organizations'?[d.organization]:d.occurrences.map(o=>o.venue)).filter(Boolean).map(c=>c.externalId!==null?`localist:id:${c.externalId}`:`localist:name:${normalizeLabel(c.name)}`))];
  for(const alias of identities){
   const id=approved[table][alias];
   if(!id){result.review.push({table,identity:alias,reason:'unapproved_identity'});continue;}
   const reference=approved.catalog[table].find(r=>r.id===id);assert.ok(reference,'Missing approved reference');
   const query=table==='categories'?`slug=eq.${encodeURIComponent(reference.slug)}`:`source_type=eq.${encodeURIComponent(reference.source_type)}&external_id=eq.${encodeURIComponent(reference.external_id)}`;
   const rows=await transport(`${table}?select=id,name&${query}`);
   if(rows.length!==1||rows[0].name!==reference.name){
    if(table==='categories')throw Error('Required approved category missing or ambiguous');
    result.review.push({table,identity:alias,reason:'missing_ambiguous_or_changed'});continue;
   }
   result[table][alias]=rows[0].id;
  }
 }
 return result;
}
export async function freshness(transport){
 const rows=await transport('localist_sync_runs?status=eq.completed&order=finished_at.desc&limit=1');return rows[0]?.finished_at??null;
}
async function outcomesFor(transport, runId){
 const runs=await transport(`import_runs?sync_id=eq.${runId}&select=id`);const all=[];
 for(const r of runs)for(let offset=0;;offset+=1000){const rows=await transport(`event_import_records?run_id=eq.${r.id}&select=outcome&limit=1000&offset=${offset}`);all.push(...rows);if(rows.length<1000)break;}
 return all;
}
const blank=()=>({fetched:0,accepted:0,created:0,updated:0,unchanged:0,stale:0,rejected:0,failed:0});
export async function runHostedSync({approved,transport,range,fetchImpl=fetch,now=()=>new Date(),staleHours=26,checkOnly=false,signal=AbortSignal.timeout(600000)}){
 let lastSuccessfulSync=null,runId=null,phase='preflight';const counts=blank();let report={};
 try{
  lastSuccessfulSync=await freshness(transport);
  let mappings=await resolveHostedMappings(approved,transport);
  const staleBeforeRun=!lastSuccessfulSync||now()-new Date(lastSuccessfulSync)>staleHours*3600000;
  if(!checkOnly)runId=await transport('rpc/begin_localist_sync',{method:'POST',body:{}});
  phase='source';let pages=0;
  const request=sourceFetch(fetchImpl,{signal});
  let expectedPages=null;
  const records=await fetchLocalistEvents({baseUrl:'https://events.umass.edu',range,pageSize:100,signal,fetchImpl:async(url,opts)=>{
   if(++pages>20)throw Error('Page cap exceeded; incomplete source');
   const response=await request(url,opts);
   return {ok:response.ok,status:response.status,json:async()=>{
    const body=await response.json();
    if(!Array.isArray(body.events)||body.events.some(w=>!w?.event)||!Number.isInteger(body.page?.total))throw Error('Incomplete provider response');
    counts.fetched+=body.events.length;
    if(body.page.total>20)throw Error('Page cap exceeded; incomplete source');
    if(expectedPages!==null&&expectedPages!==body.page.total)throw Error('Pagination changed during fetch');
    expectedPages=body.page.total;return body;
   }};
  }});
  counts.fetched=records.length;
  phase='mapping';const adapted=adaptLocalistRecords(records,now().toISOString(),mappings);
  mappings=await resolveHostedMappings(approved,transport,adapted.drafts);
  const drafts=[];const rejected=[...adapted.rejected];
  for(const draft of adapted.drafts){const prepared=prepareRecord(draft,mappings);if(prepared.outcome)rejected.push({externalId:draft.externalId,issues:prepared.issues});else drafts.push(draft);}
  counts.accepted=drafts.length;counts.rejected=rejected.length;
  report={mappingReview:rejected.map(r=>({externalId:r.externalId,codes:r.issues.map(i=>i.code),paths:r.issues.map(i=>i.path)})),catalogReview:mappings.review,pagesFetched:pages};
  if(checkOnly)return{status:'preflight-passed',lastSuccessfulSync,staleBeforeRun,counts,...report};
  phase='database';
  const fenced=async(path,opts={})=>{
   signal.throwIfAborted();
   if(path==='import_runs'&&opts.method==='POST')opts={...opts,body:{...opts.body,sync_id:runId}};
   if(path==='rpc/import_event_record'){path='rpc/hosted_import_event_record';opts={...opts,body:{...opts.body,p_sync_id:runId}};}
   return transport(path,opts);
  };
  if(drafts.length)await importDrafts({sourceType:'localist',drafts,mappings,transport:fenced});
  phase='outcomes';
  for(const o of await outcomesFor(transport,runId))if(Object.hasOwn(counts,o.outcome))counts[o.outcome]++;else counts.failed++;
  const status=counts.failed?'failed':'completed';
  signal.throwIfAborted();
  phase='finalization';await transport('rpc/finish_localist_sync',{method:'POST',body:{p_id:runId,p_status:status,p_counts:counts}});
  return{runId,status,classification:!records.length?'valid-empty':counts.accepted?'complete':'complete-all-rejected',lastSuccessfulSync:status==='completed'?await freshness(transport):lastSuccessfulSync,staleBeforeRun,counts,...report};
 }catch{
  const originalPhase=phase;let cleanupFailed=false;
  if(runId){
   try{
    const outcomes=await outcomesFor(transport.recover??transport,runId);
    counts.created=counts.updated=counts.unchanged=counts.stale=counts.failed=0;
    for(const o of outcomes)if(Object.hasOwn(counts,o.outcome))counts[o.outcome]++;else counts.failed++;
   }catch{cleanupFailed=true;for(const key of ['created','updated','unchanged','stale','failed'])counts[key]=null;}
   if(originalPhase==='finalization')try{
    const saved=await (transport.recover??transport)(`localist_sync_runs?id=eq.${runId}&select=status,counts,finished_at`);
    if(saved[0]?.status==='completed')return{runId,status:'completed',lastSuccessfulSync:saved[0].finished_at,counts:saved[0].counts,finalizationRecovered:true,...report};
   }catch{cleanupFailed=true;}
   try{await transport('rpc/finish_localist_sync',{method:'POST',body:{p_id:runId,p_status:'failed',p_counts:counts}});}catch{cleanupFailed=true;}
  }
  return{runId,status:'failed',failurePhase:originalPhase,cleanupFailed,lastSuccessfulSync,counts,...report};
 }
}
