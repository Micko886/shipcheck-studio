/* Local CSV/JSON Search Console & Bing report importer. No credentials or network calls. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ShipCheckPerformance=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function parseCSV(raw){const result=[];let field='',row=[],q=false;for(let i=0;i<raw.length;i++){
 const c=raw[i];if(q){if(c==='"'&&raw[i+1]==='"'){field+='"';i++;}else if(c==='"')q=false;else field+=c;}
 else if(c==='"')q=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));result.push(row);row=[];field='';}else field+=c;
}if(row.length||field){row.push(field.replace(/\r$/,''));result.push(row);}const headings=(result.shift()||[]).map(x=>x.trim().toLowerCase());return result.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headings.map((h,i)=>[h,r[i]||''])));}
function read(input){let arr;if(typeof input==='string'){try{arr=JSON.parse(input);}catch{arr=parseCSV(input);}}else arr=input;
 if(!Array.isArray(arr)){arr=arr?.rows||arr?.d||null;}if(!Array.isArray(arr))throw new Error('只支持包含行数据的 CSV/JSON');
 const rows=arr.slice(0,5000).map(x=>{
  const label=String(x.label||x.page||x.query||x.Page||x.Query||x.keys?.[0]||x['top pages']||x['top queries']||'').trim();
  const clicks=Number(x.clicks??x.Clicks??0)||0,impressions=Number(x.impressions??x.Impressions??0)||0;
  const pos=Number(x.position??x.Position??x['average position']??x.AvgImpressionPosition);
  return {label,clicks,impressions,ctr:impressions?clicks/impressions:0,position:Number.isFinite(pos)?pos:null};
 }).filter(x=>x.label);
 return {rows,summary:{count:rows.length,clicks:rows.reduce((s,r)=>s+r.clicks,0),impressions:rows.reduce((s,r)=>s+r.impressions,0)},
  limitations:['这份数据来自用户导入文件，日期、来源及完整性未被插件验证','不等于全部网址已被索引，也不包含 AI 平台引用证明']};
}
return {read,parseCSV};
});
