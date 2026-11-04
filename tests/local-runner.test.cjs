'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const core=require('../local-runner/core.cjs');
const base=path.join(__dirname,'..','local-runner');
test('local runner sanitizes URLs, enforces 20 URL and same-origin limits',()=>{
 assert.deepEqual(core.sanitizeJob({urls:['https://example.com/a#x','https://example.com/a#z'],strategies:['mobile','mobile']}),{urls:['https://example.com/a'],strategies:['mobile']});
 assert.throws(()=>core.sanitizeJob({urls:['https://example.com','https://other.com']}),/同源/);
 assert.throws(()=>core.sanitizeJob({urls:['javascript:alert(1)']}),/HTTP/);
 assert.throws(()=>core.sanitizeJob({urls:Array.from({length:21},(_,i)=>'https://example.com/'+i)}),/20/);
 assert.equal(core.validURL('http://localhost:3000/'),'http://localhost:3000/');
});
test('Lighthouse lab parser does not fabricate CrUX metrics and stores evidence',()=>{
 const r=core.parseLHR({lighthouseVersion:'13.6.0',categories:{performance:{score:.65,auditRefs:[{id:'unused-javascript',weight:1}]},accessibility:{score:.98},seo:{score:1},'best-practices':{score:.90}},audits:{'largest-contentful-paint':{displayValue:'3.9 s',numericValue:3900},'unused-javascript':{score:.25,title:'Reduce unused JS',displayValue:'55 KiB',description:'Consider code splitting'}}},{url:'http://localhost:3000/',strategy:'desktop'});
 assert.equal(r.scores.performance,65);assert.equal(r.scores.accessibility,98);assert.equal(r.scores.seo,100);
 assert.equal(r.lab[0].numericValue,3900);assert.equal(r.field.length,0);assert.equal(r.recommendations[0].id,'unused-javascript');assert.equal(r.source,'local-lighthouse');
});
test('local token is persistent and not an all-zero/example secret',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shipcheck-token-'));try{const a=core.loadOrCreateToken(tmp);const b=core.loadOrCreateToken(tmp);assert.match(a,/^[a-f0-9]{64}$/);assert.equal(a,b);const st=fs.statSync(core.tokenFile(tmp));if(process.platform!=='win32')assert.equal(st.mode&0o077,0);}finally{fs.rmSync(tmp,{force:true,recursive:true});}
});
test('accepts Chrome extension origins but refuses ordinary websites',()=>{
 assert.equal(core.allowedOrigin('chrome-extension://'+'a'.repeat(32)),true);
 assert.equal(core.allowedOrigin('https://random-website.com'),false);
 assert.equal(core.allowedOrigin('chrome-extension://bad/id'),false);
});
test('127.0.0.1 HTTP service blocks unauthorized requests and malformed audit jobs',async(t)=>{
 const port=48791;const child=spawn(process.execPath,[path.join(base,'server.cjs')],{cwd:base,env:{...process.env,SHIPCHECK_PORT:String(port)},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 const token=core.loadOrCreateToken(base);
 let ready=false;for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,100));try{const x=await fetch('http://127.0.0.1:'+port+'/health',{headers:{'X-ShipCheck-Token':token}});if(x.ok){ready=true;break;}}catch{}}
 assert.ok(ready,'server started and authenticated health returned');
 const endpoint='http://127.0.0.1:'+port;
 const denied=await fetch(endpoint+'/health');assert.equal(denied.status,401);
 const forbidden=await fetch(endpoint+'/health',{headers:{'Origin':'https://evil.example','X-ShipCheck-Token':token}});assert.equal(forbidden.status,403);
 const bad=await fetch(endpoint+'/audit',{method:'POST',headers:{'X-ShipCheck-Token':token,'Content-Type':'application/json'},body:JSON.stringify({urls:['file:///etc/passwd']})});assert.equal(bad.status,400);
 const allowed=await fetch(endpoint+'/health',{headers:{'Origin':'chrome-extension://'+'a'.repeat(32),'X-ShipCheck-Token':token}});assert.equal(allowed.status,200);assert.equal(allowed.headers.get('access-control-allow-origin'),'chrome-extension://'+'a'.repeat(32));
});
test('extension uses localhost only; remote PageSpeed is not loaded in current UI',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../src/sidepanel/index.html'),'utf8');const app=fs.readFileSync(path.join(__dirname,'../src/sidepanel/app.js'),'utf8');const manifest=require('../manifest.json');
 assert.match(html,/local-lighthouse-panel\.js/);assert.doesNotMatch(html,/<script src="\.\.\/studio\/pagespeed-panel\.js"/);
 assert.match(app,/autoLocalLighthouse/);assert.doesNotMatch(app,/正在从 Google 获取首页/);
 assert.deepEqual(manifest.optional_host_permissions.includes('https://www.googleapis.com/*'),false);
 assert.match(fs.readFileSync(path.join(__dirname,'../src/studio/local-lighthouse-panel.js'),'utf8'),/127\.0\.0\.1:48762/);
});
