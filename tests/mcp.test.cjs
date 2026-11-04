'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const m=require('../mcp/server.js');

test('MCP advertises exactly the implemented read-only tools',()=>{
 const names=m.listTools().map(x=>x.name);
 assert.deepEqual(names,['shipcheck_site_audit','shipcheck_search_data','shipcheck_content_review','shipcheck_scan','shipcheck_verify','shipcheck_screenshot']);
});
test('MCP detects fixed, new and persistent issues with stable identity',()=>{
 const old={url:'https://example.com',score:77,findings:[
  {rule:'H_OVERFLOW',selector:'.hero',title:'溢出',severity:'high'},
  {rule:'EMPTY_LINK',selector:'.cta',title:'空链接',severity:'high'}]};
 const next={url:'https://example.com',score:88,findings:[
  {rule:'EMPTY_LINK',selector:'.cta',title:'空链接',severity:'high'},
  {rule:'IMG_NO_ALT',selector:'.photo',title:'alt缺失',severity:'low'}]};
 const v=m.compare(next,old);assert.equal(v.hasPrevious,true);assert.equal(v.resolved.length,1);assert.equal(v.newIssues.length,1);assert.equal(v.persistent.length,1);assert.equal(v.scoreDelta,11);
});
test('no cross-domain comparison',()=>{
 assert.equal(m.compare({url:'https://other.example/',findings:[]},{url:'https://example.com',findings:[]}).hasPrevious,false);
});
