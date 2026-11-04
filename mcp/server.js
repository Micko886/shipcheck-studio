#!/usr/bin/env node
/** ShipCheck MCP + CI · zero-dependency Node 22+ stdio server.
 * Tools: shipcheck_scan, shipcheck_verify, shipcheck_screenshot. Read-only page testing.
 */
'use strict';
const fs=require('node:fs');
const {runCDPScan}=require('./cdp.js');
const {advancedCrawl}=require('./advanced-crawl.js');
const technical=require('../src/studio/technical-audit.js');
const {readSearchData}=require('./search-connectors.js');
const {reviewWithModel}=require('./semantic-review.js');
let last=null;
const meta={name:'shipcheck',version:'0.7.0'};
function listTools(){return [
  {name:'shipcheck_site_audit',description:'Bounded same-origin technical SEO crawl: raw HTML vs rendered HTML, robots, sitemap, canonical/hreflang reciprocity, links and evidence-based content review. No search index guarantees.',inputSchema:{type:'object',properties:{url:{type:'string'},maxPages:{type:'integer',minimum:1,maximum:20},sourceOnly:{type:'boolean'}},required:['url']}},
  {name:'shipcheck_search_data',description:'Read authenticated Google Search Console and Bing Webmaster data via process environment credentials. If no credentials exist, returns not_connected; no fake indexing claims.',inputSchema:{type:'object',properties:{property:{type:'string'},startDate:{type:'string'},endDate:{type:'string'},inspectUrl:{type:'string'},providers:{type:'array',items:{type:'string',enum:['google','bing']}}},required:['property']}},
  {name:'shipcheck_content_review',description:'Optional external AI evidence review of up to 5 publicly visible pages. Requires explicit confirmation and SHIPCHECK_AI_* environment secrets; never enabled by default.',inputSchema:{type:'object',properties:{url:{type:'string'},goal:{type:'string'},maxPages:{type:'integer',minimum:1,maximum:5},confirmExternalUpload:{type:'boolean'}},required:['url','confirmExternalUpload']}},
  {name:'shipcheck_scan',description:'Read-only website QA scan at real Chrome viewports. Returns evidence, DOM selectors and acceptance limitations. Never submits forms or checks out.',inputSchema:{type:'object',properties:{url:{type:'string',description:'http/https address'},widths:{type:'array',items:{type:'integer'},description:'Example [390,768,1440]'}},required:['url']}},
  {name:'shipcheck_verify',description:'Run the same QA scan again and compare issue identities with the preceding scan in this MCP process. Only issues absent on rescan are called resolved.',inputSchema:{type:'object',properties:{url:{type:'string'},widths:{type:'array',items:{type:'integer'}}}}},
  {name:'shipcheck_screenshot',description:'Capture a screenshot of a publicly reachable page at a specified viewport width, returning a PNG image.',inputSchema:{type:'object',properties:{url:{type:'string'},width:{type:'integer'}} ,required:['url']}}
];}
function key(f){return f.rule+'|'+(f.selector||'')}
function compare(current,old){if(!old||current.url!==old.url)return {hasPrevious:false};
  const a=new Map(old.findings.filter(f=>!f.verification).map(f=>[key(f),f]));
  const b=new Map(current.findings.filter(f=>!f.verification).map(f=>[key(f),f]));
  return {hasPrevious:true,previousScore:old.score,scoreDelta:current.score-old.score,
    resolved:[...a].filter(([k])=>!b.has(k)).map(([,f])=>({rule:f.rule,selector:f.selector,title:f.title})),
    newIssues:[...b].filter(([k])=>!a.has(k)).map(([,f])=>({rule:f.rule,selector:f.selector,title:f.title})),
    persistent:[...b].filter(([k])=>a.has(k)).map(([,f])=>({rule:f.rule,selector:f.selector,title:f.title}))};
}
async function callTool(name,args){
  const opt=args||{},url=opt.url || (last&&last.url),widths=opt.widths||[390,768,1440];
  if(name==='shipcheck_search_data'){const data=await readSearchData({property:opt.property,startDate:opt.startDate,endDate:opt.endDate,inspectUrl:opt.inspectUrl,providers:opt.providers||['google','bing']});return {content:[{type:'text',text:JSON.stringify(data,null,2)}],isError:false};}
  if(name==='shipcheck_site_audit'){if(!url)throw new Error('url is required');const audit=await advancedCrawl(url,{maxPages:opt.maxPages||8,sourceOnly:!!opt.sourceOnly});return {content:[{type:'text',text:JSON.stringify(audit,null,2)}],isError:false};}
  if(name==='shipcheck_content_review'){if(!url)throw new Error('url is required');if(opt.confirmExternalUpload!==true)throw new Error('Explicit user confirmation is required');const audit=await advancedCrawl(url,{maxPages:Math.min(opt.maxPages||3,5),sourceOnly:true});const review=await reviewWithModel(audit,{confirmExternalUpload:true,goal:opt.goal});return {content:[{type:'text',text:JSON.stringify({site:url,review},null,2)}],isError:false};}
  if(!url)throw new Error('URL is required for first scan');
  if(name==='shipcheck_scan'||name==='shipcheck_verify'){
    const {scan}=await runCDPScan(url,widths);
    scan.diff=compare(scan,last);last=scan;
    return {content:[{type:'text',text:JSON.stringify(scan,null,2)}],isError:false};
  }
  if(name==='shipcheck_screenshot'){
    const width=Number(opt.width)||390;
    const {scan,screenshot}=await runCDPScan(url,[width],{screenshot:true});
    return {content:[{type:'text',text:'Read-only Chrome screenshot: '+scan.url+', viewport '+width+'px.'},{type:'image',data:screenshot,mimeType:'image/png'}],isError:false};
  }
  throw new Error('Unknown tool: '+name);
}
function send(msg){const body=Buffer.from(JSON.stringify(msg),'utf8');process.stdout.write('Content-Length: '+body.length+'\r\n\r\n');process.stdout.write(body);}
let buffer=Buffer.alloc(0),busy=Promise.resolve();
function read(){while(true){const sep=buffer.indexOf('\r\n\r\n');if(sep===-1)return;const head=buffer.subarray(0,sep).toString('ascii');const match=/Content-Length:\s*(\d+)/i.exec(head);if(!match){buffer=buffer.subarray(sep+4);continue;}
  const len=Number(match[1]);if(!Number.isFinite(len)||len>20*1024*1024){process.stderr.write('Request too large\n');process.exitCode=1;return;}
  if(buffer.length<sep+4+len)return;
  const body=buffer.subarray(sep+4,sep+4+len).toString('utf8');buffer=buffer.subarray(sep+4+len);
  busy=busy.then(async()=>{let req;try{req=JSON.parse(body);}catch(e){return;}
    if(!('id'in req))return;
    const base={jsonrpc:'2.0',id:req.id};
    try{
      if(req.method==='initialize')send({...base,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:meta}});
      else if(req.method==='ping')send({...base,result:{}});
      else if(req.method==='tools/list')send({...base,result:{tools:listTools()}});
      else if(req.method==='tools/call'){
        const args=req.params||{};send({...base,result:await callTool(args.name,args.arguments||{})});
      }else send({...base,error:{code:-32601,message:'Method not found: '+req.method}});
    }catch(e){send({...base,error:{code:-32000,message:String(e.message||e)}});}
  }).catch(e=>process.stderr.write('MCP server error: '+String(e)+'\n'));
}}
async function cli(args){
  if(args.includes('--site-audit')){
    const ix=args.indexOf('--site-audit'),url=args[ix+1];if(!url)throw new Error('Usage: --site-audit https://example.com --max-pages 8 [--source-only] [--json result.json]');
    const n=args.indexOf('--max-pages'),maxPages=n<0?8:Number(args[n+1]);const audit=await advancedCrawl(url,{maxPages,sourceOnly:args.includes('--source-only')});
    const out=args.indexOf('--json');if(out>=0&&args[out+1])fs.writeFileSync(args[out+1],JSON.stringify(audit,null,2));
    const md=args.indexOf('--md');if(md>=0&&args[md+1])fs.writeFileSync(args[md+1],technical.markdown(audit));
    process.stdout.write(JSON.stringify({url:audit.start,stats:audit.stats,findings:audit.findings.length,json:out>=0?args[out+1]:null,markdown:md>=0?args[md+1]:null})+'\n');return;
  }
  if(args.includes('--search-data')){const ix=args.indexOf('--search-data'),property=args[ix+1];if(!property)throw new Error('Property required');
    const from=args.indexOf('--from'),to=args.indexOf('--to'),inspect=args.indexOf('--inspect');const data=await readSearchData({property,startDate:from<0?undefined:args[from+1],endDate:to<0?undefined:args[to+1],inspectUrl:inspect<0?undefined:args[inspect+1]});
    const out=args.indexOf('--json');if(out>=0&&args[out+1])fs.writeFileSync(args[out+1],JSON.stringify(data,null,2));process.stdout.write(JSON.stringify(data,null,2)+'\n');return;
  }
  const ix=args.indexOf('--ci');const url=args[ix+1];
  if(!url)throw new Error('Usage: node mcp/server.js --ci https://example.com --min-score 80 --fail-on high --json result.json');
  const minArg=args.indexOf('--min-score');const minScore=minArg!==-1?Number(args[minArg+1]):0;
  const failArg=args.indexOf('--fail-on');const failOn=failArg!==-1?args[failArg+1]:'critical';
  const jsonArg=args.indexOf('--json');const outfile=jsonArg!==-1?args[jsonArg+1]:null;
  const {scan}=await runCDPScan(url);
  if(outfile)fs.writeFileSync(outfile,JSON.stringify(scan,null,2));
  const threshold={'critical':1,high:2,medium:3,low:4,never:0};
  const sev={critical:1,high:2,medium:3,low:4};
  const bad=scan.findings.filter(f=>!f.verification&&threshold[failOn]&&sev[f.severity]<=threshold[failOn]);
  process.stderr.write(`ShipCheck ${scan.url} · score ${scan.score}/100 · issues ${scan.counts.total} · blockers ${bad.length}\n`);
  process.stdout.write(JSON.stringify({score:scan.score,issues:scan.counts.total,blockingIssues:bad.length,url:scan.url})+'\n');
  if(scan.score<minScore||bad.length)process.exitCode=1;
}
if(require.main===module){if(process.argv.includes('--ci')||process.argv.includes('--site-audit')||process.argv.includes('--search-data'))cli(process.argv.slice(2)).catch(e=>{process.stderr.write(String(e.stack||e)+'\n');process.exitCode=2;});
  else {process.stdin.on('data',d=>{buffer=Buffer.concat([buffer,d]);read();});process.stdin.resume();}}
module.exports={callTool,compare,listTools};
