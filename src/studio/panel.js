/* Project overview for automatic QA reports. No manual Delivery Readiness flow. */
(() => {
  'use strict';
  const Core = window.ShipCheckCore;
  const IS_EXT = Boolean(typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage);
  const KEY = 'shipcheck.studio.projects';
  const $ = selector => document.querySelector(selector);
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  let scan=null, project=null, projects={}, activeOrigin='', loaded=false;
  function toast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400);}
  async function preload(){if(loaded)return;loaded=true;if(IS_EXT){try{projects=(await chrome.storage.local.get(KEY))[KEY]||{};}catch(e){console.warn('ShipCheck storage:',e);}}}
  async function persist(){if(!project)return;projects[activeOrigin]=project;if(IS_EXT)await chrome.storage.local.set({[KEY]:projects});}
  async function update(newScan,currentUrl){
    await preload();scan=newScan||null;
    const url=scan?.url||currentUrl||'';const origin=Core.originOf(url);
    if(!origin){$('#project-overview').innerHTML='<div class="studio-muted">打开网站后，点击「一键扫描全站」查看检查结果。</div>';return;}
    if(activeOrigin!==origin||!project){activeOrigin=origin;project=Core.makeProject(scan||{url,title:new URL(url).hostname},projects[origin]);await persist();}
    if(IS_EXT&&scan?.findings)try{await chrome.storage.local.set({'shipcheck.studio.lastScan':scan});}catch(e){console.warn(e);}
    render();
  }
  function render(){if(!project)return;
    const completed=Boolean(scan?.findings),count=(scan?.findings||[]).filter(f=>!f.verification).length;
    const pages=scan?.siteScan?.pages||[],done=pages.filter(p=>p.score!=null).length;
    const priority=(scan?.findings||[]).filter(f=>!f.verification&&['critical','high'].includes(f.severity)).length;
    $('#project-overview').innerHTML=`<div class="studio-status ${completed?'green':'amber'}"><div><span class="studio-kicker">SCAN STATUS · 自动检查</span><strong>${completed?'检查已执行':'尚未扫描'}</strong><small>只报告实际扫描结果，不要求用户进行人工验收勾选。结果不等于完整业务测试或合规认证。</small></div><div class="studio-count">${completed?count:'—'}<small>发现问题</small></div></div><div class="studio-metrics"><span><b>${priority}</b> 高优先级</span><span><b>${done}</b> 已完成页</span><span><b>${Math.max(0,pages.length-done)}</b> 未完成页</span></div>`;
    $('#delivery-chip').textContent=completed?`扫描已执行 · ${count} 项发现`:'尚未扫描';
    $('#delivery-chip').dataset.status=completed?'scanned':'not_scanned';
    $('#project-details').innerHTML=`<div class="studio-heading"><div><span class="studio-kicker">PROJECT CONTEXT · 仅供检查分类</span><h3>网站类型</h3></div><span class="studio-tag">${project.confirmed?'用户设定':'自动推测'}</span></div><label class="studio-field">类型<select id="prj-type">${Object.entries(Core.TYPES).map(([k,v])=>`<option value="${k}" ${k===project.type?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label><button class="btn" data-studio="save-type">保存分类</button><p class="studio-muted">网站分类只用于报告上下文，不会自动生成需要人工确认的业务流程待办。</p>`;
    $('#project-plan').innerHTML=`<div class="studio-heading"><div><span class="studio-kicker">AUTOMATIC COVERAGE</span><h3>实际检查范围</h3></div></div><div class="studio-metrics"><span>QA / 无障碍：${completed?'已执行':'未执行'}</span><span>SEO / GEO：${scan?.searchReadiness?'已采集':'未采集'}</span><span>全站页面：${pages.length?`${done}/${pages.length}`:'尚未抓取'}</span></div><p class="studio-muted">无法自动证实的真实支付、邮件接收或后台写入结果将标注「未测试」，而不会算作未完成的人工验收。</p>`;
    $('#project-workflow').innerHTML=`<div class="studio-heading"><div><span class="studio-kicker">LOCATE & FIX</span><h3>问题定位与修复</h3></div></div><p class="studio-muted">发现问题 → 查看页面及元素 → 复制修复任务 → 重新扫描。</p><div class="studio-action-row"><button class="btn solid" data-studio="open-inspector">打开可视化问题工作台 ↗</button><button class="btn" data-studio="copy-agent">复制优先修复任务</button></div>`;
  }
  $('#tab-project').addEventListener('click',async e=>{
    const btn=e.target.closest('[data-studio]');if(!btn||!project)return;
    if(btn.dataset.studio==='save-type') { const t=$('#prj-type').value;project.type=Core.TYPES[t]?t:'generic';project.confirmed=true;await persist();render();toast('类型已保存');}
    if(btn.dataset.studio==='open-inspector'){if(!IS_EXT)return toast('请先安装 Chrome 扩展');await chrome.tabs.create({url:chrome.runtime.getURL('src/studio/workspace.html')});}
    if(btn.dataset.studio==='copy-agent'){const issues=(scan?.findings||[]).filter(f=>!f.verification&&['critical','high'].includes(f.severity));if(!issues.length)return toast('没有高优先级问题');try{await navigator.clipboard.writeText(issues.map(f=>Core.repairPrompt(f,scan,project)).join('\n\n---\n\n'));toast('已复制 '+issues.length+' 条修复任务');}catch(e){toast('复制失败');}}
  });
  window.ShipCheckStudio={update,getProject:()=>project,getScan:()=>scan,readiness:()=>Core.readiness(project,scan)};
})();
