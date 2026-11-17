import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/profile/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,NodeFilter:dom.window.NodeFilter,Element:dom.window.Element,MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
const {createElement,act}=await import('react');
const {createRoot}=await import('react-dom/client');
let root,Cards,ResultCard,LanguageProvider,temp,requests,generations,created,revoked,downloads;
const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
const originalClick=dom.window.HTMLAnchorElement.prototype.click;
const match=(extra={})=>({id:'a',tournament_id:'a',tournament_name:'Autumn Cup',tournament_slug:'autumn-cup',sport:'padel',tournament_status:'completed',tournament_date:'2026-10-01',pair_id:'ours',partner_user_id:null,partner_name:'Partner A',opponent_name:'Opponents',stage:'group',round:null,final_round:null,is_final:false,status:'completed',winner_id:'ours',pair_one_id:'ours',pair_two_id:'other',pair_one_sets:[6],pair_two_sets:[3],completed_at:'2026-10-01T10:00:00Z',scheduled_at:null,...extra});
const result={key:'card-a',tournamentId:'a',slug:'autumn-cup',name:'Autumn Cup',sport:'padel',date:'2026-10-01',result:'Четвертьфинал',consolation:'Победитель утешительной сетки',partner:'Partner A',wins:3,losses:2,matches:5};
before(async()=>{
  globalThis.__cardsClient={rpc(name){assert.equal(name,'get_my_match_history');return new Promise(resolve=>requests.push(resolve));}};
  globalThis.__cardGenerate=(...args)=>new Promise((resolve,reject)=>generations.push({args,resolve,reject}));
  const repo=fileURLToPath(new URL('../',import.meta.url));
  await mkdir(`${repo}tmp`,{recursive:true});temp=await mkdtemp(`${repo}tmp/cards-ui-`);
  const output=await build({stdin:{contents:'export {default as Cards} from "./app/profile/player-cards.tsx"; export {default as ResultCard} from "./app/profile/result-card.tsx"; export {LanguageProvider} from "./app/i18n.tsx";',resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{name:'fixtures',setup(builder){
    builder.onResolve({filter:/^@\/lib\/(supabase|result-card-image)$/},args=>({path:args.path.endsWith('supabase')?'client':'image',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='client'?'export const supabase=globalThis.__cardsClient;':'export const createResultCardFile=(...args)=>globalThis.__cardGenerate(...args);'}));
  }}]});
  await writeFile(`${temp}/component.mjs`,output.outputFiles[0].contents);
  ({Cards,ResultCard,LanguageProvider}=await import(pathToFileURL(`${temp}/component.mjs`).href));
  URL.createObjectURL=file=>{const url=`blob:card-${created.length}`;created.push({file,url});return url;};
  URL.revokeObjectURL=url=>revoked.push(url);
  dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,name:this.download});};
});
async function unmount(){if(root)await act(async()=>root.unmount());root=null;}
beforeEach(async()=>{await unmount();window.localStorage.clear();requests=[];generations=[];created=[];revoked=[];downloads=[];delete navigator.canShare;delete navigator.share;root=createRoot(document.getElementById('root'));});
after(async()=>{await unmount();URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;dom.window.HTMLAnchorElement.prototype.click=originalClick;dom.window.close();await rm(temp,{recursive:true,force:true});delete globalThis.__cardsClient;delete globalThis.__cardGenerate;});
async function renderCards(userId='A'){await act(async()=>root.render(createElement(LanguageProvider,null,createElement(Cards,{userId,name:`Player ${userId}`,photo:''}))));}
async function renderResult(props={}){await act(async()=>root.render(createElement(LanguageProvider,null,createElement(ResultCard,{userId:'A',name:'Player A',photo:'https://example.com/photo.png',result,...props}))));}
async function reply(index,data){await act(async()=>requests[index]({data,error:null}));}
async function finish(index=0,photoOmitted=false){const file=new File(['png'],generations[index].args[2],{type:'image/png'});await act(async()=>generations[index].resolve({file,photoOmitted}));return file;}
const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent.includes(label));
async function click(node){assert.ok(node);await act(async()=>node.click());}

test('cards show loading, retry and honest empty state; hidden or unfinished events do not generate images',async()=>{
  await renderCards();assert.match(document.body.textContent,/Loading card results/);
  await act(async()=>requests[0]({data:null,error:new Error('unavailable')}));
  assert.match(document.querySelector('[role="alert"]').textContent,/Could not load card results/);
  assert.doesNotMatch(document.body.textContent,/No card results yet/);
  await click(button('Try loading again'));
  await reply(1,[match({sport:'tennis',tournament_name:'Hidden tennis'}),match({id:'live',tournament_status:'live'}),match({id:'bye',pair_two_id:null})]);
  assert.match(document.body.textContent,/No card results yet/);
  assert.doesNotMatch(document.body.textContent,/Hidden tennis|Tennis/);
  assert.equal(document.querySelector('select'),null);assert.equal(generations.length,0);
});

