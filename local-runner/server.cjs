#!/usr/bin/env node
'use strict';
/* ShipCheck local-only Lighthouse runner. Binds 127.0.0.1, authenticated, no cloud relay. */
const http=require('node:http');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {sanitizeJob,parseLHR,loadOrCreateToken,allowedOrigin}=require('./core.cjs');
const PORT=Number(process.env.SHIPCHECK_PORT||48762);
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw new Error('本地端口不正确');
const TOKEN=loadOrCreateToken(__dirname);
const jobs=new Map();let running=false;const queue=[];
const REPORT_DIR=path.join(__dirname,'reports');fs.mkdirSync(REPORT_DIR,{recursive:true});
const LH_CLI=path.join(__dirname,'node_modules','lighthouse','cli','index.js');
function error(res,status,message){respond(res,status,{error:message});}
function respond(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function parseBody(req){return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>32768){reject(new Error('请求过大'));req.destroy();return;}chunks.push(chunk);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('JSON 格式不正确'));}});req.on('error',reject);});}
const lighthouseRun=async(url,strategy,base)=>{
  if(!fs.existsSync(LH_CLI))throw new Error('未安装 Lighthouse。请进入 local-runner 执行 npm install');
  const filename=base+'-'+strategy+'.json';const output=path.join(REPORT_DIR,filename);
  const args=[LH_CLI,url,'--quiet','--output=json','--output-path='+output,'--chrome-flags=--headless --disable-gpu', '--max-wait-for-load=45000'];
  if(strategy==='desktop')args.push('--preset=desktop');
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd:__dirname,env:{...process.env,NO_COLOR:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stderr='';let done=false;
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Lighthouse 单页检测超过 150 秒，请检查 Chrome 或网站加载情况'));},150000);
    child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-2000);});
    child.on('error',e=>{if(!done){done=true;clearTimeout(timer);reject(e);}});
    child.on('close',code=>{if(done)return;done=true;clearTimeout(timer);code===0?resolve():reject(new Error('Lighthouse 退出码 '+code+'：'+stderr.slice(-400)));});
  });
  const raw=JSON.parse(fs.readFileSync(output,'utf8'));
  return {...parseLHR(raw,{url,strategy}),reportFile:'reports/'+filename};
};
function pump(){if(running||!queue.length)return;const job=queue.shift();running=true;job.status='running';job.startedAt=new Date().toISOString();
  (async()=>{
    let number=0;const total=job.params.urls.length*job.params.strategies.length;
    for(const url of job.params.urls)for(const strategy of job.params.strategies){
      const key=crypto.createHash('sha256').update(url+'\0'+strategy).digest('hex').slice(0,16);
      job.stage={url,strategy,index:number+1,total};
      try{job.results.push(await lighthouseRun(url,strategy,job.id+'-'+key));}catch(e){job.results.push({url,strategy,error:String(e?.message||e),source:'local-lighthouse'});}
      number++;job.completed=number;
    }
    job.status='done';job.finishedAt=new Date().toISOString();
  })().catch(e=>{job.status='failed';job.error=String(e.message||e);}).finally(()=>{running=false;pump();});
}
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'';if(!allowedOrigin(origin))return error(res,403,'仅允许 ShipCheck Chrome 插件访问');
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','X-ShipCheck-Token, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');}
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const host=req.headers.host||'';if(!new RegExp('^(127\\.0\\.0\\.1|localhost):'+PORT+'$').test(host))return error(res,403,'只允许本机 Loopback Host');
  const provided=String(req.headers['x-shipcheck-token']||'');
  const a=Buffer.from(provided),b=Buffer.from(TOKEN);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return error(res,401,'本地访问令牌不正确');
  const route=new URL(req.url,'http://127.0.0.1:'+PORT).pathname;
  if(req.method==='GET'&&route==='/health')return respond(res,200,{ok:true,name:'ShipCheck Local Lighthouse',version:'1.0.0',running,queued:queue.length});
  if(req.method==='POST'&&route==='/audit'){
    try{const params=sanitizeJob(await parseBody(req));if(queue.length>=3)return error(res,429,'等待队列已满，请稍后重试');
      const job={id:crypto.randomUUID(),params,status:'queued',createdAt:new Date().toISOString(),completed:0,results:[],stage:null,error:null};jobs.set(job.id,job);
      if(jobs.size>30)for(const [id,j] of jobs)if(j.status==='done'||j.status==='failed'){jobs.delete(id);if(jobs.size<=25)break;}
      queue.push(job);pump();return respond(res,202,{ok:true,jobId:job.id,total:params.urls.length*params.strategies.length});
    }catch(e){return error(res,400,String(e?.message||e));}
  }
  const m=route.match(/^\/jobs\/([a-f0-9-]{36})$/);if(req.method==='GET'&&m){const job=jobs.get(m[1]);return job?respond(res,200,{id:job.id,status:job.status,completed:job.completed,total:job.params.urls.length*job.params.strategies.length,stage:job.stage,results:job.results,error:job.error}):error(res,404,'任务不存在');}
  return error(res,404,'接口不存在');
});
if(require.main===module){server.listen(PORT,'127.0.0.1',()=>{console.log('\nShipCheck 本地 Lighthouse 正在运行： http://127.0.0.1:'+PORT);console.log('访问令牌：'+TOKEN);console.log('粘贴到 Chrome 插件「速度 / CWV」里的本地令牌输入框。');console.log('使用 Ctrl+C 停止；测试报告保存在 local-runner/reports/。\n');});}
module.exports={server};
