/* ShipCheck AI · Side Panel 控制器
 * 同时支持两种运行环境：
 *   1) Chrome 扩展侧边栏（真实扫描）
 *   2) 独立 HTML 预览页（无 chrome API 时自动进入演示模式，展示同一套 UI）
 */
(() => {
  'use strict';

  const IS_EXT = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.tabs && chrome.scripting);

  const MODULE_LABEL = {
    responsive: 'Responsive QA', interaction: 'Interaction QA', visual: 'Visual QA',
    a11y: 'Accessibility', seo: 'Technical SEO', geo: 'GEO / AEO', business: 'Business Flow QA'
  };
  const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
  const SEV_ZH = { critical: '严重', high: '高', medium: '中', low: '低' };
  const SEV_COLOR = { critical: '#e11d48', high: '#f97316', medium: '#eab308', low: '#64748b' };
  const VERDICT_LABEL = {
    stable: '视觉基本无变化',
    changed: '检测到视觉变化（可能是预期修改）',
    suspicious: '疑似布局回归，建议复核',
    none: '首次扫描，基线已建立'
  };

  const DEFAULT_SETTINGS = {
    widths: [390, 768, 1440],
    modules: { responsive: true, interaction: true, visual: true, a11y: true, seo: true, geo: true, business: true },
    axe: true,
    baseline: true,
    preciseShot: false,
    maxPages: 20,
    autoLocalLighthouse: true
  };
  const ENGINE_VERSION = '1.0.1';

  /* ---------------------------------------------------------------- *
   * 演示数据（仅用于预览，非真实扫描结果）
   * ---------------------------------------------------------------- */
  function df(o) {
    return Object.assign({
      id: 'demo-' + Math.random().toString(36).slice(2, 8),
      rule: 'DEMO', module: 'responsive', severity: 'medium', confidence: 'confirmed',
      verification: false, title: '', selector: '', viewports: ['390px'],
      evidence: [], detail: '', rect: null,
      repro: ['在目标视口下打开页面', '按证据描述复现该问题'],
      causes: ['结合项目源码与 computed style 定位根因'],
      fixes: ['按下方修复要求调整实现，然后重新扫描'],
      retest: ['修复后重新扫描，该问题不再出现'],
      occurrences: 1
    }, o);
  }

  function makeDemoFindings() {
    return [
      df({
        rule:'axe:region',module:'a11y',severity:'medium',
        title:'有页面内容没有放进语义地标区域（Landmark）',selector:'#outside-content',
        viewports:['当前页面'],affectedCount:2,elementPreview:'Contact us',
        reason:'正文或可见内容处于 main、header、nav、footer、aside 等地标之外。屏幕阅读器用户可能无法按页面区域快速找到它。该项属于最佳实践检查。',
        solution:'把真正的正文包进 <main>；顶部、导航和页脚分别使用 <header>、<nav>、<footer>。不要给每个 div 随意添加 role="region"。',
        evidence:['受影响的元素：#outside-content','元素内容：<div id="outside-content">Contact us</div>','失败细节：Element is not contained by a landmark','规则：axe-core region（moderate；最佳实践）'],
        repro:['定位 #outside-content 并确认它不在任何语义地标中'],
        causes:['该节点在 main/header/nav/footer/aside 外部'],
        fixes:['将属于主内容的节点移至 main 内，重新运行 axe'],
        retest:['axe-core region 规则中不再报告 #outside-content']
      }),
      df({
        rule: 'H_OVERFLOW', module: 'responsive', severity: 'critical',
        title: '移动端出现水平溢出', selector: 'section.hero > .hero-content',
        viewports: ['390px'],
        rect: { x: 0, y: 120, width: 452, height: 360 },
        detail: '在 390px 下 Hero 容器宽度超出页面可见区域，可能导致横向滚动。',
        evidence: ['视口 clientWidth = 390px', '文档 scrollWidth = 452px', '超出 62px，页面可横向滚动', 'computed: width=452px, min-width=452px, max-width=none'],
        repro: ['将浏览器视口调整到 390px 并重新加载页面', '尝试左右拖动页面，确认出现横向滚动'],
        causes: ['Hero 容器使用固定 width / min-width，且未设置 max-width:100%', '内部标题使用 white-space:nowrap', '背景装饰元素使用负 margin 或绝对定位'],
        fixes: ['为 .hero-content 设置 max-width:100% 与 box-sizing:border-box', '把固定宽度改为 width:min(100%, 452px)', '为装饰元素添加 overflow:hidden 的父容器'],
        retest: ['document.documentElement.scrollWidth <= clientWidth', '390 / 768 / 1440px 下不出现横向滚动条', 'Hero 文案完整可见']
      }),
      df({
        rule: 'OCCLUDED_CONTROL', module: 'responsive', severity: 'high', confidence: 'needs-review',
        title: '移动端导航关闭按钮疑似被遮挡', selector: 'nav.mobile-menu > button.close',
        viewports: ['390px'],
        rect: { x: 344, y: 12, width: 32, height: 32 },
        detail: '菜单展开后右上角关闭按钮的中心点被固定定位的浮层覆盖。',
        evidence: ['中心点 (360, 28) 的 elementFromPoint 命中：div.cookie-banner', '目标控件：×（关闭按钮）', '浮层 z-index = 9999，position: fixed'],
        causes: ['Cookie 横幅的 z-index 高于导航菜单', '浮层未针对移动端断点做偏移'],
        fixes: ['调整浮层 z-index，或为菜单打开状态增加 body 类名以隐藏浮层', '确保关闭按钮位于视口内且可点击'],
        retest: ['elementFromPoint(中心点) 返回关闭按钮或其子节点', '手动点击可关闭菜单']
      }),
      df({
        rule: 'EMPTY_LINK', module: 'interaction', severity: 'high',
        title: 'Contact 按钮缺少有效目标', selector: 'a.cta-contact',
        viewports: ['当前页面'],
        rect: { x: 96, y: 486, width: 148, height: 44 },
        detail: '首屏 Contact CTA 使用 href="#" 且未绑定任何事件，点击后没有任何可观察反馈。',
        evidence: ['共 1 个无有效目标的链接', '示例：<a href="#">Contact</a>', 'DOM 定位：a.cta-contact'],
        causes: ['交付时未替换占位链接', '未绑定点击处理函数'],
        fixes: ['替换为真实联系页 URL 或 /#contact 锚点', '若确为脚本按钮，改用 <button type="button"> 并绑定事件'],
        retest: ['点击后产生导航或打开联系表单', '链接具有有效 href']
      }),
      df({
        rule: 'VISUAL_CROP', module: 'visual', severity: 'medium', confidence: 'needs-review',
        title: '商品图片被裁切，主体显示不完整', selector: '.product-gallery > img:nth-of-type(2)',
        viewports: ['390px', '768px'],
        detail: '商品图使用 object-fit:cover 且容器比例固定，椅背部分在窄视口下被裁切。',
        evidence: ['object-fit: cover，容器比例 1:1', '截图对比：商品主体右侧约 18% 被裁切', '需要人工确认是否为有意构图'],
        causes: ['object-fit:cover 未配合 object-position 调整', '未为移动端提供专门裁切比例'],
        fixes: ['设置 object-position:center 或改为 object-fit:contain', '在移动端断点下调整容器比例'],
        retest: ['商品主体在 390 / 768px 下完整可见']
      }),
      df({
        rule: 'IMG_NO_ALT', module: 'a11y', severity: 'medium',
        title: '商品图片替代文本缺失', selector: '.product-gallery > img',
        viewports: ['当前页面'],
        detail: '产品画廊中 6 张内容性图片没有 alt 属性。',
        evidence: ['共 6 张图片缺少 alt 属性', '示例 DOM 定位：.product-gallery > img:nth-of-type(1)'],
        causes: ['图片由 CMS 动态渲染，模板未输出 alt'],
        fixes: ['为内容性图片添加描述性 alt', '纯装饰图片显式使用 alt=""'],
        retest: ['所有内容性 img 均有非空 alt']
      }),
      df({
        rule: 'FORM_NO_LABEL', module: 'a11y', severity: 'medium',
        title: '表单控件缺少关联标签', selector: 'form.rfq > input[name="email"]',
        viewports: ['当前页面'],
        detail: '询盘表单有 3 个控件只依赖 placeholder，没有 <label> 或 aria-label。',
        evidence: ['共 3 个表单控件没有关联标签', '示例 DOM 定位：form.rfq > input[name="email"]'],
        causes: ['表单由 UI 库生成，未透传 label'],
        fixes: ['为每个控件添加 <label for> 或 aria-label', 'placeholder 仅作示例，不替代标签'],
        retest: ['每个控件 labels.length > 0 或存在 aria-label']
      }),
      df({
        rule: 'DIALOG_OVERFLOW', module: 'responsive', severity: 'medium',
        title: '弹窗在平板视口超出边界', selector: 'div[role="dialog"].size-guide',
        viewports: ['768px'],
        detail: '尺码指南弹窗使用固定 900px 宽度，在 768px 视口下右侧内容不可见。',
        evidence: ['弹窗 rect: left=-66, right=834, bottom=612', '视口: 768×1024'],
        causes: ['弹窗使用固定像素宽度且未设置 max-width:100vw'],
        fixes: ['设置 max-width:100vw; max-height:100vh; overflow:auto', '确保关闭按钮始终可见'],
        retest: ['弹窗 rect 完全位于视口内']
      }),
      df({
        rule: 'BROKEN_IMAGE', module: 'visual', severity: 'medium',
        title: '图片资源加载失败', selector: 'img[src="/assets/hero-2x.webp"]',
        viewports: ['当前页面'],
        detail: '构建后 Hero 背景图路径错误，线上返回 404。',
        evidence: ['共 1 张图片加载失败', '请求 /assets/hero-2x.webp → HTTP 404', 'img.complete=true, naturalWidth=0'],
        causes: ['静态资源指纹变化后路径未同步', '部署 base path 不匹配'],
        fixes: ['修正资源路径为构建产物实际路径', '为关键图片补充 onError 占位图'],
        retest: ['img.naturalWidth > 0', '网络面板返回 2xx']
      }),
      df({
        rule: 'BROKEN_ANCHOR', module: 'interaction', severity: 'medium',
        title: '锚点链接指向不存在的区块', selector: 'a[href="#craft"]',
        viewports: ['当前页面'],
        detail: '页脚「工艺」链接指向 #craft，但页面中不存在该 id。',
        evidence: ['href="#craft" 找不到 id / name 为 craft 的元素'],
        causes: ['区块在改版时被删除'],
        fixes: ['修正 href 或为对应区块补充 id="craft"'],
        retest: ['document.getElementById("craft") 返回非空']
      }),
      df({
        rule: 'META_DESC_MISSING', module: 'seo', severity: 'low',
        title: '缺少 meta description', selector: 'head',
        viewports: ['当前页面'],
        detail: '页面未提供描述信息。',
        evidence: ['未找到非空的 <meta name="description">'],
        fixes: ['添加 50–160 字的 <meta name="description">'],
        retest: ['页面存在非空 description']
      }),
      df({
        rule: 'H1_MULTIPLE', module: 'seo', severity: 'low',
        title: '页面存在多个 h1', selector: 'h1',
        viewports: ['当前页面'],
        detail: '首页存在 2 个 h1，主标题层级不唯一。',
        evidence: ['h1 数量 = 2'],
        fixes: ['保留一个主 h1，其余降级为 h2'],
        retest: ['document.querySelectorAll("h1").length === 1']
      }),
      df({
        rule: 'LOW_CONTRAST', module: 'a11y', severity: 'low', confidence: 'needs-review',
        title: '文字与背景对比度可能不足', selector: 'p.product-meta',
        viewports: ['当前页面'],
        detail: '商品副标题使用浅灰文字配浅色背景，估算对比度约 2.9:1。',
        evidence: ['前景 #a1a1aa / 背景 #ffffff', '估算对比度 2.90:1，低于 4.5:1', '字号 12px'],
        fixes: ['将文字颜色加深至 #6b7280 或更深', '用取色器复核对比度'],
        retest: ['对比度 >= 4.5:1']
      }),
      df({
        rule: 'FORM_NO_SUBMIT_CONTROL', module: 'business', severity: 'critical',
        title: '表单没有任何可提交控件', selector: 'form#rfq',
        viewports: ['当前页面'],
        detail: '询盘表单的提交按钮在改版时被替换成 div，回车也不会触发提交——样式看起来正常，但表单根本交不出去。',
        evidence: ['表单内可见字段 4 个', '未找到 type="submit" 的 button / input[type=submit]', '可用按钮：「发送询盘」type=缺省且已被阻止默认行为'],
        causes: ['为了让按钮完全贴合设计稿，把 <button> 换成了 <div>', '<form> 没有绑定 submit 事件，只绑了 div 的 click'],
        fixes: ['改回 <button type="submit"> 并保留样式类', '在 form 的 submit 事件里 preventDefault() 后走 fetch'],
        retest: ['表单内存在 type="submit" 的控件', '点击与键盘回车都能触发校验与提交']
      }),
      df({
        rule: 'FORM_FIELD_NO_NAME', module: 'business', severity: 'high',
        title: '表单字段缺少 name，提交时不会带上该字段', selector: 'form#rfq > input#company',
        viewports: ['当前页面'],
        detail: '「公司名称」只有 id 没有 name，FormData 里没有 company，服务端收不到这个值。',
        evidence: ['缺少 name 的字段 1/4：input#company'],
        causes: ['受控组件遗漏 name 属性，只靠 id 取值'],
        fixes: ['为字段补上 name="company"，并确认提交时已 append 到 FormData'],
        retest: ['FormData 中出现 company 字段与用户输入值']
      }),
      df({
        rule: 'FORM_NO_ERROR_SURFACE', module: 'business', severity: 'medium', confidence: 'needs-review',
        title: '表单缺少错误提示容器', selector: 'form#rfq',
        viewports: ['当前页面'],
        detail: '校验失败时只在控制台打印，页面上没有任何可读提示，用户会以为「点了没反应」。',
        evidence: ['字段 4 个，未找到 role="alert" / aria-live / 错误容器'],
        causes: ['错误提示逻辑依赖 console.error'],
        fixes: ['增加 role="alert" 容器并填充错误文案', '为出错字段加 aria-invalid="true" 与 aria-describedby'],
        retest: ['提交非法数据后页面出现可读错误提示']
      })
    ];
  }

  /* 演示用线框缩略图（SVG data URI，自包含，不含真实页面截图） */
  function demoThumb(kind) {
    const W = 300;
    const H = kind === '390px' ? 470 : kind === '768px' ? 380 : 300;
    const cols = kind === '390px' ? 1 : kind === '768px' ? 2 : 3;
    const cardW = (W - 24 - (cols - 1) * 8) / cols;
    let cards = '';
    for (let i = 0; i < cols * 2; i++) {
      const cx = 12 + (i % cols) * (cardW + 8);
      const cy = 92 + Math.floor(i / cols) * (cardW * 0.72 + 10);
      cards += '<rect x="' + cx.toFixed(1) + '" y="' + cy.toFixed(1) + '" width="' + cardW.toFixed(1) +
        '" height="' + (cardW * 0.72).toFixed(1) + '" rx="4" fill="#dfe4f8"/>';
    }
    const hot = kind === '390px'
      ? '<rect x="11" y="91" width="' + (cardW + 2).toFixed(1) + '" height="' + (cardW * 0.72 + 2).toFixed(1) + '" rx="5" fill="none" stroke="#e11d48" stroke-width="2"/>'
      : '';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<rect width="' + W + '" height="' + H + '" fill="#f6f7fb"/>' +
      '<rect x="0" y="0" width="' + W + '" height="48" fill="#e8ebf8"/>' +
      '<rect x="12" y="18" width="58" height="11" rx="3" fill="#c3caf0"/>' +
      '<rect x="' + (W - 86) + '" y="18" width="74" height="11" rx="3" fill="#c3caf0"/>' +
      '<rect x="12" y="60" width="' + Math.round(W * 0.52) + '" height="9" rx="4" fill="#cfd5f2"/>' +
      '<rect x="12" y="76" width="' + Math.round(W * 0.34) + '" height="7" rx="3" fill="#dde2f6"/>' +
      cards + hot + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function makeDemoScan(overrides) {
    const o = overrides || {};
    const findings = makeDemoFindings();
    const verification = [
      df({ rule: 'FORM_RESULT_UNVERIFIED', module: 'business', severity: 'low', confidence: 'needs-review', verification: true, title: '表单提交的业务结果未验证', viewports: ['当前页面'], detail: '自动规则不能确认提交是否真正保存数据或发送邮件。', evidence: ['检测到 1 个 <form>', '需要测试环境与预期结果断言'] }),
      df({ rule: 'CLICK_FEEDBACK_UNVERIFIED', module: 'business', severity: 'low', confidence: 'needs-review', verification: true, title: '按钮 / 导航点击反馈未验证', viewports: ['当前页面'], detail: '扫描过程不模拟点击。', evidence: ['检测到 18 个可交互控件'] }),
      df({ rule: 'CHECKOUT_FLOW_UNVERIFIED', module: 'business', severity: 'low', confidence: 'needs-review', verification: true, title: '关键业务流程未做端到端验证', viewports: ['当前页面'], detail: 'B2B 询盘流程需要测试账号与沙盒环境。', evidence: ['V1 未配置测试账号与预期结果'] })
    ];
    const now = new Date().toISOString();
    const demoDiff = {
      hasPrevious: true,
      scoreDelta: 7,
      previousScore: 61,
      previousTime: new Date(Date.now() - 3600e3).toISOString(),
      added: [
        { title: '弹窗在平板视口超出边界', severity: 'medium', rule: 'DIALOG_OVERFLOW' },
        { title: '图片资源加载失败', severity: 'medium', rule: 'BROKEN_IMAGE' }
      ],
      fixed: [
        { title: '移动端菜单无法关闭', severity: 'high', rule: 'NAV_UNUSABLE' },
        { title: '表单提交无错误提示', severity: 'medium', rule: 'FORM_NO_ERROR' },
        { title: '缺少 viewport meta', severity: 'high', rule: 'NO_VIEWPORT_META' }
      ],
      persisted: []
    };
    const demoVisual = {
      available: true, mode: 'multi', hasBaseline: true, demo: true,
      ratio: 0.241,
      boxes: [{ x: 0.04, y: 0.17, w: 0.62, h: 0.26 }],
      shots: ['390px', '768px', '1440px'].map((label, i) => ({
        label,
        before: demoThumb(label),
        after: demoThumb(label),
        ratio: [0.241, 0.073, 0.012][i],
        boxes: i === 0 ? [{ x: 0.04, y: 0.17, w: 0.62, h: 0.26 }] : []
      })),
      before: null, after: null,
      baselineTime: new Date(Date.now() - 3600e3).toISOString(),
      currentTime: now,
      verdict: 'suspicious'
    };
    demoVisual.before = demoVisual.shots[0].before;
    demoVisual.after = demoVisual.shots[0].after;
    const demoCounts = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) { demoCounts.total++; demoCounts[f.severity] = (demoCounts[f.severity] || 0) + 1; }
    return Object.assign({
      engine: ENGINE_VERSION, demo: true,
      url: 'https://demo.example.com/premium-furniture',
      title: 'AUREL — Premium Furniture',
      time: now,
      dpr: 1, userAgent: 'Demo Preview',
      score: 68,
      diff: demoDiff,
      visual: demoVisual,
      counts: demoCounts,
      viewports: [
        { label: '390px', width: 390, clientWidth: 390, scrollWidth: 452, height: 844, overflowPx: 62, dpr: 1, blocked: false, note: '', requestedWidth: 390, issueCount: 5 },
        { label: '768px', width: 768, clientWidth: 768, scrollWidth: 768, height: 1024, overflowPx: 0, dpr: 1, blocked: false, note: '', requestedWidth: 768, issueCount: 2 },
        { label: '1440px', width: 1440, clientWidth: 1440, scrollWidth: 1440, height: 900, overflowPx: 0, dpr: 1, blocked: false, note: '', requestedWidth: 1440, issueCount: 0 }
      ],
      findings: findings.concat(verification), verification,
      notes: ['本页为产品概念演示数据，用于展示交互与报告格式，不代表真实网站扫描结果。'],
      modules: Object.assign({}, DEFAULT_SETTINGS.modules),
      widths: [390, 768, 1440],
      durationMs: 1840
    }, o);
  }

  function makeDemoHistory() {
    const base = Date.now();
    return [
      { id: 'h1', url: 'https://demo.example.com/premium-furniture', title: 'AUREL — Premium Furniture', time: new Date(base - 3600e3).toISOString(), score: 61, counts: { total: 12 }, result: makeDemoScan({ score: 61, time: new Date(base - 3600e3).toISOString(), diff: { hasPrevious: true, scoreDelta: 7, previousScore: 54, previousTime: new Date(base - 86400e3).toISOString(), added: [{ title: '图片资源加载失败', severity: 'medium' }], fixed: [{ title: '移动端菜单无法关闭', severity: 'high' }], persisted: [] } }) },
      { id: 'h2', url: 'https://demo.example.com/premium-furniture', title: 'AUREL — Premium Furniture', time: new Date(base - 86400e3).toISOString(), score: 54, counts: { total: 12 }, result: makeDemoScan({ score: 54, time: new Date(base - 86400e3).toISOString(), diff: { hasPrevious: true, scoreDelta: -6, previousScore: 60, previousTime: new Date(base - 2 * 86400e3).toISOString(), added: [{ title: '移动端出现水平溢出', severity: 'critical' }], fixed: [], persisted: [] } }) },
      { id: 'h3', url: 'https://demo.example.com/saas-landing', title: 'Northstar — SaaS Landing', time: new Date(base - 3 * 86400e3).toISOString(), score: 83, counts: { total: 12 }, result: makeDemoScan({ score: 83, time: new Date(base - 3 * 86400e3).toISOString(), url: 'https://demo.example.com/saas-landing', title: 'Northstar — SaaS Landing', diff: { hasPrevious: false, scoreDelta: null, added: [], fixed: [], persisted: [] } }) }
    ];
  }

  /* ---------------------------------------------------------------- *
   * 状态与工具
   * ---------------------------------------------------------------- */
  const state = {
    scan: null,
    tab: 'project',
    filter: 'all',
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    history: [],
    scanning: false,
    currentUrl: '',
    visual: null,
    siteScan: null
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const scored = (scan) => (scan && scan.findings ? scan.findings.filter((f) => !f.verification) : []);
  const verifyList = (scan) => (scan && scan.findings ? scan.findings.filter((f) => f.verification) : []) || [];

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* 回退 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) { return false; }
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  };
  const hostOf = (u) => { try { return new URL(u).hostname; } catch (_) { return 'page'; } };
  const urlKey = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch (_) { return String(u); } };

  /* ---------------------------------------------------------------- *
   * V2 · 版本对比 / 修复闭环
   * ---------------------------------------------------------------- */
  const findingKey = (f) => (f.rule || '') + '|' + (f.selector || '') + '|' + (f.title || '');

  function computeDiff(current, previous) {
    if (!previous || !previous.findings) {
      return { hasPrevious: false, scoreDelta: null, added: [], fixed: [], persisted: [] };
    }
    const prevMap = new Map(scored(previous).map((f) => [findingKey(f), f]));
    const curList = scored(current);
    const curKeys = new Set(curList.map(findingKey));
    return {
      hasPrevious: true,
      scoreDelta: current.score - previous.score,
      previousScore: previous.score,
      previousTime: previous.time,
      added: curList.filter((f) => !prevMap.has(findingKey(f))),
      fixed: Array.from(prevMap.values()).filter((f) => !curKeys.has(findingKey(f))),
      persisted: curList.filter((f) => prevMap.has(findingKey(f)))
    };
  }

  function previousScanFor(url) {
    const entry = state.history.find((h) => h.url === url && h.result && h.result.findings);
    return entry ? entry.result : null;
  }

  /* ---------------------------------------------------------------- *
   * V2 · 视觉基线（当前视口截图 + canvas 像素差异）
   * ---------------------------------------------------------------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = src;
    });
  }

  async function toThumb(dataUrl, W) {
    const img = await loadImage(dataUrl);
    const width = W || 320;
    const H = Math.max(120, Math.min(360, Math.round(width * img.height / img.width)));
    const c = document.createElement('canvas');
    c.width = width; c.height = H;
    c.getContext('2d').drawImage(img, 0, 0, width, H);
    return { thumb: c.toDataURL('image/jpeg', 0.6), aspect: img.height / img.width };
  }

  async function captureThumb() {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 55 });
    let viewportWidth = 0;
    try {
      const active = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (active?.id) {
        const values = await chrome.scripting.executeScript({
          target: { tabId: active.id, allFrames: false },
          func: () => window.innerWidth
        });
        viewportWidth = Number(values?.[0]?.result) || 0;
      }
    } catch (_) { /* Screenshot is still useful without marker coordinates. */ }
    return {thumb:(await toThumb(dataUrl)).thumb,viewportWidth};
  }

  /* 多视口截图：仅在用户于设置中开启并授予 debugger 权限后启用。
   * 未授权 / 失败时返回 null，调用方回退到 captureVisibleTab 单视口基线。 */
  async function captureViewportThumbs() {
    if (!IS_EXT || !state.settings.preciseShot) return null;
    let granted = false;
    try { granted = await chrome.permissions.contains({ permissions: ['debugger'] }); } catch (_) { granted = false; }
    if (!granted) return null;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs && tabs[0] && tabs[0].id;
      if (!tabId) return null;
      const resp = await chrome.runtime.sendMessage({
        type: 'SHIPCHECK_CAPTURE_VIEWPORTS', tabId, widths: state.settings.widths
      });
      if (!resp || !resp.ok || !resp.shots || !resp.shots.length) {
        if (resp && resp.error) console.warn('[ShipCheck] 多视口截图失败:', resp.error);
        return null;
      }
      const out = [];
      for (const s of resp.shots) {
        const t = await toThumb(s.dataUrl, 300);
        out.push({ label: s.width + 'px', width: s.width, thumb: t.thumb, aspect: t.aspect });
      }
      return out;
    } catch (e) {
      console.warn('[ShipCheck] 多视口截图不可用:', e);
      return null;
    }
  }

  async function pixelDiff(beforeUrl, afterUrl) {
    const [a, b] = await Promise.all([loadImage(beforeUrl), loadImage(afterUrl)]);
    const W = 320, H = 200, GX = 16, GY = 10;
    const make = (img) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').drawImage(img, 0, 0, W, H);
      return c.getContext('2d').getImageData(0, 0, W, H).data;
    };
    const da = make(a), db = make(b);
    const cellW = W / GX, cellH = H / GY;
    const hit = new Array(GX * GY).fill(0);
    const tot = new Array(GX * GY).fill(0);
    let changed = 0, total = 0;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const i = (y * W + x) * 4;
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        const gi = Math.min(GY - 1, Math.floor(y / cellH)) * GX + Math.min(GX - 1, Math.floor(x / cellW));
        tot[gi]++; total++;
        if (d > 90) { changed++; hit[gi]++; }
      }
    }
    const boxes = [];
    for (let gy = 0; gy < GY; gy++) {
      let run = null;
      for (let gx = 0; gx <= GX; gx++) {
        const gi = gy * GX + gx;
        const hot = gx < GX && tot[gi] > 0 && hit[gi] / tot[gi] > 0.32;
        if (hot) {
          if (!run) run = { x0: gx, y0: gy, x1: gx, y1: gy };
          else run.x1 = gx;
        } else if (run) {
          boxes.push({ x: run.x0 / GX, y: run.y0 / GY, w: (run.x1 - run.x0 + 1) / GX, h: 1 / GY });
          run = null;
        }
      }
    }
    return { ratio: total ? changed / total : 0, boxes: boxes.slice(0, 14) };
  }

  async function loadBaselines() {
    if (!IS_EXT) return {};
    try { const r = await chrome.storage.local.get('shipcheck.baselines'); return r['shipcheck.baselines'] || {}; }
    catch (_) { return {}; }
  }

  async function saveBaselines(map) {
    if (!IS_EXT) return;
    const keys = Object.keys(map);
    while (keys.length > 20) delete map[keys.shift()];
    try { await chrome.storage.local.set({ 'shipcheck.baselines': map }); } catch (_) { /* noop */ }
  }

  async function runVisualBaseline(scan) {
    if (!IS_EXT || !state.settings.baseline) {
      state.visual = { available: false, reason: '视觉基线已在设置中关闭' };
      scan.visual = { available: false };
      return;
    }
    try {
      const key = urlKey(scan.url);
      const map = await loadBaselines();
      const prev = map[key];
      const addedVisual = ((scan.diff && scan.diff.added) || []).filter((f) => f.module === 'responsive' || f.module === 'visual');
      const judge = (worst, hasBase) => (!hasBase ? 'none' : worst < 0.02 ? 'stable' : (addedVisual.length ? 'suspicious' : 'changed'));

      /* 路线 1：多视口精确截图（用户已授权 debugger 权限） */
      const shots = await captureViewportThumbs();
      let visual;

      if (shots) {
        const cards = [];
        for (const s of shots) {
          const before = prev && prev.thumbs ? prev.thumbs[s.label] : null;
          let ratio = 0, boxes = [];
          if (before) {
            const d = await pixelDiff(before, s.thumb);
            ratio = d.ratio; boxes = d.boxes;
          }
          cards.push({ label: s.label, before: before || null, after: s.thumb, ratio, boxes });
        }
        const hasBaseline = cards.some((c) => !!c.before);
        const worst = cards.reduce((a, c) => Math.max(a, c.ratio), 0);
        visual = {
          available: true, mode: 'multi', hasBaseline, ratio: worst,
          boxes: cards.reduce((a, c) => a.concat(c.boxes), []).slice(0, 14),
          shots: cards,
          before: cards[0].before, after: cards[0].after,
          baselineTime: hasBaseline ? prev.time : null, currentTime: scan.time,
          verdict: judge(worst, hasBaseline)
        };
        const thumbs = {};
        for (const c of cards) thumbs[c.label] = c.after;
        map[key] = { thumbs, thumb: cards[0].after, time: scan.time, score: scan.score, url: scan.url };
      } else {
        /* 路线 2：当前视口截图（无额外权限） */
        const capture = await captureThumb();
        const thumb = capture.thumb;
        const before = prev && (prev.thumb || (prev.thumbs && prev.thumbs['当前视口']));
        let ratio = 0, boxes = [];
        if (before) { const d = await pixelDiff(before, thumb); ratio = d.ratio; boxes = d.boxes; }
        visual = {
          available: true, mode: 'single', hasBaseline: !!before, ratio, boxes,
          shots: null,
          before: before || null, after: thumb,
          baselineTime: before ? prev.time : null, currentTime: scan.time,
          verdict: judge(ratio, !!before)
        };
        map[key] = { thumbs: { '当前视口': thumb }, thumb, viewportWidth:capture.viewportWidth, time: scan.time, score: scan.score, url: scan.url };
      }

      await saveBaselines(map);
      state.visual = visual;
      // 历史记录里只保留量化的对比结论，不写入截图数据，避免 storage 膨胀。
      scan.visual = {
        available: true, mode: visual.mode, hasBaseline: visual.hasBaseline, ratio: visual.ratio,
        boxes: visual.boxes,
        shots: visual.shots ? visual.shots.map((c) => ({ label: c.label, ratio: c.ratio, boxes: c.boxes, hasBaseline: !!c.before })) : null,
        baselineTime: visual.baselineTime, currentTime: visual.currentTime,
        verdict: visual.verdict
      };
    } catch (e) {
      state.visual = { available: false, reason: '无法捕获截图：' + (e && e.message ? e.message : String(e)) };
      scan.visual = { available: false, reason: state.visual.reason };
    }
  }

  async function resetBaseline() {
    if (!IS_EXT) { toast('演示模式：不涉及真实截图基线'); return; }
    if (!state.scan) { toast('请先完成一次扫描'); return; }
    try {
      const shots = await captureViewportThumbs();
      const map = await loadBaselines();
      const now = new Date().toISOString();
      let thumb, thumbs, visual, visualViewportWidth = 0;
      if (shots) {
        thumbs = {};
        for (const s of shots) thumbs[s.label] = s.thumb;
        thumb = shots[0].thumb;
        visual = {
          available: true, mode: 'multi', hasBaseline: false, ratio: 0, boxes: [],
          shots: shots.map((s) => ({ label: s.label, before: null, after: s.thumb, ratio: 0, boxes: [] })),
          before: null, after: thumb, baselineTime: null, currentTime: now, verdict: 'none'
        };
      } else {
        const capture = await captureThumb();
        thumb = capture.thumb;
        thumbs = { '当前视口': thumb };
        visualViewportWidth = capture.viewportWidth;
        visual = {
          available: true, mode: 'single', hasBaseline: false, ratio: 0, boxes: [], shots: null,
          before: null, after: thumb, baselineTime: null, currentTime: now, verdict: 'none'
        };
      }
      map[urlKey(state.scan.url)] = { thumbs, thumb, viewportWidth:visualViewportWidth, time: now, score: state.scan.score, url: state.scan.url };
      await saveBaselines(map);
      state.visual = visual;
      state.scan.visual = {
        available: true, mode: visual.mode, hasBaseline: false, ratio: 0, boxes: [],
        shots: visual.shots, currentTime:now, verdict: 'none'
      };
      window.ShipCheckStudio?.update(state.scan, state.currentUrl).catch(e=>console.warn('[ShipCheck] Studio update',e));
      renderVersions();
      toast(shots ? '已把 ' + shots.length + ' 个视口截图设为新基线' : '已把当前截图设为新基线，下次扫描会与它对比');
    } catch (e) { toast('设置基线失败：' + (e && e.message ? e.message : String(e))); }
  }

  /* ---------------------------------------------------------------- *
   * V3 接口预留 · MCP 风格 Agent 任务包
   * ---------------------------------------------------------------- */
  function buildAgentBundle(scan) {
    const list = scored(scan);
    return {
      schema: 'shipcheck.agent-handoff/v1',
      generator: 'ShipCheck AI ' + (scan.engine || ENGINE_VERSION),
      generated_at: new Date().toISOString(),
      target: {
        url: scan.url, title: scan.title,
        score: scan.score,
        viewports: (scan.viewports || []).map((v) => v.label)
      },
      summary: {
        total_issues: list.length,
        priority: list.filter((f) => f.severity === 'critical' || f.severity === 'high').length,
        by_severity: scan.counts
      },
      tools: list.map((f) => ({
        name: 'shipcheck.apply_fix',
        arguments: {
          id: f.id, rule: f.rule, title: f.title, module: f.module,
          severity: f.severity, confidence: f.confidence,
          selector: f.selector, viewports: f.viewports,
          reproduce: f.repro, evidence: f.evidence,
          likely_causes: f.causes, expected_fix: f.fixes, retest: f.retest,
          prompt: buildFixPrompt(f, scan)
        }
      })),
      verification_required: verifyList(scan).map((f) => ({ rule: f.rule, title: f.title, note: f.detail })),
      retest: {
        command: '重新运行 ShipCheck AI 扫描',
        expect: 'score 提升；diff.added 为空；diff.fixed 包含本次修复的规则'
      },
      diff: scan.diff ? {
        score_delta: scan.diff.scoreDelta,
        added: scan.diff.added.map((f) => ({ rule: f.rule, title: f.title })),
        fixed: scan.diff.fixed.map((f) => ({ rule: f.rule, title: f.title }))
      } : null,
      demo: !!scan.demo
    };
  }

  /* ---------------------------------------------------------------- *
   * 交付物导出：PR 评论 / CI 片段
   * ---------------------------------------------------------------- */
  function buildPrComment(scan) {
    const list = scored(scan);
    const d = scan.diff;
    const L = [];
    L.push('## ShipCheck AI 交付检查');
    L.push('');
    let head = '**分数：' + scan.score + '/100**';
    if (d && d.hasPrevious && d.scoreDelta != null) head += '（较上一版 ' + (d.scoreDelta >= 0 ? '+' : '') + d.scoreDelta + '）';
    head += ' · 发现 ' + list.length + ' 个问题（严重 ' + (scan.counts.critical || 0) + ' / 高 ' + (scan.counts.high || 0) + ' / 中 ' + (scan.counts.medium || 0) + ' / 低 ' + (scan.counts.low || 0) + '）';
    L.push(head);
    L.push('');
    if (list.length) {
      L.push('| 级别 | 模块 | 问题 | 视口 | DOM 定位 |');
      L.push('| --- | --- | --- | --- | --- |');
      for (const f of list.slice(0, 20)) {
        L.push('| ' + (SEV_LABEL[f.severity] || f.severity) + ' | ' + (MODULE_LABEL[f.module] || f.module) +
          ' | ' + f.title + ' | ' + (f.viewports || []).join(' / ') + ' | ' + (f.selector ? '`' + f.selector + '`' : '—') + ' |');
      }
      if (list.length > 20) L.push('| … | 另有 ' + (list.length - 20) + ' 项 | | | |');
      L.push('');
      const priority = list.filter((f) => f.severity === 'critical' || f.severity === 'high');
      if (priority.length) {
        L.push('<details><summary>优先修复 ' + priority.length + ' 项（含复现步骤与复测标准）</summary>');
        L.push('');
        priority.forEach((f, i) => {
          L.push((i + 1) + '. **' + f.title + '**（`' + f.rule + '`' + (f.selector ? ' · `' + f.selector + '`' : '') + '）');
          if (f.detail) L.push('   - ' + f.detail);
          if ((f.fixes || []).length) L.push('   - 修复：' + f.fixes[0]);
          if ((f.retest || []).length) L.push('   - 复测：' + f.retest[0]);
        });
        L.push('');
        L.push('</details>');
        L.push('');
      }
    } else {
      L.push('未发现确定性缺陷。注意这不等于达到可交付标准：表单提交结果、点击反馈、结账与登录流程需端到端验证。');
      L.push('');
    }
    const vlist = verifyList(scan);
    if (vlist.length) {
      L.push('**待人工 / 环境验证**（不计入评分）：' + vlist.map((f) => f.title).join('；'));
      L.push('');
    }
    L.push('<sub>ShipCheck AI v' + (scan.engine || ENGINE_VERSION) + ' · ' + new Date(scan.time).toLocaleString('zh-CN') +
      ' · 规则引擎本地扫描，页面数据未上传 · 视觉变化与启发式结论需人工复核</sub>');
    return L.join('\n');
  }

  function buildCiSnippet(scan) {
    const th = scan.score >= 80 ? 80 : scan.score >= 60 ? 60 : scan.score;
    return [
      '# GitHub Actions：把 ShipCheck 接到构建之后，分数不达标或出现严重缺陷就失败',
      '      - name: ShipCheck 交付检查',
      '        run: |',
      '          node vendor/shipcheck/mcp/server.js --ci "${{ env.PREVIEW_URL }}" \\',
      '            --min-score ' + th + ' --fail-on critical --json shipcheck.json',
      '',
      '      - name: 上传检查结果',
      '        if: always()',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: shipcheck-report',
      '          path: shipcheck.json',
      '',
      '# 说明',
      '# - PREVIEW_URL 指向本次构建的预览地址（本地用 http://127.0.0.1:3000）',
      '# - --min-score 最低分，--fail-on 指定哪一级缺陷导致失败（critical / high / never）',
      '# - 运行机需要 Chrome/Chromium；可用 SHIPCHECK_CHROME 指定路径，或用 SHIPCHECK_CDP_URL 连远端浏览器',
      '# - 本次扫描得分 ' + scan.score + '，参考阈值 ' + th + '（仅为建议值，请按项目实际情况调整）'
    ].join('\n');
  }

  /* ---------------------------------------------------------------- *
   * Module F：AI 修复指令（可直接粘贴给 Cursor / Claude Code）
   * ---------------------------------------------------------------- */
  function buildFixPrompt(f, meta) {
    const L = [];
    L.push('# ShipCheck AI 修复任务 · ' + f.title);
    L.push('');
    L.push('## 1. 上下文');
    L.push('- 页面 URL：' + (meta.url || '—'));
    L.push('- 页面标题：' + (meta.title || '—'));
    L.push('- 检测时间：' + (meta.time ? new Date(meta.time).toLocaleString('zh-CN') : '—'));
    L.push('- 模块：' + (MODULE_LABEL[f.module] || f.module) + '（规则 ' + f.rule + '）');
    L.push('- 严重等级：' + (SEV_LABEL[f.severity] || f.severity) + ' / ' + (SEV_ZH[f.severity] || ''));
    L.push('- 证据等级：' + (f.confidence === 'confirmed' ? '确定性规则，可按步骤复现' : '启发式规则，请先人工确认再修改源码'));
    L.push('- 出现视口：' + (f.viewports || []).join('、'));
    if (f.selector) L.push('- DOM 定位：`' + f.selector + '`');
    L.push('');
    L.push('## 2. 复现步骤');
    (f.repro || []).forEach((s, i) => L.push((i + 1) + '. ' + s));
    L.push('');
    L.push('## 3. 问题证据');
    (f.evidence || []).forEach((s) => L.push('- ' + s));
    if (f.detail) L.push('- 说明：' + f.detail);
    L.push('');
    L.push('## 4. 可能原因');
    (f.causes || []).forEach((s) => L.push('- ' + s));
    L.push('');
    L.push('## 5. 修复要求');
    (f.fixes || []).forEach((s) => L.push('- ' + s));
    L.push('');
    L.push('## 6. 修复后必须通过的复测');
    (f.retest || []).forEach((s) => L.push('- [ ] ' + s));
    L.push('- [ ] 重新运行 ShipCheck AI 扫描，该问题不再出现且整体分数提升');
    L.push('');
    L.push('> 本指令由本地规则引擎生成，未上传任何页面源码或 Cookie。请结合项目实际源码执行，不要盲目信任「需人工确认」类结论。');
    const project=window.ShipCheckStudio?.getProject();
    if(project && window.ShipCheckCore) return window.ShipCheckCore.repairPrompt(f,meta,project);
    return L.join('\n');
  }

  function allFixPrompts(scan) {
    const list = scored(scan);
    const L = [
      '# ShipCheck AI · 批量修复任务清单',
      '',
      '- 页面：' + (scan.url || '—'),
      '- 交付检查分数：' + scan.score + '/100',
      '- 问题数：' + list.length + '（其中 Critical / High ' + list.filter((f) => f.severity === 'critical' || f.severity === 'high').length + ' 项需优先修复）',
      '- 生成时间：' + new Date().toLocaleString('zh-CN'),
      '',
      '请按「优先修复 → 中 → 低」的顺序处理以下任务。每完成一项，运行一次复测清单；全部完成后重新扫描并对比分数。',
      '',
      scan.demo ? '> 注意：以下为产品演示数据，仅用于展示格式。' : ''
    ];
    list.forEach((f, i) => {
      L.push('---');
      L.push('');
      L.push('## 任务 ' + (i + 1) + ' / ' + list.length + ' · [' + SEV_LABEL[f.severity] + '] ' + f.title);
      L.push('');
      L.push(buildFixPrompt(f, scan).split('\n').slice(3).join('\n'));
    });
    return L.join('\n');
  }

  function buildMarkdownReport(scan) {
    const list = scored(scan);
    const L = [
      '# ShipCheck AI · 网站交付检查报告',
      '',
      scan.demo ? '> **演示数据**：本报告用于展示产品概念与报告格式，不是真实扫描结果。' : '',
      '',
      '| 项目 | 内容 |',
      '| --- | --- |',
      '| 页面 | ' + (scan.url || '—') + ' |',
      '| 标题 | ' + (scan.title || '—') + ' |',
      '| 检测时间 | ' + new Date(scan.time).toLocaleString('zh-CN') + ' |',
      '| 引擎版本 | ' + (scan.engine || '—') + ' |',
      '| 交付检查分数 | **' + scan.score + '/100** |',
      '| 发现的问题 | ' + list.length + ' |',
      '| 优先修复 | ' + list.filter((f) => f.severity === 'critical' || f.severity === 'high').length + ' |',
      '| 检查视口 | ' + (scan.viewports || []).map((v) => v.label).join('、') + ' |',
      '| 耗时 | ' + (scan.durationMs || 0) + ' ms |',
      '',
      '## 视口概览',
      '',
      '| 视口 | clientWidth | scrollWidth | 横向溢出 | 状态 |',
      '| --- | --- | --- | --- | --- |'
    ];
    (scan.viewports || []).forEach((v) => L.push('| ' + v.label + ' | ' + v.clientWidth + 'px | ' + v.scrollWidth + 'px | ' + (v.overflowPx || 0) + 'px | ' + (v.blocked ? '不可用' : '正常') + ' |'));
    L.push('', '## 缺陷清单', '');
    L.push('| # | 严重等级 | 模块 | 问题 | 视口 | 证据等级 |');
    L.push('| --- | --- | --- | --- | --- | --- |');
    list.forEach((f, i) => L.push('| ' + (i + 1) + ' | ' + SEV_LABEL[f.severity] + ' | ' + (MODULE_LABEL[f.module] || f.module) + ' | ' + f.title + ' | ' + (f.viewports || []).join(' / ') + ' | ' + (f.confidence === 'confirmed' ? '可复现' : '需人工确认') + ' |'));
    const d = scan.diff;
    if (d && d.hasPrevious) {
      L.push('', '## 版本对比（与上一版）', '');
      L.push('| 项目 | 数值 |', '| --- | --- |');
      L.push('| 上一版分数 | ' + d.previousScore + ' |');
      L.push('| 本次分数 | ' + scan.score + ' |');
      L.push('| 分数变化 | ' + (d.scoreDelta >= 0 ? '+' : '') + d.scoreDelta + ' |');
      L.push('| 新增问题 | ' + d.added.length + ' |');
      L.push('| 已修复问题 | ' + d.fixed.length + ' |');
      L.push('| 仍存在的问题 | ' + (d.persisted || []).length + ' |');
      if (d.added.length) { L.push('', '**新增问题**', ''); d.added.forEach((f) => L.push('- [' + (SEV_LABEL[f.severity] || '') + '] ' + f.title)); }
      if (d.fixed.length) { L.push('', '**已修复问题**', ''); d.fixed.forEach((f) => L.push('- ' + f.title)); }
    } else if (d) {
      L.push('', '## 版本对比', '', '首次扫描，已建立基线；下次扫描将自动对比分数、新增与已修复问题。');
    }
    if (scan.visual && scan.visual.available && scan.visual.hasBaseline) {
      L.push('', '## 视觉基线对比（当前视口）', '');
      L.push('- 像素变化率：' + ((scan.visual.ratio || 0) * 100).toFixed(1) + '%');
      L.push('- 判定：' + (VERDICT_LABEL[scan.visual.verdict] || '—'));
      L.push('- 变化区域：' + (scan.visual.boxes || []).length + ' 处');
      L.push('- 说明：截图仅在本地生成与比较，未上传；视觉变化不等于缺陷，请结合新增问题人工判断。');
    }
    if (scan.siteScan && scan.siteScan.pages && scan.siteScan.pages.length) {
      L.push('', '## 同域多页面扫描', '');
      L.push('| 页面 | 分数 | 问题数 |', '| --- | --- | --- |');
      scan.siteScan.pages.forEach((p) => L.push('| ' + p.url + ' | ' + (p.score == null ? '未验证' : p.score) + ' | ' + (p.counts ? p.counts.total : '—') + ' |'));
      L.push('', '### 逐页 QA 发现', '');
      for(const p of scan.siteScan.pages){
        L.push('#### '+p.url, '');
        if(p.error)L.push('- QA 未验证：'+p.error);
        for(const f of p.findings||[])L.push('- **['+(f.severity||'review')+'] '+f.title+'** ('+f.module+')：'+(f.evidence?.[0]||f.detail||'')+'；建议：'+(f.fixes?.[0]||'核对证据后修复'));
        if(!p.error&&!p.findings?.length)L.push('- 本次规则未确认问题，不等于业务验收通过。');
      }
    }
    if (scan.pageSpeed?.results) {
      L.push('', '## Lighthouse · 本地检测', '');
      L.push('首次测试 URL：'+scan.pageSpeed.url+'；结果为本地实验室测试，不代表真实用户数据。', '');
      if (Array.isArray(scan.pageSpeed.pages) && scan.pageSpeed.pages.length) {
        L.push('', '### 本地 Lighthouse 全站抽样结果', '');
        L.push('| URL | 设备 | 性能 | 无障碍 | 最佳实践 | 基础 SEO | 状态 |', '| --- | --- | ---: | ---: | ---: | ---: | --- |');
        for (const result of scan.pageSpeed.pages) L.push('| '+result.url+' | '+(result.strategy||'—')+' | '+(result.scores?.performance??'—')+' | '+(result.scores?.accessibility??'—')+' | '+(result.scores?.['best-practices']??'—')+' | '+(result.scores?.seo??'—')+' | '+(result.error?'未验证：'+result.error.replace(/\|/g,'/'):'完成')+' |');
        L.push('', '- 覆盖：'+(scan.pageSpeed.coverage?.requestedUrls??'—')+' 个抽样 URL；未经检测的页面不等于通过。');
      }
      for(const [device,result] of Object.entries(scan.pageSpeed.results)){
        if(result?.error){L.push('- '+device+'：未取得结果（'+result.error+'）');continue;}
        L.push('### '+device, '', '- Lighthouse 评分：'+Object.entries(result.scores||{}).map(([k,v])=>k+' '+(v??'未验证')).join(' / '));
        L.push('- CrUX 真实用户数据：'+(result.field?.length?result.field.map(f=>f.label+' '+f.value).join(' / '):'本次未提供；不能据实验室数据推断实际用户体验'));
        for(const f of (result.recommendations||[]).slice(0,8)) L.push('- '+f.title+'：'+f.advice);
      }
    }
    if (scan.siteAudit) {
      L.push('', '## 全站技术 SEO / GEO 证据', '');
      for (const f of scan.siteAudit.findings || []) {
        L.push('- **[' + f.severity + '] ' + f.title + '**：' + f.evidence + ' · ' + (f.urls||[]).join(', '));
      }
      L.push('- 重要：未扫描的页面、Search Console 索引和 AI 实际引用不在通过范围内。');
    }
    L.push('', '## 缺陷详情与修复建议', '');
    list.forEach((f, i) => {
      L.push('### ' + (i + 1) + '. [' + SEV_LABEL[f.severity] + '] ' + f.title, '');
      L.push('- 规则：' + f.rule + ' ｜ 模块：' + (MODULE_LABEL[f.module] || f.module) + ' ｜ 视口：' + (f.viewports || []).join('、'));
      if (f.selector) L.push('- DOM 定位：`' + f.selector + '`');
      L.push('', '**证据**', '');
      (f.evidence || []).forEach((e) => L.push('- ' + e));
      L.push('', '**可能原因**', '');
      (f.causes || []).forEach((e) => L.push('- ' + e));
      L.push('', '**修复要求**', '');
      (f.fixes || []).forEach((e) => L.push('- ' + e));
      L.push('', '**复测清单**', '');
      (f.retest || []).forEach((e) => L.push('- [ ] ' + e));
      L.push('');
    });
    const v = verifyList(scan);
    if (v.length) {
      L.push('## 待验证项（不计入评分）', '');
      L.push('以下项目需要测试账号、沙盒环境或显式断言，V1 不自动执行，禁止在未经授权时触发真实购买、发送消息或修改生产数据。', '');
      v.forEach((f) => L.push('- **' + f.title + '**：' + f.detail));
      L.push('');
    }
    if (scan.notes && scan.notes.length) {
      L.push('## 扫描备注', '');
      scan.notes.forEach((n) => L.push('- ' + n));
      L.push('');
    }
    L.push('## 能力边界', '');
    L.push('本报告基于确定性规则与启发式检查，不能替代完整 WCAG 审计、SEO 审计或端到端业务测试，也不承诺发现全部问题。所有页面计算均在本地完成，未上传页面源码、Cookie 或截图。');
    return L.join('\n');
  }

  /* ---------------------------------------------------------------- *
   * 渲染
   * ---------------------------------------------------------------- */
  function renderHeader() {
    const scan = state.scan;
    const url = scan ? scan.url : (IS_EXT ? state.currentUrl : 'https://demo.example.com/premium-furniture');
    $('#page-url').textContent = url || '未连接 — 打开一个 http/https 网页后点击扫描';
    $('#page-url').title = url || '';
    $('#mode-badge').textContent = IS_EXT ? '' : '演示模式';
    $('#mode-badge').style.display = IS_EXT ? 'none' : '';
  }

  function renderScore() {
    const scan = state.scan;
    const score = scan ? scan.score : null;
    const counts = scan ? scan.counts : { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    const C = 326.73;
    const ring = $('#ring-fg');
    if (score === null) {
      $('#score-num').textContent = '--';
      $('#score-desc').textContent = '尚未扫描';
      ring.style.strokeDashoffset = C;
    } else {
      $('#score-num').textContent = score;
      $('#score-desc').textContent = score >= 80 ? '基础规则检查较好 · 仍需业务验收' : score >= 60 ? '基础规则存在待处理问题' : '基础规则缺陷较多';
      ring.style.strokeDashoffset = C * (1 - score / 100);
      ring.style.stroke = score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#e11d48';
    }
    $('#stat-issues').textContent = counts.total || 0;
    $('#stat-priority').textContent = (counts.critical || 0) + (counts.high || 0);
    $('#stat-viewports').textContent = scan ? (scan.viewports || []).filter(v=>!v.blocked).length : 0;

    const total = (counts.critical || 0) + (counts.high || 0) + (counts.medium || 0) + (counts.low || 0);
    const bar = $('#severity-bar');
    if (!total) { bar.innerHTML = ''; return; }
    const segs = ['critical', 'high', 'medium', 'low'].map((k) =>
      '<i style="width:' + ((counts[k] || 0) / total * 100) + '%;background:' + SEV_COLOR[k] + '"></i>');
    bar.innerHTML = segs.join('');
  }

  const FILTERS = [
    { id: 'all', label: '全部' },
    { id: 'priority', label: '优先修复' },
    { id: 'responsive', label: 'Responsive' },
    { id: 'interaction', label: 'Interaction' },
    { id: 'visual', label: 'Visual' },
    { id: 'a11y', label: '无障碍' },
    { id: 'seo', label: 'SEO' },
    { id: 'review', label: '需人工确认' }
  ];

  function matchFilter(f, filter) {
    switch (filter) {
      case 'priority': return f.severity === 'critical' || f.severity === 'high';
      case 'review': return f.confidence === 'needs-review';
      case 'all': return true;
      default: return f.module === filter;
    }
  }

  function renderSiteIssues(){
    const el=$('#site-issues-summary');if(!el)return;
    const pages=state.siteScan?.pages || state.scan?.siteScan?.pages || [];
    const audit=window.ShipCheckTechnicalPanel?.getAudit() || state.scan?.siteAudit;
    if(!pages.length){el.innerHTML='';return;}
    const qaTotal=pages.reduce((n,p)=>n+(p.findings?.length||0),0);
    const seoTotal=audit?.findings?.length||0;
    el.innerHTML=`<div class="site-issue-header"><b>全站问题总览</b><span>${qaTotal} 条 QA · ${seoTotal} 条 SEO/GEO · ${pages.length} 个 URL</span></div>
      <p class="unified-info">以下按页面汇总。未成功打开或未执行的检查属于“未验证”，不是通过。展开后可查看具体证据和修复方向。</p>
      ${pages.map(p=>`<details class="site-issue-page"><summary><strong>${esc(p.path)}</strong><span>${p.score==null?'未验证':(p.findings?.length||0)+' 项 QA'}</span></summary>
       ${p.error?`<p class="site-issue-error">${esc(p.error)}</p>`:''}
       ${(p.findings||[]).length ? (p.findings||[]).map(f=>`<div class="site-issue-finding"><span class="badge ${esc(f.severity||'medium')}">${esc(f.severity)}</span> <b>${esc(f.title)}</b><small>${esc(f.module||'')} · ${esc((f.evidence||[])[0]||f.detail||'')}</small>${(f.fixes||[]).length?`<small>建议：${esc(f.fixes[0])}</small>`:''}</div>`).join(''):'<p class="unified-info">本页面没有经本次扫描确认的 QA 缺陷，仍不代表完成业务验收。</p>'}
      </details>`).join('')}
      ${seoTotal?`<details class="site-issue-page"><summary><strong>全站关系 · SEO/GEO</strong><span>${seoTotal} 项发现</span></summary>
        ${(audit.findings||[]).map(f=>`<div class="site-issue-finding"><span class="badge ${esc(f.severity||'medium')}">${esc(f.severity)}</span> <b>${esc(f.title)}</b><small>${esc(f.evidence)}</small><small>涉及：${esc((f.urls||[]).slice(0,6).map(pathOf).join('、'))}</small></div>`).join('')}
      </details>`:''}<div class="unified-info">详细源 HTML、Canonical、hreflang、Sitemap 和 GEO 内容证据见「SEO / GEO」。</div>`;
  }

  function renderIssues() {
    renderSiteIssues();
    const list = scored(state.scan);
    $('#filters').innerHTML = FILTERS.map((x) => {
      const n = x.id === 'all' ? list.length : list.filter((f) => matchFilter(f, x.id)).length;
      return '<button class="chip' + (state.filter === x.id ? ' active' : '') + '" data-filter="' + x.id + '">' + esc(x.label) + (n ? ' ' + n : '') + '</button>';
    }).join('');

    const shown = list.filter((f) => matchFilter(f, state.filter));
    if (!state.scan) {
      $('#issue-list').innerHTML = '<div class="empty"><b>还没有扫描结果</b>打开站点，点击顶部「一键扫描全站」。<br>扫描在本地完成，不会上传页面内容。</div>';
      return;
    }
    if (!shown.length) {
      $('#issue-list').innerHTML = '<div class="empty"><b>该筛选下没有缺陷</b>换个筛选条件，或重新扫描确认。</div>';
      return;
    }
    $('#issue-list').innerHTML = shown.map(issueCard).join('');
  }

  function issueCard(f) {
    const sev = f.severity;
    const conf = f.confidence === 'confirmed'
      ? '<span class="badge conf">规则检测</span>'
      : '<span class="badge conf review">待复核</span>';
    const vps = (f.viewports || []).slice(0, 3).map(v => '<span class="badge vp">' + esc(v) + '</span>').join('');
    const prompt=buildFixPrompt(f,state.scan||{});
    const li=arr=>(arr||[]).map(s=>'<li>'+esc(s)+'</li>').join('');
    const reason=f.reason||f.causes?.[0]||f.detail||f.evidence?.[0]||'请核对规则对应的页面元素。';
    const solution=f.solution||f.fixes?.[0]||'定位实际元素并按证据修复，然后重新扫描。';
    const location=f.selector||'页面级检查';
    return [
      '<article class="issue sev-'+esc(sev)+'" data-id="'+esc(f.id)+'">',
      '<div class="issue-top"><span class="badge '+esc(sev)+'">'+esc(SEV_LABEL[sev]||sev)+'</span><span class="badge mod">'+esc(MODULE_LABEL[f.module]||f.module)+'</span>'+conf+vps+'</div>',
      '<h3>'+esc(f.title)+'</h3>',
      '<div class="issue-quick"><div><b>出错位置</b><code>'+esc(location)+'</code></div>',
      '<div><b>为什么报错</b><p>'+esc(reason)+'</p></div>',
      '<div><b>如何修复</b><p>'+esc(solution)+'</p></div></div>',
      f.affectedCount?'<div class="issue-count">涉及 '+Number(f.affectedCount)+' 个检测节点'+(f.elementPreview?' · 内容：'+esc(f.elementPreview):'')+'</div>':'',
      '<div class="issue-actions"><button class="link-btn" data-action="toggle">更多证据与复测 ▾</button><button class="btn-mini primary" data-action="copy">复制修复指令</button><button class="btn-mini" data-action="locate">网页中定位 ↗</button><button class="btn-mini" data-action="shot">截图证据</button></div>',
      '<div class="issue-full hidden">',
      f.selector?'<section><h4>DOM 定位</h4><code>'+esc(f.selector)+'</code></section>':'',
      '<section><h4>完整问题证据</h4><ul>'+li(f.evidence)+'</ul></section>',
      '<section><h4>复现步骤</h4><ul>'+li(f.repro)+'</ul></section>',
      '<section><h4>可能原因</h4><ul>'+li(f.causes)+'</ul></section>',
      '<section><h4>修复要求</h4><ul>'+li(f.fixes)+'</ul></section>',
      '<section><h4>复测清单</h4><ul>'+li(f.retest)+'</ul></section>',
      '<section><h4>完整 Agent 指令</h4><pre class="prompt-preview">'+esc(prompt)+'</pre></section></div></article>'
    ].join('');
  }

  function renderDevices() {
    const vps = state.scan ? (state.scan.viewports || []) : [];
    if (!vps.length) {
      $('#device-list').innerHTML = '<div class="empty"><b>尚未检查视口</b>扫描后会列出每个视口的宽度、文档宽度与溢出情况。</div>';
      return;
    }
    $('#device-list').innerHTML = vps.map((v) => {
      const max = Math.max(v.scrollWidth || 0, v.clientWidth || 1);
      const pct = Math.min(100, (v.clientWidth || 0) / max * 100);
      const over = (v.overflowPx || 0) > 1;
      const tag = v.blocked
        ? '<span class="tag blocked">不可用</span>'
        : over ? '<span class="tag bad">横向溢出 ' + v.overflowPx + 'px</span>' : '<span class="tag ok">正常</span>';
      return [
        '<div class="device">',
        '  <div class="device-head"><b>' + esc(v.label) + '</b>' + tag + '</div>',
        '  <div class="device-metrics">',
        '    <span>clientWidth ' + (v.clientWidth || 0) + 'px</span>',
        '    <span>scrollWidth ' + (v.scrollWidth || 0) + 'px</span>',
        '    <span>高度 ' + (v.height || 0) + 'px</span>',
        '    <span>缺陷 ' + (v.issueCount || 0) + '</span>',
        '  </div>',
        '  <div class="device-track' + (over ? ' over' : '') + '"><i style="width:' + pct + '%"></i></div>',
        v.note ? '  <div class="device-note">' + esc(v.note) + '</div>' : '',
        '</div>'
      ].join('');
    }).join('');
  }

  function renderFixes() {
    const list = scored(state.scan);
    $('#fix-count').textContent = list.length ? '共 ' + list.length + ' 条任务' : '';
    if (!list.length) {
      $('#fix-list').innerHTML = '<div class="empty"><b>暂无修复任务</b>扫描后会自动生成可交给 AI 编程工具的修复指令。</div>';
      return;
    }
    $('#fix-list').innerHTML = list.map((f, i) => [
      '<div class="fix-item" data-id="' + esc(f.id) + '">',
      '  <div class="fix-item-head"><span class="badge ' + f.severity + '">' + SEV_LABEL[f.severity] + '</span><b>' + (i + 1) + '. ' + esc(f.title) + '</b></div>',
      '  <pre>' + esc(buildFixPrompt(f, state.scan)) + '</pre>',
      '  <button class="btn-mini primary" data-action="copy-one">复制这条指令</button>',
      '</div>'
    ].join('')).join('');
  }

  function renderReport() {
    const scan = state.scan;
    if (!scan) {
      $('#report-summary').innerHTML = '<div class="empty"><b>暂无报告</b>完成一次扫描后可导出 Markdown / JSON 交付报告。</div>';
      $('#report-verify').innerHTML = '';
      $('#report-notes').innerHTML = '';
      return;
    }
    const list = scored(scan);
    $('#report-summary').innerHTML = [
      '<h3>交付检查摘要</h3>',
      '<div class="report-grid">',
      '<div><span>交付分数</span><b>' + scan.score + ' / 100</b></div>',
      '<div><span>发现的问题</span><b>' + list.length + '</b></div>',
      '<div><span>优先修复</span><b class="danger">' + list.filter((f) => f.severity === 'critical' || f.severity === 'high').length + '</b></div>',
      '<div><span>检查视口</span><b>' + (scan.viewports || []).length + '</b></div>',
      '<div><span>扫描耗时</span><b>' + (scan.durationMs || 0) + ' ms</b></div>',
      '<div><span>引擎版本</span><b>' + esc(scan.engine || '—') + '</b></div>',
      '</div>',
      '<p class="muted" style="margin:9px 0 0">页面：' + esc(scan.url || '—') + '</p>'
    ].join('');

    $('#report-verify').innerHTML='<div class="verify-box"><h3>测试范围说明</h3><p class="muted">此报告仅记录已执行的自动检查。真实支付、邮件接收、数据库保存等未经授权的业务动作没有执行，也不会要求你人工勾选验收结论。</p></div>';
    $('#report-notes').innerHTML = (scan.notes || []).map((n) => '<div class="note-line">' + esc(n) + '</div>').join('');
  }

  function boxesHtml(boxes) {
    return (boxes || []).map((b) =>
      '<div class="visual-box" style="left:' + (b.x * 100).toFixed(1) + '%;top:' + (b.y * 100).toFixed(1) +
      '%;width:' + (b.w * 100).toFixed(1) + '%;height:' + (b.h * 100).toFixed(1) + '%"></div>').join('');
  }

  function shortTime(t) {
    if (!t) return '—';
    try { return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return '—'; }
  }

  function renderVersions() {
    const scan = state.scan;
    const sumEl = $('#version-summary');
    const visEl = $('#visual-diff');
    const siteEl = $('#site-pages');

    if (!scan) {
      sumEl.innerHTML = '<div class="empty"><b>还没有版本数据</b>完成第一次扫描后建立基线，第二次扫描即可看到分数变化、新增与已修复问题。</div>';
      visEl.innerHTML = '';
      siteEl.innerHTML = '';
      return;
    }

    /* 1) 分数与问题差异 */
    const d = scan.diff;
    if (d && d.hasPrevious) {
      const delta = d.scoreDelta || 0;
      const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
      const li = (arr) => arr.length
        ? '<ul>' + arr.slice(0, 8).map((f) => '<li>' + esc(f.title) + '</li>').join('') +
          (arr.length > 8 ? '<li>…另有 ' + (arr.length - 8) + ' 项</li>' : '') + '</ul>'
        : '<div class="none">无</div>';
      sumEl.innerHTML = [
        '<div class="ver-card">',
        '  <h3>交付分数变化 <span class="sub">与同 URL 上一次扫描对比</span></h3>',
        '  <div class="ver-scores">',
        '    <div class="ver-score"><b>' + d.previousScore + '</b><span>上一版 · ' + shortTime(d.previousTime) + '</span></div>',
        '    <div class="ver-arrow">→</div>',
        '    <div class="ver-score"><b>' + scan.score + '</b><span>本次 · ' + shortTime(scan.time) + '</span></div>',
        '    <span class="ver-delta ' + cls + '">' + (delta >= 0 ? '+' : '') + delta + '</span>',
        '  </div>',
        '  <div class="ver-lists">',
        '    <div class="ver-list added"><h4>新增 ' + d.added.length + ' 项</h4>' + li(d.added) + '</div>',
        '    <div class="ver-list fixed"><h4>已修复 ' + d.fixed.length + ' 项</h4>' + li(d.fixed) + '</div>',
        '  </div>',
        '  <p class="ver-hint">修复后重新扫描即可看到「已修复」列表与分数回升；仍存在的问题 ' + ((d.persisted || []).length) + ' 项。这是持续回归检查与订阅价值的依据。</p>',
        '</div>'
      ].join('');
    } else {
      sumEl.innerHTML = '<div class="ver-card"><h3>首次扫描 · 基线已建立</h3><p class="ver-hint">下次对同一页面扫描时，这里会自动显示分数变化、新增问题、已修复问题和视觉差异。</p></div>';
    }

    /* 2) 视觉基线对比 */
    const v = scan.visual;
    const full = (state.visual && state.visual.currentTime === scan.time) ? state.visual : null;
    const imgFor = (src, label, isAfter, vdata) => {
      const boxes = isAfter ? boxesHtml(vdata && vdata.boxes) : '';
      if (src) return '<div class="visual-shot"><img alt="' + label + '" src="' + src + '">' + boxes + '<div class="cap">' + label + '</div></div>';
      return '<div class="visual-shot mock">' + label + boxes + '</div>';
    };
    if (!v || v.available === false) {
      visEl.innerHTML = '<div class="ver-card"><h3>视觉基线对比 <span class="sub">当前视口</span></h3>' +
        '<p class="ver-hint">' + esc((v && v.reason) || '视觉基线未启用或截图不可用。') + '</p></div>';
    } else if (v.mode === 'multi' && (v.shots || (full && full.shots))) {
      const cards = (full && full.shots && full.shots.length) ? full.shots : v.shots;
      const worstIdx = cards.reduce((bi, c, i) => (c.ratio > cards[bi].ratio ? i : bi), 0);
      const worst = cards[worstIdx];
      visEl.innerHTML = [
        '<div class="ver-card">',
        '  <h3>视觉基线对比 <span class="sub">' + cards.length + ' 个视口 · 精确视口截图</span></h3>',
        '  <div class="shot-strip">',
        cards.map((c, i) => {
          const ratio = c.ratio || 0;
          return '<div class="shot-card' + (i === worstIdx && c.hasBaseline !== false && c.before ? ' worst' : '') + '">' +
            '<div class="shot-frame">' +
            (c.after ? '<img alt="' + esc(c.label) + '" src="' + c.after + '">' + boxesHtml(c.boxes) : '<span class="pending">重新扫描后显示</span>') +
            '</div>' +
            '<div class="shot-cap"><b>' + esc(c.label) + '</b><span class="' + (ratio > 0.02 ? (i === worstIdx ? 'top' : 'hit') : '') + '">' +
            (c.before ? (ratio * 100).toFixed(1) + '%' : '基线待建') + '</span></div>' +
            '</div>';
        }).join(''),
        '  </div>',
        (worst && worst.before && worst.after) ? '  <div class="visual-pair">' +
          imgFor(worst.before, '基线 ' + esc(worst.label) + ' · ' + shortTime(v.baselineTime), false, worst) +
          imgFor(worst.after, '本次 ' + esc(worst.label) + ' · ' + shortTime(v.currentTime), true, worst) + '  </div>' : '',
        '  <div class="visual-meta">',
        '    <span class="visual-ratio">最大像素变化 <b>' + ((v.ratio || 0) * 100).toFixed(1) + '%</b></span>',
        '    <span class="verdict ' + esc(v.verdict || 'none') + '">' + esc(VERDICT_LABEL[v.verdict] || '—') + '</span>',
        '    <span class="muted">变化区域 ' + ((v.boxes || []).length) + ' 处</span>',
        '  </div>',
        '  <div class="visual-actions"><button class="btn tiny" data-action="reset-baseline">把当前截图设为新基线</button></div>',
        '  <p class="ver-hint">通过 debugger 权限对 ' + cards.map((c) => esc(c.label)).join(' / ') + ' 做真实视口截图，逐视口比较。下方展开的是变化最大的视口。<strong>视觉变化不等于缺陷</strong>，截图仅在本地比较，不上传。</p>',
        '</div>'
      ].join('');
    } else if (!v.hasBaseline) {
      visEl.innerHTML = '<div class="ver-card"><h3>视觉基线对比 <span class="sub">当前视口</span></h3>' +
        '<div class="visual-pair">' + imgFor(full && full.after, '本次截图（新基线）', false, v) +
        imgFor(null, '等待下次扫描', false, v) + '</div>' +
        '<p class="ver-hint">已保存本次截图为基线。下次扫描会生成像素变化率与变化区域框。</p></div>';
    } else {
      const ratio = (v.ratio || 0) * 100;
      visEl.innerHTML = [
        '<div class="ver-card">',
        '  <h3>视觉基线对比 <span class="sub">当前视口 · 本地生成</span></h3>',
        '  <div class="visual-pair">',
        imgFor(full && full.before, '基线 · ' + shortTime(v.baselineTime), false, v),
        imgFor(full && full.after, '本次 · ' + shortTime(v.currentTime), true, v),
        '  </div>',
        '  <div class="visual-meta">',
        '    <span class="visual-ratio">像素变化 <b>' + ratio.toFixed(1) + '%</b></span>',
        '    <span class="verdict ' + esc(v.verdict || 'none') + '">' + esc(VERDICT_LABEL[v.verdict] || '—') + '</span>',
        '    <span class="muted">变化区域 ' + ((v.boxes || []).length) + ' 处</span>',
        '  </div>',
        '  <div class="visual-actions"><button class="btn tiny" data-action="reset-baseline">把当前截图设为新基线</button></div>',
        '  <p class="ver-hint">红框为像素变化较明显的区域。<strong>视觉变化不等于缺陷</strong>：判定为「疑似布局回归」仅表示本次同时出现了新的响应式/视觉问题，请人工确认后再让 AI 改源码。截图仅在本地比较，不上传。</p>',
        '</div>'
      ].join('');
    }

    /* 3) 同域多页面扫描 */
    const s = state.siteScan || scan.siteScan;
    if (s && s.pages && s.pages.length) {
      const ok = s.pages.filter((p) => p.score != null);
      const avg = ok.length ? Math.round(ok.reduce((a, p) => a + p.score, 0) / ok.length) : '—';
      siteEl.innerHTML = [
        '<div class="ver-card">',
        '  <h3>全站统一扫描 <span class="sub">' + s.pages.length + ' 页 · 平均 ' + avg + ' 分</span></h3>',
        '  <table class="site-table"><thead><tr><th>页面</th><th>分数</th><th>问题</th></tr></thead><tbody>',
        s.pages.map((p) => {
          const cls = p.score == null ? 'bad' : p.score >= 80 ? 'good' : p.score >= 60 ? 'mid' : 'bad';
          return '<tr><td><b>' + esc(p.path) + '</b></td><td class="s ' + cls + '">' + (p.score == null ? '失败' : p.score) + '</td><td>' + (p.counts ? p.counts.total : '—') + '</td></tr>';
        }).join(''),
        '  </tbody></table>',
        '  <p class="ver-hint">本次统一检查包含已发现页面的 QA / SEO / GEO；扫描上限 ' + (s.maxPages || 20) + ' 页。未覆盖页面和渲染未验证项目不会算作通过。</p>',
        '</div>'
      ].join('');
    } else {
      siteEl.innerHTML = '<div class="ver-card"><h3>全站统一扫描</h3><p class="ver-hint">点击顶部「一键扫描全站」即可同时检查技术 QA、基础 SEO 和 GEO 内容线索。权限只针对当前站点申请。</p></div>';
    }
  }

  function renderHistory() {
    if (!state.history.length) {
      $('#history-list').innerHTML = '<div class="empty"><b>还没有历史记录</b>每次扫描的评分与缺陷摘要会保存在本机，方便对比版本之间的变化。</div>';
      return;
    }
    $('#history-list').innerHTML = state.history.map((h, i) => {
      const next = state.history.slice(i + 1).find((x) => x.url === h.url);
      let delta = '<span class="delta muted">—</span>';
      if (next) {
        const d = h.score - next.score;
        delta = '<span class="delta ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '') + d + '</span>';
      }
      return [
        '<div class="history-item" data-id="' + esc(h.id) + '">',
        '  <div class="history-score">' + h.score + '</div>',
        '  <div class="history-info"><b>' + esc(h.title || hostOf(h.url)) + '</b><span>' + esc(hostOf(h.url)) + ' · ' + new Date(h.time).toLocaleString('zh-CN') + '</span></div>',
        delta,
        '  <button class="btn-mini" data-action="view">查看</button>',
        '</div>'
      ].join('');
    }).join('');
  }

  function render() {
    renderHeader();
    renderScore();
    renderIssues();
    renderDevices();
    renderFixes();
    renderReport();
    renderVersions();
    renderHistory();
    renderUnifiedSummary();
    window.ShipCheckPageSpeedPanel?.setUrl(state.scan?.siteScan?.origin ? state.scan.siteScan.origin + '/' : (state.scan?.url||state.currentUrl));
    window.ShipCheckSearchPanel?.render(state.scan);
    window.ShipCheckTechnicalPanel?.setActiveScan(state.scan);
    window.ShipCheckStudio?.update(state.scan, state.currentUrl).catch(e=>console.warn('[ShipCheck] Studio update',e));
  }

  /* ---------------------------------------------------------------- *
   * 设置 / 存储
   * ---------------------------------------------------------------- */
  async function loadSettings() {
    if (!IS_EXT) { state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); return; }
    try {
      const res = await chrome.storage.local.get('shipcheck.settings');
      const s = res['shipcheck.settings'] || {};
      state.settings = {
        widths: Array.isArray(s.widths) && s.widths.length ? s.widths : DEFAULT_SETTINGS.widths.slice(),
        modules: Object.assign({}, DEFAULT_SETTINGS.modules, s.modules || {}),
        axe: s.axe !== false,
        baseline: s.baseline !== false,
        preciseShot: !!s.preciseShot,
        maxPages: [10, 20, 50, 100].includes(Number(s.maxPages)) ? Number(s.maxPages) : 20,
        autoLocalLighthouse: s.autoLocalLighthouse !== false
      };
    } catch (_) { /* 使用默认值 */ }
  }

  async function saveSettings() {
    if (!IS_EXT) return;
    try { await chrome.storage.local.set({ 'shipcheck.settings': state.settings }); } catch (_) { /* noop */ }
  }

  function syncSettingsUI() {
    $$('#settings [data-width]').forEach((el) => { el.checked = state.settings.widths.indexOf(Number(el.dataset.width)) !== -1; });
    $$('#settings [data-module]').forEach((el) => { el.checked = !!state.settings.modules[el.dataset.module]; });
    $('#opt-axe').checked = state.settings.axe !== false;
    $('#opt-auto-local-lighthouse').checked = state.settings.autoLocalLighthouse !== false;
    $('#opt-baseline').checked = state.settings.baseline !== false;
    const ps = $('#opt-precise-shot');
    if (ps) ps.checked = !!state.settings.preciseShot;
    $('#opt-max-pages').value = String(state.settings.maxPages || 20);
  }

  async function loadHistory() {
    if (!IS_EXT) { state.history = makeDemoHistory(); return; }
    try {
      const res = await chrome.storage.local.get('shipcheck.history');
      state.history = Array.isArray(res['shipcheck.history']) ? res['shipcheck.history'] : [];
    } catch (_) { state.history = []; }
  }

  async function saveHistory(result) {
    const entry = {
      id: 'scan-' + Date.now(),
      url: result.url, title: result.title || hostOf(result.url),
      time: result.time, score: result.score,
      counts: result.counts, result: {...result, siteAudit:result.siteAudit ? {...result.siteAudit, findings:(result.siteAudit.findings||[]).slice(0,40)} : null }
    };
    state.history.unshift(entry);
    state.history = state.history.slice(0, 12);
    if (!IS_EXT) return;
    try {
      await chrome.storage.local.set({ 'shipcheck.history': state.history });
      chrome.runtime.sendMessage({ type: 'SHIPCHECK_HISTORY_TRIM' }).catch(() => {});
    } catch (_) { /* noop */ }
  }

  /* ---------------------------------------------------------------- *
   * 扫描流程
   * ---------------------------------------------------------------- */
  function setProgress(percent, text) {
    $('#progress').classList.remove('hidden');
    $('#progress-fill').style.width = Math.max(2, Math.min(100, percent)) + '%';
    $('#progress-text').textContent = text;
  }
  function hideProgress() { $('#progress').classList.add('hidden'); }
  function setError(msg) {
    const el = $('#error-box');
    if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  /* ---- 站点访问权限：activeTab 失效时的兜底 ---- */

  function originOf(u) {
    try { const x = new URL(u); return x.origin === 'null' ? '' : x.origin; } catch (_) { return ''; }
  }

  // 未获站点权限时 executeScript 会抛这类错
  function isHostAccessError(e) {
    const m = String((e && e.message) || e || '');
    return /Cannot access contents of (the )?url|must request permission to access this host/i.test(m);
  }

  // 在用户点击的手势窗口内申请可选 host 权限（manifest 里已声明 optional_host_permissions）
  async function requestHostAccess(url) {
    const origin = originOf(url);
    if (!origin) return false;
    try {
      const has = await chrome.permissions.contains({ origins: [origin + '/*'] });
      if (has) return true;
    } catch (_) { /* 继续尝试申请 */ }
    try {
      return await chrome.permissions.request({ origins: [origin + '/*'] });
    } catch (e) {
      console.warn('[ShipCheck] 站点权限申请未完成：', e);
      return false;
    }
  }

  function hostAccessHint(url) {
    if (/^file:\/\//i.test(url)) {
      return '本地文件（file://）需要单独开启权限。\n\n' +
        '打开 chrome://extensions → 找到 ShipCheck AI → 详情 → 打开「允许访问文件网址」，然后刷新页面重试。';
    }
    const host = originOf(url) || '当前站点';
    return '没有获得读取 ' + host + ' 的权限，扫描已取消。\n\n' +
      '两个办法（任选其一）：\n' +
      '① 点击浏览器工具栏上的 ShipCheck 图标 —— 这会把当前标签页临时授权给扩展；\n' +
      '② 再点一次「一键扫描全站」，在弹窗里选「允许」—— 这是对该站点的长期授权，可随时在扩展详情页撤销。';
  }

  function describeScanError(e, url) {
    const msg = String((e && e.message) || e || '');
    if (/chrome:\/\/|edge:\/\/|about:blank|Cannot access a chrome-extension|Cannot access a chrome:\/\//i.test(msg)) {
      return '当前页面受浏览器保护（chrome://、扩展商店、扩展页面、about:blank 等），无法注入检测脚本。\n请切换到普通 http/https 网页后再扫描。';
    }
    if (isHostAccessError(msg)) return hostAccessHint(url);
    if (/No tab with id|The tab was closed|Invalid tab ID/i.test(msg)) {
      return '目标标签页已关闭或已跳转。请重新打开要检查的页面后再扫描。';
    }
    return '扫描失败：' + msg;
  }

  function pathOf(u) {
    try { const x = new URL(u); return (x.pathname || '/') + (x.search || ''); }
    catch (_) { return String(u).slice(0, 80); }
  }

  function pageRow(r, url) {
    return {
      path: pathOf(url), url, score: r.score, counts: r.counts,
      top: (r.findings || []).filter((f) => !f.verification).slice(0, 3).map((f) => f.title),
      findings: (r.findings || []).filter(f=>!f.verification).slice(0,100).map(f=>({
        title:f.title,severity:f.severity,module:f.module,detail:f.detail,selector:f.selector,
        evidence:(f.evidence||[]).slice(0,3),fixes:(f.fixes||[]).slice(0,3)
      }))
    };
  }

  async function injectAndScan(tabId, url) {
    let axeEnabled = false;
    if (state.settings.axe) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: false }, world: 'MAIN',
          files: ['src/vendor/axe.min.js', 'src/content/axe-bridge.js']
        });
        axeEnabled = true;
      } catch (e) {
        console.warn('[ShipCheck] axe-core 注入失败，回退本地规则:', e);
      }
    }
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: false }, world: 'ISOLATED',
      files: ['src/content/issue-explainer.js', 'src/content/search-audit.js', 'src/content/scanner.js']
    });
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'SHIPCHECK_SCAN',
      options: {
        widths: state.settings.widths,
        modules: state.settings.modules,
        axeEnabled: axeEnabled,
        timeout: 3500
      }
    });
    if (!response || !response.ok) throw new Error((response && response.error) || '扫描未返回结果');
    const result = response.result;
    result.url = url;
    result.demo = false;
    return result;
  }

  function waitForTab(tabId, timeout) {
    timeout = timeout || 12000;
    return new Promise((resolve) => {
      let done = false;
      let timer = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      };
      const onUpdated = (id, info) => {
        if (id === tabId && info.status === 'complete') setTimeout(finish, 350);
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      timer = setTimeout(finish, timeout);
      chrome.tabs.get(tabId)
        .then((t) => { if (t && t.status === 'complete') setTimeout(finish, 350); })
        .catch(finish);
    });
  }

  function scanLock(on) {
    state.scanning = on;
    $('#btn-scan').disabled = on;
    $('#btn-site-scan').disabled = on;
    $('#scan-label').textContent = on ? '正在扫描全站…' : '一键重新扫描全站';
    if (!on) setTimeout(hideProgress, 900);
  }

  // 完整扫描流程（注入 → 扫描 → 差异 → 视觉基线 → 落库 → 渲染）
  async function runScanPipeline(tab, url) {
    const result = await injectAndScan(tab.id, url);
    result.favicon = tab.favIconUrl || '';
    result.diff = computeDiff(result, previousScanFor(url));
    setProgress(90, '计算版本差异与视觉基线…');
    await runVisualBaseline(result);
    state.scan = result;
    await saveHistory(result);
    setProgress(100, '扫描完成');
    render();
    const delta = result.diff.hasPrevious
      ? '（较上版 ' + (result.diff.scoreDelta >= 0 ? '+' : '') + result.diff.scoreDelta + ' 分）'
      : '（基线已建立）';
    toast('扫描完成：' + result.counts.total + ' 个问题，' + result.score + '/100 ' + delta);
  }

  async function startScan() {
    if (state.scanning) return;
    if (!IS_EXT) { toast('演示模式：请在 Chrome 中加载扩展后执行真实扫描'); return; }
    // A quick single-page check must not be presented as a fresh site-wide result.
    state.siteScan=null;
    window.ShipCheckTechnicalPanel?.resetAudit?.();
    setError('');
    let tab;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs && tabs[0];
    } catch (e) {
      setError('无法读取活动标签页：' + e.message);
      return;
    }
    if (!tab || !tab.id) { setError('未找到活动标签页。'); return; }
    const url = tab.url || '';
    if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
      setError('当前页面（chrome://、扩展商店、about:blank 等）受浏览器保护，无法注入检测脚本。请切换到普通 http/https 网页后重试。');
      return;
    }
    state.currentUrl = url;

    scanLock(true);
    setProgress(4, '准备检测引擎…');
    try {
      try {
        await runScanPipeline(tab, url);
      } catch (e) {
        if (!isHostAccessError(e)) throw e;
        // activeTab 未覆盖该站点：就地申请可选权限。此刻仍在点击的手势窗口内，能正常弹窗。
        setProgress(12, '当前页面尚未授权，正在申请访问权限…');
        const granted = await requestHostAccess(url);
        if (!granted) { setError(hostAccessHint(url)); return; }
        setProgress(22, '已授权，重新开始扫描…');
        await runScanPipeline(tab, url);
      }
    } catch (e) {
      setError(describeScanError(e, url));
    } finally {
      scanLock(false);
    }
  }

  async function startSiteScan() {
    if (state.scanning) return;
    if (!IS_EXT) { toast('演示模式：请在 Chrome 中加载扩展后执行真实批量扫描'); return; }
    setError('');
    const baseUrl = state.currentUrl;
    if (!/^https?:\/\//i.test(baseUrl)) { setError('批量扫描需要先打开一个 http/https 页面。'); return; }
    let origin;
    try { origin = new URL(baseUrl).origin; } catch (_) { setError('当前 URL 无法解析。'); return; }

    // 必须在用户手势链内申请可选权限（函数内第一个 await）。
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [origin + '/*'] }); }
    catch (e) { setError('站点权限申请失败：' + (e && e.message ? e.message : String(e))); return; }
    if (!granted) { toast('未授予站点读取权限，已取消批量扫描'); return; }

    scanLock(true);
    setProgress(5, '读取同域页面链接…');
    const maxPages = state.settings.maxPages || 5;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab) throw new Error('未找到活动标签页');
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false }, world: 'ISOLATED',
        func: (originArg, limit) => {
          const seen = new Set();
          const out = [];
          const base = location.href.split('#')[0];
          const anchors = document.querySelectorAll('a[href]');
          for (let i = 0; i < anchors.length; i++) {
            const a = anchors[i];
            let u;
            try { u = new URL(a.href, location.href); } catch (_) { continue; }
            if (u.origin !== originArg || !/^https?:$/.test(u.protocol)) continue;
            u.hash = '';
            if (u.href === base || seen.has(u.href)) continue;
            if (/\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|mp3|docx?|xlsx?|csv|ico)$/i.test(u.pathname)) continue;
            seen.add(u.href);
            out.push(u.href);
            if (out.length >= limit) break;
          }
          return out;
        },
        args: [origin, maxPages + 4]
      });
      const links = (injected && injected[0] && injected[0].result) || [];
      const targets = links.slice(0, Math.max(0, maxPages - 1));
      const pages = [];

      setProgress(10, '扫描当前页…');
      const current = await injectAndScan(tab.id, tab.url);
      pages.push(pageRow(current, tab.url));

      for (let i = 0; i < targets.length; i++) {
        setProgress(10 + Math.round(70 * (i + 1) / (targets.length + 1)), '扫描页面 ' + (i + 2) + '/' + (targets.length + 1) + '…');
        let t = null;
        try {
          t = await chrome.tabs.create({ url: targets[i], active: false });
          await waitForTab(t.id);
          const r = await injectAndScan(t.id, targets[i]);
          pages.push(pageRow(r, targets[i]));
        } catch (e) {
          pages.push({ path: pathOf(targets[i]), url: targets[i], score: null, counts: null, error: String(e && e.message ? e.message : e) });
        } finally {
          if (t && t.id != null) { try { await chrome.tabs.remove(t.id); } catch (_) { /* noop */ } }
        }
      }

      const site = { origin: origin, pages: pages, maxPages: maxPages, time: new Date().toISOString() };
      state.siteScan = site;
      current.siteScan = site;
      current.diff = computeDiff(current, previousScanFor(tab.url));
      setProgress(94, '计算版本差异与视觉基线…');
      await runVisualBaseline(current);
      state.scan = current;
      await saveHistory(current);
      setProgress(100, '批量扫描完成');
      render();
      $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'versions'));
      $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-versions'));
      toast('已扫描 ' + pages.length + ' 个同域页面');
    } catch (e) {
      setError('批量扫描失败：' + (e && e.message ? e.message : String(e)) + '。可先单独扫描当前页确认扩展工作正常。');
    } finally {
      scanLock(false);
    }
  }

  if (IS_EXT && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'SHIPCHECK_PROGRESS' && state.scanning) {
        setProgress(msg.percent, msg.stage);
      }
    });
  }

  /* ---------------------------------------------------------------- *
   * Unified site scan: one permission, one bounded crawl, all QA modules
   * ---------------------------------------------------------------- */
  async function renderedForTab(tabId) {
    const result = await chrome.scripting.executeScript({
      target: {tabId, allFrames:false},
      func: () => {
        const node=document.querySelector('main,[role="main"],article')||document.body;
        const txt=String(node?.innerText||'').replace(/\s+/g,' ').trim();
        return {url:location.href,textLength:txt.length,textSample:txt.slice(0,5000)};
      }
    });
    return result?.[0]?.result || null;
  }

  function renderUnifiedSummary() {
    const root=$('#unified-summary');
    if(!root)return;
    const batch=state.siteScan || state.scan?.siteScan;
    if(!batch?.pages?.length){
      root.innerHTML='<div class="unified-brief">一次点击 = 全站页面发现 + QA + SEO / GEO + 响应式检查。大型网站按设置的页面上限执行，未扫部分明确显示。</div>';
      return;
    }
    const qaOk=batch.pages.filter(p=>p.score!=null);
    const qaErrors=batch.pages.filter(p=>p.score==null).length;
    const issues=qaOk.reduce((n,p)=>n+(p.counts?.total||0),0);
    const audit=window.ShipCheckTechnicalPanel?.getAudit() || state.scan?.siteAudit;
    const found=audit?.findings?.length||0;
    const notCovered=(audit?.coverage?.uncrawledLinks?.length||0)+(audit?.coverage?.unverifiedSitemapUrls?.length||0);
    root.innerHTML=`<div class="unified-title"><strong>本次全站扫描</strong><span>${esc(batch.status||'已完成有界扫描')} · 上限 ${batch.maxPages||20} 页</span></div>
      <div class="unified-grid">
        <button data-open-tab="versions"><b>${qaOk.length}/${batch.pages.length}</b><small>完成网页 QA</small></button>
        <button data-open-tab="issues"><b>${issues}</b><small>页面 QA 问题</small></button>
        <button data-open-tab="search"><b>${found}</b><small>站点 SEO / GEO 发现</small></button>
        <button data-open-tab="search"><b>${notCovered}</b><small>尚未覆盖的链接线索</small></button>
      </div><div class="unified-foot">${qaErrors?'有 '+qaErrors+' 页 QA 未能验证；':''} 索引与 AI 引用必须通过真实平台数据确认。<button data-open-tab="search">查看证据 →</button></div>`;
  }

  function initTabScrolling(){
    const tabs=$('#tabs'),left=$('#tab-prev'),right=$('#tab-next');
    if(!tabs||!left||!right)return;
    function sync(){const max=tabs.scrollWidth-tabs.clientWidth;left.disabled=tabs.scrollLeft<3;right.disabled=tabs.scrollLeft>=max-3;}
    left.addEventListener('click',()=>tabs.scrollBy({left:-Math.max(140,tabs.clientWidth*.68),behavior:'smooth'}));
    right.addEventListener('click',()=>tabs.scrollBy({left:Math.max(140,tabs.clientWidth*.68),behavior:'smooth'}));
    tabs.addEventListener('scroll',sync,{passive:true});
    window.addEventListener('resize',sync);
    tabs.addEventListener('wheel',e=>{if(tabs.scrollWidth>tabs.clientWidth+2&&Math.abs(e.deltaY)>Math.abs(e.deltaX)){
      const max=tabs.scrollWidth-tabs.clientWidth,delta=e.deltaY;
      if((delta<0&&tabs.scrollLeft>0)||(delta>0&&tabs.scrollLeft<max)){
        tabs.scrollLeft+=delta;e.preventDefault();
      }
    }},{passive:false});
    let drag=null,suppressClick=false;
    tabs.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;drag={x:e.clientX,left:tabs.scrollLeft,moved:false};});
    window.addEventListener('pointermove',e=>{if(!drag)return;const offset=e.clientX-drag.x;if(Math.abs(offset)>6){drag.moved=true;tabs.scrollLeft=drag.left-offset;}});
    window.addEventListener('pointerup',()=>{if(drag?.moved){suppressClick=true;setTimeout(()=>suppressClick=false,100);}drag=null;});
    tabs.addEventListener('click',e=>{if(suppressClick){e.stopImmediatePropagation();e.preventDefault();suppressClick=false;}},true);
    requestAnimationFrame(sync);
  }

  async function startUnifiedScan(){
    if(state.scanning)return;
    if(!IS_EXT){toast('演示模式：请加载 Chrome 扩展后执行全站扫描');return;}
    setError('');
    // Use the known current-tab URL so the permission request starts synchronously in
    // the user's click handler. Awaiting tabs.query first can lose user activation.
    const url=state.currentUrl;
    if(!/^https?:\/\//i.test(url||'')){
      setError('一键全站扫描仅支持普通 HTTP(S) 站点，请在目标站点打开后再运行。');return;
    }
    const origin=new URL(url).origin;
    const permission=chrome.permissions.request({origins:[origin+'/*']});
    scanLock(true);state.siteScan=null;
    setProgress(4,'正在申请当前站点读取权限…');
    try{
      if(!await permission)throw new Error('没有获得当前站点的读取权限，已停止全站扫描');
      const tab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
      if(!tab?.id || new URL(tab.url).origin!==origin)throw new Error('扫描开始时当前站点已切换，请回到原页面重新运行');
      const cap=state.settings.maxPages||20;
      setProgress(10,'正在读取 robots.txt、Sitemap、内部链接与源 HTML…');
      const lab=window.ShipCheckTechnicalPanel;
      if(!lab?.runSiteAudit)throw new Error('SEO/GEO 引擎未加载，请重新安装完整插件');
      // Supplement source-HTML discovery with currently rendered navigation, useful for CSR sites.
      // Read-only: anchors only; no clicking, no form submissions, no cookie export.
      let renderedSeeds=[];
      try {
        const found=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:false},func:()=>
          Array.from(document.querySelectorAll('a[href]')).slice(0,350).map(a=>a.href).filter(Boolean)});
        renderedSeeds=(found?.[0]?.result||[]).filter(x=>ShipCheckTechnical.sameOrigin(x,url)).slice(0,150);
      }catch(e){console.info('[ShipCheck] 当前页链接种子不可用，将使用 Sitemap 与服务器链接',e);}
      const audit=await lab.runSiteAudit({url,maxPages:cap,seedUrls:renderedSeeds,onProgress:x=>{
        setProgress(10+Math.round(23*x.count/Math.max(1,x.max)),`发现页面 ${x.count}/${x.max} · ${pathOf(x.url)}`);
      }});
      const targets=audit.pages.filter(p=>p.status>=200&&p.status<300&&/html/i.test(p.contentType||'text/html'));
      const currentUrl=ShipCheckTechnical.canonicalUrl(tab.url,tab.url);
      const ordered=[...targets.filter(p=>p.url===currentUrl),...targets.filter(p=>p.url!==currentUrl)];
      const pages=[];let current=null;
      for(let i=0;i<ordered.length;i++){
        const page=ordered[i];let temp=null;
        setProgress(34+Math.round(57*(i+1)/Math.max(1,ordered.length)),`逐页 QA + SEO/GEO ${i+1}/${ordered.length}：${pathOf(page.url)}`);
        try{
          const isCurrent=page.url===currentUrl;
          const targetId=isCurrent?tab.id:(temp=await chrome.tabs.create({url:page.url,active:false})).id;
          if(!isCurrent)await waitForTab(targetId,18000);
          const r=await injectAndScan(targetId,page.url);
          const row=pageRow(r,page.url);pages.push(row);
          if(isCurrent)current=r;
          try{page.renderCompare=ShipCheckTechnical.compareRendering(page,await renderedForTab(targetId));}
          catch(e){page.renderCompare={status:'unverified',reason:'无法核实浏览器渲染：'+String(e.message||e)};}
        }catch(e){
          pages.push({path:pathOf(page.url),url:page.url,score:null,counts:null,error:String(e.message||e)});
          page.renderCompare={status:'unverified',reason:'网页 QA / 渲染检查无法执行'};
        }finally{if(temp?.id)try{await chrome.tabs.remove(temp.id);}catch{}}
      }
      // Non-200 pages are intentionally reported as unverified QA instead of disappearing.
      for(const p of audit.pages.filter(p=>!targets.includes(p))){
        pages.push({path:pathOf(p.url),url:p.url,score:null,counts:null,error:p.error||`HTTP ${p.status}`});
      }
      if(current){
        audit.findings=[];
        Object.assign(audit,ShipCheckTechnical.analyzeCrawl(audit));
        audit.contentReview=ShipCheckTechnical.contentReview(audit);
        lab.publishAudit(audit);
        const failed=pages.filter(p=>p.score==null).length;
        const site={origin,pages,maxPages:cap,time:new Date().toISOString(),status:failed?'部分检查未验证':'已完成',stats:{qaVerified:pages.length-failed,qaFailed:failed,technicalIssues:audit.findings.length}};
        state.siteScan=site;
        current.siteScan=site;
        current.siteAudit={start:audit.start,stats:audit.stats,findings:audit.findings,coverage:audit.coverage};
        current.diff=computeDiff(current,previousScanFor(tab.url));
        setProgress(94,'正在生成统一验收摘要与版本基线…');
        await runVisualBaseline(current);
        state.scan=current;
        await saveHistory(current);
        setProgress(100,`扫描完成：${pages.length} 个页面，${audit.findings.length} 条站点搜索发现`);
        render();
        toast(`已完成 ${pages.length} 页 · QA、SEO、GEO 结果已归并`);
        if (state.settings.autoLocalLighthouse) {
          setProgress(100,'QA / SEO / GEO 已完成；如果本地 Lighthouse 已连接，将继续抽样测速…');
          void window.ShipCheckPageSpeedPanel?.runForScan(pages.filter(p=>p.score!=null).map(p=>p.url));
        }
      }else{
        // Do not present a green score when even the current tab could not be inspected.
        throw new Error('已获取源 HTML，但当前页真实 QA 无法执行。请刷新网页并重新授权；SEO/GEO 源码检查仍可在 Search Lab 查看。');
      }
    }catch(e){setError('统一扫描未完成：'+String(e.message||e));}
    finally{scanLock(false);}
  }

  /* ---------------------------------------------------------------- *
   * 标注截图
   * ---------------------------------------------------------------- */
  function openModal(title) {
    $('#modal-title').textContent = title;
    $('#modal').classList.remove('hidden');
  }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modal-body').innerHTML = ''; }

  function placeholderShot(text) {
    return '<div class="shot-placeholder">' + esc(text) + '<div class="mock">问题元素标注框（示意）</div>安装扩展并在真实页面上扫描后，这里会显示带红框标注的页面截图。</div>';
  }

  async function openShot(f) {
    openModal('问题证据截图 · ' + f.title);
    const body = $('#modal-body');
    if (!IS_EXT) {
      body.innerHTML = placeholderShot('演示模式：不抓取真实页面截图。');
      return;
    }
    body.innerHTML = '<div class="shot-placeholder">正在捕获当前标签页截图…</div>';
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        if (f.rect) {
          const dpr = (state.scan && state.scan.dpr) || 1;
          const x = f.rect.x * dpr, y = f.rect.y * dpr;
          const w = Math.max(2, f.rect.width * dpr), h = Math.max(2, f.rect.height * dpr);
          ctx.save();
          ctx.strokeStyle = '#e11d48';
          ctx.lineWidth = Math.max(2, 3 * dpr);
          ctx.setLineDash([9 * dpr, 6 * dpr]);
          ctx.fillStyle = 'rgba(225,29,72,.13)';
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
          const label = SEV_LABEL[f.severity] + ' · ' + f.title;
          ctx.font = 'bold ' + Math.round(12 * dpr) + 'px sans-serif';
          const tw = ctx.measureText(label).width + 14 * dpr;
          const ly = Math.max(0, y - 22 * dpr);
          ctx.fillStyle = '#e11d48';
          ctx.fillRect(x, ly, tw, 20 * dpr);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, x + 7 * dpr, ly + 14 * dpr);
          ctx.restore();
        }
        body.innerHTML = '<img alt="带标注的页面截图" src="' + canvas.toDataURL('image/png') + '">' +
          '<p class="muted" style="margin:8px 0 0">' + (f.rect ? '红框为问题元素在当前视口中的位置；截图仅在本地生成。' : '该问题没有可用的 DOM 坐标，截图为当前页面原图。') + '</p>';
      };
      img.onerror = () => { body.innerHTML = placeholderShot('截图解码失败。'); };
      img.src = dataUrl;
    } catch (e) {
      body.innerHTML = placeholderShot('无法捕获截图：' + (e && e.message ? e.message : String(e)) + '。请确认已通过工具栏图标打开侧边栏并停留在目标标签页。');
    }
  }

  /* ---------------------------------------------------------------- *
   * 事件绑定
   * ---------------------------------------------------------------- */
  function bind() {
    $('#btn-scan').addEventListener('click', startUnifiedScan);
    window.addEventListener('shipcheck:pagespeed',async e=>{
      const payload=e.detail;if(!state.scan?.url||!payload?.url)return;
      try{if(new URL(payload.url).origin!==new URL(state.scan.url).origin)return;}catch(e){return;}
      state.scan.pageSpeed={url:payload.url,source:payload.source||'legacy',results:payload.results,pages:payload.pages||[],coverage:payload.coverage||null,updatedAt:new Date().toISOString()};
      const item=state.history.find(h=>h.url===state.scan.url&&h.time===state.scan.time);
      if(item){item.result.pageSpeed=state.scan.pageSpeed;if(IS_EXT)try{await chrome.storage.local.set({'shipcheck.history':state.history});}catch(e){console.warn(e);}}
      renderReport();
      toast('本地 Lighthouse 结果已合并到本次扫描报告');
    });
    $('#btn-site-scan').addEventListener('click', startScan);
    $('#btn-open-inspector').addEventListener('click',()=>{const btn=document.querySelector('[data-studio="open-inspector"]'); if(btn)btn.click();else toast('请先扫描目标网页');});

    initTabScrolling();
    $('#unified-summary').addEventListener('click', e=>{const open=e.target.closest('[data-open-tab]');if(open)$('#tabs [data-tab="'+open.dataset.openTab+'"]').click();});
    $('#tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      state.tab = btn.dataset.tab;
      $$('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
      $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + state.tab));
      btn.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});
    });

    $('#filters').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      state.filter = btn.dataset.filter;
      renderIssues();
    });

    $('#issue-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const card = btn.closest('.issue');
      const f = scored(state.scan).find((x) => x.id === (card && card.dataset.id));
      if (!f) return;
      const action = btn.dataset.action;
      if (action === 'toggle') {
        const full = card.querySelector('.issue-full');
        const open = full.classList.toggle('hidden') === false;
        btn.textContent = open ? '收起证据与修复方案 ▴' : '展开证据与修复方案 ▾';
      } else if (action === 'copy') {
        toast((await copyText(buildFixPrompt(f, state.scan))) ? '已复制修复指令，可粘贴到 AI 编程工具' : '复制失败，请手动选择文本');
      } else if (action === 'shot') {
        openShot(f);
      } else if (action === 'locate') {
        try {
          const tabs=await chrome.tabs.query({active:true,currentWindow:true});
          const tab=tabs[0];
          if(!tab||!state.scan||urlKey(tab.url)!==urlKey(state.scan.url)) {toast('请先切换回这次扫描的目标网页');return;}
          await chrome.tabs.sendMessage(tab.id,{type:'SHIPCHECK_REVEAL',selector:f.selector,title:f.title,severity:f.severity});
          toast('已在目标网页标记问题元素');
        }catch(err){toast('无法定位：请重新扫描当前网页');}
      }
    });

    $('#fix-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="copy-one"]');
      if (!btn) return;
      const item = btn.closest('.fix-item');
      const f = scored(state.scan).find((x) => x.id === (item && item.dataset.id));
      if (f) toast((await copyText(buildFixPrompt(f, state.scan))) ? '已复制该条修复指令' : '复制失败');
    });

    $('#btn-copy-all').addEventListener('click', async () => {
      if (!state.scan) { toast('请先完成一次扫描'); return; }
      toast((await copyText(allFixPrompts(state.scan))) ? '已复制全部修复指令（' + scored(state.scan).length + ' 条任务）' : '复制失败');
    });

    $('#btn-export-md').addEventListener('click', () => {
      if (!state.scan) { toast('请先完成一次扫描'); return; }
      download('shipcheck-report-' + stamp() + '.md', buildMarkdownReport(state.scan), 'text/markdown;charset=utf-8');
      toast('已导出 Markdown 交付报告');
    });
    $('#btn-export-json').addEventListener('click', () => {
      if (!state.scan) { toast('请先完成一次扫描'); return; }
      download('shipcheck-scan-' + stamp() + '.json', JSON.stringify(state.scan, null, 2), 'application/json;charset=utf-8');
      toast('已导出 JSON 原始数据');
    });
    $('#btn-export-agent').addEventListener('click', () => {
      if (!state.scan) { toast('请先完成一次扫描'); return; }
      const bundle = buildAgentBundle(state.scan);
      bundle.siteQA = (state.scan.siteScan?.pages||[]).map(p=>({url:p.url,verified:p.score!=null,findings:p.findings||[],error:p.error||null}));
      bundle.siteSearch = state.scan.siteAudit?.findings||[];
      download('shipcheck-agent-tasks-' + stamp() + '.json', JSON.stringify(bundle, null, 2), 'application/json;charset=utf-8');
      toast('已导出 Agent 任务包（' + bundle.tools.length + ' 个 shipcheck.apply_fix 任务）');
    });
    $('#btn-copy-pr').addEventListener('click', async () => {
      if (!state.scan) { toast('请先完成一次扫描'); return; }
      const ok = await copyText(buildPrComment(state.scan));
      toast(ok ? '已复制 PR 评论 Markdown，可直接粘到 Pull Request' : '复制失败，请手动选中报告内容');
    });
    $('#btn-copy-ci').addEventListener('click', async () => {
      if (!state.scan) { toast('请先完成一次扫描'); return; }
      const ok = await copyText(buildCiSnippet(state.scan));
      toast(ok ? '已复制 CI 步骤片段（GitHub Actions）' : '复制失败，请检查剪贴板权限');
    });

    $('#visual-diff').addEventListener('click', (e) => {
      if (e.target.closest('[data-action="reset-baseline"]')) resetBaseline();
    });

    $('#history-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="view"]');
      if (!btn) return;
      const item = btn.closest('.history-item');
      const h = state.history.find((x) => x.id === (item && item.dataset.id));
      if (!h || !h.result) { toast('该记录未保存完整缺陷详情，请重新扫描'); return; }
      state.scan = h.result;
      state.filter = 'all';
      render();
      $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'issues'));
      $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-issues'));
      toast('已载入历史扫描：' + h.score + '/100');
    });

    $('#btn-clear-history').addEventListener('click', async () => {
      state.history = [];
      if (IS_EXT) { try { await chrome.storage.local.remove('shipcheck.history'); } catch (_) { /* noop */ } }
      renderHistory();
      toast('已清空本机历史记录');
    });

    $('#btn-settings').addEventListener('click', () => { syncSettingsUI(); $('#settings').classList.remove('hidden'); });
    $('#btn-close-settings').addEventListener('click', () => $('#settings').classList.add('hidden'));
    $('#btn-close-modal').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

    $('#settings').addEventListener('change', async (e) => {
      const t = e.target;
      if (t.dataset.width) {
        const w = Number(t.dataset.width);
        const set = new Set(state.settings.widths);
        if (t.checked) set.add(w); else set.delete(w);
        state.settings.widths = Array.from(set).sort((a, b) => a - b);
        if (!state.settings.widths.length) { t.checked = true; state.settings.widths = [w]; toast('至少保留一个视口'); }
      } else if (t.dataset.module) {
        state.settings.modules[t.dataset.module] = t.checked;
      } else if (t.id === 'opt-auto-local-lighthouse') {
        state.settings.autoLocalLighthouse = t.checked;
      } else if (t.id === 'opt-axe') {
        state.settings.axe = t.checked;
      } else if (t.id === 'opt-baseline') {
        state.settings.baseline = t.checked;
      } else if (t.id === 'opt-precise-shot') {
        if (t.checked) {
          // 必须在用户手势内申请；被拒绝时回退到单视口截图。
          let granted = false;
          try {
            granted = await chrome.permissions.request({ permissions: ['debugger'] });
          } catch (e) {
            granted = false;
          }
          if (!granted) {
            t.checked = false;
            state.settings.preciseShot = false;
            toast('未获得 debugger 权限，继续使用当前视口截图基线');
            await saveSettings();
            syncSettingsUI();
            return;
          }
          state.settings.preciseShot = true;
          toast('已启用多视口精确截图：浏览器顶部会显示调试提示条');
        } else {
          state.settings.preciseShot = false;
          try { await chrome.permissions.remove({ permissions: ['debugger'] }); } catch (_) { /* 忽略 */ }
        }
      } else if (t.id === 'opt-max-pages') {
        state.settings.maxPages = Number(t.value) || 20;
      }
      await saveSettings();
      syncSettingsUI();
    });

    $('#btn-reset-baseline').addEventListener('click', resetBaseline);

    $('#btn-reset-settings').addEventListener('click', async () => {
      state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      await saveSettings();
      syncSettingsUI();
      toast('已恢复默认设置');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeModal(); $('#settings').classList.add('hidden'); }
    });
  }

  /* ---------------------------------------------------------------- *
   * 启动
   * ---------------------------------------------------------------- */
  (async function init() {
    await loadSettings();
    await loadHistory();
    syncSettingsUI();
    bind();
    if (!IS_EXT) {
      state.scan = makeDemoScan();
      state.visual = state.scan.visual;
      state.siteScan = {
        origin: 'https://demo.example.com',
        maxPages: 5,
        time: new Date().toISOString(),
        pages: [
          { path: '/premium-furniture', url: 'https://demo.example.com/premium-furniture', score: 68, counts: { total: 12 } },
          { path: '/products', url: 'https://demo.example.com/products', score: 74, counts: { total: 8 } },
          { path: '/about', url: 'https://demo.example.com/about', score: 91, counts: { total: 3 } },
          { path: '/contact', url: 'https://demo.example.com/contact', score: 57, counts: { total: 15 } }
        ]
      };
      state.scan.siteScan = state.siteScan;
      $('#scan-label').textContent = '一键扫描全站（演示）';
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      if (tabs && tabs[0]) state.currentUrl = tabs[0].url || '';
      const refreshTab = async () => {
        const t = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
        state.currentUrl = (t && t[0] && t[0].url) || '';
        if (!state.scan) renderHeader();
      };
      chrome.tabs.onActivated.addListener(refreshTab);
      chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url) refreshTab(); });
    }
    render();
  })();
})();
