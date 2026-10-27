'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Model=require('./game-state.js');
function raw(extra={}){return {hp:100,xp:0,streak:0,checks:0,mission:0,mastered:[],history:[],draft:'',pending:null,...extra};}
function fresh(){return Model.hydrate(raw());}
function ok(sentence){return {verdict:'correct',correctedSentence:sentence,explanation:'Korrekt.',errors:[]};}
function wrong(sentence,corrected){return {verdict:'incorrect',correctedSentence:corrected,explanation:'Verbform korrigieren.',errors:[{original:sentence,replacement:corrected,explanation:'Das Verb muss zum Subjekt passen.'}]};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Three submissions remain separate and retain their original text',()=>{
  const s=fresh(),a=Model.enqueue(s,'Text eins.'),b=Model.enqueue(s,'Text zwei.'),c=Model.enqueue(s,'Text drei.');
  assert.deepEqual(s.tasks.map(t=>t.number),[1,2,3]);assert.equal(Model.openCount(s),3);
  assert.equal(a.sentence,'Text eins.');assert.equal(b.sentence,'Text zwei.');assert.equal(c.sentence,'Text drei.');
});
test('Duplicate pending submissions are rejected without consuming a number',()=>{
  const s=fresh();Model.enqueue(s,'Ein Text.');
  assert.throws(()=>Model.enqueue(s,'Ein Text.'),/bereits/);assert.equal(s.nextNumber,2);
});
test('A valid result is scored only once',()=>{
  const s=fresh(),t=Model.enqueue(s,'Ich lerne.');
  Model.complete(s,t,ok(t.sentence));Model.complete(s,t,ok(t.sentence));
  assert.equal(s.xp,15);assert.equal(s.checks,1);assert.equal(s.history.length,1);
});
test('Cancelling a task prevents late results from changing health or XP',()=>{
  const s=fresh(),t=Model.enqueue(s,'Ich lerne.');
  assert(Model.cancel(s,t.id));assert.equal(Model.complete(s,t,ok(t.sentence)),null);
  assert.equal(s.xp,0);assert.equal(s.checks,0);assert.equal(s.hp,100);
});
test('Two incorrect texts have independent correction roots',()=>{
  const s=fresh(),a=Model.enqueue(s,'Ich ist müde.'),b=Model.enqueue(s,'Du ist hier.');
  Model.complete(s,a,wrong(a.sentence,'Ich bin müde.'));Model.complete(s,b,wrong(b.sentence,'Du bist hier.'));
  assert.equal(s.hp,70);
  const ca=Model.enqueue(s,'Ich bin müde.',a.id);Model.complete(s,ca,ok(ca.sentence));
  assert(a.resolved);assert(!b.resolved);assert.equal(s.hp,70);assert.equal(s.xp,10);
  const cb=Model.enqueue(s,'Du ist hier.',b.id);Model.complete(s,cb,wrong(cb.sentence,'Du bist hier.'));
  assert.equal(s.hp,70);
  const cb2=Model.enqueue(s,'Du bist hier.',b.id);Model.complete(s,cb2,ok(cb2.sentence));
  assert(b.resolved);assert.equal(s.hp,70);assert.equal(s.xp,20);
});
test('A second correction for the same root cannot be queued simultaneously',()=>{
  const s=fresh(),t=Model.enqueue(s,'Ich ist müde.');Model.complete(s,t,wrong(t.sentence,'Ich bin müde.'));
  Model.enqueue(s,'Ich bin müde.',t.id);
  assert.throws(()=>Model.enqueue(s,'Ich wäre müde.',t.id),/bereits eine Korrektur/);
});
test('Uncertain verdict never changes HP or XP and can be retried',()=>{
  const s=fresh(),t=Model.enqueue(s,'Ein Text.');
  Model.complete(s,t,{verdict:'uncertain',correctedSentence:t.sentence,explanation:'Nicht eindeutig.',errors:[]});
  assert.equal(s.hp,100);assert.equal(s.xp,0);assert(Model.retry(s,t.id));assert.equal(t.status,'queued');
});
test('Already mastered texts cannot earn points again',()=>{
  const s=fresh(),t=Model.enqueue(s,'Ich lerne.');Model.complete(s,t,ok(t.sentence));
  assert.throws(()=>Model.enqueue(s,'Ich lerne.'),/gemeistert/);assert.equal(s.xp,15);
});
test('Interrupted checks recover as queued jobs without replaying awarded points',()=>{
  const s=fresh(),a=Model.enqueue(s,'Ich lerne.'),b=Model.enqueue(s,'Du lernst.');
  Model.complete(s,a,ok(a.sentence));b.status='checking';b.startedAt=123;
  const restored=Model.hydrate(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.tasks[0].status,'correct');assert.equal(restored.tasks[1].status,'queued');assert.equal(restored.xp,15);
  assert.equal(Model.complete(restored,restored.tasks[0],ok(a.sentence)),null);
});
test('Legacy save migration preserves scores, draft and open correction',()=>{
  const s=Model.hydrate(raw({hp:95,xp:30,checks:1,draft:'Ich ist müde.',pending:{original:'Ich ist müde.',hint:'Verbform prüfen.'}}));
  assert.equal(s.hp,95);assert.equal(s.xp,30);assert.equal(s.draft,'Ich ist müde.');
  assert.equal(s.draftTarget,s.tasks[0].id);assert.equal(s.tasks[0].status,'incorrect');assert.equal(s.nextNumber,2);
});
test('Version 1 backups remain supported',()=>{
  const imported=Model.readBackup({format:'schicksalsprobe-save',version:1,state:raw({hp:73,xp:120}),settings:{soundEnabled:false}});
  assert.equal(imported.state.hp,73);assert.equal(imported.state.xp,120);assert.equal(imported.soundEnabled,false);
});
test('Version 2 backup preserves queue, draft and pause state',()=>{
  const s=fresh(),t=Model.enqueue(s,'Mein Text.');t.status='retrying';s.draft='Noch ein Entwurf';s.queuePaused=true;s.pauseReason='Anmelden';
  const restored=Model.readBackup(JSON.parse(JSON.stringify(Model.backup(s,false))));
  assert.equal(restored.state.tasks[0].status,'queued');assert.equal(restored.state.draft,s.draft);
  assert.equal(restored.state.queuePaused,true);assert.equal(restored.soundEnabled,false);
});
test('Broken backup references and invalid scores are rejected',()=>{
  assert.throws(()=>Model.hydrate(raw({hp:999})),/hp/);
  const s=fresh(),t=Model.enqueue(s,'Test');t.correctionOf='missing-root';
  assert.throws(()=>Model.hydrate(s),/ursprüngliche Text/);
});
test('Pruning retains open jobs and unresolved corrections',()=>{
  const s=fresh(),root=Model.enqueue(s,'Ich ist müde.');Model.complete(s,root,wrong(root.sentence,'Ich bin müde.'));
  for(let i=0;i<100;i++){const t=Model.enqueue(s,'Text '+i+'.');Model.complete(s,t,ok(t.sentence));}
  const waiting=Model.enqueue(s,'Offener Text.');
  Model.prune(s);assert(s.tasks.some(t=>t.id===root.id));assert(s.tasks.some(t=>t.id===waiting.id));
});
test('Contradictory AI response does not mutate game state',()=>{
  const s=fresh(),t=Model.enqueue(s,'Original.');
  assert.throws(()=>Model.complete(s,t,ok('Changed.')),/Widersprüchliche/);
  assert.equal(s.checks,0);assert.equal(s.xp,0);assert.equal(t.status,'queued');
});
function setupUI({hp=100,audio=false}={}){
  const frequencies=[];
  class TestAudio{constructor(){this.state="running";this.currentTime=0;this.destination={};}createGain(){return {gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}createOscillator(){return {frequency:{setValueAtTime(f){frequencies.push(f);},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){},stop(){}};}}
  const elements={},events={},requests=[],memory=new Map();
  function element(){return {value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',dataset:{},events:{},focusCount:0,classList:{add(){},remove(){}},parentElement:{classList:{add(){},remove(){}}},setAttribute(){},addEventListener(n,f){this.events[n]=f;},focus(){this.focusCount++;}};}
  const html=fs.readFileSync(__dirname+'/index.html','utf8');
  for(const match of html.matchAll(/id="([^"]+)"/g))elements[match[1]]=element();
  memory.set('schicksalsprobe_local_v4',JSON.stringify(raw({hp})));
  const context=vm.createContext({
    document:{getElementById:id=>elements[id]||null,querySelector:s=>({content:'test-token'}),querySelectorAll:()=>[]},
    window:{SchicksalState:Model,AudioContext:audio?TestAudio:undefined,addEventListener(n,f){events[n]=f;}},
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
    JSON,Date,Math,Map,Uint16Array,Promise,AbortController,DOMException,Blob,URL,
    setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},
    fetch:(url,options={})=>{
      if(url==='/api/health')return Promise.resolve({ok:true,json:async()=>({available:true})});
      if(url==='/api/quit')return Promise.resolve({ok:true,json:async()=>({ok:true})});
      return new Promise((resolve,reject)=>{
        const request={sentence:JSON.parse(options.body).sentence,signal:options.signal,resolve};
        requests.push(request);
        options.signal.addEventListener('abort',()=>reject(new DOMException('Abgebrochen','AbortError')),{once:true});
      });
    }
  });
  const script=fs.readFileSync(__dirname+'/app.js','utf8').replace('render();health();pump();','globalThis.uiTest={submitText,editCorrection,cancelTask,getState:()=>state};render();health();pump();');
  vm.runInContext(script,context);
  async function finish(index,result,status=200){requests[index].resolve({ok:status===200,status,json:async()=>result});await tick();}
  async function cleanup(){events.pagehide();await tick();}
  return {frequencies,elements,requests,ui:context.uiTest,memory,finish,cleanup,events};
}
test('UI frees the editor instantly and keeps three submissions while one checks',async()=>{
  const u=setupUI();
  for(const sentence of ['Ich lerne.','Ich ist müde.','Du lernst.']){u.elements.sentence.value=sentence;u.ui.submitText();assert.equal(u.elements.sentence.value,'');assert.equal(u.elements.submitBtn.disabled,false);}
  assert.equal(u.requests.length,1);assert.equal(Model.openCount(u.ui.getState()),3);
  assert.deepEqual(u.ui.getState().tasks.map(t=>t.status),['checking','queued','queued']);
  await u.cleanup();
});
test('Later results never erase or refocus the next draft; corrections stay attached',async()=>{
  const u=setupUI();
  for(const sentence of ['Ich lerne.','Ich ist müde.','Du lernst.']){u.elements.sentence.value=sentence;u.ui.submitText();}
  u.elements.sentence.value='Mein vierter, noch ungesendeter Entwurf';
  const focuses=u.elements.sentence.focusCount;
  await u.finish(0,ok('Ich lerne.'));
  assert.equal(u.requests.length,2);assert.equal(u.elements.sentence.value,'Mein vierter, noch ungesendeter Entwurf');assert.equal(u.elements.sentence.focusCount,focuses);
  await u.finish(1,wrong('Ich ist müde.','Ich bin müde.'));
  assert.equal(u.requests.length,3);
  const bad=u.ui.getState().tasks[1];u.ui.editCorrection(bad);
  assert.equal(u.elements.sentence.value,'Ich ist müde.');
  u.elements.sentence.value='Ich bin müde.';u.ui.submitText();
  assert.equal(u.elements.sentence.value,'Mein vierter, noch ungesendeter Entwurf');
  await u.finish(2,ok('Du lernst.'));
  assert.equal(u.requests[3].sentence,'Ich bin müde.');
  await u.finish(3,ok('Ich bin müde.'));
  assert.equal(u.ui.getState().xp,40);assert.equal(u.ui.getState().hp,90);assert(bad.resolved);
  assert.equal(u.elements.sentence.value,'Mein vierter, noch ungesendeter Entwurf');
  await u.cleanup();
});
test('Cancelling a checking text starts the next queued text without scoring cancellation',async()=>{
  const u=setupUI();
  u.elements.sentence.value='Erster Text.';u.ui.submitText();
  u.elements.sentence.value='Zweiter Text.';u.ui.submitText();
  u.ui.cancelTask(u.ui.getState().tasks[0].id);await tick();
  assert.equal(u.ui.getState().tasks[0].status,'cancelled');assert.equal(u.requests.length,2);
  assert.equal(u.ui.getState().xp,0);assert.equal(u.ui.getState().checks,0);
  await u.cleanup();
});
test('Cancelling during network retry releases the next text',async()=>{
  const u=setupUI();
  u.elements.sentence.value='Erster Text.';u.ui.submitText();
  u.elements.sentence.value='Zweiter Text.';u.ui.submitText();
  await u.finish(0,{error:'Netzwerkfehler',retryable:true},503);
  assert.equal(u.ui.getState().tasks[0].status,'retrying');
  u.ui.cancelTask(u.ui.getState().tasks[0].id);await tick();assert.equal(u.requests.length,2);
  await u.cleanup();
});
test('Authentication error pauses checking but still accepts new writing',async()=>{
  const u=setupUI();
  u.elements.sentence.value='Erster Text.';u.ui.submitText();
  u.elements.sentence.value='Zweiter Text.';u.ui.submitText();
  await u.finish(0,{error:'Bitte anmelden',retryable:false},401);
  assert(u.ui.getState().queuePaused);assert.equal(u.requests.length,1);
  u.elements.sentence.value='Dritter Text.';u.ui.submitText();assert.equal(u.elements.sentence.value,'');
  assert.equal(u.ui.getState().tasks.length,3);assert.equal(u.requests.length,1);
  u.elements.resumeQueueBtn.events.click();assert.equal(u.requests.length,2);
  await u.cleanup();
});
test('Closing the page preserves unfinished checks for recovery',async()=>{
  const u=setupUI();
  u.elements.sentence.value='Prüfung läuft.';u.ui.submitText();
  u.elements.sentence.value='Wartet noch.';u.ui.submitText();
  u.elements.sentence.value='Nicht gesendeter Entwurf';
  await u.cleanup();
  const saved=JSON.parse(u.memory.get('schicksalsprobe_local_v4')),restored=Model.hydrate(saved);
  assert.equal(restored.draft,'Nicht gesendeter Entwurf');assert.equal(Model.openCount(restored),2);
  assert(restored.tasks.every(t=>t.status==='queued'));
});

test('One wound takes three fresh correct texts; corrections give XP without healing',()=>{
  const s=fresh(),bad=Model.enqueue(s,'Ich ist hier.');Model.complete(s,bad,wrong(bad.sentence,'Ich bin hier.'));
  assert.equal(s.hp,85);
  const correction=Model.enqueue(s,'Ich bin hier.',bad.id);Model.complete(s,correction,ok(correction.sentence));
  assert.equal(s.hp,85);assert.equal(s.xp,10);
  for(let n=1;n<=3;n++){const t=Model.enqueue(s,'Richtiger Text '+n+'.');Model.complete(s,t,ok(t.sentence));assert.equal(s.hp,85+n*5);}
});
test('Zero HP ends the run and late results cannot revive it; restart preserves progress',()=>{
  const s=Model.hydrate(raw({hp:10,xp:125,draft:'Mein Entwurf'}));
  const bad=Model.enqueue(s,'Ich ist hier.'),waiting=Model.enqueue(s,'Ich lerne.');
  Model.complete(s,bad,wrong(bad.sentence,'Ich bin hier.'));assert.equal(s.hp,0);
  assert.equal(Model.complete(s,waiting,ok(waiting.sentence)),null);assert.equal(s.hp,0);
  assert.throws(()=>Model.enqueue(s,'Neuer Text.'),/beendet/);
  const restored=Model.readBackup(Model.backup(s,true)).state;assert.equal(restored.hp,0);
  assert(Model.restart(restored));assert.equal(restored.hp,100);assert.equal(restored.xp,125);assert.equal(restored.draft,'Mein Entwurf');
  assert.equal(Model.openCount(restored),1);assert(!Model.restart(restored));
});
test('Game over stops the queue until restart and preserves the writing draft',async()=>{
  const u=setupUI({hp:10});u.elements.sentence.value='Ich ist hier.';u.ui.submitText();
  u.elements.sentence.value='Ich lerne.';u.ui.submitText();u.elements.sentence.value='Mein Entwurf';
  await u.finish(0,wrong('Ich ist hier.','Ich bin hier.'));
  assert.equal(u.requests.length,1);assert.equal(u.elements.submitBtn.disabled,true);assert.equal(u.elements.defeatPanel.hidden,false);
  assert.equal(u.elements.sentence.value,'Mein Entwurf');
  u.elements.restartBtn.events.click();assert.equal(u.requests.length,2);assert.equal(u.elements.defeatPanel.hidden,true);
  assert.equal(u.elements.sentence.value,'Mein Entwurf');await u.cleanup();
});
test('Every incorrect verdict schedules an audible error cue, including failed corrections',async()=>{
  const u=setupUI({audio:true});u.elements.sentence.value='Ich ist hier.';u.ui.submitText();
  await u.finish(0,wrong('Ich ist hier.','Ich bin hier.'));
  assert(u.frequencies.includes(311.13));assert(u.frequencies.includes(196));
  const firstCount=u.frequencies.filter(f=>f===196).length;
  u.ui.editCorrection(u.ui.getState().tasks[0]);u.elements.sentence.value='Ich sein hier.';u.ui.submitText();
  await u.finish(1,wrong('Ich sein hier.','Ich bin hier.'));
  assert.equal(u.frequencies.filter(f=>f===196).length,firstCount+1);assert.equal(u.ui.getState().hp,85);await u.cleanup();
});

test('Submitting an AI-suggested correction as free writing still cannot heal',()=>{
  const s=fresh(),bad=Model.enqueue(s,'Ich ist hier.');Model.complete(s,bad,wrong(bad.sentence,'Ich bin hier.'));
  const correction=Model.enqueue(s,'Ich bin hier.');assert.equal(correction.correctionOf,bad.id);
  Model.complete(s,correction,ok(correction.sentence));assert.equal(s.hp,85);assert.equal(s.xp,10);assert(bad.resolved);
});
