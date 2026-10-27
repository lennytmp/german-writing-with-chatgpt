'use strict';
(() => {
const $=id=>document.getElementById(id);
const input=$('sentence'),submit=$('submitBtn'),feedback=$('feedback'),KEY='schicksalsprobe_local_v4';
const Model=window.SchicksalState;
// Synthesized game audio; activated only by a user interaction.
let audioCtx=null,audioMaster=null,soundEnabled=true;
try { soundEnabled=localStorage.getItem(KEY+'_sound')!=='off'; } catch {}
function renderSound(){
  $('soundBtn').setAttribute('aria-pressed',String(soundEnabled));
  $('soundBtn').setAttribute('aria-label',soundEnabled?'Ton ausschalten':'Ton einschalten');
  $('soundBtn').title=soundEnabled?'Ton ausschalten':'Ton einschalten';
  $('soundIcon').textContent=soundEnabled?'♫':'♪';
  $('soundLabel').textContent=soundEnabled?'Ton an':'Ton aus';
}
function unlockAudio(){
  if(!soundEnabled)return Promise.resolve(null);
  try{
    if(!audioCtx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return Promise.resolve(null);audioCtx=new Audio();audioMaster=audioCtx.createGain();audioMaster.gain.value=.28;audioMaster.connect(audioCtx.destination);}
    if(audioCtx.state==='closed')return Promise.resolve(null);
    return Promise.resolve(audioCtx.state==='suspended'?audioCtx.resume():null).then(()=>soundEnabled?audioCtx:null).catch(()=>null);
  }catch{return Promise.resolve(null);}
}
function playSound(kind){
  if(!soundEnabled)return;
  const melodies={
    check:[[330,0,.09,.09],[440,.08,.12,.07]],
    success:[[523.25,0,.22,.22],[659.25,.10,.24,.22],[783.99,.20,.36,.21],[1046.5,.33,.48,.15]],
    recover:[[392,0,.20,.18],[523.25,.10,.23,.20],[659.25,.20,.28,.20],[783.99,.32,.48,.17]],
    failure:[[440,0,.12,.45],[311.13,.11,.18,.42],[196,.25,.32,.40]],
    defeat:[[392,0,.25,.42],[311.13,.22,.28,.40],[261.63,.46,.30,.38],[130.81,.75,.70,.40]],
    level:[[523.25,0,.20,.20],[659.25,.10,.20,.20],[783.99,.20,.24,.20],[1046.5,.32,.28,.20],[1318.51,.46,.55,.14]],
    reminder:[[440,0,.18,.11],[554.37,.10,.24,.09]],
    idea:[[740,0,.08,.07],[880,.06,.12,.06]]
  };
  const notes=melodies[kind];if(!notes)return;
  void unlockAudio().then(ctx=>{if(!ctx||!soundEnabled)return;
    try{const now=ctx.currentTime+.012;
      for(const [frequency,offset,duration,volume] of notes){
        const oscillator=ctx.createOscillator(),gain=ctx.createGain(),start=now+offset;
        oscillator.type='triangle';
        oscillator.frequency.setValueAtTime(frequency,start);
        if(kind==='failure')oscillator.frequency.exponentialRampToValueAtTime(frequency*.65,start+duration);
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        oscillator.connect(gain);gain.connect(audioMaster);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
        oscillator.start(start);oscillator.stop(start+duration+.03);
      }
    }catch{}
  });
}
$('soundBtn').addEventListener('click',()=>{
  soundEnabled=!soundEnabled;
  if(audioCtx&&audioMaster)audioMaster.gain.setValueAtTime(soundEnabled ? 0.28 : 0,audioCtx.currentTime);
  try{localStorage.setItem(KEY+'_sound',soundEnabled?'on':'off');}catch{}
  renderSound();if(soundEnabled)playSound('success');
});
renderSound();


const missions=[
{title:'Der letzte Zug',text:'Du hast deinen Zug verpasst. Erkläre am Schalter, was passiert ist und welche Hilfe du brauchst.'},
{title:'Ein unerwarteter Fund',text:'Auf einer Parkbank liegt ein alter Schlüssel. Beschreibe deinen Fund und was du damit machen möchtest.'},
{title:'Die verschlossene Tür',text:'Du hast dich ausgesperrt. Schreibe einem Freund, was passiert ist und wie er helfen könnte.'},
{title:'Ein ganz normaler Tag',text:'Erzähle, was du heute erlebt hast. Was war angenehm, schwierig oder überraschend?'},
{title:'Wunsch für morgen',text:'Wenn du morgen überallhin reisen könntest: Wohin würdest du fahren und warum?'},
{title:'Ein kleines Missverständnis',text:'Im Restaurant wurde dir das falsche Essen gebracht. Erkläre freundlich, was du bestellt hast.'},
{title:'Deine eigene Geschichte',text:'Schreibe frei über etwas, das dich beschäftigt. Jeder gute Satz ist ein Schritt nach vorn.'}
];
const seed={hp:95,xp:0,streak:0,checks:1,mission:0,mastered:[],
draft:'Guten Tag! Ich habe meinen Zug verpasst. Wann fäjhrt der nächsten?',
pending:{original:'Guten Tag! Ich habe meinen Zug verpasst. Wann fäjhrt der nächsten?',hint:'Prüfe den Tippfehler in „fäjhrt“ und die Endung von „nächsten“ (Nominativ).'},
history:[{sentence:'Guten Tag! Ich habe meinen Zug verpasst. Wann fäjhrt der nächsten?',verdict:'incorrect',delta:'−5 HP',explanation:'Tippfehler und Adjektivendung · Überarbeitung offen',time:Date.now()}]};

let state,exiting=false,leaving=false;
const controllers=new Map();
try{const raw=JSON.parse(localStorage.getItem(KEY));state=Model.hydrate(raw||seed,missions.length);}
catch{state=Model.hydrate(seed,missions.length);}
input.value=state.draft;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function save(){
  state.draft=input.value;if(!state.draftTarget)state.freeDraft=input.value;
  Model.prune(state);
  try{localStorage.setItem(KEY,JSON.stringify(state));$('saveStatus').textContent='● Lokal gespeichert';}
  catch{$('saveStatus').textContent='Nicht gespeichert – bitte Spielstand exportieren';}
}
function count(){const n=input.value.trim()?input.value.trim().split(/\s+/).length:0;$('wordCount').textContent=n+' '+(n===1?'Wort':'Wörter');}
function notice(message){$('submitNotice').textContent=message;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3500);}
function renderComposer(){
  const target=state.tasks.find(t=>t.id===state.draftTarget);
  $('correctionHint').hidden=!target;
  $('correctionHint').innerHTML=target?'<strong>Korrektur zu Text #'+target.number+'</strong><span>Dein anderer Entwurf bleibt erhalten.</span><button id="freeTextBtn" class="text-btn">Zurück zum freien Schreiben</button>':'';
  $('freeTextBtn')?.addEventListener('click',()=>switchToFree());
  $('rewardLabel').textContent=target?'✦ +10 XP · keine Heilung durch Korrekturen':'✦ +15 XP · +5 HP';
  $('penaltyLabel').textContent=target?'♥ Keine weitere Strafe für Text #'+target.number:'♥ −15 HP bei Fehler';
  submit.disabled=exiting||state.hp===0;
  $('defeatPanel').hidden=state.hp>0;
  submit.innerHTML=target?'Korrektur einreihen <span>→</span>':'Text einreihen <span>→</span>';
  $('inspireBtn').disabled=exiting;
  $('importSaveBtn').disabled=exiting||Model.openCount(state)>0;
}
function taskStatus(task){
  if(task.status==='queued')return state.queuePaused?'Pausiert':'Wartet';
  return {checking:'Wird geprüft',retrying:'Verbindung wird erneut versucht',correct:'Richtig',incorrect:task.resolved?'Verbessert':'Fehler gefunden',uncertain:'Noch unsicher',error:'Prüfung nicht möglich',cancelled:'Abgebrochen'}[task.status]||task.status;
}
function wordDiff(before,after){
  const a=before.split(/\s+/),b=after.split(/\s+/);
  if(a.length*b.length>100000)return esc(after);
  const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
  let i=a.length,j=b.length,out=[];
  while(i||j){if(i&&j&&a[i-1]===b[j-1]){out.unshift(esc(b[--j]));i--;}else if(j&&(!i||dp[i][j-1]>=dp[i-1][j]))out.unshift('<mark>'+esc(b[--j])+'</mark>');else out.unshift('<del>'+esc(a[--i])+'</del>');}
  return out.join(' ');
}
function renderTasks(){
  const waiting=state.tasks.filter(t=>t.status==='queued');
  const active=state.tasks.filter(t=>['checking','retrying'].includes(t.status));
  const finished=state.tasks.filter(t=>!Model.isOpen(t)&&t.status!=='cancelled').sort((a,b)=>b.number-a.number).slice(0,20);
  const open=waiting.length+active.length;
  const summary=state.hp===0?'Abenteuer beendet · '+open+' Texte warten auf deinen neuen Versuch':state.queuePaused?'Prüfung pausiert · '+open+(open===1?' Text offen':' Texte offen'):open?active.length+' in Prüfung · '+waiting.length+' warten':'Alle Prüfungen abgeschlossen';
  $('queueSummary').textContent=summary;
  $('queueInline').textContent=state.hp===0?'Abenteuer beendet – starte einen neuen Versuch':open?summary:'Bereit für deinen nächsten Text';
  $('queueHelp').textContent=state.hp===0?'Bei 0 HP werden keine weiteren Texte geprüft. Nach „Neuer Versuch“ geht es mit den gespeicherten Texten weiter.':state.queuePaused?(state.pauseReason+' Du kannst weiter Texte einreihen.'):'Die Texte werden nacheinander geprüft. Du kannst währenddessen weiterschreiben.';
  $('resumeQueueBtn').hidden=!state.queuePaused;
  $('cancelAllBtn').hidden=open<2;
  const displayed=state.tasks.filter(Model.isOpen).sort((a,b)=>a.number-b.number);
  const card=task=>{
    const root=Model.rootTask(state,task),pending=Model.isOpen(task),busy=root&&Model.correctionBusy(state,root.id);
    const result=task.result;
    const waitingIndex=waiting.findIndex(t=>t.id===task.id);
    let detail='';
    if(task.status==='queued')detail=state.queuePaused?'Wird nach dem Fortsetzen geprüft.':'Platz '+(waitingIndex+1)+' in der Warteschlange.';
    else if(['checking','retrying'].includes(task.status))detail=task.detail||'Du kannst sofort deinen nächsten Text schreiben.';
    else if(task.status==='error'||task.status==='cancelled')detail=task.detail;
    let resultHtml=result?'<p class="task-explanation">'+esc(result.explanation)+'</p>':'';
    if(result?.errors?.length)resultHtml+='<ul>'+result.errors.map(e=>'<li>'+esc(e.explanation)+'</li>').join('')+'</ul>';
    if(task.status==='incorrect'&&task.resolved)resultHtml+='<p class="task-resolved">Durch eine Korrektur gemeistert.</p>';
    const actions=[];
    if(pending)actions.push('<button class="text-btn" data-action="cancel" data-task-id="'+esc(task.id)+'" title="Prüfung abbrechen und entfernen">Entfernen</button>');
    if(task.status==='incorrect'&&root&&!root.resolved){
      actions.push('<button class="secondary" data-action="correct" data-task-id="'+esc(task.id)+'"'+(busy||exiting?' disabled':'')+'>'+(busy?'Korrektur ist eingereiht':'Diesen Text korrigieren')+'</button>');
    }
    if(['error','cancelled','uncertain'].includes(task.status)&&(!task.correctionOf||!root?.resolved))actions.push('<button class="secondary" data-action="retry" data-task-id="'+esc(task.id)+'"'+(exiting?' disabled':'')+'>Erneut einreihen</button>');
    if(task.status==='incorrect'&&result?.correctedSentence)actions.push('<button class="text-btn" data-action="solution" data-task-id="'+esc(task.id)+'">'+(task.showSolution?'Lösung ausblenden':'Korrektur ansehen')+'</button>');
    const solution=task.showSolution&&result?.correctedSentence?'<div class="diff"><span class="correction-label">Änderungen</span><p>'+wordDiff(task.sentence,result.correctedSentence)+'</p></div>':'';
    const elapsed=task.startedAt&&pending?Math.max(0,Math.floor((Date.now()-task.startedAt)/1000)):null;
    return '<article class="task-card '+esc(task.status)+(task.resolved?' resolved':'')+'" id="job-'+esc(task.id)+'"><div class="task-heading"><strong>Text #'+task.number+'</strong>'+(task.correctionOf&&root?'<span class="task-relation">Korrektur zu #'+root.number+'</span>':'')+'<span class="task-status">'+(task.status==='checking'?'<span class="small-spinner" aria-hidden="true"></span>':'')+esc(taskStatus(task))+'</span></div><p class="task-sentence">'+esc(task.sentence)+'</p>'+(detail?'<p class="task-detail">'+esc(detail)+(elapsed!==null?' <span data-job-time="'+esc(task.id)+'">'+elapsed+' s</span>':'')+'</p>':'')+resultHtml+solution+'<div class="task-bottom"><span class="task-delta">'+esc(task.delta)+'</span><div class="task-actions">'+actions.join('')+'</div></div></article>';
  };
  $('taskList').innerHTML=displayed.length?displayed.map(card).join(''):'<p class="history-empty">Keine aktiven Prüfungen. Ergebnisse findest du in der Chronik.</p>';
  $('resultsList').innerHTML=finished.map(card).join('');
}
function render(){
  const level=Math.floor(state.xp/100)+1,p=state.xp%100;
  $('hpText').textContent=state.hp+' / 100';$('hpBar').value=state.hp;
  $('xpText').textContent=p+' / 100 XP';$('xpBar').value=p;$('level').textContent=level;$('streak').textContent=state.streak;
  $('xpNote').textContent='Noch '+(100-p)+' XP bis Stufe '+(level+1);
  $('hpNote').textContent=state.hp===0?'0 HP – dein Abenteuer ist beendet.':state.hp<=30?'Lebensgefahr! Neue richtige Texte heilen je 5 HP.':'Eine Wunde: −15 HP. Drei neue richtige Texte heilen je 5 HP.';
  $('rank').textContent=level<3?'Wortwanderer':level<5?'Satzschmied':level<10?'Sprachritter':'Meister der Worte';
  $('journey').textContent=state.mastered.length?'Du hast '+state.mastered.length+' Texte gemeistert.':'Die erste Etappe beginnt mit einem Satz.';
  $('masteredCount').textContent=state.mastered.length+' Texte';$('checksCount').textContent=state.checks;
  $('questTitle').textContent=missions[state.mission].title;$('questText').textContent=missions[state.mission].text;
  $('history').innerHTML=state.history.length?state.history.filter(r=>!state.tasks.some(t=>t.status!=='cancelled'&&!Model.isOpen(t)&&(t.id===r.taskId||(t.legacy&&t.sentence===r.sentence)))).slice(0,20).map(r=>'<article class="history-item '+(r.verdict==='incorrect'?'incorrect':'')+'"><span class="history-icon">'+(r.verdict==='correct'?'✓':r.verdict==='incorrect'?'✕':'◇')+'</span><div><p>'+(r.number?'#'+r.number+' · ':'')+esc(r.sentence)+'</p><small>'+esc(r.explanation)+' · '+new Date(r.time).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+'</small></div><span class="history-delta">'+esc(r.delta)+'</span></article>').join(''):'<p class="history-empty">Dein nächster Satz schreibt Geschichte.</p>';
  renderComposer();renderTasks();count();
}
function switchToFree(){
  if(state.draftTarget)state.correctionDrafts[state.draftTarget]=input.value;
  state.draftTarget=null;input.value=state.freeDraft||'';save();renderComposer();count();input.focus();
}
function editCorrection(task){
  const root=Model.rootTask(state,task);
  if(!root||root.resolved||Model.correctionBusy(state,root.id)){notice('Für diesen Text ist bereits eine Korrektur eingereiht oder abgeschlossen.');return;}
  if(state.draftTarget===root.id){input.focus();return;}
  if(state.draftTarget)state.correctionDrafts[state.draftTarget]=input.value;else state.freeDraft=input.value;
  state.draftTarget=root.id;input.value=state.correctionDrafts[root.id]??task.sentence;
  save();renderComposer();count();input.focus();notice('Du korrigierst jetzt Text #'+root.number+'. Dein anderer Entwurf ist gespeichert.');
}
function submitText(){
  if(exiting)return;
  const sentence=input.value.trim();if(!sentence){input.focus();return;}
  try{
    const target=state.draftTarget;
    const task=Model.enqueue(state,sentence,target);
    if(target){delete state.correctionDrafts[target];state.draftTarget=null;input.value=state.freeDraft||'';}
    else{input.value='';state.freeDraft='';}
    save();render();notice('Text #'+task.number+' ist eingereiht. Du kannst sofort weiterschreiben.');playSound('check');input.focus();pump();
  }catch(error){notice(error.message);playSound('reminder');}
}
function wait(ms,signal){return new Promise((resolve,reject)=>{
  const done=()=>{signal.removeEventListener('abort',abort);resolve();};
  const timer=setTimeout(done,ms);
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Abgebrochen','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});}
async function requestGrade(task,signal){
  let attempt=0;
  while(true){
    attempt++;task.attempts=attempt;
    try{
      const response=await fetch('/api/check',{method:'POST',headers:{'Content-Type':'application/json','X-Game-Token':document.querySelector('meta[name="game-token"]').content},body:JSON.stringify({sentence:task.sentence}),signal});
      const data=await response.json();
      if(!response.ok){const error=new Error(data.error||'Prüfung fehlgeschlagen.');error.retryable=!!data.retryable;error.status=response.status;throw error;}
      try{Model.assertResult(data,task.sentence);}catch(error){error.retryable=true;throw error;}
      return data;
    }catch(error){
      if(signal.aborted||error.name==='AbortError')throw error;
      if(error.retryable===false)throw error;
      const delay=Math.min(30000,3000*attempt);
      task.status='retrying';task.detail='Verbindungsversuch '+(attempt+1)+' in '+Math.ceil(delay/1000)+' s. Du kannst weiter schreiben oder diesen Auftrag abbrechen.';
      save();renderTasks();await wait(delay,signal);
      if(signal.aborted)throw new DOMException('Abgebrochen','AbortError');
      task.status='checking';task.detail='Verbindungsversuch '+(attempt+1);save();renderTasks();
    }
  }
}
async function processTask(task){
  const controller=new AbortController();controllers.set(task.id,controller);
  task.status='checking';task.startedAt=Date.now();task.detail='Dein Schreibfeld bleibt frei.';save();render();
  try{
    const result=await requestGrade(task,controller.signal);
    if(controller.signal.aborted||leaving||exiting)return;
    const scored=Model.complete(state,task,result);
    if(scored){
      const sound=state.hp===0?'defeat':scored.levelUp?'level':result.verdict==='correct'?(task.correctionOf?'recover':'success'):result.verdict==='incorrect'?'failure':'reminder';
      playSound(sound);
      if(result.verdict==='incorrect'){
        $('hpBar').parentElement.classList.remove('damage-hit');
        setTimeout(()=>$('hpBar').parentElement.classList.add('damage-hit'),0);
        setTimeout(()=>$('hpBar').parentElement.classList.remove('damage-hit'),850);
        toast(state.hp===0?'0 HP – Abenteuer beendet.':scored.hp<0?'Treffer! '+scored.hp+' HP. Drei neue richtige Texte heilen eine Wunde.':'Noch ein Fehler. Keine zusätzliche Strafe für diese Korrektur.');
      }
      $('queueAnnouncements').textContent='Text #'+task.number+': '+taskStatus(task)+'. '+task.delta;
      if(scored.levelUp)toast('Stufe '+scored.level+' erreicht!');
    }
  }catch(error){
    if(leaving||exiting)return;
    if(controller.signal.aborted){if(Model.isOpen(task))Model.cancel(state,task.id);}
    else if(Model.isOpen(task)){
      task.status='error';task.detail=error.message;task.delta='Keine Wertung';task.finishedAt=Date.now();
      if(error.retryable===false){state.queuePaused=true;state.pauseReason=error.message;}
    }
  }finally{
    controllers.delete(task.id);
    if(!leaving){save();render();pump();}
  }
}
function pump(){
  if(exiting||leaving||state.hp===0||state.queuePaused||controllers.size)return;
  const task=state.tasks.find(t=>t.status==='queued');
  if(task)void processTask(task);
}
function cancelTask(id){
  if(Model.cancel(state,id)){controllers.get(id)?.abort();save();render();pump();}
}
function handleTaskAction(event){
  const button=event.target.closest('button[data-task-id]');if(!button||exiting)return;
  const task=state.tasks.find(t=>t.id===button.dataset.taskId);if(!task)return;
  if(button.dataset.action==='cancel')cancelTask(task.id);
  else if(button.dataset.action==='correct')editCorrection(task);
  else if(button.dataset.action==='solution'){task.showSolution=!task.showSolution;save();renderTasks();}
  else if(button.dataset.action==='retry'){
    try{if(Model.retry(state,task.id)){save();render();pump();}}catch(error){notice(error.message);}
  }
}
$('taskList').addEventListener('click',handleTaskAction);
$('resultsList').addEventListener('click',handleTaskAction);
$('cancelAllBtn').addEventListener('click',()=>{
  for(const task of state.tasks)if(Model.isOpen(task)){Model.cancel(state,task.id);controllers.get(task.id)?.abort();}
  state.queuePaused=false;state.pauseReason='';save();render();
});
$('resumeQueueBtn').addEventListener('click',()=>{
  if(exiting)return;state.queuePaused=false;state.pauseReason='';
  const failed=[...state.tasks].reverse().find(t=>t.status==='error');
  try{if(failed)Model.retry(state,failed.id);}catch{}
  save();render();pump();
});
$('restartBtn').addEventListener('click',()=>{
  if(exiting||!Model.restart(state))return;
  save();render();playSound('recover');notice('Neuer Versuch mit 100 HP. Deine XP, Texte und Entwürfe bleiben erhalten.');pump();
});
submit.addEventListener('click',submitText);
input.addEventListener('input',()=>{count();save();});
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();submitText();}});
$('inspireBtn').addEventListener('click',()=>{if(exiting)return;state.mission=(state.mission+1)%missions.length;playSound('idea');save();render();});
function parkActive(){
  for(const [id,controller] of controllers){
    const task=state.tasks.find(t=>t.id===id);
    if(task&&Model.isOpen(task)){task.status='queued';task.startedAt=null;task.detail='Wird beim nächsten Start fortgesetzt.';}
    controller.abort();
  }
  save();
}
window.addEventListener('pagehide',()=>{leaving=true;parkActive();});
$('exitBtn').addEventListener('click',async()=>{
  exiting=true;parkActive();
  try{await fetch('/api/quit',{method:'POST',headers:{'X-Game-Token':document.querySelector('meta[name="game-token"]').content}});}catch{}
  $('connectionText').textContent='Spiel beendet';$('connectionDot').parentElement.classList.remove('ready');
  notice('Spielstand und offene Texte sind gespeichert. Du kannst das Fenster schließen.');render();
});
setInterval(()=>{
  for(const span of document.querySelectorAll('[data-job-time]')){
    const task=state.tasks.find(t=>t.id===span.dataset.jobTime);
    if(task?.startedAt)span.textContent=Math.max(0,Math.floor((Date.now()-task.startedAt)/1000))+' s';
  }
},1000);
async function health(){
  try{
    const response=await fetch('/api/health'),data=await response.json();
    $('connectionText').textContent=data.available?'ChatGPT bereit':'Codex fehlt';
    if(data.available)$('connectionDot').parentElement.classList.add('ready');
  }catch{$('connectionText').textContent='Lokale Verbindung fehlt';}
}
function backupData(){save();return Model.backup(state,soundEnabled);}
$('exportSaveBtn').addEventListener('click',()=>{
  try{
    const blob=new Blob([JSON.stringify(backupData(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='schicksalsprobe-spielstand-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.json';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Spielstand mit offenen Texten gesichert.');
  }catch(error){toast('Sicherung nicht möglich: '+error.message);}
});
let stagedBackup=null;
function closeImport(){stagedBackup=null;$('importPreview').hidden=true;$('importSaveFile').value='';}
$('importSaveBtn').addEventListener('click',()=>{if(!exiting&&!Model.openCount(state))$('importSaveFile').click();});
$('cancelImportBtn').addEventListener('click',closeImport);
$('importSaveFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>5000000)throw Error('Die Sicherungsdatei ist zu groß.');
    stagedBackup=Model.readBackup(JSON.parse(await file.text()),missions.length);
    if(exiting||Model.openCount(state)){closeImport();throw Error('Bitte zuerst die offenen Prüfungen abschließen oder abbrechen.');}
    const s=stagedBackup.state;
    $('importSummary').textContent=s.hp+' HP · '+s.xp+' XP · '+Model.openCount(s)+' offene Texte';
    $('importPreview').hidden=false;
  }catch(error){closeImport();toast('Spielstand nicht geladen: '+error.message);}
});
$('confirmImportBtn').addEventListener('click',()=>{
  if(!stagedBackup||exiting||Model.openCount(state))return;
  try{
    const incoming=stagedBackup;
    localStorage.setItem(KEY+'_before_import',JSON.stringify(backupData()));
    localStorage.setItem(KEY,JSON.stringify(incoming.state));
    localStorage.setItem(KEY+'_sound',incoming.soundEnabled?'on':'off');
    state=incoming.state;input.value=state.draft;soundEnabled=incoming.soundEnabled;
    if(audioCtx&&audioMaster)audioMaster.gain.setValueAtTime(soundEnabled ? 0.28 : 0,audioCtx.currentTime);
    closeImport();renderSound();render();save();feedback.innerHTML='';playSound('recover');toast('Spielstand wiederhergestellt.');pump();
  }catch(error){toast('Spielstand konnte nicht geladen werden: '+error.message);}
});
render();health();pump();

})();
