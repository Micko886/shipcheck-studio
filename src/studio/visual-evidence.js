/* Local-only screenshot evidence resolver.
 * A scan stores screenshot METADATA in scan.visual but JPEG bytes in
 * chrome.storage.local['shipcheck.baselines']. This module joins them.
 */
(() => {
  'use strict';
  function urlKey(u) {
    try { const x = new URL(u); return x.origin + x.pathname; }
    catch (_) { return String(u || ''); }
  }
  function resolve(scan, baselines, view = 'current') {
    const meta = scan && scan.visual;
    const empty = (label, reason) => ({src:'', width:0, label, mode:'none', reason});
    if (!scan || !scan.url) return empty('未选择页面', '请先在插件中扫描一个网站。');
    if (!meta || meta.available !== true) {
      const why = (meta && meta.reason) || '本次扫描未保存截图。请在插件设置中开启「扫描时保存截图基线」，然后重新扫描。';
      return empty('未取得当前扫描截图', why);
    }
    const entry = (baselines || {})[urlKey(scan.url)];
    if (!entry || (!entry.thumb && !Object.values(entry.thumbs || {}).some(Boolean))) {
      return empty('没有本地截图数据', '本次扫描有截图状态，但本地基线存储没有对应图片。请返回网页重新扫描；如果仍失败，检查扩展错误日志。');
    }
    const scanTime = meta.currentTime || scan.time;
    if (scanTime && entry.time && entry.time !== scanTime) {
      return empty('截图与扫描版本不一致', '已有更新的截图覆盖了当前页面的基线。请在插件中重新扫描，并在工作台点击「读取最新扫描」。');
    }
    const shots = entry.thumbs || {};
    if (view !== 'current') {
      const src = meta.mode === 'multi' ? shots[view] : null;
      if (!src) return empty(view + ' 未采集截图', '该视口尚无真实截图。需要在插件设置里开启「多视口精确截图」并授权 debugger，然后重新扫描。');
      return {src, width:Number.parseInt(view,10)||0, label:view+' 精确视口截图（本地缩略图）', mode:'multi', reason:''};
    }
    if (meta.mode === 'multi') {
      // Only exact-width shots exist in multi mode. Do not mislabel the first
      // captured 390px image as the browser's current viewport.
      const label = (meta.shots || []).map(x=>x.label).find(x=>shots[x]) || Object.keys(shots).find(x=>/^\d+px$/.test(x)&&shots[x]);
      if (!label) return empty('多视口截图缺失', '没有找到本次扫描的精确视口图片，请重新扫描。');
      return {src:shots[label],width:Number.parseInt(label,10)||0,label:label+' 精确视口截图（本地缩略图）',mode:'multi',reason:''};
    }
    const src = shots['当前视口'] || entry.thumb || '';
    if (!src) return empty('当前视口截图缺失','请重新扫描目标网页以保存当前视口截图。');
    // Old baseline records lack viewportWidth. In this case, show the image
    // but do not position issue markers at an unverified scale.
    const width = Number(entry.viewportWidth)||0;
    return {src,width,label:width?`当前浏览器视口 ${width}px（本地缩略图）`:'当前浏览器视口截图（旧数据；元素标注需重新扫描）',mode:'single',reason:''};
  }
  const api={urlKey,resolve};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  if (typeof window !== 'undefined') window.ShipCheckVisualEvidence=api;
})();