test('tournament selection and language changes cannot expose an obsolete generated PNG',async()=>{
  await renderCards();await reply(0,[match(),match({id:'older',tournament_id:'older',tournament_name:'Older Cup',tournament_slug:'older-cup',tournament_date:'2026-09-01'})]);
  assert.equal(document.querySelectorAll('option').length,2);
  assert.equal(generations[0].args[0].tournament,'Autumn Cup');
  assert.equal(button('Download PNG').disabled,true);
  const select=document.querySelector('select');
  await act(async()=>{select.selectedIndex=1;select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.equal(generations[1].args[0].tournament,'Older Cup');
  await finish(0);assert.equal(document.querySelector('.player-card-image img'),null);
  const file=await finish(1);assert.equal(created[0].file,file);
  await act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:'kyng-language',newValue:'uk'})));
  assert.equal(document.querySelector('.player-card-image img'),null);
  assert.equal(generations[2].args[0].labels.verified,'Підтверджені результати');
  assert.equal(generations[2].args[2],'kyng-cup-older-cup-story-uk.png');
  await finish(2);assert.ok(revoked.includes('blob:card-0'));
});

test('switching accounts immediately removes the old card and ignores its delayed results',async()=>{
  await renderCards('A');await reply(0,[match()]);await finish(0);
  await click(button('Post caption'));assert.match(document.querySelector('textarea').value,/Player A/);
  await renderCards('B');
  assert.equal(document.querySelector('textarea'),null);assert.equal(document.querySelector('.player-card-image img'),null);
  assert.doesNotMatch(document.body.textContent,/Autumn Cup|Player A/);
  await renderCards('C');await reply(2,[match({tournament_name:'Cup C'})]);
  await reply(1,[match({tournament_name:'Late B'})]);
  assert.doesNotMatch(document.body.textContent,/Late B/);
  assert.equal(generations.at(-1).args[0].player,'Player C');
  await finish(1);assert.match(document.querySelector('img').alt,/Player C/);
  assert.ok(revoked.includes('blob:card-0'));
});

test('formats, optional photo, download and native sharing use the same current PNG with no private email',async()=>{
  await renderResult();assert.equal(generations[0].args[3],undefined);
  await finish(0);await click(button('Square'));
  assert.equal(button('Download PNG').disabled,true);
  assert.equal(generations[1].args[1],'square');await finish(1);
  await click(document.querySelector('input[type="checkbox"]'));
  assert.equal(generations[2].args[3],'https://example.com/photo.png');
  const file=await finish(2);
  let shared; navigator.canShare=({files})=>files[0]===file;navigator.share=async payload=>{shared=payload;};
  await click(button('Share'));assert.equal(shared.files[0],file);
  await click(button('Download PNG'));assert.deepEqual(downloads,[{href:document.querySelector('img').src,name:'kyng-cup-autumn-cup-square-en.png'}]);
  await click(button('Post caption'));
  assert.match(document.querySelector('textarea').value,/Quarterfinal\nConsolation winner/);
  assert.match(document.querySelector('textarea').value,/Matches: 5 · Wins: 3 · Losses: 2/);
  assert.doesNotMatch(JSON.stringify(generations[2].args),/@|email|пример|TOP 8/);
  assert.match(document.body.textContent,/Image ready to save/);
});

test('unsupported or failed sharing offers PNG download and cancelling the native menu stays silent',async()=>{
  await renderResult();await finish();
  navigator.canShare=()=>true;navigator.share=async()=>{throw new DOMException('Cancelled','AbortError');};
  await click(button('Share'));assert.doesNotMatch(document.body.textContent,/sharing is unavailable/);
  navigator.share=async()=>{throw new Error('Denied');};await click(button('Share'));
  assert.match(document.body.textContent,/Download the PNG and attach/);
  assert.equal(button('Download PNG').disabled,false);
  await click(button('Post'));await finish(1);
  navigator.canShare=()=>false;let calls=0;navigator.share=async()=>{calls++;};
  await click(button('Share'));assert.equal(calls,0);assert.match(document.body.textContent,/sharing is unavailable/);
  navigator.canShare=()=>true;await click(button('Share'));
  assert.match(document.body.textContent,/Card sent to your chosen app/);assert.doesNotMatch(document.body.textContent,/sharing is unavailable/);
});

test('render failure can retry; unavailable optional photo leaves a downloadable card and revokes previews',async()=>{
  await renderResult();await act(async()=>generations[0].reject(new Error('canvas unavailable')));
  assert.match(document.querySelector('[role="alert"]').textContent,/Could not prepare your card/);
  assert.equal(button('Download PNG').disabled,true);
  await click(button('Try again'));await finish(1,true);
  assert.match(document.body.textContent,/Photo unavailable/);
  assert.equal(button('Download PNG').disabled,false);
  await unmount();assert.deepEqual(revoked,['blob:card-0']);
});

test('unmounting during generation creates no preview URL and sharing blocks duplicate submissions',async()=>{
  await renderResult();await unmount();await finish(0);assert.equal(created.length,0);
  root=createRoot(document.getElementById('root'));await renderResult();await finish(1);
  let complete,calls=0;navigator.canShare=()=>true;navigator.share=()=>{calls++;return new Promise(resolve=>{complete=resolve;});};
  await click(button('Share'));assert.equal(button('Opening share menu').disabled,true);
  await click(button('Opening share menu'));assert.equal(calls,1);
  await act(async()=>complete());assert.match(document.body.textContent,/Card sent to your chosen app/);
});
