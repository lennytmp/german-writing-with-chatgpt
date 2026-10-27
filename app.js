'use strict';
(() => {
const $=id=>document.getElementById(id);
const input=$('sentence'),submit=$('submitBtn'),feedback=$('feedback'),cancel=$('cancelBtn'),KEY='schicksalsprobe_local_v4';
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
    failure:[[130.81,0,.26,.20],[98,.12,.34,.16]],
    level:[[523.25,0,.20,.20],[659.25,.10,.20,.20],[783.99,.20,.24,.20],[1046.5,.32,.28,.20],[1318.51,.46,.55,.14]],
    reminder:[[440,0,.18,.11],[554.37,.10,.24,.09]],
    idea:[[740,0,.08,.07],[880,.06,.12,.06]]
  };
  const notes=melodies[kind];if(!notes)return;
  void unlockAudio().then(ctx=>{if(!ctx||!soundEnabled)return;
    try{const now=ctx.currentTime+.012;
      for(const [frequency,offset,duration,volume] of notes){
        const oscillator=ctx.createOscillator(),gain=ctx.createGain(),start=now+offset;
        oscillator.type=kind==='failure'?'sine':'triangle';
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
let state=structuredClone(seed),running=false,exiting=false,controller=null,ticker=null,started=0;
try{
const saved=JSON.parse(localStorage.getItem(KEY));
if(saved&&typeof saved==='object'){
state={...seed,...saved};
for(const k of ['hp','xp','streak','checks','mission'])if(!Number.isFinite(state[k]))state[k]=seed[k];
state.hp=Math.max(0,Math.min(100,state.hp));state.xp=Math.max(0,state.xp);
state.mission=Math.abs(Math.floor(state.mission))%missions.length;
state.mastered=Array.isArray(state.mastered)?state.mastered.filter(x=>typeof x==='string').slice(-500):[];
state.history=Array.isArray(state.history)?state.history.slice(0,40):[];
if(!state.pending||typeof state.pending.original!=='string')state.pending=null;
state.draft=typeof state.draft==='string'?state.draft:'';
}}catch{}
input.value=state.draft;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function key(s){return s.normalize('NFC').trim().replace(/\s+/g,' ');}
function save(){state.draft=input.value;try{localStorage.setItem(KEY,JSON.stringify(state));$('saveStatus').textContent='● Lokal gespeichert';}catch{$('saveStatus').textContent='Speichern nicht möglich';}}
function count(){const n=input.value.trim()?input.value.trim().split(/\s+/).length:0;$('wordCount').textContent=n+' '+(n===1?'Wort':'Wörter');}
function render(){
const level=Math.floor(state.xp/100)+1,p=state.xp%100;
$('hpText').textContent=state.hp+' / 100';$('hpBar').value=state.hp;
$('xpText').textContent=p+' / 100 XP';$('xpBar').value=p;$('level').textContent=level;$('streak').textContent=state.streak;
$('xpNote').textContent='Noch '+(100-p)+' XP bis Stufe '+(level+1);
$('hpNote').textContent=state.hp===0?'Zweite Chance: Verbessere einen Text und gewinne HP zurück.':'Jede Verbesserung macht dich stärker.';
$('rank').textContent=level<3?'Wortwanderer':level<5?'Satzschmied':level<10?'Sprachritter':'Meister der Worte';
$('journey').textContent=state.mastered.length?'Du hast '+state.mastered.length+' Texte gemeistert.':'Die erste Etappe beginnt mit einem Satz.';
$('masteredCount').textContent=state.mastered.length+' Texte';$('checksCount').textContent=state.checks;
$('questTitle').textContent=missions[state.mission].title;$('questText').textContent=missions[state.mission].text;
$('rewardLabel').textContent=state.pending?'✦ +10 XP · +5 HP für deine Korrektur':'✦ +15 XP · +5 HP';
$('penaltyLabel').textContent=state.pending?'♥ Keine weitere Strafe für diese Runde':'♥ −5 HP bei Fehler';
$('correctionHint').hidden=!state.pending;
$('correctionHint').innerHTML=state.pending?esc(state.pending.hint||'Verbessere deinen letzten Text.')+' <button class="text-btn" id="newTextBtn">Neuen Text beginnen</button>':'';
$('newTextBtn')?.addEventListener('click',()=>{if(running)return;state.pending=null;input.value='';save();render();input.focus();});
$('inspireBtn').disabled=running;
$('history').innerHTML=state.history.length?state.history.slice(0,20).map(r=>'<article class="history-item '+(r.verdict==='incorrect'?'incorrect':'')+'"><span class="history-icon">'+(r.verdict==='correct'?'✓':r.verdict==='incorrect'?'✕':'◇')+'</span><div><p>'+esc(r.sentence)+'</p><small>'+esc(r.explanation)+' · '+new Date(r.time).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+'</small></div><span class="history-delta">'+esc(r.delta)+'</span></article>').join(''):'<p class="history-empty">Dein nächster Satz schreibt Geschichte.</p>';
count();
}
input.addEventListener('input',()=>{count();save();});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();evaluate();}});
$('inspireBtn').addEventListener('click',()=>{if(running)return;state.mission=(state.mission+1)%missions.length;playSound('idea');save();render();});
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3500);}
function showFeedback(kind,title,body,delta=''){
feedback.innerHTML='<div class="feedback '+kind+'"><h3>'+esc(title)+(delta?'<span class="delta">'+esc(delta)+'</span>':'')+'</h3>'+body+'</div>';
feedback.focus({preventScroll:true});
}
function setBusy(value){
running=value;submit.disabled=value||exiting;$('importSaveBtn').disabled=value||exiting;cancel.hidden=!value;$('processing').hidden=!value;$('inspireBtn').disabled=value;clearInterval(ticker);
if(value){started=Date.now();$('timer').textContent='0 s';$('processingTitle').textContent='Das Orakel prüft deinen Text …';$('processingDetail').textContent='Ein KI-Aufruf · keine Chat-Übergabe';
ticker=setInterval(()=>{$('timer').textContent=Math.floor((Date.now()-started)/1000)+' s';},1000);}
}
function wait(ms,signal){return new Promise((resolve,reject)=>{
const done=()=>{signal.removeEventListener('abort',abort);resolve();};
const timer=setTimeout(done,ms);
const abort=()=>{clearTimeout(timer);reject(new DOMException('Abgebrochen','AbortError'));};
signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});}
async function requestGrade(sentence,signal){
let attempt=0;
while(true){
attempt++;
try{
const response=await fetch('/api/check',{method:'POST',headers:{'Content-Type':'application/json','X-Game-Token':document.querySelector('meta[name="game-token"]').content},body:JSON.stringify({sentence}),signal});
const data=await response.json();
if(!response.ok){const error=new Error(data.error||'Prüfung fehlgeschlagen.');error.retryable=!!data.retryable;throw error;}
return data;
}catch(error){
if(signal.aborted||error.name==='AbortError')throw error;
if(error.retryable===false)throw error;
const delay=Math.min(30000,3000*attempt);
$('processingTitle').textContent='Verbindung wird erneut versucht …';
$('processingDetail').textContent='Versuch '+(attempt+1)+' in '+Math.ceil(delay/1000)+' s. Du kannst jederzeit abbrechen.';
await wait(delay,signal);
$('processingTitle').textContent='Das Orakel prüft deinen Text …';$('processingDetail').textContent='Verbindungsversuch '+(attempt+1);
}
}}
function wordDiff(before,after){
const a=before.split(/\s+/),b=after.split(/\s+/);
if(a.length*b.length>100000)return esc(after);
const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
let i=a.length,j=b.length,out=[];
while(i||j){if(i&&j&&a[i-1]===b[j-1]){out.unshift(esc(b[--j]));i--;}else if(j&&(!i||dp[i][j-1]>=dp[i-1][j]))out.unshift('<mark>'+esc(b[--j])+'</mark>');else out.unshift('<del>'+esc(a[--i])+'</del>');}
return out.join(' ');
}
function record(sentence,verdict,delta,explanation){state.history.unshift({sentence,verdict,delta,explanation,time:Date.now()});state.history=state.history.slice(0,40);}
function applyGrade(result,sentence,wasCorrection){
state.checks++;
if(result.verdict==='uncertain'){
record(sentence,'uncertain','Keine Wertung',result.explanation);
playSound('reminder');
showFeedback('neutral','Noch kein sicheres Urteil','<p>'+esc(result.explanation)+'</p><p>Dein Spielstand bleibt gleich. Du kannst erneut prüfen.</p>');
}else if(result.verdict==='correct'){
const oldLevel=Math.floor(state.xp/100)+1,xp=wasCorrection?10:15,hp=Math.min(5,100-state.hp);
state.xp+=xp;state.hp+=hp;state.streak++;state.mastered.push(key(sentence));state.mastered=state.mastered.slice(-500);state.pending=null;
record(sentence,'correct','+'+xp+' XP'+(hp?' · +'+hp+' HP':''),wasCorrection?'Erfolgreich verbessert':'Fehlerfrei');
showFeedback('',wasCorrection?'Fehler gemeistert!':'Ein starker Satz.','<p>'+esc(sentence)+'</p><p>'+esc(result.explanation)+'</p>','+'+xp+' XP'+(hp?' · +'+hp+' HP':''));
if(Math.floor(state.xp/100)+1>oldLevel){playSound('level');toast('Stufe '+(Math.floor(state.xp/100)+1)+' erreicht!');}
else {playSound(wasCorrection?'recover':'success');}
if(Math.floor(state.xp/100)+1===oldLevel && state.streak>0&&state.streak%3===0)toast(state.streak+' Texte in Folge gemeistert!');
if(input.value.trim()===sentence)input.value='';
state.mission=(state.mission+1)%missions.length;
}else{
const loss=wasCorrection?0:Math.min(5,state.hp);state.hp-=loss;state.streak=0;playSound('failure');
state.pending={original:sentence,hint:result.errors.map(e=>e.explanation).join(' ')};
const delta=loss?'−'+loss+' HP':'Keine weitere Strafe';record(sentence,'incorrect',delta,result.explanation);
const errors=result.errors.map(e=>'<li>'+esc(e.explanation)+'</li>').join('');
showFeedback('incorrect','Ein Schritt zum nächsten Level','<p>'+esc(result.explanation)+'</p><ul>'+errors+'</ul><button id="solutionBtn" class="secondary">Korrektur ansehen</button><div id="solution" class="diff" hidden><span class="correction-label">Änderungen</span><p>'+wordDiff(sentence,result.correctedSentence)+'</p></div><p>Verbessere deinen Text und prüfe ihn noch einmal: +10 XP und +5 HP.</p>',delta);
$('solutionBtn').addEventListener('click',()=>{$('solution').hidden=!$('solution').hidden;$('solutionBtn').textContent=$('solution').hidden?'Korrektur ansehen':'Korrektur ausblenden';});
}
save();render();
}
async function evaluate(){
if(running||exiting)return;
const sentence=input.value.trim();if(!sentence){input.focus();return;}
if(state.mastered.includes(key(sentence))){playSound('reminder');showFeedback('neutral','Diesen Text hast du schon gemeistert.','<p>Versuche eine neue Formulierung. Für denselben Text gibt es nur einmal Punkte.</p>');return;}
playSound('check');
const wasCorrection=!!state.pending;controller=new AbortController();setBusy(true);feedback.innerHTML='';
try{
const result=await requestGrade(sentence,controller.signal);
if(controller.signal.aborted)return;
applyGrade(result,sentence,wasCorrection);
}catch(error){
if(error.name==='AbortError'||controller.signal.aborted)showFeedback('neutral','Prüfung abgebrochen','<p>Keine Wertung. Dein Text bleibt erhalten.</p>');
else showFeedback('neutral','Prüfung gerade nicht möglich','<p>'+esc(error.message)+'</p><p>Keine Wertung. Dein Text und Spielstand bleiben erhalten.</p>');
}finally{setBusy(false);controller=null;input.focus();}
}
submit.addEventListener('click',evaluate);cancel.addEventListener('click',()=>controller?.abort());
$('exitBtn').addEventListener('click',async()=>{
exiting=true;controller?.abort();save();
try{await fetch('/api/quit',{method:'POST',headers:{'X-Game-Token':document.querySelector('meta[name="game-token"]').content}});}catch{}
$('connectionText').textContent='Spiel beendet';submit.disabled=true;$('connectionDot').parentElement.classList.remove('ready');
showFeedback('neutral','Bis zum nächsten Abenteuer.','<p>Dein Spielstand ist gespeichert. Schließe das Fenster und setze später mit „Spiel starten“ fort.</p>');
});
async function health(){
try{
const response=await fetch('/api/health'),data=await response.json();
if(data.available){$('connectionText').textContent='ChatGPT bereit';$('connectionDot').parentElement.classList.add('ready');}
else{$('connectionText').textContent='Codex fehlt';showFeedback('neutral','Einmalige Einrichtung nötig','<p>Bitte Codex installieren und mit deinem ChatGPT-Konto anmelden. Hinweise stehen in „Lies mich“.</p>');}
}catch{$('connectionText').textContent='Lokale Verbindung fehlt';}
}

