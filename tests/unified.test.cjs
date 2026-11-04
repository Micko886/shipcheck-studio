'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const technical=require('../src/studio/technical-audit.js');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');

test('single primary call-to-action runs unified site audit, with quick page retest secondary',()=>{
 const html=read('src/sidepanel/index.html');
 const js=read('src/sidepanel/app.js');
 assert.match(html,/id="btn-scan"[^]*一键扫描全站/);
 assert.match(html,/id="btn-site-scan"[^]*仅扫/);
 assert.match(js, /btn-scan'\)\.addEventListener\('click', startUnifiedScan\)/);
 assert.match(js, /runSiteAudit\(\{url,maxPages:cap,seedUrls:renderedSeeds/);
 assert.match(js,/ShipCheckTechnical\.compareRendering\(page,await renderedForTab\(targetId\)\)/);
});

test('navigation exposes visible arrows and scrolling without hiding tabs',()=>{
 const html=read('src/sidepanel/index.html');
 const css=read('src/sidepanel/style.css');
 const js=read('src/sidepanel/app.js');
 assert.match(html,/id="tab-prev"/);
 assert.match(html,/id="tab-next"/);
 assert.match(css,/touch-action:pan-x/);
 assert.match(js,/function initTabScrolling\(/);
 assert.match(js,/scrollIntoView\(\{block:'nearest',inline:'center'/);
});

test('rendered SPA links can seed crawl safely; mutation and cross-origin URLs are excluded',async()=>{
 const base='https://example.com/';
 const visited=[];
 const fetcher=async u=>{
   visited.push(u);
   if(u.endsWith('/robots.txt')||u.endsWith('/sitemap.xml'))return {url:u,status:404,body:'',contentType:'text/plain',headers:{}};
   return {url:u,status:200,body:'<html></html>',contentType:'text/html',headers:{}};
 };
 const extract=async(_html,url)=>({url,title:'Unique '+url,description:'',h1:['Test'],lang:'en',textLength:550,textSample:'Real content',firstParagraph:'Real content',canonicals:[url],hreflang:[],links:[],robots:[],noindex:false,schema:[],schemaErrors:[],facts:[],questionHeaders:[],aboutLinks:[]});
 const xmlExtract=async()=>({urls:[],nested:[],error:null});
 const a=await technical.crawlSite({url:base,maxPages:20,fetcher,extract,xmlExtract,
   seedUrls:['https://example.com/js-route','https://example.com/logout','https://example.com/checkout','https://evil.example.com/x'],
   rendered:async()=>null});
 assert.deepEqual(a.pages.map(p=>p.url),['https://example.com/','https://example.com/js-route']);
 assert.ok(!visited.some(u=>/logout|checkout|evil/.test(u)));
 assert.equal(a.stats.pagesCrawled,2);
 assert.equal(a.stats.confirmedIndexing,null);
 assert.equal(a.stats.aiCitations,null);
});
