import assert from 'node:assert/strict';
import {after,before,beforeEach,test} from 'node:test';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<div id="root"></div>',{url:'https://kyngcup.com/register/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,HTMLSelectElement:dom.window.HTMLSelectElement,Node:dom.window.Node,NodeFilter:dom.window.NodeFilter,MutationObserver:dom.window.MutationObserver,Element:dom.window.Element,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
const {createElement,act}=await import('react');
const {createRoot}=await import('react-dom/client');
let root,Register,LanguageProvider,temp,submissions,insertError,tournaments;
const event={id:'sample-event',slug:'sample-event',name:'Sample Event',sport:'padel',status:'published',registration_status:'open',starts_at:'2099-01-01',ends_at:'2099-01-01'};
before(async()=>{
  globalThis.__registrationClient={rpc(...args){return globalThis.__repeatPayload(...args);},from(table){
    if(table==='tournaments'){const chain={select(){return chain;},in(){return chain;},order(){return Promise.resolve({data:tournaments,error:null});}};return chain;}
    assert.equal(table,'tournament_registrations');return {insert(payload){submissions.push(payload);return Promise.resolve({error:insertError});}};
  }};
  const repo=fileURLToPath(new URL('../',import.meta.url));await mkdir(`${repo}tmp`,{recursive:true});temp=await mkdtemp(`${repo}tmp/registration-ui-`);
  const output=await build({stdin:{contents:'export {default as Register} from "./app/register/page.tsx"; export {LanguageProvider} from "./app/i18n.tsx";',resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{name:'fixtures',setup(builder){
    builder.onResolve({filter:/^(next\/navigation|@\/lib\/supabase)$|(?:use-player-account|analytics|site-footer)$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='next/navigation'?'export const usePathname=()=>"/register/";':path.endsWith('supabase')?'export const supabase=globalThis.__registrationClient;':path.endsWith('use-player-account')?'export const usePlayerAccount=()=>globalThis.__registrationAccount??({user:null,profile:null});':path.endsWith('analytics')?'export const getLeadAttribution=()=>({}); export const trackEvent=()=>{};':'export default function Footer(){return null;}'}));
  }}]});
  await writeFile(`${temp}/component.mjs`,output.outputFiles[0].contents);({Register,LanguageProvider}=await import(pathToFileURL(`${temp}/component.mjs`).href));
});
beforeEach(async()=>{if(root)await act(async()=>root.unmount());window.localStorage.clear();window.history.replaceState({},"","/register/");globalThis.__registrationAccount=null;submissions=[];insertError=null;tournaments=[event];root=createRoot(document.getElementById('root'));});
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

test('repeat registration fills only empty fields and requires a fresh confirmation',async()=>{
  const source='11111111-1111-1111-1111-111111111111';
  window.history.replaceState({},'',`/register/?sport=padel&repeat=${source}`);
  globalThis.__registrationAccount={user:{id:'verified-player',email:'primary@example.invalid',email_confirmed_at:'2026-11-01'},profile:{display_name:'Primary Player'}};
  globalThis.__repeatPayload=async(name,args)=>{
    assert.equal(name,'get_my_repeat_registration');
    assert.deepEqual(args,{p_registration_id:source});
    return {data:{tournament_id:'old-event',sport:'padel',pair_name:'Previous pair',
      player_one_phone:'+431234567',player_two_first_name:'Previous',player_two_last_name:'Partner',
      player_two_email:'partner@example.invalid',player_one_level:'advanced',player_two_level:'advanced',
      comment:'Do not reuse', player_one_email:'obsolete@example.invalid'},error:null};
  };
  await render();
  const form=document.querySelector('form');
  form.elements.namedItem('player_two_first_name').value='Edited';
  form.elements.namedItem('rules_privacy_accepted').checked=true;
  const fillButton=[...form.querySelectorAll('button')].find(button=>button.textContent.includes('Fill from my past application'));
  await act(async()=>fillButton.click());
  const values=new FormData(form);
  assert.equal(values.get('pair_name'),'Previous pair');
  assert.equal(values.get('player_two_first_name'),'Edited');
  assert.equal(values.get('player_two_last_name'),'Partner');
  assert.equal(values.get('player_one_email'),'primary@example.invalid');
  assert.equal(values.get('comment'),'');
  assert.equal(values.get('rules_privacy_accepted'),null);
  assert.equal(submissions.length,0);
});

test('public registration excludes past and QA events and requires selection after an unavailable link', async () => {
  tournaments = [
    { ...event, id: 'past', slug: 'past', starts_at: '2020-01-01', ends_at: '2020-01-01' },
    { ...event, id: 'test', slug: 'kyngcup-qa-registration' },
    event,
  ];
  window.history.replaceState({}, '', '/register/?tournament=past');
  await render();
  const picker = document.querySelector('.registration-tournament-select select');
  const submitButton = document.querySelector('button[type="submit"]');
  assert.deepEqual([...picker.options].map(option => option.value), ['', event.slug]);
  assert.match(document.querySelector('[role="alert"]').textContent, /Registration for this tournament is no longer available/);
  assert.ok(submitButton.matches(':disabled'));
  assert.equal(submissions.length, 0);

  await act(async () => {
    picker.value = event.slug;
    picker.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(picker.value, event.slug);
  assert.equal(submitButton.matches(':disabled'), false);
  assert.equal(document.querySelector('[role="alert"]'), null);
  fill();
  await submit();
  assert.equal(submissions.length, 1);
  assert.match(document.querySelector('.registration-success').textContent, /Sample Event/);
});
