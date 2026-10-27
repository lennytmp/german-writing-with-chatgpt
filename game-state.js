(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SchicksalState=api;
})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const OPEN=['queued','checking','retrying'];
const STATUSES=[...OPEN,'correct','incorrect','uncertain','error','cancelled'];
const textKey=s=>s.normalize('NFC').trim().replace(/\s+/g,' ');
const isOpen=t=>OPEN.includes(t.status);
function copy(value){return JSON.parse(JSON.stringify(value));}
function plainText(value,max=3000){return typeof value==='string'&&value.length<=max;}
function assertResult(result,sentence){
  if(!result||!['correct','incorrect','uncertain'].includes(result.verdict)||!plainText(result.correctedSentence,20000)||!plainText(result.explanation,20000)||!Array.isArray(result.errors)||result.errors.some(e=>!e||!plainText(e.original,10000)||!plainText(e.replacement,10000)||!plainText(e.explanation,20000)))throw Error('Die Prüfung hat keine gültige Antwort geliefert.');
  if(result.verdict==='correct'&&(result.correctedSentence!==sentence||result.errors.length))throw Error('Widersprüchliche KI-Antwort.');
  if(result.verdict==='incorrect'&&(!result.errors.length||!result.correctedSentence.trim()||result.correctedSentence===sentence))throw Error('Widersprüchliche KI-Antwort.');
}
function checkRaw(raw,missionCount=7){
  if(!raw||typeof raw!=='object')throw Error('Spielstand fehlt.');
  for(const [name,max] of [['hp',100],['xp',100000000],['streak',100000000],['checks',100000000],['mission',missionCount-1]])
    if(!Number.isInteger(raw[name])||raw[name]<0||raw[name]>max)throw Error('Ungültiger Wert: '+name);
  if(!plainText(raw.draft)||!Array.isArray(raw.mastered)||raw.mastered.length>500||raw.mastered.some(s=>!plainText(s)))throw Error('Ungültige Texte im Spielstand.');
  if(!Array.isArray(raw.history)||raw.history.length>40||raw.history.some(r=>!r||!plainText(r.sentence)||!plainText(r.explanation,20000)||!plainText(r.delta,200)||!['correct','incorrect','uncertain'].includes(r.verdict)||!Number.isFinite(r.time)))throw Error('Ungültige Chronik.');
  if(raw.pending!=null&&(!plainText(raw.pending.original)||!plainText(raw.pending.hint,20000)))throw Error('Ungültiger Korrekturversuch.');
  if(raw.tasks!==undefined){
    if(!Array.isArray(raw.tasks)||raw.tasks.length>2000)throw Error('Ungültige Warteschlange.');
    const ids=new Set();
    for(const t of raw.tasks){
      if(!t||!plainText(t.id,80)||!t.id||ids.has(t.id)||!Number.isInteger(t.number)||t.number<1||!plainText(t.sentence)||!t.sentence.trim()||!STATUSES.includes(t.status)||!Number.isFinite(t.submittedAt))throw Error('Ungültiger Prüfauftrag.');
      ids.add(t.id);
      if(t.rootId!==undefined&&!plainText(t.rootId,80))throw Error('Ungültige Korrekturzuordnung.');
      if(t.correctionOf!=null&&!plainText(t.correctionOf,80))throw Error('Ungültige Korrekturzuordnung.');
      if(t.result!=null&&!t.legacy)assertResult(t.result,t.sentence);
    }
  }
}
function hydrate(raw,missionCount=7,now=Date.now()){
  checkRaw(raw,missionCount);
  const state={
    hp:raw.hp,xp:raw.xp,streak:raw.streak,checks:raw.checks,mission:raw.mission,
    mastered:copy(raw.mastered),history:copy(raw.history),draft:raw.draft,
    tasks:[],nextNumber:1,draftTarget:null,freeDraft:plainText(raw.freeDraft)?raw.freeDraft:raw.draft,
    correctionDrafts:{},queuePaused:raw.queuePaused===true,pauseReason:plainText(raw.pauseReason,2000)?raw.pauseReason:''
  };
  if(Array.isArray(raw.tasks)){
    state.tasks=raw.tasks.map(t=>({
      id:t.id,number:t.number,sentence:t.sentence,rootId:t.rootId||t.id,correctionOf:t.correctionOf||null,
      status:isOpen(t)?'queued':t.status,result:t.result?copy(t.result):null,
      settled:t.settled===true,resolved:t.resolved===true,legacy:t.legacy===true,
      submittedAt:t.submittedAt,finishedAt:Number.isFinite(t.finishedAt)?t.finishedAt:null,
      startedAt:null,attempts:0,delta:plainText(t.delta,200)?t.delta:'',
      detail:isOpen(t)?'Nach dem Neustart wieder eingereiht.':plainText(t.detail,2000)?t.detail:'',
      showSolution:t.showSolution===true
    }));
    const ids=new Set(state.tasks.map(t=>t.id));
    for(const t of state.tasks)if(t.correctionOf&&!ids.has(t.correctionOf))throw Error('Der ursprüngliche Text zu einer Korrektur fehlt.');
    state.nextNumber=Math.max(1,...state.tasks.map(t=>t.number+1),Number.isInteger(raw.nextNumber)?raw.nextNumber:1);
    if(typeof raw.draftTarget==='string'&&ids.has(raw.draftTarget))state.draftTarget=raw.draftTarget;
    if(raw.correctionDrafts&&typeof raw.correctionDrafts==='object'){
      for(const [id,value] of Object.entries(raw.correctionDrafts))if(ids.has(id)&&plainText(value))state.correctionDrafts[id]=value;
    }
  }else if(raw.pending){
    const n=Math.max(1,raw.checks),id='text-'+n;
    state.tasks=[{id,number:n,rootId:id,correctionOf:null,sentence:raw.pending.original,status:'incorrect',
      result:{verdict:'incorrect',correctedSentence:'',explanation:raw.pending.hint,errors:[]},
      settled:true,resolved:false,legacy:true,submittedAt:now,finishedAt:now,startedAt:null,attempts:0,
      delta:'Bereits gewertet',detail:'Überarbeitung aus der bisherigen Version.',showSolution:false}];
    state.draftTarget=id;state.freeDraft='';state.nextNumber=n+1;
  }else state.nextNumber=Math.max(1,raw.checks+1);
  return state;
}
function rootTask(state,task){return state.tasks.find(t=>t.id===(task.correctionOf||task.rootId||task.id));}
function openCount(state){return state.tasks.filter(isOpen).length;}
function correctionBusy(state,id){return state.tasks.some(t=>t.correctionOf===id&&isOpen(t));}
function enqueue(state,sentence,correctionOf=null,now=Date.now()){
  if(state.hp===0)throw Error('Dein Abenteuer ist beendet. Starte einen neuen Versuch.');
  sentence=sentence.trim();
  if(!sentence||sentence.length>3000)throw Error('Bitte 1 bis 3000 Zeichen schreiben.');
  if(state.mastered.includes(textKey(sentence)))throw Error('Diesen Text hast du schon gemeistert. Schreibe einen neuen Text.');
  const duplicate=state.tasks.find(t=>isOpen(t)&&textKey(t.sentence)===textKey(sentence));
  if(duplicate)throw Error('Dieser Text wartet bereits als Text #'+duplicate.number+'.');
  if(openCount(state)>=50)throw Error('50 Texte sind bereits offen. Warte kurz auf ein Ergebnis.');
  if(!correctionOf){
    const known=state.tasks.find(t=>t.status==='incorrect'&&!t.resolved&&t.result?.correctedSentence&&textKey(t.result.correctedSentence)===textKey(sentence));
    if(known)correctionOf=known.correctionOf||known.id;
  }
  const root=correctionOf?state.tasks.find(t=>t.id===correctionOf):null;
  if(correctionOf&&(!root||root.resolved||root.status!=='incorrect'))throw Error('Diese Korrektur ist nicht mehr offen. Wechsle zu einem neuen Text.');
  if(root&&correctionBusy(state,root.id))throw Error('Für Text #'+root.number+' läuft bereits eine Korrektur.');
  const number=state.nextNumber++,id='text-'+number;
  const task={id,number,sentence,rootId:root?root.id:id,correctionOf:root?root.id:null,status:'queued',
    result:null,settled:false,resolved:false,legacy:false,submittedAt:now,startedAt:null,finishedAt:null,attempts:0,delta:'',detail:'',showSolution:false};
  state.tasks.push(task);return task;
}
function record(state,task,verdict,delta,explanation,now){
  state.history.unshift({taskId:task.id,number:task.number,sentence:task.sentence,verdict,delta,explanation,time:now});
  state.history=state.history.slice(0,40);
}
function complete(state,task,result,now=Date.now()){
  if(state.hp===0||!isOpen(task)||task.settled)return null;
  assertResult(result,task.sentence);
  task.result=copy(result);task.status=result.verdict;task.settled=true;task.finishedAt=now;task.detail='';
  state.checks++;
  const oldLevel=Math.floor(state.xp/100)+1;
  let xp=0,hp=0;
  if(result.verdict==='correct'){
    const already=state.mastered.includes(textKey(task.sentence));
    if(!already){
      xp=task.correctionOf?10:15;hp=task.correctionOf?0:Math.min(5,100-state.hp);state.xp+=xp;state.hp+=hp;state.streak++;
      state.mastered.push(textKey(task.sentence));state.mastered=state.mastered.slice(-500);
    }
    task.resolved=true;
    const root=rootTask(state,task);if(root)root.resolved=true;
    task.delta=already?'Bereits gemeistert':'+'+xp+' XP'+(hp?' · +'+hp+' HP':'');
  }else if(result.verdict==='incorrect'){
    hp=task.correctionOf?0:-Math.min(15,state.hp);state.hp+=hp;state.streak=0;
    task.delta=hp?'−'+(-hp)+' HP':'Keine weitere Strafe';
  }else task.delta='Keine Wertung';
  record(state,task,result.verdict,task.delta,result.explanation,now);
  return {xp,hp,levelUp:Math.floor(state.xp/100)+1>oldLevel,level:Math.floor(state.xp/100)+1};
}
function cancel(state,id,now=Date.now()){
  const task=state.tasks.find(t=>t.id===id);if(!task||!isOpen(task))return false;
  task.status='cancelled';task.finishedAt=now;task.detail='Abgebrochen. Du kannst diesen Text erneut einreihen.';task.delta='Keine Wertung';return true;
}
function retry(state,id){
  if(state.hp===0)throw Error('Starte zuerst einen neuen Versuch.');
  const task=state.tasks.find(t=>t.id===id);if(!task||!['error','cancelled','uncertain'].includes(task.status))return false;
  if(state.mastered.includes(textKey(task.sentence)))throw Error('Dieser Text wurde inzwischen gemeistert.');
  if(openCount(state)>=50)throw Error('Die Warteschlange ist voll.');
  const duplicate=state.tasks.find(t=>t!==task&&isOpen(t)&&textKey(t.sentence)===textKey(task.sentence));
  if(duplicate)throw Error('Dieser Text wartet bereits als Text #'+duplicate.number+'.');
  if(task.correctionOf){
    const root=rootTask(state,task);
    if(!root||root.resolved)throw Error('Der ursprüngliche Text wurde bereits verbessert.');
    if(correctionBusy(state,root.id))throw Error('Für diesen Text läuft bereits eine Korrektur.');
  }
  task.status='queued';task.result=null;task.settled=false;task.finishedAt=null;task.startedAt=null;task.attempts=0;task.delta='';task.detail='';return true;
}
function restart(state){
  if(state.hp!==0)return false;
  state.hp=100;state.streak=0;return true;
}
function prune(state){
  const keep=new Set(state.tasks.filter(t=>isOpen(t)||(t.status==='incorrect'&&!t.resolved)).map(t=>t.id));
  for(const t of state.tasks.slice(-80))keep.add(t.id);
  if(state.draftTarget)keep.add(state.draftTarget);
  for(const id of Object.keys(state.correctionDrafts))keep.add(id);
  let changed=true;
  while(changed){changed=false;for(const t of state.tasks)if(keep.has(t.id)&&t.correctionOf&&!keep.has(t.correctionOf)){keep.add(t.correctionOf);changed=true;}}
  state.tasks=state.tasks.filter(t=>keep.has(t.id));
}
function backup(state,soundEnabled){return {format:'schicksalsprobe-save',version:2,exportedAt:new Date().toISOString(),settings:{soundEnabled},state:copy(state)};}
function readBackup(data,missionCount=7){
  if(!data||data.format!=='schicksalsprobe-save'||![1,2].includes(data.version))throw Error('Keine unterstützte Schicksalsprobe-Sicherung.');
  return {state:hydrate(data.state,missionCount),soundEnabled:typeof data.settings?.soundEnabled==='boolean'?data.settings.soundEnabled:true};
}
return {textKey,isOpen,openCount,rootTask,correctionBusy,hydrate,enqueue,complete,cancel,retry,restart,prune,backup,readBackup,assertResult};
});
