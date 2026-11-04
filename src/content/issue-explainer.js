/* Human-readable issue explanations. Pure helper; no network or storage access. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ShipCheckIssueExplain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const rules = {
    region: {
      title:'有页面内容没有放进语义地标区域（Landmark）',
      reason:'正文或可见内容处于 main、header、nav、footer、aside 等地标之外。使用屏幕阅读器的访客可能无法按页面区域快速定位它。此项属于 axe 最佳实践检查，并不自动代表违反 WCAG AA。',
      fix:'把真正的主体内容包进一个 <main>；全站导航放在 <nav>、顶部放 <header>、页脚放 <footer>。不要为了消除提醒给每个 div 随意添加 role="region"。',
      tag:'语义结构 / Landmarks'
    },
    'landmark-one-main': {title:'页面缺少主内容区域（main）',reason:'当前页面没有唯一明确的主内容地标，辅助技术用户无法直接跳到页面正文。',fix:'给正文增加一个 <main> 元素；同一页面通常只应有一个主要的 main 地标。',tag:'语义结构 / main'},
    'color-contrast': {title:'文字与背景对比度不足',reason:'部分文字颜色和背景颜色太接近，可能难以阅读。',fix:'调整文字或背景颜色，并用实际文字大小复测对比度；不要仅靠颜色传递信息。',tag:'可读性 / 对比度'},
    'aria-valid-attr': {title:'使用了无效 ARIA 属性',reason:'元素声明了不受支持的 aria-* 属性，辅助技术可能忽略。',fix:'检查该元素的角色和属性名称，改用语义 HTML 或受支持的 ARIA 属性。',tag:'语义属性 / ARIA'},
    'aria-allowed-attr': {title:'ARIA 属性不适用于当前元素',reason:'ARIA 属性与元素的角色不匹配，可能造成错误的无障碍语义。',fix:'优先修正原生 HTML 元素，再补充该角色允许使用的 ARIA 属性。',tag:'语义属性 / ARIA'},
    'aria-hidden-focus': {title:'隐藏区域内仍有可聚焦控件',reason:'元素标记了 aria-hidden="true"，但其内部仍含可键盘聚焦的控件。',fix:'移除隐藏区域的聚焦能力，或不要把可操作控件放在 aria-hidden 区域内。',tag:'键盘操作 / aria-hidden'},
    'link-name': {title:'链接缺少可读名称',reason:'部分链接无法让屏幕阅读器用户判断链接目的。',fix:'补充可见链接文字或准确的 aria-label；图标链接同样需要可读名称。',tag:'链接 / 名称'},
    'button-name': {title:'按钮缺少可读名称',reason:'图标或空按钮没有辅助技术可读取的名称。',fix:'给按钮添加可见文字或 aria-label，并与实际操作保持一致。',tag:'按钮 / 名称'},
    'image-alt': {title:'图片缺少适当替代文本',reason:'图片缺少 alt，无法传达其内容或作用。',fix:'信息性图片提供准确 alt；纯装饰图片使用 alt=""。',tag:'图片 / alt'},
    label: {title:'表单控件缺少标签',reason:'输入框没有明确的可访问名称，用户可能无法知道需要填写什么。',fix:'使用 <label for="..."> 关联控件，或根据实际结构添加准确的 aria-label。',tag:'表单 / 标签'},
    'heading-order': {title:'标题层级跳跃',reason:'标题层级出现不合理跳跃，可能影响内容导航。',fix:'按内容结构组织 h1–h6，不要仅为了字体样式选择标题级别。',tag:'结构 / 标题'},
    'landmark-unique': {title:'多个同类地标缺少不同名称',reason:'存在相同角色且名称相同的页面地标，使用户难以区分。',fix:'给重复导航或区域设置不同且准确的 aria-label 或 aria-labelledby。',tag:'语义结构 / Landmarks'},
    'nested-interactive': {title:'交互控件被错误嵌套',reason:'链接、按钮等交互元素互相嵌套，可能导致焦点和激活行为不确定。',fix:'拆分嵌套的交互元素，保持每个操作拥有独立的点击与键盘焦点目标。',tag:'交互 / 嵌套'}
  };
  const clip = (v,n=170)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n);
  const strip = html=>clip(String(html||'').replace(/<[^>]+>/g,' '),120);
  function explain(violation) {
    const id=String(violation?.id||'unknown');
    const info=rules[id];
    const nodes=Array.isArray(violation?.nodes)?violation.nodes:[];
    const first=nodes[0]||{};
    const selector=Array.isArray(first.target)?first.target.join(' '):String(first.target||'');
    const element=strip(first.html)||selector||'未提供元素片段';
    const fallback=clip(violation?.help||id,110);
    const reason=info?.reason||('axe-core 发现：'+fallback+'。请核对下方具体元素和失败原因。');
    const fix=info?.fix||('修正标出的元素，并参阅对应 axe 规则说明：'+clip(violation?.helpUrl,190));
    return {
      title:info?.title||'无障碍问题：'+fallback,
      tag:info?.tag||'无障碍 / '+id,
      reason, solution:fix, selector, elementPreview:element,
      affectedCount:Math.max(1, Number(violation?.nodeCount)||nodes.length),
      summary:'位置：'+clip(selector||element,90)+' · 原因：'+clip(reason,155),
      evidence:[
        '受影响的元素：'+clip(selector||'未识别',190),
        '元素内容：'+clip(first.html||element,190),
        '失败细节：'+clip(first.summary||'请核对页面 DOM 与地标语义',220),
        '规则：axe-core '+id+'（'+clip(violation?.impact||'unknown',35)+'；'+(id==='region'?'最佳实践':'详见规则依据')+'）'
      ]
    };
  }
  return {explain,rules};
});
