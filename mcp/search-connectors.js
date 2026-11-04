/** Opt-in, read-only search data connectors. Secrets only from environment; never persisted.
 * GSC: OAuth access token with webmasters.readonly scope. Bing: user API key (JSON REST only).
 */
'use strict';
const fs=require('node:fs');
const http=require('node:fs');
const getDate=days=>new Date(Date.now()-days*86400000).toISOString().slice(0,10);
function validateDate(x){if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||Number.isNaN(Date.parse(x+'T00:00:00Z')))throw new Error('Invalid YYYY-MM-DD date: '+x);return x;}
function validateProperty(p){if(/^sc-domain:[a-z0-9.-]+$/i.test(p))return p;const u=new URL(p);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('Invalid site property');return p;}
async function jsonResponse(url,options,fetchImpl=fetch){
  const r=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  const body=await r.text();let parsed;try{parsed=JSON.parse(body)}catch{throw new Error('Search API returned non-JSON HTTP '+r.status)}
  if(!r.ok)throw new Error('Search API HTTP '+r.status+' '+String(parsed.error?.message||parsed.Message||'').slice(0,160));return parsed;
}
function normalizedRows(provider,data,kind){
  const raw=provider==='bing'?(Array.isArray(data.d)?data.d:[]):Array.isArray(data.rows)?data.rows:[];
  return raw.slice(0,2000).map(r=>{
    const label=provider==='bing'?String(r.Query||r.Page||''):String(r.keys?.[0]||'');
    const clicks=Number(provider==='bing'?r.Clicks:r.clicks)||0,impressions=Number(provider==='bing'?r.Impressions:r.impressions)||0;
    const position=provider==='bing'?Number(r.AvgImpressionPosition??r.AvgClickPosition):Number(r.position);
    return {kind,label,clicks,impressions,ctr:impressions?clicks/impressions:0,position:Number.isFinite(position)?position:null};
  });
}
async function googleSearchConsole({property,startDate,endDate,inspectUrl,token=process.env.SHIPCHECK_GSC_TOKEN,fetchImpl=fetch}){
  if(!token)return {provider:'google',status:'not_connected',note:'未配置 SHIPCHECK_GSC_TOKEN；没有读取任何私人搜索数据'};
  property=validateProperty(property);startDate=validateDate(startDate||getDate(30));endDate=validateDate(endDate||getDate(3));
  if(startDate>endDate)throw new Error('startDate must be earlier than endDate');
  const base='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(property)+'/searchAnalytics/query';
  const opts={method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate,dimensions:['page'],type:'web',rowLimit:250,dataState:'final'})};
  const data=await jsonResponse(base,opts,fetchImpl);
  const result={provider:'google',status:'connected',property,period:{startDate,endDate},source:'GSC Search Analytics / web / page',rows:normalizedRows('google',data,'page'),
    limitations:['结果为可访问资源的汇总表现，不能单独证明所有 URL 已收录','API 可能仅返回主要结果行，不一定包括所有搜索数据','不代表 AI Overviews 的独立曝光或 ChatGPT 引用']};
  if(inspectUrl){
    const u=new URL(inspectUrl);if(!['https:','http:'].includes(u.protocol))throw new Error('Invalid inspection URL');
    const info=await jsonResponse('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',{method:'POST',headers:opts.headers,body:JSON.stringify({inspectionUrl:inspectUrl,siteUrl:property,languageCode:'en-US'})},fetchImpl);
    const status=info.inspectionResult?.indexStatusResult||{};
    result.inspection={url:inspectUrl,coverageState:status.coverageState||null,indexingState:status.indexingState||null,robotsTxtState:status.robotsTxtState||null,
      pageFetchState:status.pageFetchState||null,lastCrawlTime:status.lastCrawlTime||null,verdict:status.verdict||null,
      source:'Google URL Inspection API; describes the Google-indexed version, not a live test'};
  }
  return result;
}
async function bingWebmaster({property,apiKey=process.env.SHIPCHECK_BING_KEY,fetchImpl=fetch}){
  if(!apiKey)return {provider:'bing',status:'not_connected',note:'未配置 SHIPCHECK_BING_KEY；没有读取 Bing Webmaster 数据'};
  property=validateProperty(property);
  const base='https://ssl.bing.com/webmaster/api.svc/json/';
  const rows={};
  for(const [kind,method] of [['query','GetQueryStats'],['page','GetPageStats']]){
    const url=base+method+'?siteUrl='+encodeURIComponent(property)+'&apikey='+encodeURIComponent(apiKey);
    const data=await jsonResponse(url,{method:'GET'},fetchImpl);
    rows[kind]=normalizedRows('bing',data,kind);
  }
  return {provider:'bing',status:'connected',property,source:'Bing Webmaster API JSON/HTTP (not retired POX/SOAP)',rows:[...rows.page,...rows.query],
    limitations:['查询与页面数据可能有延迟或仅包含热门数据','Bing 自然搜索数据不代表 ChatGPT 或其他平台的引用','API Key 只来自进程环境变量，不应出现在配置、日志或仓库']};
}
function parseCSV(raw){const out=[];let current='',row=[],quoted=false;for(let i=0;i<raw.length;i++){
  const c=raw[i];if(quoted){if(c==='"'&&raw[i+1]==='"'){current+='"';i++;}else if(c==='"')quoted=false;else current+=c;}
  else if(c==='"')quoted=true;else if(c===','){row.push(current);current='';}else if(c==='\n'){row.push(current.replace(/\r$/,''));out.push(row);row=[];current='';}else current+=c;
}if(current||row.length){row.push(current.replace(/\r$/,''));out.push(row);}const header=(out.shift()||[]).map(v=>v.trim().toLowerCase());return out.filter(x=>x.some(Boolean)).map(x=>Object.fromEntries(header.map((h,i)=>[h,x[i]||''])));}
function importReport(content,{provider='import',kind='page'}={}){
  let obj;if(typeof content==='string'){try{obj=JSON.parse(content);}catch{obj=parseCSV(content);}}else obj=content;
  if(!Array.isArray(obj)&&obj&&Array.isArray(obj.rows))obj=obj.rows;
  else if(!Array.isArray(obj)&&obj&&Array.isArray(obj.d))obj=obj.d;
  if(!Array.isArray(obj))throw new Error('Unsupported data format: expected CSV or JSON array/rows');
  const rows=obj.slice(0,5000).map(r=>{
    const label=String(r.label||r.page||r.query||r.Page||r.Query||r.keys?.[0]||r['top pages']||r['top queries']||'').trim();
    const clicks=Number(r.clicks??r.Clicks??r['clicks'])||0,impressions=Number(r.impressions??r.Impressions??r['impressions'])||0;
    const p=Number(r.position??r.Position??r['average position']??r.AvgImpressionPosition);
    return {kind:r.kind||kind,label,clicks,impressions,ctr:impressions?clicks/impressions:0,position:Number.isFinite(p)?p:null};
  }).filter(r=>r.label);
  return {provider,status:'imported',source:'用户自行导入的 CSV/JSON（未验证平台来源）',rows,limitations:['导入文件的真实性、日期范围、完整性需要用户自行确认','导入的数据不能被视为实时索引状态，也不证明 AI 引用']};
}
async function readSearchData({property,startDate,endDate,inspectUrl,providers=['google','bing'],fetchImpl}={}){
  if(!property)throw new Error('property is required');const result={generatedAt:new Date().toISOString(),property,providers:{}};
  for(const provider of providers){
    try{result.providers[provider]=provider==='google'?await googleSearchConsole({property,startDate,endDate,inspectUrl,fetchImpl}):
      provider==='bing'?await bingWebmaster({property,fetchImpl}):{status:'unsupported'};
    }catch(e){result.providers[provider]={provider,status:'error',error:String(e.message||e).replace(/apikey=[^&\s]+/ig,'apikey=[REDACTED]')};}
  }
  return result;
}
module.exports={googleSearchConsole,bingWebmaster,readSearchData,importReport,parseCSV,validateProperty,normalizedRows};
