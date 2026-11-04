/* ShipCheck Search Lab: bounded site crawl + evidence-first SEO/GEO analysis.
 * Browser/Node compatible UMD, no third-party dependencies.
 * Source HTML is parsed as inert markup; never execute untrusted page scripts.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ShipCheckTechnical=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const short=(s,n=170)=>clean(s).slice(0,n);
const uniq=a=>[...new Set(a)];
// Restrict read-only audits to ordinary public-looking URLs. A GET endpoint can still
// have side effects, so do not follow obvious session or mutation actions.
function safeAuditUrl(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return false;
  if(/(?:^|\/)(?:logout|log-out|signout|sign-out|delete|remove|destroy|unsubscribe|checkout|payment|confirm-order)(?:\/|$)/i.test(u.pathname))return false;
  for(const name of u.searchParams.keys())if(/^(?:token|auth|signature|sig|session|sessionid|api_key|access_key|action)$/i.test(name))return false;
  return true;}catch{return false;}}
const originOf=u=>new URL(u).origin;
function canonicalUrl(raw,base){try{const u=new URL(raw,base);if(!/^https?:$/.test(u.protocol))return null;u.hash='';return u.href;}catch{return null;}}
function pathOf(url){try{const u=new URL(url);return u.pathname+u.search;}catch{return url;}}
function sameOrigin(raw,base){const resolved=canonicalUrl(raw,base);return resolved&&originOf(resolved)===originOf(base)?resolved:null;}
function getAll(doc,selector){return Array.from(doc.querySelectorAll(selector));}
function visibleText(doc){
  const main=doc.querySelector('main,[role="main"],article')||doc.body;
  if(!main)return '';
  const node=main.cloneNode(true);
  for(const el of getAll(node,'script,style,noscript,template,svg,nav,footer,header,[aria-hidden="true"]'))el.remove();
  return clean(node.textContent).slice(0,30000);
}
function extractPage(html,url,parse){
  if(typeof parse!=='function')throw new Error('HTML parser required');
  const doc=parse(html,'text/html');if(!doc||!doc.querySelector)throw new Error('Invalid HTML parser response');
  const title=clean(doc.title),text=visibleText(doc),heading=getAll(doc,'h1').map(el=>short(el.textContent,160));
  const metas=getAll(doc,'meta[name="robots" i],meta[name="googlebot" i],meta[name="bingbot" i]').map(n=>clean(n.getAttribute('content')).toLowerCase());
  const canonicals=getAll(doc,'link[rel~="canonical" i]').map(n=>canonicalUrl(n.getAttribute('href'),url)||clean(n.getAttribute('href')));
  const hreflang=getAll(doc,'link[rel~="alternate" i][hreflang]').map(n=>({lang:clean(n.getAttribute('hreflang')).toLowerCase(),href:canonicalUrl(n.getAttribute('href'),url)}));
  const links=uniq(getAll(doc,'a[href]').map(n=>canonicalUrl(n.getAttribute('href'),url)).filter(Boolean));
  const schema=[],schemaErrors=[];
  for(const [i,s] of getAll(doc,'script[type="application/ld+json"]').entries()){
    try{const obj=JSON.parse(s.textContent||'');const objects=Array.isArray(obj)?obj:[obj];for(const item of objects){for(const entry of (Array.isArray(item?.['@graph'])?item['@graph']:[item])){
      if(entry&&typeof entry==='object')schema.push({type:clean([].concat(entry['@type']||[]).join(', ')),name:short(entry.name,120),description:short(entry.description,160),url:clean(entry.url)});
    }}}catch(e){schemaErrors.push('JSON-LD #'+(i+1)+': '+e.message.slice(0,80));}
  }
  const desc=clean(doc.querySelector('meta[name="description" i]')?.getAttribute('content'));
  const facts=[];
  const patterns=[
    {id:'moq',name:'MOQ',re:/(?:\bMOQ\b|minimum order(?: quantity)?|起订量)[^\n。.!?]{0,65}/gi},
    {id:'leadTime',name:'Lead time',re:/(?:lead time|production time|delivery time|交期)[^\n。.!?]{0,65}/gi},
    {id:'spec',name:'Product facts',re:/(?:\bSKU\b|materials?|dimensions?|weight|certifications?|规格|材质|尺寸|认证)[^\n。.!?]{0,70}/gi}
  ];
  for(const p of patterns){for(const match of text.matchAll(p.re)){facts.push({type:p.id,quote:short(match[0],100)});if(facts.length>=30)break;}if(facts.length>=30)break;}
  const questionHeaders=getAll(doc,'h2,h3,h4,dt,summary').filter(n=>/(?:\?|？|^(?:how|what|why|which|when|who|can|is|are)\b|如何|什么|为什么|是否)/i.test(clean(n.textContent))).map(n=>short(n.textContent,140));
  return {url,title,description:desc,h1:heading,lang:clean(doc.documentElement?.getAttribute('lang')),textLength:text.length,
    textSample:text.slice(0,6000),firstParagraph:short(doc.querySelector('main p,article p,p')?.textContent,300),
    canonicals,hreflang,links,robots:metas,noindex:metas.some(x=>/(?:^|[,\s])noindex(?:[,\s]|$)/.test(x)),
    schema,schemaErrors,facts:uniq(facts.map(x=>x.type+'|'+x.quote)).map(x=>{const pos=x.indexOf('|');return {type:x.slice(0,pos),quote:x.slice(pos+1)};}),questionHeaders:questionHeaders.slice(0,12),
    aboutLinks:links.filter(x=>/\b(about|contact|company|privacy|terms)\b/i.test(new URL(x).pathname)).slice(0,8)};
}
function parseRobots(body){const rules=[],sitemaps=[];let agents=[];
  for(let line of String(body||'').split(/\r?\n/)){
    line=line.replace(/#.*/,'').trim();if(!line)continue;const pos=line.indexOf(':');if(pos<0)continue;const key=line.slice(0,pos).trim().toLowerCase(),val=line.slice(pos+1).trim();
    if(key==='user-agent'){agents=[val.toLowerCase()];}
    else if(key==='sitemap')sitemaps.push(val);
    else if(['allow','disallow'].includes(key))rules.push({agents:[...agents],type:key,path:val});
  }
  return {rules,sitemaps:uniq(sitemaps)};
}
function robotRestriction(robots,url){const pathname=new URL(url).pathname;
  const matches=robots.rules.filter(x=>x.agents.some(a=>a==='*'||a==='shipcheck')&&x.path&&pathname.startsWith(x.path));
  matches.sort((a,b)=>b.path.length-a.path.length);
  return matches.length?matches[0].type==='disallow':false;
}
function parseSitemap(xml,base,parse){const doc=parse(xml,'application/xml');if(doc.querySelector('parsererror'))return {urls:[],nested:[],error:'XML parsing error'};
  const elements=getAll(doc,'loc');const urls=[],nested=[];
  for(const node of elements){const u=canonicalUrl(node.textContent,base);if(!u)continue;
    if(node.parentElement?.localName==='sitemap')nested.push(u);else if(node.parentElement?.localName==='url')urls.push(u);
  }
  return {urls:uniq(urls),nested:uniq(nested),error:null};
}
function compareRendering(page,rendered){
  if(!rendered||!Number.isFinite(Number(rendered.textLength)))return {status:'unverified',reason:'尚未执行实际浏览器渲染，不能判断 CSR/SSR 差异',sourceChars:page.textLength};
  const raw=page.textLength,hydrated=Number(rendered.textLength)||0;
  if(raw<120&&hydrated>=220)return {status:'attention',reason:'服务器原始 HTML 正文很少，但浏览器渲染后内容明显增加；存在依赖 JavaScript 的抓取风险',sourceChars:raw,renderedChars:hydrated};
  if(raw>=120)return {status:'pass',reason:'初始 HTML 已含可提取的正文；这不等于实际收录或无需 JavaScript',sourceChars:raw,renderedChars:hydrated};
  return {status:'unverified',reason:'原始 HTML 与渲染结果均缺少足够正文；也可能是非内容型页面',sourceChars:raw,renderedChars:hydrated};
}
function issue(id,severity,title,evidence,urls,advice,scope='technical'){
  return {id,severity,title,evidence:String(evidence),urls:uniq((urls||[]).filter(Boolean)),advice,scope};
}
function analyzeCrawl(data){
  const pages=data.pages||[],start=data.start,byUrl=new Map(pages.map(p=>[p.url,p])),findings=[],append=(...args)=>findings.push(issue(...args));
  const scanned=new Set(pages.map(p=>p.url));
  const sources=new Map(),incoming=new Map();
  for(const p of pages){for(const href of p.links.filter(l=>originOf(l)===originOf(start))){if(!incoming.has(href))incoming.set(href,[]);incoming.get(href).push(p.url);}}
  for(const p of pages){
    if(p.status>=400)append('http-'+p.url,'high','页面返回 HTTP '+p.status,'HTTP 状态：'+p.status,[p.url],'检查站内链接、重定向与是否应保留该页面');
    if(p.status<200||p.status>=300||p.error)continue;
    if(!p.title)append('title-'+p.url,'medium','缺少 Title','原始 HTML 未提取到 Title',[p.url],'根据真实页面意图补充独立标题');
    if(p.canonicals.length>1)append('canonical-multi-'+p.url,'high','页面声明多个 Canonical',p.canonicals.join(', '),[p.url],'只保留符合实际规范化策略的一项');
    if(p.canonicals.length===1){
      const target=p.canonicals[0];
      if(!canonicalUrl(target,p.url))append('canonical-invalid-'+p.url,'high','Canonical 非有效 URL',target,[p.url],'确保 canonical 为可访问的绝对 HTTP(S) 地址');
      if(target!==p.url&&originOf(target)===originOf(start)&&byUrl.has(target)&&byUrl.get(target).noindex)append('canonical-noindex-'+p.url,'high','Canonical 指向带 noindex 的页面',target,[p.url,target],'核对目标是否应被索引以及规范页策略');
    }
    if(p.noindex||/(?:^|[,\s])noindex(?:[,\s]|$)/.test((p.xRobots||'').toLowerCase()))append('noindex-'+p.url,'medium','页面存在 Noindex 信号','robots meta: '+p.robots.join(' | ')+'; X-Robots-Tag: '+(p.xRobots||'无'),[p.url],'对照项目是否为正式站；测试环境 noindex 可能是有意的');
    if(p.schemaErrors.length)append('jsonld-'+p.url,'medium','JSON-LD 解析错误',p.schemaErrors.join('；'),[p.url],'修复 JSON 语法并核实字段与可见内容一致');
    if(p.renderCompare?.status==='attention')append('csr-'+p.url,'high','首屏正文可能依赖客户端渲染',p.renderCompare.reason+`（源 ${p.renderCompare.sourceChars}，渲染 ${p.renderCompare.renderedChars} 字符）`,[p.url],'检查服务器返回的 HTML 是否包含关键正文；必要时采用 SSR/预渲染并复查');
    if(p.contentType&&!/text\/html/i.test(p.contentType))append('type-'+p.url,'low','链接内容并非 HTML',p.contentType,[p.url],'确认目标链接类型是否符合预期');
  }
  const titleMap=new Map();for(const p of pages.filter(x=>x.status>=200&&x.status<300&&x.title)){
    const t=p.title.toLowerCase();if(!titleMap.has(t))titleMap.set(t,[]);titleMap.get(t).push(p.url);
  }
  for(const [title,urls] of titleMap)if(urls.length>1)append('duplicate-title-'+title,'medium','多个页面使用相同 Title',`Title: ${title}`,urls,'确认页面搜索意图是否重复；不同页面应有清晰独立的信息价值');
  const canonMap=new Map();for(const p of pages){const u=p.canonicals[0];if(!u)continue;if(!canonMap.has(u))canonMap.set(u,[]);canonMap.get(u).push(p.url);}
  for(const [target,urls] of canonMap)if(urls.length>1&&urls.some(u=>u!==target))append('shared-canonical-'+target,'low','多个页面指向同一 Canonical',target,urls,'可能是有意合并重复内容；与索引目标、重定向和 sitemap 核对');
  for(const p of pages){for(const h of p.hreflang){if(!h.href)append('hreflang-invalid-'+p.url+'-'+h.lang,'medium','hreflang 目标 URL 无效',h.lang,[p.url],'修正有效 URL');
    else if(byUrl.has(h.href)){
      const target=byUrl.get(h.href);
      if(!target.hreflang.some(x=>x.href===p.url))append('hreflang-reciprocal-'+p.url+'-'+h.href,'medium','hreflang 双向回链缺失',`${p.url} → ${h.lang} → ${h.href}；目标未声明返回原页面`,[p.url,h.href],'检查目标页面是否声明互相对应的 hreflang；仅在两页均已抓取时判断');
      if(target.status>=400)append('hreflang-broken-'+h.href,'high','hreflang 目标页面无法访问',`HTTP ${target.status}`,[p.url,h.href],'修复翻译目标地址或移除错误标记');
    }
  }}
  for(const p of pages){for(const target of p.links.filter(x=>originOf(x)===originOf(start))){const linked=byUrl.get(target);if(linked&&linked.status>=400)append('broken-link-'+p.url+'-'+target,'high','内部链接指向错误页面',`${pathOf(p.url)} → ${pathOf(target)} (HTTP ${linked.status})`,[p.url,target],'修复页面内链接，或恢复目标页面 / 设置合理重定向');}}
  const fromSitemap=uniq(data.sitemapUrls||[]).filter(u=>originOf(u)===originOf(start));
  const orphans=fromSitemap.filter(u=>scanned.has(u)&&u!==start&&!incoming.has(u));
  if(orphans.length)append('orphans','medium','部分站点地图页面没有发现站内入链',`只针对已抓取样本发现 ${orphans.length} 个候选：${orphans.slice(0,5).map(pathOf).join(', ')}`,orphans.slice(0,12),'站内抓取样本有限；先核对导航和分类页链接，再判断是否真正孤立');
  if(data.robots?.error)append('robots-fetch','low','robots.txt 未完成验证',data.robots.error,[start],'检查抓取器权限及站点的实际访问情况');
  if(data.sitemap?.error)append('sitemap-fetch','low','Sitemap 未能完整验证',data.sitemap.error,[start],'检查 XML 文件、路径、索引与服务器响应');
  // Cross-page business fact differences: a human review hint, not an automatic contradiction verdict.
  const moq=pages.flatMap(p=>p.facts.filter(x=>x.type==='moq'&&/\d/.test(x.quote)).map(f=>({url:p.url,quote:f.quote}))).slice(0,16);
  if(moq.length>=2){const num=uniq(moq.map(m=>m.quote.match(/\d[\d,]*/)?.[0]).filter(Boolean));
    if(num.length>=2)append('moq-review','low','不同页面出现不同 MOQ 数值，需要核对适用条件',moq.slice(0,6).map(f=>`${pathOf(f.url)}: ${f.quote}`).join(' | '),moq.map(x=>x.url),'标准款和定制款可能有不同 MOQ；应按产品/服务类型核对，不要直接当成矛盾','content');
  }
  return {findings:findings.sort((a,b)=>({high:0,medium:1,low:2}[a.severity]??3)-({high:0,medium:1,low:2}[b.severity]??3)),
    stats:{pagesCrawled:pages.length,failedPages:pages.filter(p=>p.error||p.status>=400).length,withHtmlBody:pages.filter(p=>p.textLength>=120).length,
      csrRisk:pages.filter(p=>p.renderCompare?.status==='attention').length,renderVerified:pages.filter(p=>p.renderCompare?.status!=='unverified').length,
      sitemapCandidates:fromSitemap.length,confirmedIndexing:null,aiCitations:null},
    coverage:{crawled:pages.map(p=>p.url),uncrawledLinks:uniq(pages.flatMap(p=>p.links.filter(l=>originOf(l)===originOf(start)&&safeAuditUrl(l)&&!scanned.has(l)))).slice(0,60),
      unverifiedSitemapUrls:fromSitemap.filter(u=>!scanned.has(u)).slice(0,60)}};
}
function contentReview(data){
  const pages=(data.pages||[]).filter(p=>p.status>=200&&p.status<300),checks=[];
  for(const p of pages){
    const path=new URL(p.url).pathname;
    const pageType=/\/blog|\/articles|\/guides|\/news/.test(path)?'article':/\/product|\/item|\/sku/.test(path)?'product':/\/contact|\/quote|\/rfq/.test(path)?'conversion':'general';
    const facts=p.facts||[];
    const evidence=[];
    if(p.h1.length)evidence.push('H1: '+p.h1[0]);
    if(p.firstParagraph)evidence.push('首段: '+p.firstParagraph);
    if(facts.length)evidence.push('事实: '+facts.slice(0,3).map(x=>x.quote).join(' | '));
    checks.push({url:p.url,pageType,status:p.textLength<120?'review':'observed',evidence:evidence.slice(0,4),
      observations:[...(p.textLength<120?['可提取正文不足，需要确认页面是否依赖 JS 或主要由交互组成']:[]),
        ...(pageType==='product'&&!facts.length?['未提取到规格或采购条款线索；请核对真实商品参数是否在页面上清晰呈现']:[]),
        ...(pageType==='article'&&!p.questionHeaders.length?['未识别到问题型标题；这不是 SEO 缺陷，应结合目标搜索意图检查信息组织']:[]),
        ...(p.schema?.length?[]:['未提取到 JSON-LD；不是所有内容都需要结构化数据'])],
      reviewQuestions:pageType==='product'?['产品规格、MOQ、样品与定制条件是否与真实资料一致？','是否能看出下一步如何询价？']:
        pageType==='article'?['是否回答了明确的用户问题并说明限制和来源？','是否存在重复、无证据的事实或空泛内容？']:
        ['页面承诺的业务能力是否真实可验证？','联系信息与品牌身份是否一致？']});
  }
  return {checks,disclaimer:'基于页面内容线索的辅助审查，不对事实真实性、搜索意图匹配、Google 排名或 AI 引用作自动结论。'};
}
async function crawlSite({url,fetcher,parse,extract,xmlExtract,maxPages=8,seedUrls=[],rendered,onProgress}){
  const start=canonicalUrl(url,url);if(!start)throw new Error('请输入有效的 http/https URL');
  const siteOrigin=originOf(start),max=Math.max(1,Math.min(100,Number(maxPages)||20));
  if(!fetcher||(!parse&&!extract)||(!parse&&!xmlExtract))throw new Error('Fetcher and HTML/XML extraction are required');
  async function pull(u){const result=await fetcher(u);if(!result||typeof result.body!=='string')throw new Error('Invalid fetcher result');
    const actual=canonicalUrl(result.url||u,u);if(!actual||originOf(actual)!==siteOrigin)throw new Error('Cross-origin redirect blocked');
    return {...result,url:actual};}
  let robots={status:'unverified',rules:[],sitemaps:[]};
  try{const response=await pull(siteOrigin+'/robots.txt');robots={...parseRobots(response.status===200?response.body:''),status:response.status,error:response.status>=500?'HTTP '+response.status:null};}
  catch(e){robots={status:'unverified',rules:[],sitemaps:[],error:String(e.message)}}
  let sitemap={status:'unverified',error:null},sitemapUrls=[];
  const candidates=uniq([...robots.sitemaps.filter(x=>sameOrigin(x,start)),siteOrigin+'/sitemap.xml']).slice(0,3);
  for(const address of candidates){try{const response=await pull(address);if(response.status!==200)continue;
      const parsed=parse?parseSitemap(response.body,address,parse):await xmlExtract(response.body,address);sitemapUrls.push(...parsed.urls.filter(x=>sameOrigin(x,start)));
      sitemap={status:200,error:parsed.error};
      for(const nested of parsed.nested.filter(x=>sameOrigin(x,start)).slice(0,2)){
        try{const index=await pull(nested);if(index.status===200){const nestedMap=parse?parseSitemap(index.body,nested,parse):await xmlExtract(index.body,nested);sitemapUrls.push(...nestedMap.urls.filter(x=>sameOrigin(x,start)));}}catch{}
      }
      if(!parsed.error)break;
    }catch(e){sitemap.error=String(e.message);}
  }
  sitemapUrls=uniq(sitemapUrls).slice(0,250);
  const queue=uniq([start,...sitemapUrls.slice(0,max),...seedUrls.map(u=>sameOrigin(u,start)).filter(Boolean)]).filter(safeAuditUrl),visited=new Set(),pages=[],skipped=[];
  while(queue.length&&pages.length<max){const next=queue.shift(),link=sameOrigin(next,start);if(!link||visited.has(link))continue;visited.add(link);
    if(robotRestriction(robots,link)){skipped.push({url:link,reason:'robots.txt'});onProgress?.({count:pages.length,max,url:link,skipped:'robots.txt'});continue;}
    try{const response=await pull(link),p={url:response.url,status:response.status,contentType:response.contentType||'',xRobots:response.headers?.['x-robots-tag']||'',error:null};
      if(response.status>=200&&response.status<300&&/html/i.test(response.contentType||'text/html'))Object.assign(p,extract?await extract(response.body,response.url):extractPage(response.body,response.url,parse));
      else Object.assign(p,{title:'',description:'',h1:[],lang:'',textLength:0,textSample:'',firstParagraph:'',canonicals:[],hreflang:[],links:[],robots:[],noindex:false,schema:[],schemaErrors:[],facts:[],questionHeaders:[],aboutLinks:[]});
      if(p.status>=200&&p.status<300&&typeof rendered==='function'){
        try{p.renderCompare=compareRendering(p,await rendered(p.url));}catch(e){p.renderCompare={status:'unverified',reason:'渲染无法验证：'+String(e.message).slice(0,100),sourceChars:p.textLength};}
      }else p.renderCompare=compareRendering(p,null);
      pages.push(p);
      for(const href of p.links){if(sameOrigin(href,start)&&safeAuditUrl(href)&&!visited.has(href)&&queue.length<180)queue.push(href);}
    }catch(e){pages.push({url:link,status:0,error:String(e.message),links:[],facts:[],title:'',description:'',textLength:0,renderCompare:{status:'unverified',reason:'请求失败'}});}
    onProgress?.({count:pages.length,max,url:link});
  }
  const base={version:'site-audit/0.8',start,generatedAt:new Date().toISOString(),pages,skipped,robots,sitemap,sitemapUrls,limits:{maxPages:max,readOnly:true,sameOrigin:true,queryLimit:'只确认已抓取样本；不表示站点完整索引'},
    caveats:['本地抓取与搜索引擎抓取结果不一定相同','只有成功执行真实渲染对比的页面才有 SSR/CSR 证据','Sitemap 中未扫描的 URL 不代表不存在或有错误','不存在可验证的 GEO 保证排名或 AI 引用公式']};
  Object.assign(base,analyzeCrawl(base));base.contentReview=contentReview(base);
  return base;
}
function markdown(a){if(!a)return '# ShipCheck Search Lab\n\n尚未扫描';const s=a.stats||{},lines=['# ShipCheck Search Lab · 全站 SEO / GEO 验收','','- 站点：'+a.start,'- 时间：'+a.generatedAt,
  `- 覆盖：${s.pagesCrawled||0} 页面；源 HTML/浏览器已对照 ${s.renderVerified||0} 页；待复核问题 ${a.findings?.length||0}`,
  '- Google 实际索引：未从此检查确认；AI 平台引用：未从此检查确认','','## 优先核查'];
  for(const i of a.findings||[])lines.push(`- **[${i.severity}] ${i.title}** (${i.scope})\n  - 证据：${i.evidence}\n  - 页面：${i.urls.map(pathOf).join(', ')}\n  - 建议：${i.advice}`);
  if(!a.findings?.length)lines.push('- 本次已抓取样本中未发现规则性关系异常；不等于 SEO 已全部合格。');
  lines.push('','## 页级 SSR/CSR 检查');for(const p of a.pages||[])lines.push(`- ${p.url}: HTTP ${p.status||'未知'}，${p.renderCompare?.status||'unverified'}；${p.renderCompare?.reason||p.error||''}`);
  lines.push('','## 内容及 GEO 证据复核');for(const p of a.contentReview?.checks||[])lines.push(`- ${p.url}: ${p.pageType}；${p.observations.join('；')||'未提示必须修改的问题'}`);
  lines.push('','## 覆盖限制',...(a.caveats||[]).map(x=>'- '+x));return lines.join('\n');
}
function agentTask(a){const lines=['# ShipCheck Search Lab · 可复核优化任务','',`- 站点：${a?.start||'未提供'}`,'- 约束：只修改有证据的问题，不编造认证、MOQ、规格、引用或 AI 搜索曝光。',''];for(const x of a?.findings||[])lines.push(`## ${x.title}\n- 证据：${x.evidence}\n- URL：${x.urls.join(', ')}\n- 建议：${x.advice}\n- 验收：再次真实抓取对应 URL，附 HTTP/HTML/DOM 证据并检查回归。\n`);
  lines.push('## 仍需人工或平台验证','- Google Search Console / Bing Webmaster 数据不能凭 DOM 推断。','- 任何 AI 内容建议需与项目资料、页面事实和客户实际产品一致。');return lines.join('\n');}
return {canonicalUrl,sameOrigin,safeAuditUrl,extractPage,parseRobots,robotRestriction,parseSitemap,compareRendering,analyzeCrawl,contentReview,crawlSite,markdown,agentTask};
});
