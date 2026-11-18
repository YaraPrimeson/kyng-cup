import assert from 'node:assert/strict';
import {after,before,beforeEach,test} from 'node:test';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<div id="root"></div>',{url:'https://kyngcup.com/register/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,NodeFilter:dom.window.NodeFilter,MutationObserver:dom.window.MutationObserver,Element:dom.window.Element,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
const {createElement,act}=await import('react');
const {createRoot}=await import('react-dom/client');
let root,Register,LanguageProvider,temp,submissions,insertError;
const event={id:'qa-event',slug:'qa-event',name:'QA Event',sport:'padel',status:'published',registration_status:'open',starts_at:'2027-01-01',ends_at:'2027-01-01'};
before(async()=>{
  globalThis.__registrationClient={from(table){
    if(table==='tournaments'){const chain={select(){return chain;},in(){return chain;},order(){return Promise.resolve({data:[event],error:null});}};return chain;}
    assert.equal(table,'tournament_registrations');return {insert(payload){submissions.push(payload);return Promise.resolve({error:insertError});}};
  }};
  const repo=fileURLToPath(new URL('../',import.meta.url));await mkdir(`${repo}tmp`,{recursive:true});temp=await mkdtemp(`${repo}tmp/registration-ui-`);
  const output=await build({stdin:{contents:'export {default as Register} from "./app/register/page.tsx"; export {LanguageProvider} from "./app/i18n.tsx";',resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{name:'fixtures',setup(builder){
    builder.onResolve({filter:/^(next\/navigation|@\/lib\/supabase)$|(?:use-player-account|analytics|site-footer)$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='next/navigation'?'export const usePathname=()=>"/register/";':path.endsWith('supabase')?'export const supabase=globalThis.__registrationClient;':path.endsWith('use-player-account')?'export const usePlayerAccount=()=>({user:null,profile:null});':path.endsWith('analytics')?'export const getLeadAttribution=()=>({}); export const trackEvent=()=>{};':'export default function Footer(){return null;}'}));
  }}]});
  await writeFile(`${temp}/component.mjs`,output.outputFiles[0].contents);({Register,LanguageProvider}=await import(pathToFileURL(`${temp}/component.mjs`).href));
});
beforeEach(async()=>{if(root)await act(async()=>root.unmount());window.localStorage.clear();submissions=[];insertError=null;root=createRoot(document.getElementById('root'));});
after(async()=>{if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});delete globalThis.__registrationClient;});
async function render(language='en'){
  window.localStorage.setItem('kyng-language',language);
  await act(async()=>root.render(createElement(LanguageProvider,null,createElement(Register))));
  await act(async()=>new Promise(resolve=>setTimeout(resolve,15)));
}
function fill(partnerEmail='partner@example.invalid'){
  const values={player_one_first_name:'QA',player_one_last_name:'Primary',player_one_email:'primary@example.invalid',player_one_phone:'+0000000000',player_one_level:'intermediate',player_two_first_name:'QA',player_two_last_name:'Partner',player_two_level:'intermediate',player_two_email:partnerEmail};
  for(const [name,value] of Object.entries(values)){const input=document.querySelector(`[name="${name}"]`);assert.ok(input,`${name} must exist in the real form`);input.value=value;}
  for(const checkbox of document.querySelectorAll('input[type="checkbox"][required]'))checkbox.checked=true;
}
async function submit(){
  const clock=Date.now;Date.now=()=>clock()+2000;
  try{await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));}
  finally{Date.now=clock;}
}
test('the normal application form preserves the optional partner email required for account linking',async()=>{
  await render();fill('  PARTNER@Example.invalid  ');await submit();
  assert.equal(submissions.length,1);assert.equal(submissions[0].player_two_email,'partner@example.invalid');
  assert.equal(submissions[0].player_one_email,'primary@example.invalid');assert.equal('submitted_by' in submissions[0],false);
  assert.match(document.body.textContent,/Application received/);
});
test('a pair may apply without a partner account, but cannot reuse the primary email',async()=>{
  await render();fill('PRIMARY@EXAMPLE.INVALID');await submit();assert.equal(submissions.length,0);
  assert.match(document.body.textContent,/different email address/);
  document.querySelector('[name="player_two_email"]').value='';await submit();
  assert.equal(submissions.length,1);assert.equal(submissions[0].player_two_email,null);
});
test('a network or server error preserves the entered partner contact for retry',async()=>{
  await render();fill();insertError={code:'network_error'};await submit();
  assert.equal(document.querySelector('[name="player_two_email"]').value,'partner@example.invalid');
  assert.equal(document.querySelector('button[type="submit"]').disabled,false);
  insertError=null;await submit();assert.equal(submissions.length,2);
});
test('an event closed during form entry shows a clear availability error and keeps the application',async()=>{
  await render();fill();
  for(const message of ['Tournament registration is unavailable','Tournament registration is closed']){
    insertError={code:'P0001',message};await submit();
    assert.match(document.body.textContent,/Registration for this tournament is no longer available/);
  }
  assert.equal(document.querySelector('[name="player_two_email"]').value,'partner@example.invalid');
  assert.equal(document.querySelector('[name="player_one_phone"]').maxLength,40);
});
for(const [language,label,hint] of [['uk','Email партнера (за бажанням)','Вкажіть email'],['de','E-Mail des Partners (optional)','Verwende die E-Mail']])test(`partner email guidance is localized for ${language}`,async()=>{
  await render(language);
  assert.match(document.querySelector('[name="player_two_email"]').closest('label').textContent,new RegExp(label.replace(/[()]/g,'\\$&')));
  assert.ok(document.getElementById('partner-email-hint').textContent.includes(hint));
  fill();await submit();assert.equal(submissions[0].locale,language);
});
