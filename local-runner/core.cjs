'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const MAX_URLS=20;
function validURL(input){
  if(typeof input!=='string'||input.length>2048)throw new Error('URL 不合法');
  let u;try{u=new URL(input);}catch{throw new Error('无法解析 URL');}
  if(!['https:','http:'].includes(u.protocol)||!u.hostname||u.username||u.password)throw new Error('仅允许 HTTP(S) URL，且不能包含用户名密码');
  u.hash='';return u.href;
}
function sanitizeJob(input){
  if(!input||typeof input!=='object')throw new Error('缺少检测参数');
  const urls=[...new Set((Array.isArray(input.urls)?input.urls:[]).map(validURL))];
  if(!urls.length)throw new Error('请提供至少一个 URL');
  if(urls.length>MAX_URLS)throw new Error('一次 Lighthouse 最多运行 '+MAX_URLS+' 页；请缩小选择或分批检测');
  const origin=new URL(urls[0]).origin;
  if(urls.some(u=>new URL(u).origin!==origin))throw new Error('一项任务只允许同源页面');
  const strategies=[...new Set((Array.isArray(input.strategies)?input.strategies:['mobile','desktop']).filter(x=>['mobile','desktop'].includes(x)))];
  if(!strategies.length)throw new Error('请选择 mobile / desktop');
  return {urls,strategies};
}
function score(v){return typeof v==='number'&&v>=0&&v<=1?Math.round(v*100):null;}
const names={'first-contentful-paint':'FCP','largest-contentful-paint':'LCP','total-blocking-time':'TBT','cumulative-layout-shift':'CLS','speed-index':'Speed Index','interactive':'TTI'};
function parseLHR(lhr,{url,strategy}={}){
  if(!lhr||typeof lhr!=='object'||!lhr.categories)throw new Error('Lighthouse 没有返回有效报告');
  const cats=lhr.categories||{},audits=lhr.audits||{};
  const scores={};for(const k of ['performance','accessibility','best-practices','seo'])scores[k]=score(cats[k]?.score);
  const lab=Object.entries(names).map(([id,label])=>audits[id]?{id,label,value:audits[id].displayValue||'未提供',numericValue:audits[id].numericValue??null}:null).filter(Boolean);
  const recommended=[];
  const ids=new Set();for(const c of Object.values(cats))for(const a of c.auditRefs||[])if((a.weight||0)>0)ids.add(a.id);
  for(const id of ids){const a=audits[id];if(!a||typeof a.score!=='number'||a.score>=.9||['manual','notApplicable','informative'].includes(a.scoreDisplayMode))continue;
    recommended.push({id,title:a.title||id,description:String(a.description||'').replace(/\[[^\]]*\]\([^)]*\)/g,'').slice(0,360),score:a.score,displayValue:a.displayValue||'',advice:'依据当前审计证据定位资源或元素，优先修复后在相同测试条件下复测。'});
  }
  recommended.sort((a,b)=>a.score-b.score);
  return {url:url||lhr.requestedUrl||'',analyzedUrl:lhr.finalDisplayedUrl||lhr.finalUrl||url||'',strategy,date:new Date().toISOString(),scores,lab,
    recommendations:recommended.slice(0,20),field:[],fieldSource:'本地 Lighthouse 为实验室测试，不提供 CrUX 真实用户数据',runtimeError:lhr.runtimeError?.message||null,rawVersion:lhr.lighthouseVersion||null,source:'local-lighthouse'};
}
function tokenFile(base=__dirname){return path.join(base,'.shipcheck-token');}
function loadOrCreateToken(base=__dirname){const file=tokenFile(base);if(fs.existsSync(file)){const v=fs.readFileSync(file,'utf8').trim();if(/^[a-f0-9]{64}$/.test(v))return v;throw new Error('本地令牌文件格式不正确，请手动检查');}
  const value=crypto.randomBytes(32).toString('hex');fs.writeFileSync(file,value,{mode:0o600,flag:'wx'});return value;
}
function allowedOrigin(origin){return !origin||/^chrome-extension:\/\/[a-p]{32}$/.test(origin);}
module.exports={MAX_URLS,validURL,sanitizeJob,parseLHR,tokenFile,loadOrCreateToken,allowedOrigin};
