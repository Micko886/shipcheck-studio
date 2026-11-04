'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http');
const t=require('../src/studio/technical-audit.js');
const perf=require('../src/studio/performance-import.js');
const {fetchSameOrigin,advancedCrawl}=require('../mcp/advanced-crawl.js');
const data=require('../mcp/search-connectors.js');
const {reviewWithModel,scrub}=require('../mcp/semantic-review.js');
const {findChrome}=require('../mcp/cdp.js');
function page(url,overrides={}){return {url,status:200,contentType:'text/html',error:null,title:'Title '+url,description:'',h1:['Hello'],lang:'en',textLength:550,textSample:'Content',firstParagraph:'Content',canonicals:[url],hreflang:[],links:[],robots:[],xRobots:'',noindex:false,schema:[],schemaErrors:[],facts:[],questionHeaders:[],aboutLinks:[],renderCompare:{status:'unverified'},...overrides};}
function audit(pages,sitemapUrls=[]){const a={start:'https://example.com/',pages,sitemapUrls,robots:{rules:[],sitemaps:[]},sitemap:{status:200},caveats:[]};Object.assign(a,t.analyzeCrawl(a));a.contentReview=t.contentReview(a);return a;}

test('canonical URL normalizes fragments and enforces same-origin',()=>{
 assert.equal(t.canonicalUrl('/docs#intro','https://example.com/'),'https://example.com/docs');
 assert.equal(t.sameOrigin('https://other.com/','https://example.com'),null);
});
test('robots longest matching allow rule overrides disallow',()=>{
 const r=t.parseRobots('User-agent: *\nDisallow: /secret\nAllow: /secret/public\nSitemap: https://example.com/sitemap.xml');
 assert.equal(t.robotRestriction(r,'https://example.com/secret/x'),true);
 assert.equal(t.robotRestriction(r,'https://example.com/secret/public/x'),false);
 assert.equal(r.sitemaps.length,1);
});
test('SSR risk only when actually-rendered evidence exists',()=>{
 assert.equal(t.compareRendering({textLength:0},null).status,'unverified');
 assert.equal(t.compareRendering({textLength:35},{textLength:900}).status,'attention');
 assert.equal(t.compareRendering({textLength:450},{textLength:800}).status,'pass');
 assert.equal(t.compareRendering({textLength:35},{textLength:45}).status,'unverified');
});
test('crawl graph detects broken link, reciprocal hreflang and orphan candidate',()=>{
 const a='https://example.com/',b='https://example.com/de/',missing='https://example.com/404';
 const r=audit([page(a,{hreflang:[{lang:'de',href:b}],links:[b,missing]}),page(b,{links:[missing]}),page(missing,{status:404})],[b]);
 assert.ok(r.findings.some(x=>x.title.includes('hreflang')));
 assert.ok(r.findings.some(x=>x.title.includes('内部链接')));
 assert.ok(r.findings.some(x=>x.title.includes('HTTP 404')));
 assert.equal(r.stats.confirmedIndexing,null);
});
test('different MOQ values are review hints, not verified contradictions',()=>{
 const r=audit([page('https://example.com/a',{facts:[{type:'moq',quote:'MOQ 100 standard'}]}),page('https://example.com/b',{facts:[{type:'moq',quote:'MOQ 1000 custom'}]})]);
 const found=r.findings.find(x=>x.id==='moq-review');assert.equal(found.severity,'low');assert.match(found.advice,/标准款/);
});
test('duplicate titles are detected only across fetched pages',()=>{
 const r=audit([page('https://example.com/a',{title:'Same title'}),page('https://example.com/b',{title:'Same title'})]);
 assert.ok(r.findings.some(x=>x.id.startsWith('duplicate-title-')));
});
test('no search ranking or AI citation score in report',()=>{
 const r=audit([page('https://example.com/')]);r.generatedAt='2026-11-04';
 assert.equal(r.stats.aiCitations,null);assert.match(t.markdown(r),/AI 平台引用/);
 assert.match(t.agentTask(r),/不编造/);
});
test('CSV importer handles quoted commas and GSC fields',()=>{
 const d=perf.read('Page,Clicks,Impressions,Position\n"https://site.com/a,b",12,200,5\n');
 assert.equal(d.rows[0].label,'https://site.com/a,b');assert.equal(d.summary.clicks,12);
});
test('missing credentials reports not_connected, never zero impressions',async()=>{
 const x=await data.googleSearchConsole({property:'https://example.com/',token:''});assert.equal(x.status,'not_connected');
 const y=await data.bingWebmaster({property:'https://example.com/',apiKey:''});assert.equal(y.status,'not_connected');
});
test('GSC read-only OAuth request uses official API and normalized page metrics',async()=>{
 const calls=[];const fn=async(u,opt)=>{calls.push({url:u,options:opt});return new Response(JSON.stringify({rows:[{keys:['https://example.com/p'],clicks:4,impressions:50,ctr:0.08,position:8}]}),{status:200});};
 const result=await data.googleSearchConsole({property:'https://example.com/',token:'MY_SECRET',startDate:'2026-10-01',endDate:'2026-10-29',fetchImpl:fn});
 assert.equal(result.rows[0].clicks,4);assert.match(calls[0].url,/googleapis.com\/webmasters/);
 assert.equal(calls[0].options.headers.Authorization,'Bearer MY_SECRET');assert.equal(JSON.stringify(result).includes('MY_SECRET'),false);
});
test('Bing uses JSON REST instead of retired pox/soap routes',async()=>{
 const calls=[];const fn=async(u)=>{calls.push(u);return new Response(JSON.stringify({d:[{Query:'https://example.com/a',Clicks:1,Impressions:10}]}),{status:200});};
 const r=await data.bingWebmaster({property:'https://example.com/',apiKey:'secret key',fetchImpl:fn});
 assert.equal(r.rows.length,2);assert.ok(calls.every(u=>u.includes('/json/')));assert.ok(calls.every(u=>!u.includes('/pox/')&&!u.includes('/soap/')));
 assert.equal(JSON.stringify(r).includes('secret key'),false);
});
test('search data import JSON is explicitly labeled unverified',()=>{
 const r=data.importReport(JSON.stringify([{page:'https://example.com',clicks:5,impressions:45}]));
 assert.equal(r.rows[0].ctr,5/45);assert.match(r.source,/用户/);
});
test('semantic model requires affirmative consent and redacts contacts',async()=>{
 const a=audit([page('https://example.com/',{textSample:'contact alice@example.com +1 (415) 555-1234 and specs'})]);
 await assert.rejects(()=>reviewWithModel(a,{confirmExternalUpload:false}),/Explicit/);
 assert.equal(scrub('person@example.com'), '[EMAIL]');
 let req;const mock=async(u,opt)=>{req=JSON.parse(opt.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({observations:[],unverified:[]})}}]}),{status:200});};
 const r=await reviewWithModel(a,{confirmExternalUpload:true,endpoint:'https://api.example.com/v1/chat/completions',model:'test',key:'test-secret',fetchImpl:mock});
 assert.equal(r.sentPages,1);assert.ok(!JSON.stringify(req).includes('alice@example.com'));assert.ok(!JSON.stringify(r).includes('test-secret'));
});
test('same-origin fetch rejects redirected external host before following',async()=>{
 const mock=async()=>new Response('',{status:302,headers:{location:'http://169.254.169.254/metadata'}});
 await assert.rejects(()=>fetchSameOrigin('https://example.com/','https://example.com/',mock),/Cross-origin/);
});
test('live Chromium parser crawls raw HTML locally and marks blocked rendering unverified', {skip:!findChrome()}, async()=>{
 let server;try{
  server=http.createServer((req,res)=>{
   if(req.url==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});res.end('User-agent: *\nAllow: /');return;}
   if(req.url==='/sitemap.xml'){res.writeHead(404);res.end('');return;}
   if(req.url==='/broken'){res.writeHead(404,{'content-type':'text/html'});res.end('<h1>Not found</h1>');return;}
   res.writeHead(200,{'content-type':'text/html'});res.end('<html lang="en"><head><title>Example Test Site</title></head><body><main><h1>Test</h1><p>'+('long enough to be rendered '.repeat(12))+'</p><a href="/broken">Bad link</a></main></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  const result=await advancedCrawl('http://127.0.0.1:'+port+'/',{maxPages:2,sourceOnly:true});
  assert.equal(result.stats.pagesCrawled,2);assert.equal(result.pages[0].title,'Example Test Site');
  assert.equal(result.pages[0].renderCompare.status,'unverified');assert.ok(result.findings.some(f=>f.title.includes('HTTP 404')));
 }finally{await new Promise(r=>server?.close(r));}
});
