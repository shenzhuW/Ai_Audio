// Read-only production UI review of the two existing synthetic Phase06 acceptance projects.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..'), appDir = path.join(root, 'apps/web');
const req = createRequire(path.join(appDir, 'package.json'));
const backend = process.argv.includes('--postgres') ? 'postgresql' : 'sqlite';
const prior = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/phase06', backend, 'results.json')));
assert.equal(prior.status, 'PASS'); assert.match(prior.runId, /^[a-z0-9]+$/);
const dataDir = path.join(root, '.cache/phase06', prior.runId), output = path.join(root, 'docs/evidence/phase06/remote', backend);
assert.ok(fs.existsSync(dataDir)); fs.mkdirSync(output, { recursive: true });
const base = 'http://127.0.0.1:' + (backend === 'sqlite' ? 3026 : 3027);
const env = { ...process.env, DATABASE_URL: '', STUDIO_DATA_DIR: dataDir, STUDIO_CODEX_ENABLED: '1' };
let secrets = [], app, browser, cookie, appLog = '';
const clean = s => secrets.reduce((s, secret) => s.replaceAll(secret, '[REDACTED]'), String(s)).replaceAll(root, '[repo]');
if (backend === 'postgresql') {
  assert.match(prior.database, /^studio_phase06_[a-z0-9]+$/);
  const c = JSON.parse(fs.readFileSync(path.join(root, '.cache/postgres-phase005/connection.json')));
  assert.equal(c.host, '127.0.0.1'); assert.equal(c.port, 55432);
  secrets = [c.appPassword, c.adminPassword];
  const u = new URL('postgresql://127.0.0.1:55432/' + prior.database + '?connection_limit=2');
  u.username = c.appUser; u.password = c.appPassword; env.DATABASE_URL = u.href;
}
function protectedHash() {
  const hash = createHash('sha256');
  function walk(dir) { if (!fs.existsSync(dir)) return; for (const f of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else { hash.update(p); hash.update(fs.readFileSync(p)); } } }
  walk(path.join(appDir, '.data')); walk(path.join(root, '.cache/acceptance-data')); return hash.digest('hex');
}
const beforeHash = protectedHash(), result = { status: 'RUNNING', backend, projectId: prior.projectId, checks: [], pageErrors: [] };
const save = () => fs.writeFileSync(path.join(output, 'browser-review.json'), JSON.stringify(result, null, 2) + '\n');
const record = (name, detail={}) => { result.checks.push({ name, status: 'PASS', detail }); save(); console.log('PASS ' + name); };
async function start() {
  await new Promise((ok,fail)=>{ const s=require('node:net').createServer(); s.once('error',fail); s.listen(Number(new URL(base).port),'127.0.0.1',()=>s.close(ok)); });
  app=spawn(process.execPath,[req.resolve('next/dist/bin/next'),'start','-H','127.0.0.1','-p',new URL(base).port],{cwd:appDir,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',b=>appLog+=clean(b));app.stderr.on('data',b=>appLog+=clean(b));
  for(let i=0;i<120;i++){if(app.exitCode!==null)throw Error(appLog.slice(-1200));try{const r=await fetch(base+'/projects');if(r.ok){cookie=r.headers.get('set-cookie').split(';')[0];return;}}catch{} await new Promise(r=>setTimeout(r,250));}throw Error('App readiness timeout');
}
async function stop(){if(app&&app.exitCode===null){const done=new Promise(r=>app.once('exit',r));app.kill();await done;}app=undefined;}
async function get(suffix=''){const r=await fetch(base+`/api/v1/projects/${prior.projectId}/director${suffix}`,{headers:{Cookie:cookie}}),b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b.data;}
async function main(){
  await start();const current=await get(),raw=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/phase06',backend,'real-director-job.json')));
  const approved=current.revisions.find(r=>r.status==='approved');assert.ok(approved);const historical=await get('?revisionId='+approved.id);
  assert.equal(historical.shots.length,6);assert.equal(historical.shots.at(-1).endFrame,3600);assert.equal(historical.document.durationMs,120000);
  assert.equal(historical.shots[0].shotId,raw.directorResult.shots[1].shotId);assert.equal(historical.shots[1].shotId,raw.directorResult.shots[0].shotId);
  assert.ok(historical.shots.some(s=>s.scriptSegmentIds.length>1));assert.ok(historical.shots.some((s,i)=>historical.shots.some((other,j)=>j!==i&&s.scriptSegmentIds.some(id=>other.scriptSegmentIds.includes(id)))));
  assert.deepEqual(new Set(historical.shots.map(s=>s.route)),new Set(['code','pending','bound']));
  assert.equal(current.impact.stale,true);assert.equal(current.impact.scriptChanged,true);assert.equal(current.impact.voiceChanged,true);assert.equal(current.impact.affectedShotIds.length,6);
  assert.equal(current.jobs.find(j=>j.id===raw.id).aiRuns[0].runId,raw.aiRuns[0].runId);
  record('批准历史真实六镜/交换顺序/一段多镜多段一镜/三路线与双输入stale',{approvedRevisionId:approved.id,sortedShotIds:historical.shots.map(s=>s.shotId),originalShotIds:raw.directorResult.shots.map(s=>s.shotId),impact:current.impact});
  browser=await req('playwright').chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1800,height:1100}});page.on('pageerror',e=>result.pageErrors.push(e.message));
  await page.route('**/api/v1/**',route=>{if(!['GET','HEAD'].includes(route.request().method())){result.pageErrors.push('Unexpected API mutation: '+route.request().method());return route.abort();}return route.continue();});
  await page.goto(base+`/projects/${prior.projectId}/storyboard`);await page.getByLabel('镜头标题',{exact:true}).waitFor();
  const jobCard=page.getByText(raw.id,{exact:true}).locator('..');await jobCard.waitFor();await jobCard.evaluate(el=>el.scrollIntoView({block:'center'}));await page.waitForTimeout(300);await page.screenshot({path:path.join(output,'06-real-generation-audit.png'),fullPage:false});
  await page.getByRole('button',{name:/^v1 · 已批准/}).click();await page.waitForTimeout(1500);assert.equal(await page.getByLabel('镜头标题',{exact:true}).isEditable(),false);
  await page.getByRole('heading',{name:'导演时间轴',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'06-sorted-approved.png'),fullPage:false});
  record('真实浏览器补拍已完成Codex审计与排序后的批准历史；只发送GET，无新模型调用');
  await stop();await start();assert.deepEqual(await get(),current);assert.deepEqual((await get('?revisionId='+approved.id)).shots,historical.shots);
  assert.equal(protectedHash(),beforeHash);record('两次应用启动后导演/Job/历史/失效关系一致，用户数据不变',{originalDataSha256:beforeHash});
  assert.deepEqual(result.pageErrors,[]);result.status='PASS';result.finishedAt=new Date().toISOString();save();
}
main().catch(e=>{result.status='FAIL';result.error=clean(e.stack||e);save();console.error(result.error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.writeFileSync(path.join(output,'app.log'),appLog);});