function readBackup(data){
  if(!data||data.format!=='schicksalsprobe-save'||data.version!==1||!data.state)throw Error('Das ist keine unterstützte Schicksalsprobe-Sicherung.');
  const s=data.state;
  for(const [name,max] of [['hp',100],['xp',100000000],['streak',100000000],['checks',100000000],['mission',missions.length-1]]){
    if(!Number.isInteger(s[name])||s[name]<0||s[name]>max)throw Error('Ungültiger Wert im Spielstand: '+name);
  }
  const text=(value,max)=>typeof value==='string'&&value.length<=max;
  if(!text(s.draft,3000)||!Array.isArray(s.mastered)||s.mastered.length>500||s.mastered.some(x=>!text(x,3000)))throw Error('Ungültige Texte in der Sicherung.');
  if(!Array.isArray(s.history)||s.history.length>40||s.history.some(r=>!r||!text(r.sentence,3000)||!text(r.explanation,20000)||!text(r.delta,200)||!['correct','incorrect','uncertain'].includes(r.verdict)||!Number.isFinite(r.time)))throw Error('Ungültige Chronik in der Sicherung.');
  if(s.pending!==null&&(!s.pending||!text(s.pending.original,3000)||!text(s.pending.hint,20000)))throw Error('Ungültiger Korrekturversuch in der Sicherung.');
  return {state:{hp:s.hp,xp:s.xp,streak:s.streak,checks:s.checks,mission:s.mission,draft:s.draft,mastered:[...s.mastered],history:s.history.map(r=>({sentence:r.sentence,explanation:r.explanation,delta:r.delta,verdict:r.verdict,time:r.time})),pending:s.pending?{original:s.pending.original,hint:s.pending.hint}:null},soundEnabled:typeof data.settings?.soundEnabled==='boolean'?data.settings.soundEnabled:soundEnabled};
}
function backupData(){
  save();
  return {format:'schicksalsprobe-save',version:1,exportedAt:new Date().toISOString(),settings:{soundEnabled},state:structuredClone(state)};
}
$('exportSaveBtn').addEventListener('click',()=>{
  try{
    const blob=new Blob([JSON.stringify(backupData(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='schicksalsprobe-spielstand-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.json';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Spielstand als Datei gesichert.');
  }catch(error){toast('Sicherung nicht möglich: '+error.message);}
});
$('importSaveBtn').addEventListener('click',()=>{if(running||exiting)return;$('importSaveFile').click();});
let stagedBackup=null;
function closeImport(){stagedBackup=null;$('importPreview').hidden=true;$('importSaveFile').value='';}
$('cancelImportBtn').addEventListener('click',closeImport);
$('importSaveFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>5000000)throw Error('Die Sicherungsdatei ist zu groß.');
    stagedBackup=readBackup(JSON.parse(await file.text()));
    if(running||exiting){closeImport();throw Error('Bitte warte, bis die laufende Prüfung beendet ist.');}
    const s=stagedBackup.state;
    $('importSummary').textContent=s.hp+' HP · '+s.xp+' XP · Stufe '+(Math.floor(s.xp/100)+1)+' · '+s.history.length+' Chronikeinträge';
    $('importPreview').hidden=false;
  }catch(error){closeImport();toast('Spielstand nicht geladen: '+error.message);}
});
$('confirmImportBtn').addEventListener('click',()=>{
  if(!stagedBackup||running||exiting)return;
  try{
    const incoming=stagedBackup;
    // Retain the previous state before replacing it.
    localStorage.setItem(KEY+'_before_import',JSON.stringify(backupData()));
    localStorage.setItem(KEY,JSON.stringify(incoming.state));
    localStorage.setItem(KEY+'_sound',incoming.soundEnabled?'on':'off');
    state=incoming.state;input.value=state.draft;soundEnabled=incoming.soundEnabled;
    if(audioCtx&&audioMaster)audioMaster.gain.setValueAtTime(soundEnabled ? .28 : 0,audioCtx.currentTime);
    closeImport();renderSound();render();save();feedback.innerHTML='';playSound('recover');toast('Spielstand wiederhergestellt.');
  }catch(error){toast('Spielstand konnte nicht geladen werden: '+error.message);}
});

render();health();
})();
