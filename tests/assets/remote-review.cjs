// Recheck immutable accepted records; this is not a new AI execution or full integration rerun.
require('../../scripts/register-typescript.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {AssetJobInputSchema,AssetResultSchema,SourceAssetSchema,CandidateClipSchema,AssetBindingSchema,PreparedAssetSchema}=require('../../apps/web/src/domain/assets.ts');
const {recipeHash}=require('../../apps/web/src/server/assets/recipe.ts');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/evidence/phase07'),read=p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'));
const code='0240d6ef8a5e674598ff46758c4bca0f1e8fa9e3',baseline='34d88410a1f1b1e0a92a4bae548871fcc9c7288f';
assert.equal(execFileSync('git',['diff',baseline,code,'--','scripts/codex-runtime.cjs','apps/web/src/server/ai/codex.ts'],{cwd:root}).toString(),'');
const hash=b=>createHash('sha256').update(b).digest('hex');
const backends=[];
for(const backend of ['sqlite','postgresql']){
  const prior=read(backend+'/results.json'),db=read(backend+'/asset-snapshot.json'),browser=read('remote/'+backend+'/browser-review.json');
  assert.equal(prior.status,'PASS');assert.ok(prior.checks.every(c=>c.status==='PASS'));assert.equal(browser.status,'PASS');assert.deepEqual(browser.pageErrors,[]);
  assert.equal(db.director.status,'approved');assert.equal(db.approvedDirectorId,db.director.id);
  for(const source of db.sources)SourceAssetSchema.parse(source);
  for(const c of db.candidates){CandidateClipSchema.parse(c);assert.equal(c.directorRevisionId,db.director.id);assert.ok(db.shots.some(s=>s.shotId===c.shotId));assert.ok(db.sources.some(s=>s.id===c.sourceAssetId));}
  for(const b of db.bindings){AssetBindingSchema.parse(b);assert.equal(b.directorRevisionId,db.director.id);assert.equal(recipeHash(b.recipe),b.recipeHash);const c=db.candidates.find(c=>c.id===b.candidateId);assert.ok(c&&c.shotId===b.shotId&&c.sourceAssetId===b.sourceAssetId);}
  for(const p of db.prepared){PreparedAssetSchema.parse(p);assert.equal(recipeHash(p.recipe),p.recipeHash);assert.equal(p.recipe.sourceSha256,p.sourceSha256);}
  const audits=[];
  for(const filename of ['local-visual-match.json','external-search-match.json']){
    const job=read(backend+'/'+filename),input=AssetJobInputSchema.parse(job.assetInput),result=AssetResultSchema.parse(job.assetResult);
    assert.equal(job.state,'succeeded');assert.equal(input.analysis,'real');assert.equal(input.directorRevisionId,db.director.id);assert.deepEqual(job.inputRevisionIds,[db.director.id]);assert.deepEqual(input.shot.visualSearchIntent,db.shots.find(s=>s.shotId===input.shot.shotId).visualSearchIntent);
    for(const c of result.candidates){assert.equal(c.method,'real_visual');assert.equal(c.shotId,input.shot.shotId);assert.ok(c.reasons.length);assert.ok(c.frameIds.length);assert.equal(c.frameIds.length,c.frameSha256.length);const source=result.sources.find(s=>s.id===c.sourceAssetId);for(let i=0;i<c.frameIds.length;i++)assert.equal(source.index.frames.find(f=>f.id===c.frameIds[i]).blob.sha256,c.frameSha256[i]);assert.ok(job.aiRuns.some(a=>a.runId===c.runId&&!a.failureReason));}
    for(const run of job.aiRuns){assert.equal(run.provider,'codex-cli');assert.equal(run.policy,'data-only-v1');assert.equal(run.searchMode,'disabled');assert.equal(run.isolation.modelShell,'disabled');assert.equal(run.isolation.modelPatch,'disabled');assert.equal(run.isolation.enabledMcpServers,0);assert.ok(run.model&&run.runId&&run.durationMs>0);audits.push({runId:run.runId,model:run.model,durationMs:run.durationMs,usage:run.usage});}
    if(filename.startsWith('external')){const search=result.searches.find(s=>s.provider==='nasa'&&s.status==='ok');assert.ok(search.url.startsWith('https://images-api.nasa.gov/'));assert.match(search.responseSha256,/^[a-f0-9]{64}$/);assert.ok(search.at&&search.count>0);for(const s of result.sources)assert.ok(s.sourceUrl&&s.author&&s.restrictions);}
  }
  const split=prior.checks.find(c=>c.detail.intervals);assert.deepEqual(split.detail.intervals,[[0,6000],[6000,12000]]);const candidates=split.detail.candidateIds.map(id=>db.candidates.find(c=>c.id===id));assert.ok(candidates.every(c=>c.sourceAssetId===split.detail.sourceId));assert.equal(db.sources.filter(s=>s.id===split.detail.sourceId).length,1);
  const render=read(backend+'/remotion-result.json'),manifest=read(backend+'/remotion-manifest.json'),r=render.renderResult;
  assert.equal(render.state,'succeeded');assert.equal(r.manifestHash,r.previewManifestHash);assert.equal(manifest.manifestHash,r.manifestHash);
  const prepared=db.prepared.find(p=>p.blob.sha256===manifest.input.assets.backgroundSha256);assert.ok(prepared);assert.equal(prepared.recipeHash,manifest.input.preparedBackground.recipeHash);assert.equal(manifest.input.preparedBackground.directorRevisionId,db.director.id);assert.ok(manifest.input.preparedBackground.provenance.restrictions);
  const aliases={'video.mp4':'internal-poc.mp4','ffprobe.json':'ffprobe-remotion.json','manifest.json':'remotion-manifest.json','frame-060.png':'remotion-frame-060.png','frame-150.png':'remotion-frame-150.png','frame-240.png':'remotion-frame-240.png'};
  for(const a of r.artifacts){const bytes=fs.readFileSync(path.join(dir,backend,aliases[a.file]));assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.sizeBytes);}
  for(const d of r.determinism)assert.equal(d.first,d.second);
  assert.deepEqual(r.determinism.map(d=>d.frame),[60,150,240]);
  assert.ok(db.jobs.some(j=>j.state==='cancelled'&&!j.assetResult));assert.ok(db.jobs.some(j=>j.errorCode==='PROVIDER_NOT_CONFIGURED'));assert.ok(db.jobs.some(j=>j.state==='failed'&&j.errorCode==='ASSET_INTERRUPTED'));
  backends.push({backend,status:'PASS',historicalIntegrationGroups:prior.checks.length,includesResumeProvenance:1,freshReadOnlyBrowserGroups:browser.checks.length,directorRevisionId:db.director.id,sourceCount:db.sources.length,candidateCount:db.candidates.length,bindingVersions:db.bindings.length,preparedCount:db.prepared.length,aiAudits:audits,remotionSha256:r.artifacts.find(a=>a.file==='video.mp4').sha256,protectedUserDataHash:browser.checks.at(-1).detail.originalDataSha256});
}
let regressionGroups=0;
for(const p of ['phase03','phase04','phase05','phase06','phase045','claim-boundaries']){const j=read('regression/'+p+'/sqlite/results.json');assert.equal(j.status,'PASS');assert.ok(j.checks.every(c=>c.status==='PASS'));regressionGroups+=j.checks.length;}
assert.equal(regressionGroups,65);
const units=fs.readFileSync(path.join(dir,'remote/logs/unit.log'),'utf8');assert.match(units,/tests 76/);assert.match(units,/pass 76/);assert.match(units,/fail 0/);
const media=read('remote/media-fault-review.json');assert.equal(media.status,'PASS');
const audit=read('remote/code-security-audit.json');assert.equal(audit.scannedFiles,236);assert.deepEqual(audit.findings,[]);
const provider=read('providers/results.json');assert.equal(provider.status,'PASS');assert.deepEqual(new Set(provider.results.map(p=>p.source.provider)),new Set(['commons','nasa']));
const report={status:'PASS',code,baseline,at:new Date().toISOString(),fresh:{unitPass:76,unitFail:0,browserRestartGroups:6,mediaFaultAndPixelGroups:media.checks.length},historicalEvidenceRechecked:{sqliteGroups:19,postgresqlGroups:21,oldPhaseSQLiteGroups:regressionGroups,renderArtifactsByteVerified:12},backends,realAIReexecuted:false,codexSafetyRuntimeUnchanged:true,notes:['Fresh unit/type/build, two database read-only browser/restart and actual media fault/pixel checks. Original actual AI and integration logs reviewed; not renamed as freshly rerun.','Transport interruption and HTTP404 checks use explicit fault injection; real external success evidence remains original NASA/Commons calls.','No business implementation or migration changes in final acceptance supplement.']};
fs.writeFileSync(path.join(dir,'remote/review.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
