// Additional acceptance fault checks. Scratch copies only; no application/database writes.
require('../../scripts/register-typescript.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto'),{Readable}=require('node:stream'),{EventEmitter}=require('node:events');
const {assetStore}=require('../../apps/web/src/server/assets/storage.ts');
const {recipeHash}=require('../../apps/web/src/server/assets/recipe.ts');
const {prepare,ffmpeg,probe}=require('../../scripts/asset-media.cjs');
const {fetchAsset}=require('../../scripts/asset-fetch.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/evidence/phase07/remote');
const dir=path.join(root,'.cache/phase07/remote-media',Date.now().toString(36));
const result={status:'RUNNING',checks:[],faultInjection:'Only synthetic isolated copies and transport stubs; never presented as external provider success.'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const record=(name,detail={})=>{result.checks.push({name,status:'PASS',detail});console.log('PASS '+name);};
async function fail(name,fn,expected){let code;try{await fn();}catch(e){code=e.message;}assert.match(code||'',expected);record(name,{error:code});}
(async()=>{
  await fs.mkdir(dir,{recursive:true});await fs.mkdir(out,{recursive:true});
  const original=await fs.readFile(path.join(root,'fixtures/assets/gpu-two-scenes.mp4')),store=assetStore(dir),blob=await store.put(original);
  const source={id:randomUUID(),kind:'video',blob,localRef:null};
  const recipe={version:1,sourceSha256:blob.sha256,sourceInMs:0,sourceOutMs:3000,width:320,height:180,fps:30,frames:90,fit:'cover',x:.5,y:.5,playback:'once',mute:true};
  const binding=r=>({id:randomUUID(),recipe:r,recipeHash:recipeHash(r)});
  const b=binding(recipe),first=await prepare(source,b,dir,path.join(dir,'first'));
  assert.equal(first.cacheHit,false);assert.equal((await prepare(source,b,dir,path.join(dir,'repeat'))).cacheHit,true);
  record('Real FFmpeg preparation then exact recipe cache hit',{recipeHash:b.recipeHash,metadata:first.prepared.metadata});
  const changed=binding({...recipe,sourceInMs:6000,sourceOutMs:9000});
  const second=await prepare(source,changed,dir,path.join(dir,'range-change'));
  assert.notEqual(changed.recipeHash,b.recipeHash);assert.equal(second.cacheHit,false);assert.notEqual(second.prepared.blob.sha256,first.prepared.blob.sha256);
  record('Changing interval rebuilds distinct recipe and output',{before:b.recipeHash,after:changed.recipeHash});
  const variant=path.join(dir,'variant.mp4');
  await ffmpeg(['-v','error','-i',path.join(dir,'asset-blobs',blob.key),'-vf','hflip','-an','-c:v','libx264','-preset','ultrafast','-y',variant]);
  const newBlob=await store.put(await fs.readFile(variant)),newSource={...source,id:randomUUID(),blob:newBlob},newBinding=binding({...recipe,sourceSha256:newBlob.sha256});
  const rebuilt=await prepare(newSource,newBinding,dir,path.join(dir,'source-change'));assert.equal(rebuilt.cacheHit,false);assert.notEqual(newBinding.recipeHash,b.recipeHash);
  record('New source content SHA creates a new immutable source and cache key',{before:blob.sha256,after:newBlob.sha256,recipeHash:newBinding.recipeHash});
  const sourcePath=path.join(dir,'asset-blobs',blob.key);await fs.writeFile(sourcePath,Buffer.from('intentionally corrupted scratch source'));
  await fail('Modified source is refused before cached output use',()=>prepare(source,b,dir,path.join(dir,'bad-source')),/ASSET_SOURCE_CHANGED/);
  await fs.writeFile(sourcePath,original);
  await fail('Missing original produces explicit failure',()=>prepare({...source,localRef:{area:'asset-blobs',id:'absent-original'}},b,dir,path.join(dir,'missing-source')),/ENOENT/);
  const cachePath=path.join(dir,'asset-cache',b.recipeHash+'.json'),cacheBytes=await fs.readFile(cachePath),cache=JSON.parse(cacheBytes);
  await fs.writeFile(cachePath,JSON.stringify({...cache,recipeHash:'0'.repeat(64)}));
  await fail('Corrupt recipe manifest is refused',()=>prepare(source,b,dir,path.join(dir,'bad-manifest')),/ASSET_CACHE_INVALID/);
  await fs.writeFile(cachePath,cacheBytes);
  const outputPath=path.join(dir,'asset-blobs',cache.blob.key),outputBytes=await fs.readFile(outputPath);
  await fs.writeFile(outputPath,Buffer.from('intentionally corrupted scratch output'));
  await fail('Corrupt cached media is refused by SHA',()=>prepare(source,b,dir,path.join(dir,'bad-output')),/ASSET_BLOB_CHANGED/);
  await fs.writeFile(outputPath,outputBytes);
  await fs.rename(cachePath,cachePath+'.saved');
  const missingCache=await prepare(source,b,dir,path.join(dir,'cache-manifest-missing'));
  assert.equal(missingCache.cacheHit,false);assert.equal(missingCache.prepared.blob.sha256,first.prepared.blob.sha256);
  record('Missing cache manifest rebuilds verified output rather than assuming a hit');
  const savedFfmpeg=process.env.STUDIO_FFMPEG_PATH;
  process.env.STUDIO_FFMPEG_PATH=path.join(dir,'missing-ffmpeg.exe');
  await fail('FFmpeg unavailable produces an explicit media failure',()=>prepare(source,binding({...recipe,frames:60,sourceOutMs:2000}),dir,path.join(dir,'no-ffmpeg')),/ASSET_MEDIA_FAILED/);
  if(savedFfmpeg===undefined)delete process.env.STUDIO_FFMPEG_PATH;else process.env.STUDIO_FFMPEG_PATH=savedFfmpeg;
  await fs.writeFile(cachePath,cacheBytes);
  // Transport failures are deliberate dependency-injection tests, not actual external search.
  const transport=status=>(url,opts,cb)=>{
    const req=new EventEmitter();const res=new Readable({read(){this.push(Buffer.from([255,216,255]));this.destroy(Error('test interrupted body'));}});
    res.statusCode=status;res.headers={'content-type':'image/jpeg'};queueMicrotask(()=>cb(res));return req;
  };
  await fail('Stale provider URL 404 (fault injection)',()=>fetchAsset('https://images-assets.nasa.gov/acceptance-missing',{lookup:async()=>['8.8.8.8'],request:transport(404)}),/FETCH_HTTP_404/);
  await fail('Interrupted download does not produce success (fault injection)',()=>fetchAsset('https://images-assets.nasa.gov/acceptance-interrupted',{lookup:async()=>['8.8.8.8'],request:transport(200)}),/FETCH_NETWORK_ERROR/);
  const cancelled=new AbortController();cancelled.abort();
  await fail('Cancelled fetch rejected without network',()=>fetchAsset('https://images-assets.nasa.gov/a',{signal:cancelled.signal}),/FETCH_ABORTED/);
  assert.deepEqual(await store.read(blob),original);record('Self-authored source remains byte-identical after all fault checks',{sha256:hash(original)});
  const prior=JSON.parse(await fs.readFile(path.join(root,'docs/evidence/phase07/sqlite/results.json')));
  const manifest=JSON.parse(await fs.readFile(path.join(root,'docs/evidence/phase07/sqlite/remotion-manifest.json')));
  const background=path.join(root,'.cache/phase07',prior.runId,'asset-blobs',manifest.input.assets.backgroundSha256);
  assert.equal(hash(await fs.readFile(background)),manifest.input.assets.backgroundSha256);
  const video=path.join(root,'docs/evidence/phase07/sqlite/internal-poc.mp4'),metadata=(await probe(video)).metadata;
  assert.equal(metadata.frames,300);assert.equal(metadata.durationMs,10000);assert.equal(metadata.width,1080);assert.equal(metadata.height,1920);
  const samples=[];
  for(const seconds of [2,5,8]){
    const pixels=[];
    for(const [label,file] of [['prepared',background],['mp4',video]]){
      const target=path.join(dir,label+'-'+seconds+'.rgb');
      await ffmpeg(['-v','error','-i',file,'-ss',String(seconds),'-frames:v','1','-vf','crop=1080:60:0:40,scale=108:6','-pix_fmt','rgb24','-f','rawvideo','-y',target]);pixels.push(await fs.readFile(target));
    }
    const [a,b]=pixels,mean=(buf,ch)=>[...buf].filter((_,i)=>i%3===ch).reduce((s,v)=>s+v,0)/(buf.length/3);
    const ma=mean(a,1),mb=mean(b,1);let cross=0,va=0,vb=0;
    for(let i=1;i<a.length;i+=3){cross+=(a[i]-ma)*(b[i]-mb);va+=(a[i]-ma)**2;vb+=(b[i]-mb)**2;}
    const correlation=cross/Math.sqrt(va*vb);
    assert.ok(correlation>.9,JSON.stringify({seconds,correlation}));assert.ok(mb>mean(b,2),'Green scene B visible in MP4');
    await ffmpeg(['-v','error','-i',video,'-ss',String(seconds),'-frames:v','1','-vf','scale=540:960','-q:v','3','-y',path.join(out,'mp4-at-'+seconds+'s.jpg')]);
    samples.push({seconds,sourceInMs:6000,sourceOutMs:12000,preparedSha256:manifest.input.assets.backgroundSha256,greenChannelSpatialCorrelation:correlation,meanPreparedRGB:[0,1,2].map(c=>mean(a,c)),meanMp4RGB:[0,1,2].map(c=>mean(b,c))});
  }
  record('Decode actual Remotion MP4 at 2/5/8 seconds and compare spatial background to exact PreparedAsset',{videoSha256:hash(await fs.readFile(video)),roi:{x:0,y:40,width:1080,height:60,scale:[108,6]},tolerance:'Green-channel Pearson >0.90; expected gradient darkening; graphics-free ROI containing grid lines',metadata,samples});
  result.status='PASS';
})().catch(e=>{result.status='FAIL';result.error=String(e.stack||e).replaceAll(root,'[repo]');console.error(result.error);process.exitCode=1;}).finally(async()=>{result.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'media-fault-review.json'),JSON.stringify(result,null,2).replaceAll(root,'[repo]')+'\n');});
