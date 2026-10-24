// Read-only production UI review of the two existing synthetic Phase07 acceptance projects.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..'), appDir = path.join(root, 'apps/web');
const req = createRequire(path.join(appDir, 'package.json'));
const backend = process.argv.includes('--postgres') ? 'postgresql' : 'sqlite';
const prior = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/phase07', backend, 'results.json')));
assert.equal(prior.status, 'PASS'); assert.match(prior.runId, /^[a-z0-9]+$/);
const dataDir = path.join(root, '.cache/phase07', prior.runId), output = path.join(root, 'docs/evidence/phase07/remote', backend);
assert.ok(fs.existsSync(dataDir)); fs.mkdirSync(output, { recursive: true });
const base = 'http://127.0.0.1:' + (backend === 'sqlite' ? 3036 : 3037);
const env = { ...process.env, DATABASE_URL: '', STUDIO_DATA_DIR: dataDir, STUDIO_CODEX_ENABLED: '1' };
let secrets = [], app, browser, cookie, appLog = '';
const clean = s => secrets.reduce((s, secret) => s.replaceAll(secret, '[REDACTED]'), String(s)).replaceAll(root, '[repo]');
if (backend === 'postgresql') {
  assert.match(prior.database, /^studio_phase07_[a-z0-9]+$/);
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
async function get(suffix=''){const r=await fetch(base+`/api/v1/projects/${prior.projectId}/assets${suffix}`,{headers:{Cookie:cookie}}),b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b.data;}
async function main(){
  await start(); const current=await get();
  assert.equal(current.director.id,prior.checks.find(c=>c.detail.directorRevisionId).detail.directorRevisionId);
  assert.equal(current.director.status,'approved'); assert.equal(current.stale,true);
  assert.ok(current.bindings.length>=3); assert.ok(current.prepared.length>=2);
  const summary={director:current.director.id,bindings:current.bindings.map(b=>({id:b.id,shotId:b.shotId,version:b.version,recipeHash:b.recipeHash})),sources:current.sources.map(s=>({id:s.id,sha256:s.blob?.sha256})),prepared:current.prepared.map(p=>({id:p.id,sha256:p.blob.sha256,recipeHash:p.recipeHash})),jobs:current.jobs.map(j=>({id:j.id,state:j.state,errorCode:j.errorCode}))};
  record('真实数据库读取固定批准导演、区间绑定历史、PreparedAsset与任务状态',{...summary,stale:current.stale});
  browser=await req('playwright').chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1500,height:1050}});
  page.on('pageerror',e=>result.pageErrors.push(e.message));
  await page.route('**/api/v1/**',route=>{if(!['GET','HEAD'].includes(route.request().method())){result.pageErrors.push('Unexpected API mutation: '+route.request().method());return route.abort();}return route.continue();});
  await page.goto(base+`/projects/${prior.projectId}/assets`);await page.getByLabel('素材镜头').waitFor();
  await page.getByRole('button',{name:/GPU schematic two scenes/}).first().click();
  const media=await page.locator('video').first().evaluate(async v=>{
    await new Promise((ok,no)=>{if(v.readyState>=1)return ok();v.onloadedmetadata=ok;v.onerror=()=>no(Error('media load failed'));});
    await new Promise((ok,no)=>{v.onseeked=ok;v.onerror=()=>no(Error('seek failed'));v.currentTime=7;});
    await v.play();await new Promise(r=>setTimeout(r,500));v.pause();return {duration:v.duration,currentTime:v.currentTime,width:v.videoWidth,height:v.videoHeight,readyState:v.readyState};
  }); assert.equal(media.duration,12);assert.ok(media.currentTime>7);assert.equal(media.width,640);
  await page.screenshot({path:path.join(output,'07-source-playback.png'),fullPage:false});
  assert.equal(await page.getByRole('button',{name:'搜索并匹配素材',exact:true}).isDisabled(),true);
  record('生产浏览器原片真实播放/7秒定位，历史stale明确只读',{media});
  await stop();await start();assert.deepEqual(await get(),current);
  const file=await fetch(base+`/api/v1/projects/${prior.projectId}/asset-files/${current.sources.find(s=>s.provider==='project'&&s.kind==='video').blob.key}`,{headers:{Cookie:cookie,Range:'bytes=0-31'}});
  assert.equal(file.status,206);assert.equal((await file.arrayBuffer()).byteLength,32);
  assert.equal(protectedHash(),beforeHash);
  record('应用重启后完整素材关系/历史/任务一致，受保护Range206，原用户数据不变',{originalDataSha256:beforeHash});
  assert.deepEqual(result.pageErrors,[]);result.status='PASS';result.finishedAt=new Date().toISOString();save();
}
main().catch(e=>{result.status='FAIL';result.error=clean(e.stack||e);save();console.error(result.error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();fs.writeFileSync(path.join(output,'app.log'),appLog);});
