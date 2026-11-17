import assert from 'node:assert/strict';
import {after,before,beforeEach,test} from 'node:test';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('',{url:'https://kyngcup.com/profile/'});
let createResultCardFile,temp,created,revoked,canvases,fetches,failure;
const original={create:URL.createObjectURL,revoke:URL.revokeObjectURL,fetch:globalThis.fetch};
const content={player:'Player',tournament:'Real Cup',sport:'Padel',date:'1 Oct 2026',result:'Final',consolation:null,partner:'Partner',wins:3,losses:1,matches:4,labels:{partner:'Partner',matches:'Matches',wins:'Wins',losses:'Losses',verified:'Confirmed results'}};
before(async()=>{
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Blob:dom.window.Blob,File:dom.window.File,FileReader:dom.window.FileReader});
  globalThis.Image=class{set src(value){assert.match(value,/^blob:svg-/);queueMicrotask(()=>failure==='image'?this.onerror():this.onload());}};
  dom.window.HTMLCanvasElement.prototype.getContext=function(){canvases.push(this);return failure==='canvas'?null:{drawImage(){if(failure==='draw')throw new Error('tainted');}};};
  dom.window.HTMLCanvasElement.prototype.toBlob=function(callback,type){assert.equal(type,'image/png');if(failure==='export')throw new Error('tainted');callback(failure==='blob'?null:new Blob(['PNG'],{type}));};
  URL.createObjectURL=blob=>{const url=`blob:svg-${created.length}`;created.push({blob,url});return url;};URL.revokeObjectURL=url=>revoked.push(url);
  globalThis.fetch=async(url,options)=>{fetches.push({url,options});throw new Error('CORS unavailable');};
  const repo=fileURLToPath(new URL('../',import.meta.url));await mkdir(`${repo}tmp`,{recursive:true});temp=await mkdtemp(`${repo}tmp/card-image-`);
  const output=await build({entryPoints:[`${repo}lib/result-card-image.ts`],bundle:true,format:'esm',write:false,platform:'node'});
  await writeFile(`${temp}/image.mjs`,output.outputFiles[0].contents);
  ({createResultCardFile}=await import(pathToFileURL(`${temp}/image.mjs`).href));
});
beforeEach(()=>{created=[];revoked=[];canvases=[];fetches=[];failure=null;});
after(async()=>{URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;globalThis.fetch=original.fetch;dom.window.close();await rm(temp,{recursive:true,force:true});});
const read=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob);});

test('PNG exports use exact format sizes, stay local without a photo and release SVG resources',async()=>{
  for(const [format,height] of [['story',1920],['post',1350],['square',1080]]){
    const result=await createResultCardFile(content,format,`result-${format}.png`);
    assert.equal(result.file.type,'image/png');assert.equal(result.file.name,`result-${format}.png`);assert.equal(result.file.size,3);
    assert.equal(result.photoOmitted,false);assert.equal(canvases.at(-1).width,1080);assert.equal(canvases.at(-1).height,height);
  }
  assert.equal(fetches.length,0);assert.deepEqual(revoked,created.map(item=>item.url));
});

test('a blocked optional photo falls back to a PNG and never sends account credentials',async()=>{
  const result=await createResultCardFile(content,'square','result.png','https://cdn.example.com/photo.png');
  assert.equal(result.photoOmitted,true);assert.equal(result.file.type,'image/png');
  assert.equal(fetches.length,1);assert.equal(fetches[0].options.credentials,'omit');assert.equal(fetches[0].options.mode,'cors');assert.ok(fetches[0].options.signal);
  assert.doesNotMatch(await read(created[0].blob),/<image/);assert.deepEqual(revoked,['blob:svg-0']);
});

test('optional raster photo is embedded before SVG conversion',async()=>{
  const blockedFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob(['photo bytes'],{type:'image/png'})});
  try{
    const result=await createResultCardFile(content,'post','result.png','https://cdn.example.com/photo.png');
    assert.equal(result.photoOmitted,false);assert.match(await read(created[0].blob),/<image href="data:image\/png;base64,/);
  }finally{globalThis.fetch=blockedFetch;}
});

test('unsupported or oversized photos are omitted rather than breaking the result card',async()=>{
  const blockedFetch=globalThis.fetch;
  try{for(const blob of [new Blob(['<svg/>'],{type:'image/svg+xml'}),new Blob([new Uint8Array(5_000_001)],{type:'image/png'})]){
    globalThis.fetch=async()=>({ok:true,blob:async()=>blob});
    const result=await createResultCardFile(content,'square','result.png','https://cdn.example.com/photo');
    assert.equal(result.photoOmitted,true);assert.doesNotMatch(await read(created.at(-1).blob),/<image/);
  }}finally{globalThis.fetch=blockedFetch;}
});

test('image, canvas and PNG export failures reject and always revoke the intermediate SVG',async()=>{
  for(const stage of ['image','canvas','draw','export','blob']){
    failure=stage;
    await assert.rejects(createResultCardFile(content,'post','result.png'));
    assert.equal(revoked.at(-1),created.at(-1).url);
  }
});
