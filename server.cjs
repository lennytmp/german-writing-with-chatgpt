'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = __dirname;
const PORT = Number(process.env.DEUTSCH_PORT || 8787);
const TOKEN = crypto.randomBytes(24).toString('hex');
const jobs = new Set();
function locateCodex() {
  if (process.env.CODEX_BIN && fs.existsSync(process.env.CODEX_BIN)) return process.env.CODEX_BIN;
  const found = spawnSync('where.exe', ['codex'], { encoding:'utf8', windowsHide:true });
  const candidate = (found.stdout || '').trim().split(/\r?\n/).find(p => p.endsWith('.exe') && fs.existsSync(p));
  if (candidate) return candidate;
  const dir = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  try {
    const choices = fs.readdirSync(dir).map(n => path.join(dir,n,'codex.exe')).filter(p => fs.existsSync(p));
    choices.sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (choices[0]) return choices[0];
  } catch {}
  return null;
}
const CODEX = locateCodex();
const schema = path.join(ROOT,'grade-schema.json');
const instructions = fs.readFileSync(path.join(ROOT,'grammar-instructions.txt'),'utf8');
class GameError extends Error {
  constructor(message,status=502,retryable=false) {super(message);this.status=status;this.retryable=retryable;}
}
function classifyFailure(detail) {
  if (/401|unauthori[sz]ed|not logged in|authentication|refresh.token|sign in|login required/i.test(detail))
    return new GameError('Bitte einmal mit „codex login“ bei ChatGPT anmelden und dann erneut prüfen.',401,false);
  if (/usage limit|quota|credits|limit reached/i.test(detail))
    return new GameError('Dein ChatGPT-Nutzungslimit ist erreicht. Bitte später erneut versuchen.',429,false);
  if (/rate limit|429/i.test(detail)) return new GameError('Die Sprachprüfung ist kurz ausgelastet. Wir versuchen es erneut.',429,true);
  if (/access is denied|permission denied|os error 5|sandbox.*(fail|error)/i.test(detail))
    return new GameError('Windows hat den Zugriff für Codex blockiert. Starte das Spiel über „Spiel starten“ außerhalb dieser Vorschau.',503,false);
  return new GameError('Die Verbindung zur Sprachprüfung ist unterbrochen. Wir versuchen es erneut.',503,true);
}
function validateGrade(value,sentence) {
  if (!value || !['correct','incorrect','uncertain'].includes(value.verdict) ||
      typeof value.correctedSentence !== 'string' || typeof value.explanation !== 'string' ||
      !Array.isArray(value.errors) || value.errors.some(e => !e || ['original','replacement','explanation'].some(k=>typeof e[k]!=='string')))
    throw new GameError('Die KI hat keine gültige Bewertung geliefert. Erneuter Versuch …',502,true);
  if (value.verdict==='correct' && (value.errors.length || value.correctedSentence !== sentence))
    throw new GameError('Die KI-Bewertung war widersprüchlich. Erneuter Versuch …',502,true);
  if (value.verdict==='incorrect' && (!value.errors.length || !value.correctedSentence.trim() || value.correctedSentence===sentence))
    throw new GameError('Die KI-Bewertung war widersprüchlich. Erneuter Versuch …',502,true);
  return value;
}
function checkSentence(sentence,{signal,runner=spawn,executable=CODEX,timeoutMs=90000}={}) {
  if (!executable) return Promise.reject(new GameError('Codex wurde nicht gefunden. Bitte zuerst Codex installieren und mit ChatGPT anmelden.',503,false));
  const args=['exec','--ignore-user-config','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--color','never',
    '-c','model_reasoning_effort="low"','--output-schema',schema,'--json','-'];
  return new Promise((resolve,reject) => {
    let child, settled=false, stdout='', stderr='', lastMessage='', fatal='';
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(child)jobs.delete(child);
      if(error)reject(error);else resolve(value);
    };
    const abort=()=>{child?.kill();finish(new GameError('Prüfung abgebrochen.',499,false));};
    const timer=setTimeout(()=>{child?.kill();finish(new GameError('Die Prüfung braucht zu lange. Neuer Verbindungsversuch …',504,true));},timeoutMs);
    if(signal?.aborted){abort();return;}
    try {child=runner(executable,args,{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});jobs.add(child);}
    catch(error){finish(classifyFailure(error.message));return;}
    signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',chunk=>{
      stdout+=chunk.toString();
      if(stdout.length>500000){child.kill();finish(new GameError('Unerwartet umfangreiche KI-Antwort.',502,false));}
    });
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-12000);});
    child.on('error',error=>finish(classifyFailure(error.message)));
    child.on('close',code=>{
      if(settled)return;
      for(const line of stdout.split(/\r?\n/)){
        try {
          const event=JSON.parse(line);
          if(event.type==='item.completed' && event.item?.type==='agent_message')lastMessage=event.item.text;
          if(event.type==='error')fatal=event.message||'';
          if(event.type==='turn.failed')fatal=event.error?.message||fatal;
        } catch {}
      }
      if(code!==0 || !lastMessage){finish(classifyFailure(fatal || stderr));return;}
      try {finish(null,validateGrade(JSON.parse(lastMessage),sentence));}
      catch(error){finish(error instanceof GameError ? error : new GameError('Die KI-Antwort konnte nicht gelesen werden. Erneuter Versuch …',502,true));}
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(instructions+'\n\nZu prüfender Text:\n'+JSON.stringify({sentence}));
  });
}
function send(res,status,body) {
  if(res.destroyed)return;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
}
function createServer() {
  return http.createServer(async(req,res)=>{
    const target=new URL(req.url,'http://127.0.0.1:'+PORT);
    if(req.headers.host!=='127.0.0.1:'+PORT && req.headers.host!=='localhost:'+PORT){send(res,403,{error:'Zugriff nur lokal erlaubt.'});return;}
    if(req.method==='GET' && target.pathname==='/api/health'){send(res,200,{app:'deutsche-schicksalsprobe-local',available:!!CODEX,provider:'ChatGPT über Codex'});return;}
    if(req.method==='GET'){
      const names={'/':'index.html','/style.css':'style.css','/app.js':'app.js','/game-state.js':'game-state.js'};
      const name=names[target.pathname];
      if(!name){send(res,404,{error:'Nicht gefunden.'});return;}
      let content=fs.readFileSync(path.join(ROOT,name),'utf8');
      if(name==='index.html')content=content.replace('__GAME_TOKEN__',TOKEN);
      res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
      res.end(content);return;
    }
    if(req.method!=='POST' || req.headers['x-game-token']!==TOKEN){send(res,403,{error:'Ungültige Spielanfrage.'});return;}
    if(req.headers.origin && !['http://127.0.0.1:'+PORT,'http://localhost:'+PORT].includes(req.headers.origin)){send(res,403,{error:'Fremder Ursprung.'});return;}
    if(target.pathname==='/api/quit'){
      send(res,200,{ok:true});for(const child of jobs)child.kill();
      setTimeout(()=>{server.close();process.exit(0);},150);return;
    }
    if(target.pathname!=='/api/check'){send(res,404,{error:'Nicht gefunden.'});return;}
    if(jobs.size){send(res,503,{error:'Eine Prüfung läuft bereits.',retryable:true});return;}
    let body='', chunks=[], size=0;
    try {
      for await(const chunk of req){chunks.push(chunk);size+=chunk.length;if(size>20000)throw new GameError('Text ist zu lang.',413,false);}
      body=Buffer.concat(chunks).toString('utf8');
      const input=JSON.parse(body);
      if(typeof input.sentence!=='string' || !input.sentence.trim() || input.sentence.length>3000)throw new GameError('Bitte 1 bis 3000 Zeichen eingeben.',400,false);
      if(jobs.size) throw new GameError('Eine Prüfung läuft bereits.',503,true);
      const controller=new AbortController();
      res.on('close',()=>{if(!res.writableEnded)controller.abort();});
      const result=await checkSentence(input.sentence,{signal:controller.signal});
      send(res,200,result);
    } catch(error){send(res,error.status||400,{error:error.message||'Anfrage fehlgeschlagen.',retryable:!!error.retryable});}
  });
}
let server;
if(require.main===module){
  server=createServer();
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(PORT,'127.0.0.1',()=>console.log('Deutsche Schicksalsprobe: http://127.0.0.1:'+PORT));
  for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>{for(const child of jobs)child.kill();server.close(()=>process.exit(0));});
}
module.exports={checkSentence,validateGrade,classifyFailure,createServer};
