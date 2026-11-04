/* Search Readiness — dedicated extension panel; separate from delivery score. */
(() => {'use strict';
  const E=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const $=s=>document.querySelector(s);
  let current=null;
  const tags={pass:'已检测',attention:'需关注',unverified:'未验证'};
  function render(scan){const el=$('#search-readiness-root');if(!el)return;
    current=scan?.searchReadiness||null;
    if(!current){el.innerHTML='<div class="studio-heading"><h3>SEO / GEO / AEO 搜索准备度</h3></div><p class="studio-muted">还没有搜索准备度结果。请在扫描设置中开启 Technical SEO 与 GEO/AEO，重新扫描当前网页。</p>';return;}
    const x=current;
    const groups=[['seo','Technical SEO'],['geo','GEO · 实体与证据'],['aeo','AEO · 内容回答结构']];
    el.innerHTML=`<div class="studio-heading"><div><span class="studio-kicker">SEARCH READINESS / EVIDENCE FIRST</span><h3>SEO / GEO / AEO</h3></div><span class="studio-tag">本页检测</span></div>
      <p class="studio-muted">技术 SEO 与 AI 可理解性分别检查。没有“GEO 排名预测分”；未验证不等于不合格。</p>
      <div class="studio-metrics"><span><b>${x.summary.pass}</b> 已检测</span><span><b>${x.summary.attention}</b> 需关注</span><span><b>${x.summary.unverified}</b> 未验证</span></div>
      ${groups.map(([g,name])=>`<div class="studio-heading" style="margin-top:17px"><h3>${name}</h3></div>${x.checks.filter(c=>c.group===g).map(c=>`<article class="search-check ${E(c.status)}"><div class="search-check-title"><strong>${E(c.label)}</strong><span>${tags[c.status]}</span></div><p>${E(c.evidence)}</p><small>${E(c.advice)}</small></article>`).join('')}`).join('')}
      <div class="studio-action-row"><button data-search="agent" class="btn solid">复制 Agent 修复任务</button><button data-search="copy" class="btn">复制报告</button><button data-search="export" class="btn">导出 Markdown</button></div>
      <p class="studio-muted">仅检查当前 DOM。实际收录、robots.txt、X-Robots-Tag、站点地图、AI 引用量需要进一步独立验证。</p>`;
  }
  $('#tab-search')?.addEventListener('click',async ev=>{const b=ev.target.closest('[data-search]');if(!b||!current)return;
    const txt=b.dataset.search==='agent'?window.ShipCheckSearch.agentTask(current):window.ShipCheckSearch.markdown(current);
    if(b.dataset.search==='copy'||b.dataset.search==='agent'){try{await navigator.clipboard.writeText(txt);b.textContent='已复制';}catch(e){b.textContent='复制失败';}}
    if(b.dataset.search==='export'){const url=URL.createObjectURL(new Blob([txt],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='shipcheck-search-readiness.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  });
  window.ShipCheckSearchPanel={render};
})();
