/* Local card spend/payment ledger. Financial data remains in the core app. */
(function(root){
'use strict';
const DATA_KEY='debt_manager_hosted_v1',MAP_KEY='debt_manager_card_map_v1',LEDGER_KEY='debt_manager_card_ledger_v1',VERSION=1;
const TYPES=['spend','pay','refund','installment','interest','fee','adjustment'];
function arr(x){return Array.isArray(x)?x:[]}
function obj(x){return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}
function round2(n){return Math.round((Number(n)+Number.EPSILON)*100)/100}
function num(s){const n=Number(String(s||'').replace(/,/g,''));return Number.isFinite(n)?round2(n):null}
function hash(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
function bank(name){const s=String(name||'').replace(/\s/g,'').replace(/\d+$/,'');const n={CEB:['光大','光大银行','中国光大银行'],CITIC:['中信','中信银行','中信信用卡','中国中信银行'],CMB:['招行','招商','招商银行'],ICBC:['工行','工商','工商银行','中国工商银行'],CIB:['兴业','兴业银行','兴业信用卡','兴业银行信用卡'],CGB:['广发','广发银行'],SPDB:['浦发','浦发银行'],PAB:['平安','平安银行'],BOCOM:['交行','交通银行'],HXB:['华夏','华夏银行']};return Object.keys(n).find(k=>n[k].includes(s))||null}
function typeLabel(t){return {spend:'消费',pay:'还款',refund:'退款',installment:'分期',interest:'利息',fee:'费用',adjustment:'调整'}[t]||'其他'}
function signed(x){if(typeof x.signedAmount==='number')return x.signedAmount;return x.type==='pay'||x.type==='refund'?-(Number(x.amount)||0):Number(x.amount)||0}
function parseHistoryItem(h){
 if(!h||typeof h.title!=='string')return null;
 const m=h.title.match(/^(.+)\s+(刷卡|还款)\s+¥\s*([\d,]+(?:\.\d+)?)$/);if(!m)return null;
 const amount=num(m[3]);if(!(amount>0))return null;
 const note=String(h.note||''),debt=note.match(/欠款\s*¥\s*([\d,]+(?:\.\d+)?)\s*→\s*¥\s*([\d,]+(?:\.\d+)?)/),fund=note.match(/(?:^|\s·\s)从\s+(.+?)\s+扣\s+¥\s*([\d,]+(?:\.\d+)?)(?:\s·\s|$)/);
 let userNote=note;const cut=userNote.indexOf(' · 欠款 ');if(cut>=0)userNote=userNote.slice(0,cut);userNote=userNote.replace(/^\s*·\s*|\s*·\s*$/g,'').trim();
 const time=typeof h.time==='string'&&Number.isFinite(Date.parse(h.time))?new Date(h.time).toISOString():String(h.time||''),sourceKey=hash([time,h.title,note].join('|')),type=m[2]==='刷卡'?'spend':'pay';
 return {id:'h-'+sourceKey,source:'history',sourceLabel:'手工记录',sourceKey,cardName:m[1].trim(),type,amount,signedAmount:type==='pay'?-amount:amount,time,note:userNote,debtBefore:debt?num(debt[1]):null,debtAfter:debt?num(debt[2]):null,fundName:fund?fund[1].trim():null,fundAmount:fund?num(fund[2]):null,archivedAt:new Date().toISOString()};
}
function readLedger(storage){
 const s=storage||root.localStorage;let v={version:VERSION,entries:[],cloudBatchReceipts:[],lastSyncAt:null};
 try{const x=JSON.parse(s.getItem(LEDGER_KEY)||'null');if(x&&x.version===VERSION&&Array.isArray(x.entries))v={...v,...x,cloudBatchReceipts:arr(x.cloudBatchReceipts)}}catch(_){}
 return v;
}
function saveLedger(ledger,storage){const s=storage||root.localStorage;s.setItem(LEDGER_KEY,JSON.stringify(ledger));return ledger}
function sync(data,storage,now){
 const s=storage||root.localStorage,ledger=readLedger(s),seen=new Set(ledger.entries.map(x=>x&&x.sourceKey).filter(Boolean));let added=0;
 for(const h of arr(obj(data).history)){const x=parseHistoryItem(h);if(!x||seen.has(x.sourceKey))continue;ledger.entries.push(x);seen.add(x.sourceKey);added++}
 ledger.entries=ledger.entries.filter(x=>x&&TYPES.includes(x.type)&&typeof x.cardName==='string'&&x.cardName&&Number(x.amount)>0).sort((a,b)=>String(b.time||'').localeCompare(String(a.time||''))).slice(0,8000);
 ledger.lastSyncAt=now||new Date().toISOString();saveLedger(ledger,s);return {ledger,added};
}
function dateKey(v){if(typeof v!=='string')return'';if(/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10);const t=Date.parse(v);return Number.isFinite(t)?new Date(t+28800000).toISOString().slice(0,10):''}
function dayDiff(a,b){const x=Date.parse(a+'T00:00:00Z'),y=Date.parse(b+'T00:00:00Z');return Number.isFinite(x)&&Number.isFinite(y)?Math.abs(x-y)/86400000:999}
function norm(s){return String(s||'').toLowerCase().replace(/[\s\-—_（）()·:：,，.。/\\]/g,'')}
function similar(a,b){const x=norm(a),y=norm(b);return x.length>=2&&y.length>=2&&(x.includes(y)||y.includes(x))}
function findManualMatch(entries,cardName,tx){
 const base=tx.category==='pay'?'pay':tx.category==='spend'?'spend':null;if(!base)return null;
 const amount=Math.abs(tx.amountCents)/100,txDay=tx.transactionAt.slice(0,10);
 const c=entries.filter(x=>x&&x.cardName===cardName&&(x.source==='history'||x.source==='history+email')&&x.type===base&&Math.abs(Number(x.amount)-amount)<0.005&&dayDiff(dateKey(x.time),txDay)<=2&&!arr(x.emailMatches).some(m=>m&&m.transactionId===tx.id));
 if(tx.category==='spend'){const d=c.filter(x=>similar(x.note,tx.description));return d.length===1?d[0]:null}
 if(c.length===1)return c[0];const d=c.filter(x=>similar(x.note,tx.description));return d.length===1?d[0]:null;
}
function importCloudBatches(data,mapping,batches,storage,now){
 const s=storage||root.localStorage,ledger=readLedger(s),map=obj(mapping),cards=arr(obj(data).cards),existingEmail=new Set();
 for(const x of ledger.entries){if(String(x.sourceKey||'').startsWith('email:'))existingEmail.add(String(x.sourceKey).slice(6));for(const m of arr(x.emailMatches))if(m&&m.transactionId)existingEmail.add(m.transactionId)}
 const receipts=new Set(arr(ledger.cloudBatchReceipts));let added=0,matched=0,skipped=0;const results=[];
 for(const b of arr(batches)){
  if(!b||!/^\d{4}$/.test(b.last4||'')||!Array.isArray(b.transactions)||!b.transactions.length||b.transactions.length>250||!/^[a-f0-9-]{36}$/.test(b.batchId||'')){skipped++;continue}
  const matches=cards.filter(c=>bank(c.name)===b.bank&&map[c.name]===b.last4);
  if(matches.length!==1){results.push({batchId:b.batchId,status:'unmatched',bank:b.bank,last4:b.last4,reason:matches.length?'银行和尾号映射有冲突':'请先填写对应信用卡尾号'});skipped++;continue}
  const cardName=matches[0].name,converted=[];let valid=true;
  for(const tx of b.transactions){
   if(!tx||typeof tx.id!=='string'||!TYPES.includes(tx.category)||!Number.isSafeInteger(tx.amountCents)||tx.amountCents===0||typeof tx.transactionAt!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(tx.transactionAt)||typeof tx.description!=='string'||!tx.description||tx.description.length>160){valid=false;break}
   converted.push(tx);
  }
  if(!valid){results.push({batchId:b.batchId,status:'invalid',bank:b.bank,last4:b.last4,reason:'电子账单明细格式异常，未写入'});skipped++;continue}
  for(const tx of converted){
   if(existingEmail.has(tx.id))continue;
   const manual=findManualMatch(ledger.entries,cardName,tx);
   if(manual){
    manual.emailMatches=arr(manual.emailMatches);manual.emailMatches.push({transactionId:tx.id,batchId:b.batchId,statementDate:b.statementDate,description:tx.description,postDate:tx.postDate});
    manual.source='history+email';manual.sourceLabel='手工记录 + 电子账单';if(!manual.statementDate)manual.statementDate=b.statementDate;if(!manual.postDate)manual.postDate=tx.postDate;matched++;existingEmail.add(tx.id);continue;
   }
   const signedAmount=round2(tx.amountCents/100),amount=Math.abs(signedAmount),time=tx.transactionAt.length===10?tx.transactionAt+'T12:00:00+08:00':tx.transactionAt;
   ledger.entries.push({id:'e-'+hash(tx.id),source:'email',sourceLabel:'电子账单',sourceKey:'email:'+tx.id,transactionId:tx.id,cloudBatchId:b.batchId,bank:b.bank,last4:b.last4,statementDate:b.statementDate,cardName,type:tx.category,amount,signedAmount,time,transactionDate:tx.transactionAt.slice(0,10),postDate:tx.postDate,note:tx.description,debtBefore:null,debtAfter:null,fundName:null,fundAmount:null,archivedAt:now||new Date().toISOString()});added++;existingEmail.add(tx.id);
  }
  receipts.add(b.batchId);results.push({batchId:b.batchId,status:'imported',bank:b.bank,last4:b.last4,cardName,transactionCount:converted.length});
 }
 ledger.entries=ledger.entries.filter(x=>x&&TYPES.includes(x.type)&&typeof x.cardName==='string'&&x.cardName&&Number(x.amount)>0).sort((a,b)=>String(b.time||'').localeCompare(String(a.time||''))).slice(0,8000);
 ledger.cloudBatchReceipts=Array.from(receipts).slice(-100);ledger.lastCloudImportAt=now||new Date().toISOString();saveLedger(ledger,s);
 return {ledger,added,matched,skipped,results,receivedBatchIds:ledger.cloudBatchReceipts};
}
function syncFromStorage(storage){const s=storage||root.localStorage;let data=null;try{data=JSON.parse(s.getItem(DATA_KEY)||'null')}catch(_){}if(!data||!Array.isArray(data.cards))return {ledger:readLedger(s),added:0,error:'当前浏览器没有有效账本'};return sync(data,s)}
function monthOf(time){return typeof time==='string'&&/^\d{4}-\d{2}/.test(time)?time.slice(0,7):''}
function filter(entries,opt){opt=obj(opt);const card=String(opt.card||''),month=String(opt.month||''),type=String(opt.type||'all'),q=String(opt.q||'').trim().toLowerCase();return arr(entries).filter(x=>(!card||x.cardName===card)&&(!month||monthOf(x.time)===month)&&(type==='all'||x.type===type)&&(!q||[x.cardName,x.note,x.fundName,x.sourceLabel,x.postDate].some(v=>String(v||'').toLowerCase().includes(q))))}
function summary(entries){let increase=0,decrease=0;for(const x of arr(entries)){const v=signed(x);if(v>=0)increase+=v;else decrease+=-v}return {increase:round2(increase),decrease:round2(decrease),net:round2(increase-decrease),count:arr(entries).length}}
function cards(data,entries){const now=arr(obj(data).cards).map(c=>String(c.name||'')).filter(Boolean),old=arr(entries).map(x=>x.cardName).filter(Boolean);return Array.from(new Set([...now,...old])).sort((a,b)=>a.localeCompare(b,'zh-CN'))}
function months(entries){return Array.from(new Set(arr(entries).map(x=>monthOf(x.time)).filter(Boolean))).sort().reverse()}
function money(n){return typeof n==='number'&&Number.isFinite(n)?'¥'+n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}
function csv(entries){
 const esc=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"',rows=[['交易时间','记账日','信用卡','类型','来源','金额(正负)','摘要','账单日','操作前欠款','操作后欠款','资金账户','关联金额']];
 for(const x of arr(entries))rows.push([x.time,x.postDate||'',x.cardName,typeLabel(x.type),x.sourceLabel||'',signed(x).toFixed(2),x.note||'',x.statementDate||'',x.debtBefore==null?'':Number(x.debtBefore).toFixed(2),x.debtAfter==null?'':Number(x.debtAfter).toFixed(2),x.fundName||'',x.fundAmount==null?'':Number(x.fundAmount).toFixed(2)]);
 return '\ufeff'+rows.map(r=>r.map(esc).join(',')).join('\r\n');
}
const api={DATA_KEY,MAP_KEY,LEDGER_KEY,VERSION,TYPES,parseHistoryItem,readLedger,saveLedger,sync,syncFromStorage,importCloudBatches,filter,summary,cards,months,money,csv,monthOf,hash,typeLabel,signed,bank};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DebtCardLedger=api;
})(typeof window!=='undefined'?window:globalThis);
