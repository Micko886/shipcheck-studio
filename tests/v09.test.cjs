'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const P=require('../docs/legacy/v0.9.0-pagespeed.js');const X=require('../src/content/issue-explainer.js');const C=require('../src/studio/core.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const sample={id:'https://example.com/',lighthouseResult:{lighthouseVersion:'12.5.0',categories:{performance:{score:.72,auditRefs:[{id:'unused-javascript',weight:1}]},accessibility:{score:.95,auditRefs:[]},'best-practices':{score:.89,auditRefs:[]},seo:{score:1,auditRefs:[]}},audits:{'first-contentful-paint':{displayValue:'1.8 s',numericValue:1800},'largest-contentful-paint':{displayValue:'3.1 s',numericValue:3100},'unused-javascript':{title:'Reduce unused JavaScript',score:.3,description:'Remove unused JavaScript to reduce bytes',displayValue:'160 KiB'}}},loadingExperience:{metrics:{LARGEST_CONTENTFUL_PAINT_MS:{percentile:2800,category:'AVERAGE'},INTERACTION_TO_NEXT_PAINT:{percentile:180,category:'FAST'}}}};
test('PageSpeed adapter uses the official API with all four categories and both device strategies',()=>{
 const url=P.buildURL('https://example.com/product/','mobile');const u=new URL(url);
 assert.equal(u.host,'www.googleapis.com');assert.equal(u.searchParams.get('strategy'),'mobile');assert.deepEqual(u.searchParams.getAll('category'),['performance','accessibility','best-practices','seo']);
 assert.equal(new URL(P.buildURL('https://example.com/','desktop')).searchParams.get('strategy'),'desktop');
});
test('PageSpeed refuses private/internal URL and embedded credentials',()=>{
 for(const u of ['http://localhost:8080','http://127.0.0.1','http://192.168.1.8','http://172.16.0.2','ftp://example.com','https://a:b@example.com'])assert.throws(()=>P.validURL(u));
});
test('PageSpeed separates Lighthouse lab score from optional CrUX field data and actionable audits',()=>{
 const r=P.parse(sample,'mobile','https://example.com');assert.equal(r.scores.performance,72);assert.equal(r.scores.accessibility,95);assert.equal(r.field.find(x=>x.label==='INP').value,180);assert.match(r.recommendations[0].advice,/代码分包|按需加载/);assert.match(r.lab.find(x=>x.id==='largest-contentful-paint').value,/3.1/);
 const blank=P.parse({lighthouseResult:sample.lighthouseResult},'desktop','https://example.com');assert.equal(blank.field.length,0);assert.equal(blank.scores.performance,72);
});
test('Google API errors do not fabricate a 0 score',async()=>{
 await assert.rejects(()=>P.query('https://example.com','mobile',{fetcher:async()=>({ok:false,status:429,json:async()=>({error:{message:'Quota exceeded'}})})}),/429.*Quota/);
});
test('axe region is immediately described in Chinese, with exact selector, reason, fix and best-practice nuance',()=>{
 const f=X.explain({id:'region',impact:'moderate',nodeCount:2,nodes:[{target:['#outside'],html:'<div id="outside">Contact us</div>',summary:'Element is not contained by a landmark'}]});
 assert.match(f.title,/语义地标/);assert.equal(f.selector,'#outside');assert.match(f.reason,/屏幕阅读器/);assert.match(f.solution,/<main>/);assert.match(f.reason,/最佳实践/);assert.equal(f.affectedCount,2);
});
test('plugin UI does not render manual Delivery Readiness controls and contains first-glance issue explanation',()=>{
 const html=read('src/sidepanel/index.html'),panel=read('src/studio/panel.js'),workspace=read('src/studio/workspace.html'),app=read('src/sidepanel/app.js');
 assert.match(html,/速度 \/ CWV/);assert.match(html,/local-lighthouse-panel\.js/);assert.doesNotMatch(html,/项目验收<\/button>/);
 assert.doesNotMatch(panel,/通过（人工确认）|失败（人工确认）/);assert.doesNotMatch(workspace,/id="add-check"|id="rebuild-plan"/);
 assert.match(app,/为什么报错/);assert.match(app,/如何修复/);assert.match(app,/issue-explainer\.js/);
 const s=C.makeProject({url:'https://example.com/'});assert(!s.checks.some(c=>c.kind==='manual'));
});
