'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const C=require('../src/studio/core.js');
function scan(findings=[],extra={}){return {url:'https://factory.example.com/',title:'OEM Wholesale Manufacturer',findings,modules:{responsive:true,interaction:true,visual:true,a11y:true,seo:true,business:true},viewports:[{width:390,blocked:false},{width:768,blocked:false}],...extra};}

test('project inference recognizes manufacturing and labels uncertainty',()=>{
 const x=C.makeProject(scan());assert.equal(x.type,'b2b');assert.equal(x.confirmed,false);assert.match(x.goal,/询盘/);
});
test('default plan has no manual acceptance tasks',()=>{
 const x=C.makeProject(scan());assert.equal(x.checks.filter(c=>c.kind==='manual').length,0);
 const v=C.readiness(x,scan());assert.equal(v.verdict,'scanned');
});
test('critical issues are findings, not artificial Delivery Readiness failure',()=>{
 const s=scan([{rule:'H_OVERFLOW',severity:'critical',verification:false,title:'横向溢出'}]);const x=C.makeProject(s);const r=C.readiness(x,s);
 assert.equal(r.verdict,'issues_found');assert.equal(r.checks.find(c=>c.id==='responsive').result.status,'fail');
});
test('blocked viewport is unverified rather than passed',()=>{
 const s=scan([],{viewports:[{width:390,blocked:true}]});const x=C.makeProject(s);const v=C.readiness(x,s);assert.equal(v.checks.find(c=>c.id==='responsive').result.status,'unverified');
});
test('legacy saved manual criteria are dropped on project migration',()=>{
 const s=scan();const x=C.makeProject(s,{type:'b2b',checks:[{id:'flow-contact',kind:'manual',status:'pass',title:'人工确认'}]});
 assert.equal(x.checks.some(c=>c.kind==='manual'),false);
});
test('disabled module cannot be declared passing',()=>{
 const s=scan([],{modules:{responsive:false,interaction:false,visual:false,a11y:false,seo:false,business:false}});const x=C.makeProject(s);
 assert.equal(C.readiness(x,s).checks.find(c=>c.id==='links').result.status,'unverified');
});
test('repair task includes evidence, constraints and retest',()=>{
 const s=scan([{rule:'H_OVERFLOW',title:'页面横向溢出',severity:'high',selector:'.hero',evidence:['超过50px'],retest:['修复横向滚动']}]);
 const x=C.makeProject(s);const p=C.repairPrompt(s.findings[0],s,x);assert.match(p,/超过50px/);assert.match(p,/不能|不允许/);assert.match(p,/修复横向滚动/);
});
test('automatic report is not a business-process certification',()=>{
 const s=scan([],{searchReadiness:{summary:{pass:6,attention:0,unverified:4}}});const x=C.makeProject(s);
 assert.equal(C.readiness(x,s).verdict,'scanned');assert.match(C.acceptanceMarkdown(x,s),/仅代表已执行的自动检查/);
});
