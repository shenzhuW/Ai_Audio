// Verify accepted evidence and fresh read-only browser results. No AI calls or writes to user databases.
require('../../scripts/register-typescript.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process'), { createHash } = require('node:crypto');
const { DirectorJobInputSchema, DirectorResultSchema, shotTime } = require('../../apps/web/src/domain/director.ts');
const root = path.resolve(__dirname, '../..'), dir = path.join(root, 'docs/evidence/phase06');
const read = p => JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'));
const code = 'ad26a25e2bc01c9a22e95c4a4076b5ea09720f25', baseline = '0f2fa62bf4fd9ef6cde2ff21540fed71574b8258';
assert.equal(execFileSync('git',['diff',baseline,code,'--','scripts/codex-runtime.cjs','apps/web/src/server/ai/codex.ts','scripts/render-worker.cjs'],{cwd:root}).toString(),'');
const backends = [];
for(const backend of ['sqlite','postgresql']){
  const job=read(backend+'/real-director-job.json'), input=DirectorJobInputSchema.parse(job.directorInput), result=DirectorResultSchema.parse(job.directorResult), db=read(backend+'/database-snapshot.json');
  const browser=read('remote/'+backend+'/browser-review.json'); assert.equal(browser.status,'PASS'); assert.deepEqual(browser.pageErrors,[]);
  assert.equal(job.provider,'director');assert.equal(job.state,'succeeded');assert.equal(input.mode,'real');assert.equal(result.mode,'real');assert.ok(result.aiRun.runId);assert.equal(result.aiRun.failureReason,null);
  for(const id of [input.document.scriptRevisionId,input.document.voiceRevisionId]){assert.ok(job.inputRevisionIds.includes(id));assert.equal(db.tables.workflow_revisions.find(r=>r.id===id).status,'approved');assert.ok(db.tables.workflow_approval_events.some(a=>a.revisionId===id&&a.action==='approve'&&Date.parse(a.at)<=Date.parse(job.createdAt)));}
  assert.equal(input.voice.scriptRevisionId,input.document.scriptRevisionId);assert.equal(input.voice.alignmentConfirmed,true);assert.equal(input.voice.audio.durationMs,120000);assert.equal(input.document.totalFrames,3600);
  let end=0;for(const shot of result.shots){assert.equal(shot.startFrame,end);assert.equal(shot.endFrame,shot.startFrame+shot.durationFrames);assert.ok(shot.durationFrames>0);end=shot.endFrame;const time=shotTime(shot,input.document);
    for(const c of input.cues.filter(c=>!c.stale&&c.startMs<time.endMs&&c.endMs>time.startMs))assert.ok(shot.scriptSegmentIds.includes(c.segmentId));
    for(const id of shot.scriptSegmentIds)assert.ok(input.segments.some(s=>s.id===id));
    for(const id of shot.voiceCueAnchorIds)assert.ok(input.cues.some(c=>c.anchorId===id&&!c.stale&&shot.scriptSegmentIds.includes(c.segmentId)&&c.startMs<time.endMs&&c.endMs>time.startMs));
    for(const id of shot.claimIds)assert.ok(input.segments.filter(s=>shot.scriptSegmentIds.includes(s.id)).some(s=>s.factBindings.some(b=>b.claimId===id)));
    for(const id of shot.sourceIds)assert.ok(input.sources.some(s=>s.id===id));
    assert.ok(shot.narrativeGoal&&shot.viewerTakeaway&&shot.layers.length&&shot.transition.continuity&&shot.animation.reason);
    if(shot.route==='pending'){assert.equal(shot.media,null);assert.ok(shot.visualSearchIntent.query&&shot.visualSearchIntent.subject);assert.notEqual(shot.visualSearchIntent.format,'none');}
    if(shot.route==='code'){assert.equal(shot.media,null);assert.equal(shot.visualSearchIntent.format,'none');}
  }assert.equal(result.shots.length,6);assert.equal(end,3600);
  const events=fs.readFileSync(path.join(dir,backend,'real-cli-events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.find(e=>e.type==='thread.started').thread_id,result.aiRun.runId);
  assert.deepEqual(JSON.parse(events.findLast(e=>e.item?.type==='agent_message').item.text).shots,result.shots);
  const approved=db.tables.workflow_revisions.find(r=>r.status==='approved'&&r.directorSchemaVersion===1);assert.ok(approved);
  const shots=db.tables.director_shot_versions.filter(s=>s.revisionId===approved.id&&!s.removed).sort((a,b)=>a.order-b.order).map(s=>s.value);
  const mapping=new Map();for(const s of shots)for(const id of s.scriptSegmentIds)mapping.set(id,(mapping.get(id)||0)+1);
  assert.ok([...mapping.values()].some(n=>n>1));assert.ok(shots.some(s=>s.scriptSegmentIds.length>1));assert.deepEqual(new Set(shots.map(s=>s.route)),new Set(['code','bound','pending']));
  const failed=read(backend+'/cancelled-director-job.json');assert.equal(failed.state,'cancelled');assert.equal(failed.resultRevisionId,null);assert.equal(failed.leaseOwner,null);assert.ok(failed.aiRuns.some(r=>r.failureReason==='CODEX_CANCELLED'));
  backends.push({backend,status:'PASS',model:result.aiRun.model,runId:result.aiRun.runId,durationMs:result.aiRun.durationMs,usage:result.aiRun.usage,shotCount:6,totalFrames:end,voiceDurationMs:input.voice.durationMs,scriptRevisionId:input.document.scriptRevisionId,voiceRevisionId:input.document.voiceRevisionId,audioSha256:input.voice.audio.blob.sha256,approvedDirectorRevisionId:approved.id,paragraphSplitAndMerge:true,routes:['code','bound','pending'],browserChecks:browser.checks.length});
}
const audit=read('remote/code-security-audit.json');assert.equal(audit.scannedFiles,284);assert.deepEqual(audit.findings,[]);
const old=read('summary.json');assert.equal(old.integrationGroups,157);for(const c of old.checks){const r=read(c.file);assert.equal(r.status,'PASS');assert.ok(r.checks.every(c=>c.status==='PASS'));}
const unit=fs.readFileSync(path.join(dir,'remote/logs/unit.log'),'utf8');assert.match(unit,/tests 66/);assert.match(unit,/pass 66/);assert.match(unit,/fail 0/);
const audio=fs.readFileSync(path.join(root,'fixtures/director/director-120s.wav'));assert.equal(createHash('sha256').update(audio).digest('hex'),backends[0].audioSha256);
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',path.join(root,'fixtures/director/director-120s.wav')],{windowsHide:true,encoding:'utf8'}));delete probe.format.filename;assert.equal(Number(probe.format.duration),120);
fs.writeFileSync(path.join(dir,'remote/ffprobe.json'),JSON.stringify(probe,null,2)+'\n');
const report={status:'PASS',code,baseline,unit:{pass:66,fail:0},previousIntegrationGroupsRechecked:157,freshReadOnlyBrowserGroups:6,realAIReexecuted:false,backends,security:{scannedFiles:284,findings:[],maxFileBytes:audit.maxFileBytes,duplicateGroups:audit.duplicateGroups.length},safetyRuntimeUnchanged:true,notes:'Fresh unit/type/build and browser restart checks; existing actual AI/database/integration evidence was rechecked, not re-labelled as new model executions.'};
fs.writeFileSync(path.join(dir,'remote/review.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
