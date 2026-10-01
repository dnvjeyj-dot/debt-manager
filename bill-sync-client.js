(function(){
'use strict';
const DATA='debt_manager_hosted_v1',MAP='debt_manager_card_map_v1',CFG='debt_manager_bill_sync_config_v1',PENDING='debt_manager_bill_sync_pending_v1',REPORT='debt_manager_bill_sync_report_v1',BACKUP='debt_manager_before_bill_sync_v1';
const ROOT='https://dnvjeyj-dot.github.io/debt-manager/',SERVICE='https://debt-statement-sync.hatchable.site/connect.html';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch(_){return fallback}};
const config=()=>read(CFG,{});
const b64=a=>btoa(Array.from(new Uint8Array(a),x=>String.fromCharCode(x)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const un64=s=>{if(typeof s!=='string'||s.length>300000||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('同步响应格式异常');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0))};
async function keyStore(value,remove){
 return new Promise((resolve,reject)=>{
  let settled=false;
  const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);reject(Error('本机配对密钥读写失败，请关闭其他配对页面后重试；不要清除账本数据'));};
  const timer=setTimeout(fail,6000);
  let r;try{r=indexedDB.open('debt_manager_sync_keys_v1',1)}catch(_){fail();return;}
  r.onupgradeneeded=()=>r.result.createObjectStore('keys');r.onerror=fail;r.onblocked=fail;
  r.onsuccess=()=>{
   const db=r.result;if(settled){db.close();return;}
   try{
    const tx=db.transaction('keys',value||remove?'readwrite':'readonly'),s=tx.objectStore('keys');
    const q=remove?s.delete('device'):value?s.put(value,'device'):s.get('device');let result;
    q.onsuccess=()=>result=q.result;
    tx.oncomplete=()=>{db.close();if(!settled){settled=true;clearTimeout(timer);resolve(result)}};
    tx.onerror=tx.onabort=()=>{db.close();fail()};
   }catch(_){db.close();fail();}
  };
 });
}
function book(){const raw=localStorage.getItem(DATA);if(!raw)throw Error('这个浏览器没有本机账本，请从原来的 Safari 入口打开');let d;try{d=JSON.parse(raw)}catch(_){throw Error('本机账本无法解析，未写入')};if(!d||!Array.isArray(d.cards)||!Array.isArray(d.debts)||!Array.isArray(d.receivables)||!d.cards.length)throw Error('当前浏览器没有信用卡数据，不会创建或覆盖账本');return {raw,data:d};}
async function begin(mode,renew){
 book();
 if(location.origin!=='https://dnvjeyj-dot.github.io'||!location.pathname.startsWith('/debt-manager/'))throw Error('请从原债务管理器网址开始配对');
 if(!crypto.subtle||!window.indexedDB)throw Error('当前浏览器不支持安全配对');
 let keys=renew?null:await keyStore();let cfg=config();
 if(!keys){const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);keys={privateKey:pair.privateKey,publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey)};await keyStore(keys);cfg={enabled:false};}
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
 const action=cfg.linkId&&!renew?'sync':'pair';
 sessionStorage.setItem(PENDING,JSON.stringify({nonce,mode:mode||'manual',at:Date.now(),action,linkId:cfg.linkId||null}));
 localStorage.setItem(CFG,JSON.stringify({...cfg,lastAttempt:Date.now()}));
 const request={action,nonce,linkId:cfg.linkId||undefined,publicKey:action==='pair'?keys.publicKey:undefined,name:'债务管理器手机'};
 location.replace(SERVICE+'#request='+b64(new TextEncoder().encode(JSON.stringify(request))));
 return false;
}
async function receive(){
 const hash=new URLSearchParams(location.hash.slice(1)),encoded=hash.get('response');if(!encoded)return null;
 history.replaceState(null,'',location.pathname+location.search);
 let pending;try{pending=JSON.parse(sessionStorage.getItem(PENDING)||'null')}catch(_){}
 sessionStorage.removeItem(PENDING);
 if(!pending||Date.now()-pending.at>600000||Date.now()<pending.at)throw Error('同步请求已过期，请重新同步；账本未改动');
 const env=JSON.parse(new TextDecoder().decode(un64(encoded)));
 if(env.version!==1||env.nonce!==pending.nonce)throw Error('同步校验失败，账本未改动');
 const keys=await keyStore();if(!keys)throw Error('本机配对密钥不存在，请重新配对');
 const secret=await crypto.subtle.decrypt({name:'RSA-OAEP'},keys.privateKey,un64(env.key));
 const aes=await crypto.subtle.importKey('raw',secret,{name:'AES-GCM'},false,['decrypt']);
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(env.iv),additionalData:new TextEncoder().encode(pending.nonce)},aes,un64(env.data));
 const payload=JSON.parse(new TextDecoder().decode(clear));
 if(payload.version!==1||payload.nonce!==pending.nonce||!/^[a-f0-9-]{36}$/.test(payload.linkId||'')||Math.abs(Date.now()-Date.parse(payload.issuedAt))>600000||!Number.isFinite(Date.parse(payload.issuedAt))||pending.action==='sync'&&payload.linkId!==pending.linkId||!payload.feed||payload.feed.version!==1)throw Error('账单来源或时效校验失败，账本未改动');
 const current=book();
 const result=window.DebtBillMerge.merge(current.data,read(MAP,{}),payload.feed.items);
 if(result.changed){
  // All calculations are complete. There is no await between re-read and commit.
  const snap={};for(const k of ['cards','debts','receivables','funds','otherAssets','cashflow','planner','audit','monthlyStats','snapshots','history'])snap[k]=current.data[k];
  snap.otherAssets=snap.otherAssets||[];snap.funds=snap.funds||[];
  result.data.undoStack=Array.isArray(result.data.undoStack)?result.data.undoStack:[];
  result.data.undoStack.push({label:'自动同步账单',state:snap});if(result.data.undoStack.length>30)result.data.undoStack.shift();
  const next=JSON.stringify(result.data);
  localStorage.setItem(BACKUP,current.raw);
  if(localStorage.getItem(DATA)!==current.raw)throw Error('另一页面正在修改账本，请重新同步');
  localStorage.setItem(DATA,next);
  if(localStorage.getItem(DATA)!==next)throw Error('账本写入校验失败，请保留备份并停止操作');
 }
 const report={at:new Date().toISOString(),updated:result.updated,results:result.results,lastCheck:payload.feed.lastCheck||null,policy:result.policy};
 localStorage.setItem(REPORT,JSON.stringify(report));
 localStorage.setItem(CFG,JSON.stringify({enabled:true,linkId:payload.linkId,expiresAt:payload.expiresAt,lastAttempt:Date.now(),lastSuccess:Date.now()}));
 if(pending.mode==='startup'){location.replace(ROOT+'?bill_skip=1');return {redirected:true};}
 return report;
}
async function beforeBoot(){
 const params=new URLSearchParams(location.search);if(params.has('bill_skip')){params.delete('bill_skip');history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():'')+location.hash);return true;}
 const cfg=config();
 if(!cfg.enabled||navigator.onLine===false||Date.now()-(cfg.lastAttempt||0)<600000)return true;
 try{return await begin('startup',false)}catch(e){localStorage.setItem(REPORT,JSON.stringify({at:new Date().toISOString(),error:e.message}));return true;}
}
function disable(){const cfg=config();cfg.enabled=false;localStorage.setItem(CFG,JSON.stringify(cfg));sessionStorage.removeItem(PENDING);}
window.DebtBillSync={begin,receive,beforeBoot,disable,config,report:()=>read(REPORT,null),book};
})();
