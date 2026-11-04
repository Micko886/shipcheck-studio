'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const V=require('../src/studio/visual-evidence.js');
const url='https://example.com/products/?utm_source=test';
const time='2026-11-04T22:00:00.000Z';
const scan={url,time,visual:{available:true,mode:'single',currentTime:time},viewports:[{clientWidth:390}]};
const base={
  'https://example.com/products/':{time,thumb:'data:image/jpeg;base64,AAA',thumbs:{'当前视口':'data:image/jpeg;base64,AAA'},viewportWidth:1260}
};

test('workspace resolves real screenshot data from local baseline rather than absent scan.visual.after',()=>{
  assert.equal(scan.visual.after,undefined);
  const evidence=V.resolve(scan,base,'current');
  assert.equal(evidence.src,base['https://example.com/products/'].thumb);
  assert.equal(evidence.width,1260);
  assert.match(evidence.label,/1260px/);
});
test('old single-viewport screenshot can render but cannot guess marker coordinates',()=>{
  const old={...base,'https://example.com/products/':{...base['https://example.com/products/'],viewportWidth:undefined}};
  const evidence=V.resolve(scan,old,'current');
  assert.ok(evidence.src);assert.equal(evidence.width,0);
});
test('switching device without exact viewport screenshot displays action instead of mislabeling current screenshot',()=>{
  const evidence=V.resolve(scan,base,'390px');
  assert.equal(evidence.src,'');assert.match(evidence.reason,/debugger/);
});
test('rendered mobile screenshot uses precise pixel width and current button discloses its actual viewport',()=>{
  const multi={...scan,visual:{available:true,mode:'multi',currentTime:time,shots:[{label:'390px'},{label:'768px'}]}};
  const images={'https://example.com/products/':{time,thumb:'other',thumbs:{'390px':'mobile','768px':'tablet'}}};
  assert.deepEqual(V.resolve(multi,images,'390px').width,390);
  assert.equal(V.resolve(multi,images,'768px').src,'tablet');
  assert.match(V.resolve(multi,images,'current').label,/390px/);
});
test('never display stale screenshot from another scan for the same path',()=>{
  const newer={'https://example.com/products/':{...base['https://example.com/products/'],time:'2026-11-05T22:00:00.000Z'}};
  const evidence=V.resolve(scan,newer,'current');
  assert.equal(evidence.src,'');assert.match(evidence.reason,/更新/);
});
test('failed screenshot or disabled setting does not reuse previous baseline as valid proof',()=>{
  const failed={...scan,visual:{available:false,reason:'无法捕获截图：Access denied'}};
  assert.equal(V.resolve(failed,base,'current').src,'');
  assert.match(V.resolve(failed,base,'current').reason,/Access denied/);
});
test('workspace HTML loads screenshot resolver before the workspace controller',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../src/studio/workspace.html'),'utf8');
  assert.ok(html.indexOf('visual-evidence.js')<html.indexOf('workspace.js'));
});
