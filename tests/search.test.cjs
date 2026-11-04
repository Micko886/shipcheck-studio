
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../src/content/search-audit.js');
function node(attrs={},txt=''){return {textContent:txt,innerText:txt,getAttribute:k=>attrs[k]??null,href:attrs.href||''};}
function doc(overrides={}){
 const lists={
  'h1':[node({},'Industry supplies')],
  'meta[name="robots" i],meta[name="googlebot" i],meta[name="bingbot" i]':[],
  'link[rel~="canonical" i]':[node({href:'https://example.com'})],
  'link[rel~="alternate" i][hreflang]':[],
  'script[type="application/ld+json"]':[node({},'{"@type":"Organization","name":"Test Maker"}')],
  'h2,h3,h4,summary,dt':[],
  'table,dl,[itemprop="additionalProperty"]':[]
 };
 const one={
  'meta[name="description" i]':node({content:'Precision supplier and catalog'}),
  'meta[property="og:site_name" i]':node({content:'Test Maker'}),
  'main, [role="main"], article':node({},'Our MOQ is 100 units with 10 days lead time. Dimensions in mm. '.repeat(5))
 };
 Object.assign(lists,overrides.lists||{});Object.assign(one,overrides.one||{});
 return {title:overrides.title===undefined?'Industrial supplies':overrides.title,URL:'https://example.com',documentElement:node({lang:'en'}),body:node({},'Fallback content '.repeat(20)),querySelectorAll:selector=>lists[selector]||[],querySelector:selector=>one[selector]||null};
}
const w={location:{href:'https://example.com'}};
test('SEO/GEO/AEO audit produces evidence without invented ranking',()=>{
 const x=S.run(doc(),w);assert(x.checks.some(c=>c.group==='geo'));assert(x.checks.some(c=>c.group==='aeo'));
 assert.equal(x.checks.find(c=>c.id==='ai-visibility').status,'unverified');
 assert.equal(x.checks.find(c=>c.id==='jsonld').status,'pass');
 assert.match(S.markdown(x),/不是搜索引擎官方评分/);
 assert.match(S.agentTask(x),/不承诺排名、收录或 AI 引用/);
});
test('explicit noindex is attention rather than automatic SEO failure',()=>{
 const x=S.run(doc({lists:{'meta[name="robots" i],meta[name="googlebot" i],meta[name="bingbot" i]':[node({content:'noindex, follow'})]}}),w);
 assert.equal(x.checks.find(c=>c.id==='index-directive').status,'attention');
});
test('malformed JSON-LD and malformed canonical are flagged, not silently passed',()=>{
 const x=S.run(doc({lists:{'script[type="application/ld+json"]':[node({},'{bad')],'link[rel~="canonical" i]':[node({href:'http://['})]}}),w);
 assert.equal(x.checks.find(c=>c.id==='jsonld').status,'attention');
 assert.equal(x.checks.find(c=>c.id==='canonical').status,'attention');
});
test('empty DOM cannot be called crawlable or indexed',()=>{
 const x=S.run(doc({title:'',lists:{'h1':[]},one:{'main, [role="main"], article':node({},'')}}),w);
 assert.equal(x.checks.find(c=>c.id==='visible-text').status,'attention');
 assert.equal(x.checks.find(c=>c.id==='crawl-validation').status,'unverified');
});
