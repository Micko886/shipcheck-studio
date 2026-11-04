/* ShipCheck Studio Core · pure, deterministic project context and automatic coverage logic.
 * Browser: window.ShipCheckCore; Node tests: require('../src/studio/core.js').
 * No network, model, or browser API side effects. Inferences are always labelled suggestions.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ShipCheckCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TYPES = {
    b2b: { name: 'B2B 采购 / 询盘站', goal: '帮助采购商了解产品并提交有效询盘', audience: '企业采购商' },
    ecommerce: { name: '电商商店', goal: '帮助消费者选购并完成测试结账', audience: '在线消费者' },
    saas: { name: 'SaaS / Web 应用', goal: '让用户注册并完成核心产品操作', audience: '应用用户' },
    booking: { name: '预约 / 服务网站', goal: '完成可用时间查询与预约确认', audience: '预约服务的客户' },
    portfolio: { name: '作品集 / 个人展示', goal: '展示作品并建立有效联系入口', audience: '潜在客户或雇主' },
    landing: { name: '营销落地页', goal: '让用户理解主张并完成主要 CTA', audience: '潜在客户' },
    generic: { name: '通用企业网站', goal: '清晰展示信息并提供可用的行动入口', audience: '网站访客' }
  };
  const RULES = {
    responsive: ['H_OVERFLOW', 'ELEMENT_OVERFLOW', 'DIALOG_OVERFLOW', 'TEXT_CLIPPED', 'OCCLUDED_CONTROL'],
    links: ['EMPTY_LINK', 'BROKEN_ANCHOR'],
    media: ['BROKEN_IMAGE', 'IMAGE_ERROR', 'RESOURCE_4XX', 'RESOURCE_5XX'],
    a11y: ['IMG_NO_ALT', 'FORM_NO_LABEL', 'BUTTON_NO_NAME', 'LINK_NO_NAME'],
    forms: ['FORM_NO_SUBMIT_CONTROL', 'FORM_MIXED_CONTENT_ACTION', 'FORM_FIELD_NO_NAME'],
    seo: ['TITLE_MISSING', 'META_DESC_MISSING', 'H1_MISSING', 'NO_VIEWPORT_META']
  };
  const COMMON = [
    { id:'responsive', title:'响应式关键布局', detail:'所选视口未发现已知的严重布局异常', kind:'auto', group:'技术', module:'responsive', rules:RULES.responsive, critical:true },
    { id:'links', title:'导航与页面内链接', detail:'不存在已检测到的明显空链接或失效锚点', kind:'auto', group:'技术', module:'interaction', rules:RULES.links, critical:false },
    { id:'media', title:'关键图片与资源', detail:'图片等基础可见资源未出现已检测到的加载错误', kind:'auto', group:'技术', module:'visual', rules:RULES.media, critical:false },
    { id:'a11y', title:'基础可访问性', detail:'基础标签和可访问名称规则的检查结果', kind:'auto', group:'技术', module:'a11y', rules:RULES.a11y, critical:false },
    { id:'seo', title:'基础搜索呈现', detail:'标题、描述和视口声明等基础规则', kind:'auto', group:'技术', module:'seo', rules:RULES.seo, critical:false },
    { id:'search-readiness', title:'搜索准备度证据已采集', detail:'技术 SEO 与 GEO/AEO 内容线索已采集；不代表收录或 AI 引用。', kind:'auto', group:'搜索准备度', module:'seo', rules:[], critical:false }
  ];
  function originOf(url) { try { return new URL(url).origin; } catch (_) { return ''; } }
  function inferType(scan) {
    const s = scan || {};
    const v = s.pageSignals || {};
    const sample = [s.title,s.url,v.description,(v.headings||[]).join(' '),(v.navigation||[]).join(' '),(v.actions||[]).join(' ')].join(' ').toLowerCase().slice(0,12000);
    const tests = [
      ['b2b',/\b(oem|odm|wholesale|manufacturer|rfq|request quote|request a quote|supplier|bulk order|distributor|minimum order|moq)\b|询盘|工厂|批发/g],
      ['ecommerce',/\b(add to cart|checkout|shopping cart|free shipping|shop now|buy now)\b|加入购物车|立即购买/g],
      ['saas',/\b(dashboard|sign up|start free trial|api keys|workspace|subscription)\b|注册|仪表盘/g],
      ['booking',/\b(book appointment|book now|reserve a table|availability|schedule a call)\b|预约|预订/g],
      ['portfolio',/\b(portfolio|my projects|case studies|selected work|hire me)\b|作品集/g],
      ['landing',/\b(waitlist|join the beta|early access|launching soon|get started)\b|候补名单/g]
    ];
    const ranks = tests.map(([type,reg]) => ({type,score:(sample.match(reg)||[]).length})).sort((a,b)=>b.score-a.score);
    const best = ranks[0];
    return {type:best && best.score>=2 ? best.type : 'generic', confidence:best && best.score>=4 ? 'medium' : 'low', matches:best ? best.score : 0, origin:originOf(s.url)};
  }
  function makeProject(scan, previous) {
    const inferred = inferType(scan);
    const old = previous || {};
    const type = TYPES[old.type] ? old.type : inferred.type;
    return {
      origin:originOf(scan && scan.url) || old.origin || '', type,
      name:old.name || (scan && scan.title) || '未命名项目',
      goal:old.goal || TYPES[type].goal, audience:old.audience || TYPES[type].audience,
      source:old.source || '根据当前页面内容推断（尚未确认）',
      confirmed:old.confirmed===true, inferred,
      checks:makePlan(type), // migrate away from old manual acceptance items
      issueStates:old.issueStates && typeof old.issueStates==='object' ? old.issueStates : {},
      updatedAt:new Date().toISOString()
    };
  }
  function makePlan(type) {
    // v0.9: only real machine-executed checks, never create manual TODOs.
    const items = COMMON.map(x=>({...x,status:'unverified',note:'',updatedAt:null}));
    items.push({id:'forms',title:'表单结构检查（仅限扫描范围）',detail:'检查表单字段、标签和提交元素结构；不声称服务器已经收到数据。',kind:'auto',group:'技术',module:'business',rules:RULES.forms,critical:false,status:'unverified',note:'',updatedAt:null});
    return items;
  }
  function assess(check, scan) {
    if (check.kind !== 'auto') return {status:'unverified',evidence:'此版本只展示自动执行的规则结果',source:'rule'};
    if (!scan || !Array.isArray(scan.findings)) return {status:'unverified',evidence:'尚未扫描当前页面',source:'rule'};
    if (scan.modules && scan.modules[check.module] === false) return {status:'unverified',evidence:'相关检查模块已关闭',source:'rule'};
    if (check.id==='search-readiness') {
      if(!scan.searchReadiness) return {status:'unverified',evidence:'尚未进行新版搜索准备度检测',source:'rule'};
      const ss=scan.searchReadiness.summary;return {status:'pass',evidence:'采集已完成：'+ss.pass+' 项有证据、'+ss.attention+' 项需关注、'+ss.unverified+' 项未验证；不等于搜索验收通过',source:'rule'};
    }
    if (check.id==='forms' && scan.pageSignals && scan.pageSignals.formCount===0) return {status:'unverified',evidence:'当前页面未发现表单，尚未验证网站其他页面的业务提交入口',source:'rule'};
    if (check.id==='responsive' && (!(scan.viewports||[]).length || scan.viewports.some(v=>v.blocked))) return {status:'unverified',evidence:'部分视口未成功渲染，无法判定通过',source:'rule'};
    const fails = scan.findings.filter(f=>!f.verification && check.rules.includes(f.rule));
    if (fails.length) return {status:'fail',evidence:'检测到 '+fails.length+' 项相关问题：'+fails.slice(0,3).map(f=>f.title).join('、'),source:'rule'};
    return {status:'pass',evidence:'所启用的静态检查未发现该类别的已知问题（不等于完整业务验证）',source:'rule'};
  }
  function readiness(project, scan) {
    const checks = ((project&&project.checks)||[]).map(c=>({...c,result:assess(c,scan)}));
    const counts={pass:0,fail:0,unverified:0};
    checks.forEach(c=>counts[c.result.status]++);
    const criticalFailures=checks.filter(c=>c.critical && c.result.status==='fail');
    const highIssues=((scan&&scan.findings)||[]).filter(f=>!f.verification && (f.severity==='critical'||f.severity==='high'));
    const verdict=!scan||!Array.isArray(scan.findings)?'not_scanned':(criticalFailures.length||highIssues.length||counts.fail?'issues_found':'scanned');
    return {verdict,counts,checks,highIssues:highIssues.length,coverage:checks.length?Math.round((checks.length-counts.unverified)/checks.length*100):0};
  }
  function keyForIssue(f) { return [f.rule||'',f.selector||'',f.title||''].join('|'); }
  function repairPrompt(f, scan, project) {
    const lines=[
      '# ShipCheck · 有证据的修复任务',
      '- 项目：'+(project&&project.name || scan&&scan.title || ''),
      '- 项目目标：'+(project&&project.goal || '未确认'),
      '- 页面：'+(scan&&scan.url || ''),
      '- 问题：'+f.title+' / '+f.rule,
      '- 证据可信度：'+(f.confidence==='confirmed'?'规则确认':'启发式，需复核'),
      '- 选择器：'+(f.selector||'未识别'),
      '- 影响视口：'+(f.viewports||[]).join(', '),'',
      '## 复现步骤',...(f.repro||[]).map((x,i)=>(i+1)+'. '+x),'',
      '## 扫描证据',...(f.evidence||[]).map(x=>'- '+x),'',
      '## 修复约束',
      '- 先结合项目源码检查真实根因，不要照抄猜测性建议。',
      '- 不允许为了通过检查而隐藏、删除关键业务内容或关闭功能。',
      '- 尽量只改必要组件；保留现有桌面/移动端行为。',
      '- 给出明确改动文件、diff 与影响范围。','',
      '## 可参考修复思路',...(f.fixes||[]).map(x=>'- '+x),'',
      '## 验收断言',...(f.retest||[]).map(x=>'- [ ] '+x),
      '- [ ] 原缺陷在对应视口不再复现',
      '- [ ] 其他已通过的检查没有新增回归',
      '- [ ] 核心业务流程仍然成立（未经授权不得提交真实交易或表单）','',
      '请在实际项目内执行、验证，并报告尚未确定的内容。'
    ];
    return lines.join('\n');
  }
  function acceptanceMarkdown(project, scan) {
    const result=readiness(project,scan);
    const label={pass:'通过（限已测范围）',fail:'未通过',unverified:'待验证'};
    const lines=['# ShipCheck · 自动质量检查', '',
      '- 项目：'+(project.name||''), '- 网站：'+(project.origin||''),
      '- 类型：'+(TYPES[project.type]||TYPES.generic).name,
      '- 目标：'+(project.goal||''), '- 目标用户：'+(project.audience||''),
      '- 网站类型：由页面线索推测，可编辑，非业务验收结论',
      '- 技术评分：'+(scan&&typeof scan.score==='number'?scan.score+'/100':'尚未扫描'),
      '- 扫描状态：'+(result.verdict==='not_scanned'?'未运行':result.verdict==='issues_found'?'已扫描（发现问题）':'已扫描（未发现已知高优先缺陷）'),
      '- 通过 / 失败 / 待验证：'+[result.counts.pass,result.counts.fail,result.counts.unverified].join(' / '), '',
      '| 自动检测项 | 状态 | 证据 / 备注 |','| --- | --- | --- |'];
    result.checks.forEach(c=>lines.push('| '+c.title+' | '+label[c.result.status]+' | '+(c.result.evidence||'').replace(/\|/g,'/').replace(/\n/g,' ')+' |'));
    lines.push('','> 本报告仅代表已执行的自动检查。未验证的流程不被算作通过，也不会生成需要用户打勾的人工验收任务。');
    return lines.join('\n');
  }
  return {TYPES,COMMON,inferType,makePlan,makeProject,assess,readiness,keyForIssue,repairPrompt,acceptanceMarkdown,originOf};
});
