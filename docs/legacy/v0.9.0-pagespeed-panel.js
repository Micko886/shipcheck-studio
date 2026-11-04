/* PageSpeed tab: explicit external request or saved opt-in after unified scan. */
(() => {
  'use strict';
  const $=q=>document.querySelector(q), esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const extension=Boolean(typeof chrome!=='undefined'&&chrome.runtime?.id&&chrome.permissions);
  const API=window.ShipCheckPageSpeed;
  const root=$('#pagespeed-root');if(!root||!API)return;
  let url='',results={},working=false,lastError='',apiKey='';
  const labels={performance:'性能',accessibility:'无障碍', 'best-practices':'最佳实践',seo:'SEO'};
  function scoreHtml(name,v){const css=v==null?'unknown':v>=90?'good':v>=50?'warn':'bad';return `<div class="psi-score ${css}"><span>${labels[name]}</span><strong>${v??'—'}</strong><small>${v==null?'未获取':'Lighthouse 实验室评分'}</small></div>`;}
  function block(data){if(!data)return '<p class="psi-muted">本设备尚未分析，不能显示评分。</p>';
    return `<section class="psi-result"><div class="psi-result-title"><strong>${data.strategy==='mobile'?'Mobile · 移动端':'Desktop · 桌面端'}</strong><span>${esc(data.rawVersion||'Lighthouse')}</span></div>
    <div class="psi-score-grid">${Object.keys(labels).map(k=>scoreHtml(k,data.scores[k])).join('')}</div>
    <div class="psi-metrics">${data.lab.map(m=>`<div><b>${esc(m.label)}</b><span>${esc(m.value)}</span></div>`).join('')}</div>
    <div class="psi-field"><strong>真实用户数据（CrUX）</strong><small>${esc(data.fieldSource)}</small>${data.field.length?data.field.map(m=>`<span>${esc(m.label)}：${esc(m.value)} ${esc(m.category)}</span>`).join(''):'<span>本次没有 URL 级真实用户指标。不能将实验室结果视作用户实际体验。</span>'}</div>
    <h4>建议优先处理的问题</h4>${data.recommendations.length?data.recommendations.slice(0,9).map((a,i)=>`<div class="psi-advice"><b>${i+1}. ${esc(a.title)}</b><span>${esc(a.displayValue)}</span><p>${esc(a.advice)}</p><small>${esc(a.description)}</small></div>`).join(''):'<p class="psi-muted">Lighthouse 未返回需要优化的评分审计项，仍需结合真实设备测试。</p>'}
    </section>`;}
  function render(){
    root.innerHTML=`<section class="psi-panel"><div class="psi-heading"><div><span class="studio-kicker">GOOGLE PAGESPEED INSIGHTS</span><h3>页面速度 · Core Web Vitals</h3><p>Google 官方 Lighthouse：Performance、Accessibility、Best Practices、SEO；并单独展示存在时的 CrUX 实际用户数据。</p></div></div>
    <label class="psi-label">当前分析 URL<input id="psi-url" type="url" value="${esc(url)}" placeholder="https://example.com/"></label>
    <label class="psi-label">可选 API Key（只在本次面板内使用，不保存）<input id="psi-key" type="password" autocomplete="off" placeholder="不填可尝试公开 API，可能受配额限制"></label>
    <div class="psi-actions"><button class="btn solid" id="psi-run" ${working?'disabled':''}>${working?'正在获取 Google 测试结果…':'检测手机端 + 桌面端'}</button><button class="btn" id="psi-export" ${!Object.keys(results).length?'disabled':''}>导出 PageSpeed JSON</button></div>
    <p class="psi-muted">只有点击检测或在设置中明确打开「自动 PageSpeed」才会将 URL 发送给 Google。每个结果对应一个 URL 和一类设备，不能表示全站每页的速度。</p>
    <div class="psi-state" role="status">${working?'正在等待 Google Lighthouse 结果（两个设备分别运行），不影响已完成的本地 QA / SEO / GEO 检查。':lastError?'获取失败：'+esc(lastError):Object.keys(results).length?'已获取 '+Object.keys(results).length+' 项设备分析结果。':'尚未执行 Google PageSpeed 检查。'}</div>
    <div class="psi-results">${block(results.mobile)}${block(results.desktop)}</div></section>`;
    $('#psi-run').addEventListener('click',()=>run({askPermission:true}));
    $('#psi-export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({url,results},null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='shipcheck-pagespeed-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
    $('#psi-url').addEventListener('change',e=>{url=e.target.value.trim();results={};lastError='';render();});
    // key is intentionally kept in module memory and not in persistent storage
    const k=$('#psi-key');k.value=apiKey;k.addEventListener('input',e=>{apiKey=e.target.value;});
  }
  async function ensurePermission(ask){if(!extension)return true;const origin='https://www.googleapis.com/*';if(ask)return chrome.permissions.request({origins:[origin]});return chrome.permissions.contains({origins:[origin]});}
  async function run({askPermission=false,siteUrl}={}){
    if(working)return;
    if(siteUrl)url=siteUrl;
    try{API.validURL(url);}catch(e){lastError=e.message;render();return;}
    // Request permission before other awaits, as required for Chrome user gestures.
    const authPromise=ensurePermission(askPermission);
    working=true;results={};lastError='';render();
    try{
      const allowed=await authPromise;if(!allowed)throw new Error('没有授权访问 Google PageSpeed API；本地扫描不受影响');
      for(const strategy of ['mobile','desktop']){
        try{results[strategy]=await API.query(url,strategy,{key:apiKey});}catch(e){results[strategy]={strategy,error:String(e.message||e)};lastError=String(e.message||e);}
        render();
      }
    }catch(e){lastError=String(e.message||e);}finally{working=false;render();}
    if(typeof window.CustomEvent==='function')window.dispatchEvent(new CustomEvent('shipcheck:pagespeed',{detail:{url,results:{...results}}}));
    return {...results};
  }
  // Guard partial responses independently; a failed strategy is not a 0-point audit.
  const rawBlock=block;
  block=function(data){if(data?.error)return `<p class="psi-error">${esc(data.strategy)} 检测失败：${esc(data.error)}</p>`;return rawBlock(data);};
  function setUrl(next){if(!url||next&&url!==next){url=next;results={};lastError='';render();}}
  window.ShipCheckPageSpeedPanel={setUrl,runForScan:(siteUrl)=>run({siteUrl,askPermission:false}),getResults:()=>({...results})};
  render();
})();
