/** Bounded source-HTML / real-render crawler using isolated Chromium and same-origin HTTP fetch.
 * Node 22+, no npm packages. This does not submit forms or persist credentials.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {startBrowser,safeURL}=require('./cdp.js');
const technical=require('../src/studio/technical-audit.js');
const script=fs.readFileSync(path.join(__dirname,'../src/studio/technical-audit.js'),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MAX_BODY=2*1024*1024;
function hostSafe(start,next){try{return new URL(next).origin===new URL(start).origin;}catch{return false;}}
async function fetchSameOrigin(raw,root,fetchImpl=fetch){
  const rootUrl=new URL(safeURL(root));let url=new URL(safeURL(raw));
  for(let redirects=0;redirects<5;redirects++){
    if(url.origin!==rootUrl.origin)throw new Error('Cross-origin fetch/redirect blocked: '+url.origin);
    const r=await fetchImpl(url.href,{method:'GET',redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(12000),headers:{'Accept':'text/html,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5','User-Agent':'ShipCheck-Studio/0.7 (authorized site audit)'}});
    if([301,302,303,307,308].includes(r.status)){
      const loc=r.headers.get('location');if(!loc)throw new Error('Redirect without Location');url=new URL(loc,url);continue;
    }
    const contentLength=Number(r.headers.get('content-length'));
    if(contentLength>MAX_BODY)throw new Error('Document exceeds 2 MiB scan limit');
    // Stream with cap to avoid loading oversized files.
    let buffer='';const reader=r.body?.getReader();if(reader){const decoder=new TextDecoder();let bytes=0;
      while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BODY){await reader.cancel().catch(()=>{});throw new Error('Document exceeds 2 MiB scan limit');}buffer+=decoder.decode(value,{stream:true});}buffer+=decoder.decode();
    }else buffer=await r.text();
    return {url:url.href,status:r.status,contentType:r.headers.get('content-type')||'',headers:{'x-robots-tag':r.headers.get('x-robots-tag')||''},body:buffer};
  }
  throw new Error('Too many redirects');
}
function encodeJSON(value){return JSON.stringify(value).replace(/</g,'\\u003c');}
async function browserEval(c,session,expression,timeout=25000){
  const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session,timeout);
  if(r.exceptionDetails||!r.result||!('value'in r.result))throw new Error('Browser evaluation error: '+(r.exceptionDetails?.text||'empty result'));
  return r.result.value;
}
async function advancedCrawl(url,{maxPages=8,sourceOnly=false,onProgress,fetchImpl}={}){
  url=safeURL(url);const instance=await startBrowser(),c=instance.client;let id=null,session=null;
  const results={browser:{available:true,renderedPages:0,errors:[]}};
  async function blank(){await c.send('Page.navigate',{url:'about:blank'},session,14000);await sleep(70);}
  try{
    id=(await c.send('Target.createTarget',{url:'about:blank'})).targetId;
    session=(await c.send('Target.attachToTarget',{targetId:id,flatten:true})).sessionId;
    await c.send('Page.enable',{},session);await c.send('Runtime.enable',{},session);await blank();
    await browserEval(c,session,'(function(){'+script+';return Boolean(globalThis.ShipCheckTechnical)})()');
    const extract=async(html,href)=>{
      await blank();
      // Script is loaded again after each navigation; src HTML is inert DOMParser input.
      const expr='(function(){'+script+';return globalThis.ShipCheckTechnical.extractPage('+encodeJSON(html)+','+encodeJSON(href)+', (h,t)=>new DOMParser().parseFromString(h,t));})()';
      return await browserEval(c,session,expr);
    };
    const xmlExtract=async(xml,href)=>{
      await blank();
      const expr='(function(){'+script+';return globalThis.ShipCheckTechnical.parseSitemap('+encodeJSON(xml)+','+encodeJSON(href)+',(h,t)=>new DOMParser().parseFromString(h,t));})()';
      return await browserEval(c,session,expr);
    };
    const rendered=sourceOnly?null:async(pageUrl)=>{
      try{
        const nav=await c.send('Page.navigate',{url:pageUrl},session,15000);
        if(nav.errorText)throw new Error(nav.errorText);
        for(let j=0;j<35;j++){
          const state=await browserEval(c,session,'document.readyState').catch(()=>'');
          if(state==='complete')break;await sleep(180);
        }
        await sleep(220);
        const data=await browserEval(c,session,`(function(){const e=document.querySelector('main,[role="main"],article')||document.body;const t=String(e?.innerText||'').replace(/\\s+/g,' ').trim();return {url:location.href,title:document.title,textLength:t.length,textSample:t.slice(0,5000)};})()`);
        if(/^chrome-error:/i.test(data.url||'')||!hostSafe(url,data.url))throw new Error('Browser could not load the requested same-origin page');
        results.browser.renderedPages++;return data;
      }catch(e){results.browser.errors.push({url:pageUrl,error:String(e.message||e).slice(0,200)});throw e;}
    };
    const audit=await technical.crawlSite({url,maxPages,onProgress,fetcher:u=>fetchSameOrigin(u,url,fetchImpl||fetch),extract,xmlExtract,rendered});
    audit.runner=results;return audit;
  }finally{
    try{if(id)await c.send('Target.closeTarget',{targetId:id},undefined,1500);}catch{}
    if(instance.owned)await instance.stop();else c.close();
  }
}
module.exports={advancedCrawl,fetchSameOrigin,MAX_BODY};
