/* ShipCheck Search Readiness — local, evidence-first technical SEO / AI-search diagnostics.
 * No fake GEO rankings, indexing claims, or mandatory llms.txt/schema advice.
 * UMD for browser and tests. No network or model calls.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ShipCheckSearch=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=x=>String(x==null?'':x).replace(/\s+/g,' ').trim();
  const content=(d,s,a='content')=>text(d.querySelector(s)?.getAttribute(a));
  function readJsonLd(d){
    const data=[],errors=[];
    for(const [i,node] of [...d.querySelectorAll('script[type="application/ld+json"]')].entries()){
      try{
        const parsed=JSON.parse(node.textContent||'');
        const queue=Array.isArray(parsed)?parsed:[parsed];
        for(const entry of queue){
          if(entry && typeof entry==='object'){
            const graph=Array.isArray(entry['@graph'])?entry['@graph']:[entry];
            for(const item of graph){
              if(item && typeof item==='object')data.push({types:[].concat(item['@type']||[]).filter(x=>typeof x==='string').slice(0,5),name:text(item.name).slice(0,120)});
            }
          }
        }
      }catch(e){errors.push('JSON-LD 脚本 #'+(i+1)+' 无法解析：'+e.message.slice(0,100));}
    }
    return {nodes:data,errors,scripts:d.querySelectorAll('script[type="application/ld+json"]').length};
  }
  function run(d,w){
    const current=w.location?.href||d.URL||'';
    const checks=[],add=(group,id,label,status,evidence,advice)=>checks.push({group,id,label,status,evidence,advice});
    const title=text(d.title),desc=content(d,'meta[name="description" i]'),h1=[...d.querySelectorAll('h1')];
    const robots=[...d.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i],meta[name="bingbot" i]')].map(el=>text(el.getAttribute('content')).toLowerCase());
    const noindex=robots.some(x=>/(^|[,\s])noindex([,\s]|$)/.test(x));
    const noSnippet=robots.some(x=>/(^|[,\s])nosnippet([,\s]|$)/.test(x));
    add('seo','index-directive','页面索引指令',noindex||noSnippet?'attention':'pass',noindex?'检测到 noindex':noSnippet?'检测到 nosnippet':'当前 DOM 没有明确的 noindex/nosnippet 标签','需同时检查响应头 X-Robots-Tag、robots.txt 和 Google Search Console；预览站 noindex 可能是有意的。');
    add('seo','title','Title 与页面主标题',title&&h1.length?'pass':'attention',`Title：${title.slice(0,140)||'空'}；H1：${h1.length} 个`,'标题应准确描述页面内容。多个 H1 不必一律判为 SEO 失败。');
    add('seo','description','搜索摘要描述',desc?'pass':'attention',desc?'已提供 meta description（'+desc.length+' 字符）':'未发现非空 meta description','这是一项可控的搜索摘要建议，并非 Google 必须使用的展示文案。');
    const canonical=[...d.querySelectorAll('link[rel~="canonical" i]')].map(x=>x.getAttribute('href')||'');
    let canonStatus='unverified',canonEvidence='未声明 canonical（不一定是错误）';
    if(canonical.length>1){canonStatus='attention';canonEvidence='检测到 '+canonical.length+' 个 canonical 链接';}
    else if(canonical.length===1){try{const u=new URL(canonical[0],current);canonStatus=/^https?:$/.test(u.protocol)?'pass':'attention';canonEvidence=u.href;}catch(e){canonStatus='attention';canonEvidence='canonical URL 无法解析：'+canonical[0];}}
    add('seo','canonical','规范 URL 声明',canonStatus,canonEvidence,'比较 canonical、重定向和站点地图是否一致。跨 URL 指向可能是有意合并，不应自动判错。');
    const langs=[...d.querySelectorAll('link[rel~="alternate" i][hreflang]')];
    const badLangs=langs.filter(x=>!/^([a-z]{2,3}(-[a-z0-9]{2,8})*|x-default)$/i.test(x.getAttribute('hreflang')||'')||!x.href.startsWith('http'));
    const names=langs.map(x=>(x.getAttribute('hreflang')||'').toLowerCase());
    if(new Set(names).size<names.length)badLangs.push(...langs.filter((x,i)=>names.indexOf(names[i])!==i));
    add('seo','hreflang','多语言 hreflang',badLangs.length?'attention':langs.length?'pass':'unverified',langs.length?`${langs.length} 条 alternate hreflang；${badLangs.length} 条需复核`:'当前页面未声明 hreflang（单语言网站可能不需要）','完整的双向回链、目标页状态和 canonical 关系需要多页面验证。');
    const schema=readJsonLd(d);
    add('seo','jsonld','JSON-LD 结构化数据语法',schema.errors.length?'attention':schema.scripts?'pass':'unverified',schema.errors.length?schema.errors.join('；'):schema.scripts?`${schema.scripts} 个脚本，${schema.nodes.length} 个类型节点`:'未发现 JSON-LD（并非所有页面都需要）','语法通过不等于符合 Google 富媒体结果资格；必须核对数据与可见内容一致。');
    const main=d.querySelector('main, [role="main"], article')||d.body;
    const bodyText=text(main && typeof main.innerText === 'string' ? main.innerText : main?.textContent).slice(0,200000);
    const visibleLength=bodyText.length;
    add('seo','visible-text','重要正文可获取性',visibleLength<100?'attention':'pass',`当前渲染 DOM 主内容约 ${visibleLength} 字符`,'此检查只覆盖渲染后的 DOM；服务端原始 HTML 和搜索引擎实际索引状态尚未验证。');
    const lang=text(d.documentElement?.getAttribute('lang'));
    add('seo','lang','文档语言声明',lang?'pass':'attention',lang?'html lang="'+lang+'"':'html 元素缺少 lang','多语言页面还应核对页面真实语言、同语言 canonical 和 hreflang 关系。');
    add('seo','crawl-validation','真实抓取和收录验证','unverified','当前浏览器页面不能证明 robots.txt、HTTP 响应头、站点地图、索引与排名状态','接入 Search Console/Bing Webmaster Tools 或有权限的站点抓取流程后验证。');
    const siteName=content(d,'meta[property="og:site_name" i]')||content(d,'meta[name="application-name" i]');
    const orgTypes=schema.nodes.flatMap(x=>x.types).filter(x=>/^(Organization|Corporation|LocalBusiness|Brand|Person)$/i.test(x));
    add('geo','identity','品牌与实体信息可辨识',orgTypes.length||siteName?'pass':'unverified',orgTypes.length?'结构化实体类型：'+[...new Set(orgTypes)].join(', '):siteName?'可见站点身份：'+siteName:'未找到明显品牌实体结构信号（不代表不存在）','核对真实品牌名称、联系方式、About 页面以及可见内容之间的一致性，不要虚构主体或资质。');
    const facts=bodyText.match(/\b(MOQ|SKU|OEM|ODM|specifications?|dimensions?|materials?|minimum order|lead time|warranty|certification|pricing|compatible|features?)\b|起订|规格|材质|型号|交期|认证|参数|尺寸|保修|价格/gi)||[];
    const tables=d.querySelectorAll('table,dl,[itemprop="additionalProperty"]').length;
    add('geo','concrete-facts','可核实的具体事实',facts.length>=2||tables?'pass':'unverified',`相关事实线索 ${facts.length} 处；参数/定义表 ${tables} 个`,'优先提供真实规格、适用条件、验收标准和可追溯证据；词汇出现不证明内容真实或有价值。');
    const questions=[...d.querySelectorAll('h2,h3,h4,summary,dt')].filter(x=>/\?|？|^(what|why|how|when|which|who|can|is|are|do|does)\b|什么|如何|为什么|多少|是否/i.test(text(x.textContent))).length;
    add('aeo','answers','明确问题与可读答案',questions?'pass':'unverified',`检测到 ${questions} 个可能的问题型标题`,'仅在用户真实需要时组织问答；没有问答格式不代表无法被 AI 搜索使用。');
    const byline=d.querySelector('[rel="author"],[itemprop="author"],address,time[datetime],.author,.byline');
    add('geo','attribution','作者、日期与来源可核查',byline?'pass':'unverified',byline?'存在作者/日期/联系相关 DOM 线索':'未检测到明显作者、日期或出处标签','按内容类型呈现准确的作者、发布时间、来源、联系信息；不应为凑信号虚构资质。');
    add('geo','ai-visibility','AI 平台引用与真实可见度','unverified','页面结构检查不能证明 ChatGPT、Google AI 或 Bing Copilot 正在引用本站','需使用真实平台观测、带日期和查询记录的引用数据，不得生成虚构的 GEO 成功率。');
    return {version:'search-readiness/1',url:current,generatedAt:new Date().toISOString(),checks,summary:{pass:checks.filter(x=>x.status==='pass').length,attention:checks.filter(x=>x.status==='attention').length,unverified:checks.filter(x=>x.status==='unverified').length},schemaTypes:[...new Set(schema.nodes.flatMap(x=>x.types))].slice(0,25),limitations:['仅检查当前页面的渲染 DOM；不能确认已收录、排名、AI 引用、robots.txt 或响应头状态。','GEO/AEO 为内容可理解性与证据线索检查，不是搜索引擎官方评分。']};
  }
  function markdown(a){if(!a)return '# Search Readiness\n\n尚未扫描';const lines=['# ShipCheck · SEO / GEO / AEO 搜索准备度报告','','页面：'+a.url,'生成：'+a.generatedAt,'检测通过 '+a.summary.pass+' / 需关注 '+a.summary.attention+' / 未验证 '+a.summary.unverified,''];for(const group of ['seo','geo','aeo']){lines.push('## '+({seo:'Technical SEO',geo:'GEO 内容与实体可理解性',aeo:'AEO 回答结构'}[group]),'');for(const x of a.checks.filter(c=>c.group===group))lines.push('- **'+x.label+'** ['+x.status+']：'+x.evidence+'。建议：'+x.advice);lines.push('');}lines.push('## 能力边界',...a.limitations.map(x=>'- '+x));return lines.join('\n');}
  function agentTask(a){
    if(!a)return '# ShipCheck 搜索优化任务\n请先执行扫描。';
    const actionable=a.checks.filter(x=>x.status==='attention');
    const lines=['# ShipCheck · SEO/GEO 有证据修复任务','',
      '- 目标 URL：'+a.url,
      '- 优化目的：修复可复核的技术问题，并改进真实信息的可理解性；不承诺排名、收录或 AI 引用。','',
      '## 需要优先核查的发现'];
    for(const x of actionable){lines.push('### '+x.label,'- 分类：'+x.group,'- 当前证据：'+x.evidence,'- 建议：'+x.advice,'- [ ] 修复时检查真实页面意图和源码；不要为了规则而增加虚构信息。','- [ ] 修复后重新扫描；保留前后证据。','');}
    if(!actionable.length)lines.push('当前扫描未发现需立即修复的技术异常；请勿据此宣称已收录或已符合 AI 推荐条件。','');
    lines.push('## 未验证事项','- 使用正式站点环境验证 HTTP 状态、X-Robots-Tag、robots.txt、站点地图与服务器初始 HTML。','- 由网站所有者使用 Search Console / Bing Webmaster Tools 验证实际收录与表现。','- 对结构化数据运行平台官方测试工具，并确认标记与页面实际内容一致。','- 不要把 llms.txt、关键词堆砌或不真实第三方提及作为必选优化。','',
      '## 验收标准','- [ ] 修改记录包含真实源码路径与前后差异','- [ ] 内容与结构化标记一致，不添加虚假规格、价格、认证、作者、评价','- [ ] 核心导航、表单及页面业务流程没有回归','- [ ] 实际平台数据和未验证项目明确标注，不能推测为成功');
    return lines.join('\n');
  }
  return {run,readJsonLd,markdown,agentTask};
});
