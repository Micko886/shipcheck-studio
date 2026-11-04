/** ShipCheck CDP runner. Node 22+, no external packages.
 * Browser is launched with an isolated temporary profile; no cookies are read or uploaded.
 * Scanning performs no form submits, payments or user-visible clicks.
 */
'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function findChrome(){
  const paths=[process.env.SHIPCHECK_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','/opt/google/chrome/chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
  return paths.find(p=>fs.existsSync(p))||null;
}
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
class CDP {
  constructor(ws){this.ws=ws;this.serial=1;this.waiters=new Map();this.events=new Map();ws.addEventListener('message',event=>{
    let msg;try{msg=JSON.parse(event.data);}catch(e){return;}
    if(msg.id){const p=this.waiters.get(msg.id);if(!p)return;this.waiters.delete(msg.id);clearTimeout(p.timer);if(msg.error)p.reject(new Error(msg.error.message||JSON.stringify(msg.error)));else p.resolve(msg.result||{});return;}
    const k=(msg.sessionId||'root')+':'+msg.method;const list=this.events.get(k)||[];this.events.delete(k);list.forEach(f=>f(msg.params||{}));
  });}
  send(method,params={},sessionId,timeout=45000){return new Promise((resolve,reject)=>{const id=this.serial++;const timer=setTimeout(()=>{this.waiters.delete(id);reject(new Error('CDP timeout: '+method));},timeout);this.waiters.set(id,{resolve,reject,timer});try{this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}catch(e){clearTimeout(timer);this.waiters.delete(id);reject(e);}});}
  event(method,sessionId,timeout=15000){const k=(sessionId||'root')+':'+method;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Event timeout: '+method)),timeout);const fn=x=>{clearTimeout(timer);resolve(x)};this.events.set(k,[...(this.events.get(k)||[]),fn]);});}
  close(){try{this.ws.close()}catch(e){}}
}
async function connect(url){return new Promise((resolve,reject)=>{let ws;try{ws=new WebSocket(url)}catch(e){reject(e);return;}
  const t=setTimeout(()=>{try{ws.close()}catch(e){}reject(new Error('CDP websocket connection timeout'));},12000);
  ws.addEventListener('open',()=>{clearTimeout(t);resolve(new CDP(ws))},{once:true});
  ws.addEventListener('error',()=>{clearTimeout(t);reject(new Error('Cannot connect to local Chrome debugging endpoint'))},{once:true});
});}
async function startBrowser(){
  if(process.env.SHIPCHECK_CDP_URL){const raw=process.env.SHIPCHECK_CDP_URL;
    const u=new URL(raw);if(!['http:','ws:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error('SHIPCHECK_CDP_URL must be a local browser debugging endpoint');
    const url=raw.startsWith('ws')?raw:(await (await fetch(raw.replace(/\/$/,'')+'/json/version')).json()).webSocketDebuggerUrl;
    return {client:await connect(url),owned:false,stop:async()=>{}};
  }
  const chrome=findChrome();if(!chrome)throw new Error('Chrome / Chromium not found. Set SHIPCHECK_CHROME to its executable path.');
  const port=await freePort(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'shipcheck-cdp-'));
  const args=['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'];
  if(process.getuid&&process.getuid()===0)args.unshift('--no-sandbox');
  const child=spawn(chrome,args,{stdio:['ignore','ignore','pipe']});let errorOutput='';child.stderr.on('data',d=>{errorOutput+=String(d).slice(-400);});
  let client;try{
    let endpoint=null;
    for(let i=0;i<65;i++){if(child.exitCode!==null)throw new Error('Chromium exited early: '+errorOutput.slice(-400));
      try{const r=await fetch('http://127.0.0.1:'+port+'/json/version');if(r.ok){endpoint=(await r.json()).webSocketDebuggerUrl;break;}}catch(e){}
      await wait(150);
    }
    if(!endpoint)throw new Error('Chrome debugging socket did not start. '+errorOutput.slice(-300));
    client=await connect(endpoint);
  }catch(e){child.kill('SIGTERM');fs.rmSync(profile,{recursive:true,force:true});throw e;}
  return {client,owned:true,stop:async()=>{client.close();child.kill('SIGTERM');await wait(250);if(child.exitCode===null)child.kill('SIGKILL');fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:120});}};
}
const scanner=fs.readFileSync(path.join(__dirname,'../src/content/issue-explainer.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/content/search-audit.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/content/scanner.js'),'utf8');
function safeURL(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw new Error('Only http/https URLs are supported');if(u.username||u.password)throw new Error('URLs containing embedded credentials are not supported');return u.href;}
async function runCDPScan(url,widths=[390,768,1440],options={}){
  url=safeURL(url);
  const widthsSafe=(Array.isArray(widths)?widths:[390,768,1440]).map(Number).filter(x=>Number.isInteger(x)&&x>=240&&x<=2560).slice(0,4);
  if(!widthsSafe.length)throw new Error('Specify at least one viewport width (240–2560)');
  const instance=await startBrowser();const c=instance.client;let targetId=null;let session=null;
  try{
    targetId=(await c.send('Target.createTarget',{url:'about:blank'})).targetId;
    session=(await c.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
    await c.send('Page.enable',{},session);await c.send('Runtime.enable',{},session);
    const nav=await c.send('Page.navigate',{url},session,18000);
    if(nav.errorText)throw new Error('Navigation failed: '+nav.errorText);
    for(let i=0;i<65;i++){
      const res=await c.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true},session,5000).catch(()=>({result:{value:''}}));
      if(res.result&&res.result.value==='complete')break;await wait(200);
    }
    await wait(400);
    const locationCheck=await c.send('Runtime.evaluate',{expression:'({url:location.href,title:document.title})',returnByValue:true},session);
    const pageInfo=locationCheck.result && locationCheck.result.value || {};
    if(/^chrome-error:/i.test(pageInfo.url||'') || /^(This site can.t be reached|无法访问此网站)$/i.test(pageInfo.title||''))throw new Error('Target website failed to load in Chrome');
    const outcomes=[];
    for(const width of widthsSafe){
      await c.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},session);
      await wait(230);
      const js='(function(){'+scanner+'; return true;})()';
      // Each viewport reuses the same injected engine; duplicate injection is guarded in scanner.js.
      const injected=await c.send('Runtime.evaluate',{expression:js,returnByValue:true},session);
      if(injected.exceptionDetails)throw new Error('Scanner injection failed at '+width+'px');
      const expr='JSON.stringify(await window.__shipcheck.runScan('+JSON.stringify({widths:[width],modules:{responsive:true,interaction:true,visual:true,a11y:true,seo:true,geo:true,business:true},axeEnabled:false,timeout:2500})+'))';
      const r=await c.send('Runtime.evaluate',{expression:'(async()=>{return '+expr+'})()',awaitPromise:true,returnByValue:true},session,55000);
      if(r.exceptionDetails||!r.result||typeof r.result.value!=='string')throw new Error('Scan failed at '+width+'px: '+JSON.stringify(r.exceptionDetails||r.result));
      const data=JSON.parse(r.result.value);
      const vp=data.viewports.find(v=>!v.blocked)||data.viewports[0];
      outcomes.push({width,score:data.score,findings:data.findings,verification:data.verification,viewport:vp,notes:data.notes,signal:data.pageSignals,searchReadiness:data.searchReadiness,title:data.title});
    }
    const map=new Map();
    for(const o of outcomes)for(const f of o.findings){const k=f.rule+'|'+(f.selector||'');if(map.has(k)){
      const prev=map.get(k);const label=o.width+'px';if(!prev.viewports.includes(label))prev.viewports.push(label);
      if(['critical','high','medium','low'].indexOf(f.severity)<['critical','high','medium','low'].indexOf(prev.severity))prev.severity=f.severity;
      for(const v of f.evidence||[])if(!prev.evidence.includes(v)&&prev.evidence.length<9)prev.evidence.push(v);
    }else map.set(k,{...f,viewports:[o.width+'px']});}
    const findings=[...map.values()].sort((a,b)=>['critical','high','medium','low'].indexOf(a.severity)-['critical','high','medium','low'].indexOf(b.severity));
    const weights={critical:12,high:6,medium:2.5,low:0.8},byRule={};let deduct=0;
    for(const f of findings){if(f.verification)continue;let obj=byRule[f.rule]||{w:0,n:0};obj.w=Math.max(obj.w,weights[f.severity]||1);obj.n++;byRule[f.rule]=obj;}
    for(const o of Object.values(byRule))deduct+=o.w*(1+Math.min(o.n-1,4)*.3);
    const counts={total:0,critical:0,high:0,medium:0,low:0};for(const f of findings){if(f.verification)continue;counts.total++;counts[f.severity]++;}
    const scan={schema:'shipcheck.scan/v0.6',url,title:outcomes[0].title,time:new Date().toISOString(),engine:'0.6.0',score:Math.max(10,Math.min(100,Math.round(100-Math.min(deduct,90)))),findings,verification:findings.filter(f=>f.verification),counts,viewports:outcomes.map(o=>({...o.viewport,label:o.width+'px',width:o.width,requestedWidth:o.width,method:'native-cdp'})),pageSignals:outcomes[0].signal,searchReadiness:outcomes[0].searchReadiness||null,notes:[...new Set(outcomes.flatMap(o=>o.notes||[]))]};
    let screenshot=null;
    if(options.screenshot){const width=widthsSafe[0];await c.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},session);await wait(200);screenshot=(await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true},session,20000)).data;}
    return {scan,screenshot};
  }finally{
    try{if(targetId)await c.send('Target.closeTarget',{targetId},undefined,1500);}catch(e){}
    if(instance.owned)await instance.stop();else c.close();
  }
}
module.exports={runCDPScan,safeURL,findChrome,startBrowser};
