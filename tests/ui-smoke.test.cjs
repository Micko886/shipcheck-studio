'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {startBrowser,findChrome}=require('../mcp/cdp.js');
test('Search Lab initializes in a real Chromium JavaScript context with no extension permission', {skip:!findChrome()}, async()=>{
 const instance=await startBrowser(),c=instance.client;let id;
 try{
  id=(await c.send('Target.createTarget',{url:'about:blank'})).targetId;
  const session=(await c.send('Target.attachToTarget',{targetId:id,flatten:true})).sessionId;
  await c.send('Runtime.enable',{},session);
  let code="document.body.innerHTML='<div id=\\\"technical-audit-root\\\"></div>';";
  for(const rel of ['../src/studio/technical-audit.js','../src/studio/performance-import.js','../src/studio/technical-panel.js'])code+=fs.readFileSync(path.join(__dirname,rel),'utf8')+'\n';
  code+='({heading:document.querySelector(\'#technical-audit-root h3\')?.textContent, inputs:document.querySelectorAll(\'#technical-audit-root input\').length,run:Boolean(document.querySelector(\'#lab-run\')),ai:Boolean(document.querySelector(\'#lab-ai-review\'))})';
  const r=await c.send('Runtime.evaluate',{expression:code,returnByValue:true},session);
  assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));
  assert.equal(r.result.value.heading,'全站 SEO · GEO 证据');assert.equal(r.result.value.run,true);assert.equal(r.result.value.ai,true);
 }finally{try{if(id)await c.send('Target.closeTarget',{targetId:id},undefined,1200);}catch{}if(instance.owned)await instance.stop();else c.close();}
});
