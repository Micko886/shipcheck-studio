/* Pure PageSpeed Insights v5 adapter. No hidden network calls. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ShipCheckPageSpeed=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const endpoint='https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
  const metricIds=['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index','interactive'];
  const fixes={
    'render-blocking-resources':'延迟非关键 CSS/JS，优先渲染首屏；复测首屏样式是否完整。',
    'unused-javascript':'检查代码分包、按需加载和未使用的第三方脚本。',
    'unused-css-rules':'移除确实无用的 CSS 并确保动态状态样式不被误删。',
    'modern-image-formats':'评估 AVIF/WebP 与合理回退格式，控制首屏图片体积。',
    'uses-optimized-images':'压缩图片、使用响应式 srcset 和适当的分辨率。',
    'uses-responsive-images':'按实际显示尺寸提供 srcset/sizes，避免下载过大的资源。',
    'offscreen-images':'对首屏外非关键图片设置合适的懒加载。',
    'font-display':'使用 font-display 并评估字体加载时布局跳变。',
    'largest-contentful-paint-element':'查看 LCP 元素，优先降低其资源与渲染延迟。',
    'lcp-discovery-insight':'确保首屏 LCP 图片或字体能被尽早发现、及时请求。',
    'lcp-request-discovery':'让浏览器在初始 HTML 中尽早发现 LCP 资源。',
    'cls-culprits-insight':'为图片、广告和异步区域预留尺寸，避免内容跳动。',
    'layout-shift-elements':'为动态内容预留空间，避免首屏内容位置变化。',
    'total-byte-weight':'减少第三方脚本与不必要资源体积。',
    'third-party-summary':'识别高开销第三方脚本，评估延后或替代。'
  };
  const metricLabel={
    'first-contentful-paint':'FCP 首次内容绘制',
    'largest-contentful-paint':'LCP 最大内容绘制',
    'total-blocking-time':'TBT 总阻塞时间',
    'cumulative-layout-shift':'CLS 累积布局偏移',
    'speed-index':'Speed Index 速度指数',
    'interactive':'TTI 可交互时间'
  };
  const fieldLabel={LARGEST_CONTENTFUL_PAINT_MS:'LCP',CUMULATIVE_LAYOUT_SHIFT_SCORE:'CLS',INTERACTION_TO_NEXT_PAINT:'INP',FIRST_CONTENTFUL_PAINT_MS:'FCP',EXPERIMENTAL_TIME_TO_FIRST_BYTE:'TTFB'};
  function validURL(url){const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||!u.hostname||u.username||u.password)throw new Error('仅支持公开 HTTP/HTTPS 网页');if(/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|::1|\[::1\])/.test(u.hostname))throw new Error('Google PageSpeed 无法访问本机或私网 URL');return u.href;}
  function buildURL(url,strategy='mobile',key=''){
    const u=new URL(endpoint);u.searchParams.set('url',validURL(url));u.searchParams.set('strategy',strategy==='desktop'?'desktop':'mobile');u.searchParams.set('locale','zh-CN');
    for(const cat of ['performance','accessibility','best-practices','seo'])u.searchParams.append('category',cat);
    if(key)u.searchParams.set('key',key);
    return u.toString();
  }
  function parse(raw,strategy,url){
    if(!raw||typeof raw!=='object'||!raw.lighthouseResult)throw new Error('Google 未返回有效的 Lighthouse 数据');
    const l=raw.lighthouseResult, categories=l.categories||{}, audits=l.audits||{};
    const score={};for(const cat of ['performance','accessibility','best-practices','seo'])score[cat]=typeof categories[cat]?.score==='number'?Math.round(categories[cat].score*100):null;
    const lab=metricIds.map(id=>{const a=audits[id];return a?{id,label:metricLabel[id],value:a.displayValue||'未提供',numericValue:a.numericValue??null}:null;}).filter(Boolean);
    const field=[];for(const [id,obj] of Object.entries(raw.loadingExperience?.metrics||{})){
      if(fieldLabel[id])field.push({id,label:fieldLabel[id],value:obj.percentile??null,category:obj.category||'UNKNOWN'});
    }
    const refCategories=new Map();for(const [name,c] of Object.entries(categories))for(const r of c.auditRefs||[]){if((r.weight||0)<=0)continue;if(!refCategories.has(r.id))refCategories.set(r.id,[]);refCategories.get(r.id).push(name);}
    const recommendations=[];
    for(const [id,a] of Object.entries(audits)){
      if(!refCategories.has(id)||typeof a.score!=='number'||a.score>=.9||a.scoreDisplayMode==='manual'||a.scoreDisplayMode==='notApplicable')continue;
      recommendations.push({id,title:a.title||id,description:String(a.description||'').replace(/\[[^\]]+\]\([^)]*\)/g,'').slice(0,320),score:a.score,displayValue:a.displayValue||'',categories:refCategories.get(id),advice:fixes[id]||'查看检查详情和受影响资源；先在测试环境优化，修复后重新测试。',details:a.details?.type||null});
    }
    recommendations.sort((a,b)=>a.score-b.score);
    return {url:raw.id||url||'',strategy,date:new Date().toISOString(),scores:score,lab,field,fieldSource:raw.loadingExperience?.metrics?'CrUX 网页级真实用户数据':'未提供网页级 CrUX 数据',recommendations:recommendations.slice(0,20),runtimeError:l.runtimeError?.message||null,analyzedUrl:l.finalDisplayedUrl||l.finalUrl||url||'',rawVersion:l.lighthouseVersion||null};
  }
  async function query(url,strategy,options={}){
    if(typeof options.fetcher!=='function'&&typeof fetch!=='function')throw new Error('当前运行环境不支持网络请求');
    const fetcher=options.fetcher||fetch,ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),options.timeout||55000);
    try{
      const resp=await fetcher(buildURL(url,strategy,options.key||''),{signal:ctl.signal,credentials:'omit',cache:'no-store'});
      const json=await resp.json().catch(()=>({}));
      if(!resp.ok){const message=json.error?.message||'请检查 API 配额、网站是否公开可访问、API Key 配置';throw new Error('PageSpeed HTTP '+resp.status+'：'+String(message).slice(0,180));}
      return parse(json,strategy,url);
    }finally{clearTimeout(timer);}
  }
  return {buildURL,parse,query,validURL,fixes};
});
