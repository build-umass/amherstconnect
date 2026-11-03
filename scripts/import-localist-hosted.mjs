import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {hostedTransport,runHostedSync} from './importer/hosted-localist.mjs';
let summary;
try{
 if(process.argv.length!==3||!['--check-only','--write'].includes(process.argv[2]))throw Error('Explicit --check-only or --write required');
 const signal=AbortSignal.timeout(600000);
 const start=new Date().toISOString().slice(0,10),end=new Date(Date.parse(start)+30*86400000).toISOString().slice(0,10);
 summary=await runHostedSync({approved:JSON.parse(readFileSync('scripts/importer/localist-local-catalog.json')),transport:hostedTransport(process.env.LOCALIST_SUPABASE_URL,process.env.LOCALIST_SERVICE_ROLE_KEY,fetch,{signal}),range:{start,end},checkOnly:process.argv[2]==='--check-only',signal});
}catch{summary={status:'failed',failurePhase:'configuration',lastSuccessfulSync:null};}
if(summary.status==='failed')process.exitCode=1;
if(summary.staleBeforeRun)console.log('::warning::No recent successful Localist sync (provisional 26-hour threshold).');
writeFileSync('localist-sync-result.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Localist sync\n\n\`\`\`json\n${JSON.stringify(summary,null,2)}\n\`\`\`\n`);
