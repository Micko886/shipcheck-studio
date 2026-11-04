/* ShipCheck Local Lighthouse Panel · no third-party API calls. */
(()=>{
 'use strict';
 const root=document.querySelector('#pagespeed-root');if(!root)return;
 const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const IS_EXT=!!(typeof chrome!=='undefined'&&chrome.runtime?.id&&chrome.permissions&&chrome.storage);
 const BASE='http://127.0.0.1:48762';
 const ORIGIN='http://127.0.0.1/*';
 const LABELS={performance:'性能',accessibility:'无障碍','best-practices':'最佳实践',seo:'SEO'};
 let token='',connected=false,working=false,jobId='',status='',error='',url='',results=[],lastUrlList=[],currentMax=3,initialized=false;
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 function scoreHtml(k,v){const cls=v==null?'unknown':v>=90?'good':v>=50?'warn':'bad';return `<div class="psi-score ${cls}"><span>${LABELS[k]}</span><strong>${v??'—'}</strong><small>${v==null?'未测得':'本地 Lighthouse'}</small></div>`;}
 function card(r){if(r.error)return `<div class="psi-result"><div class="psi-result-title"><b>${esc(r.url||'')} · ${esc(r.strategy)}</b></div><p class="psi-error">未完成：${esc(r.error)}</p></div>`;
  return `<div class="psi-result"><div class="psi-result-title"><b>${esc(r.url)} · ${r.strategy==='mobile'?'手机':'桌面'}</b><span>${esc(r.rawVersion||'Lighthouse')}</span></div>
   <div class="psi-score-grid">${Object.keys(LABELS).map(k=>scoreHtml(k,r.scores?.[k])).join('')}</div>
   <div class="psi-metrics">${(r.lab||[]).map(x=>`<div><b>${esc(x.label)}</b><span>${esc(x.value)}</span></div>`).join('')}</div>
   <p class="psi-muted">本地实验室结果；真实用户 INP / CrUX 不在本次检测范围。${r.reportFile?'原始报告保存在 local-runner/'+esc(r.reportFile):''}</p>
   <h4>建议优先检查</h4>${(r.recommendations||[]).length?(r.recommendations||[]).slice(0,8).map(x=>`<div class="psi-advice"><b>${esc(x.title)}</b><span>${esc(x.displayValue)}</span><p>${esc(x.description)}</p></div>`).join(''):'<p class="psi-muted">本次没有可展示的高优先级建议。</p>'}</div>`;
 }
 function render(){
  root.innerHTML=`<section class="psi-panel">
   <div class="psi-heading"><div><span class="studio-kicker">LOCAL LIGHTHOUSE · NO CLOUD RELAY</span><h3>本机 Lighthouse 性能检测</h3><p>在你的电脑上运行 Chromium + Lighthouse。标准化测试性能、无障碍、最佳实践和基础 SEO；无需 Google PageSpeed API。</p></div></div>
   <div class="psi-state" role="status"><strong>本地检测器：</strong>${connected?'已连接': '尚未连接'}${working?' · '+esc(status):status?' · '+esc(status):''}${error?'<p class="psi-error">'+esc(error)+'</p>':''}</div>
   <div class="psi-local-form"><label class="psi-label">本机运行器访问令牌<input id="local-lh-token" type="password" autocomplete="off" placeholder="粘贴运行器终端显示的 64 位本地令牌" value="${esc(token)}"></label>
   <div class="psi-actions"><button class="btn" id="local-lh-connect">连接本地检测器</button><button class="btn solid" id="local-lh-run" ${working||!connected?'disabled':''}>${working?'检测运行中…':'手动检测当前 URL'}</button></div>
   <label class="psi-label">检测 URL<input id="local-lh-url" type="url" value="${esc(url)}" placeholder="https://example.com/ 或 http://localhost:3000/"></label>
   <label class="psi-label">一键全站扫描时 Lighthouse 抽样页数<select id="local-lh-max">${[1,3,5,10,20].map(n=>`<option value="${n}" ${currentMax===n?'selected':''}>${n} 页（手机 + 桌面）</option>`).join('')}</select></label></div>
   <p class="psi-muted">本地组件启动：Windows 双击 <code>local-runner/start-windows.cmd</code>；macOS/Linux 执行 <code>./start-mac-linux.sh</code>。首次需要 Node.js 22+ 并联网安装开源 Lighthouse 依赖。只连接 127.0.0.1，不向 ShipCheck 云端上传网站内容；被测网站本身可能产生网络请求。</p>
   <div class="psi-actions"><button class="btn" id="local-lh-export" ${!results.length?'disabled':''}>导出本地 Lighthouse JSON</button></div>
   <p class="psi-muted">一键全站 QA / SEO / GEO 不依赖本地检测器，未连接时会提示速度检查未执行，不会影响其他模块完成状态。大型网站只抽样部分页面做 Lighthouse，其余仍按原设置执行规则扫描。</p>
   <div class="psi-results">${results.length?results.map(card).join(''):'<p class="psi-muted">尚未取得本地 Lighthouse 结果。</p>'}</div>
  </section>`;
  root.querySelector('#local-lh-token').addEventListener('input',e=>{token=e.target.value.trim();});
  root.querySelector('#local-lh-url').addEventListener('change',e=>{url=e.target.value.trim();});
  root.querySelector('#local-lh-max').addEventListener('change',async e=>{currentMax=Number(e.target.value);if(IS_EXT)await chrome.storage.local.set({'shipcheck.localLighthouse.pages':currentMax});});
  root.querySelector('#local-lh-connect').addEventListener('click',connect);
  root.querySelector('#local-lh-run').addEventListener('click',()=>runManual());
  root.querySelector('#local-lh-export').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({source:'local-lighthouse',results},null,2)],{type:'application/json'});
    const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='shipcheck-local-lighthouse-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
  });
 }
 async function call(path,options={}){
  const response=await fetch(BASE+path,{...options,headers:{'X-ShipCheck-Token':token,...(options.headers||{})},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(25000)});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok)throw new Error(data.error||'本地 HTTP '+response.status);
  return data;
 }
 async function canConnect(){if(!IS_EXT)return false;return chrome.permissions.contains({origins:[ORIGIN]});}
 async function connect(){
  // Request at the start of the user-click handler to preserve Chrome activation.
  const grant=IS_EXT?chrome.permissions.request({origins:[ORIGIN]}):Promise.resolve(false);
  const value=root.querySelector('#local-lh-token')?.value.trim()||token;
  token=value;
  if(!/^[a-f0-9]{64}$/.test(token)){error='请输入本地终端显示的 64 位令牌';render();return;}
  working=true;error='';status='正在建立本机连接…';render();
  try{if(!await grant)throw new Error('没有授予访问 127.0.0.1 的权限');
    const info=await call('/health');if(!info.ok)throw new Error('本地检测器未就绪');
    connected=true;status='本地引擎 v'+info.version+' 已就绪';
    if(IS_EXT)await chrome.storage.local.set({'shipcheck.localLighthouse.token':token});
  }catch(e){connected=false;error=String(e.message||e)+'。请先启动 local-runner 中的程序。';}
  finally{working=false;render();}
 }
 async function runManual(){if(!url)return;await runJob([url]);}
 async function runJob(urls){
  if(working||!connected||!token)return;
  let origin;
  try{origin=new URL(urls[0]).origin;for(const u of urls){const parsed=new URL(u);if(!/^https?:$/.test(parsed.protocol)||parsed.origin!==origin)throw new Error('本次仅允许同站 HTTP(S) URL');}}
  catch(e){error='URL 不正确：'+String(e.message||e);render();return;}
  working=true;error='';results=[];status='正在创建本地 Lighthouse 任务…';lastUrlList=urls;render();
  try{
    const response=await call('/audit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls,strategies:['mobile','desktop']})});
    jobId=response.jobId;let data=null;
    while(true){await delay(1800);data=await call('/jobs/'+encodeURIComponent(jobId));results=data.results||[];status=`${data.completed||0}/${data.total||0} 项检测完成`;
      render();if(data.status==='done')break;if(data.status==='failed')throw new Error(data.error||'本地检测任务失败');
    }
    status=`${results.filter(x=>!x.error).length}/${results.length} 项 Lighthouse 已完成`;
    const byFirst=results.filter(x=>x.url===urls[0]);const compact={};for(const r of byFirst)compact[r.strategy]=r;
    window.dispatchEvent(new CustomEvent('shipcheck:pagespeed',{detail:{source:'local-lighthouse',url:urls[0],results:compact,pages:results,coverage:{requestedUrls:urls.length,tests:results.length},updatedAt:new Date().toISOString()}}));
  }catch(e){error=String(e.message||e);status='本次速度检测未完成';}
  finally{working=false;render();}
 }
 async function init(){if(initialized)return;initialized=true;
  if(IS_EXT){try{const saved=await chrome.storage.local.get(['shipcheck.localLighthouse.token','shipcheck.localLighthouse.pages']);
    token=saved['shipcheck.localLighthouse.token']||'';currentMax=saved['shipcheck.localLighthouse.pages']||3;
    if(token&&await canConnect()){const res=await call('/health');connected=!!res.ok;status=connected?'本地引擎已就绪':'本地引擎未连接';}
  }catch(e){connected=false;status='未启动或无法连接本地运行器';}}
  render();
 }
 function setUrl(next){if(next&&url!==next){url=next;results=[];error='';status='';render();}}
 async function runForScan(urls){
  const input=Array.isArray(urls)?urls:[urls];const unique=[...new Set(input.filter(Boolean))].slice(0,currentMax);
  if(!unique.length)return;
  if(!token||!await canConnect()){error='未连接本地 Lighthouse；QA / SEO / GEO 扫描已完成，速度检查未运行。';render();return;}
  try{const health=await call('/health');connected=!!health.ok;}catch(e){connected=false;error='本地运行器离线，请先启动程序';render();return;}
  await runJob(unique);
 }
 window.ShipCheckPageSpeedPanel={setUrl,runForScan,getResults:()=>({pages:results,source:'local-lighthouse'}),isConnected:()=>connected};
 render();void init();
})();
