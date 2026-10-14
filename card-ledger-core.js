/* Local card spend/payment ledger. Never writes the financial storage key. */
(function(root){
'use strict';
const DATA_KEY='debt_manager_hosted_v1';
const LEDGER_KEY='debt_manager_card_ledger_v1';
const VERSION=1;
function arr(x){return Array.isArray(x)?x:[]}
function obj(x){return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}
function round2(n){return Math.round((Number(n)+Number.EPSILON)*100)/100}
function num(s){const n=Number(String(s||'').replace(/,/g,''));return Number.isFinite(n)?round2(n):null}
function hash(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
function parseHistoryItem(h){
 if(!h||typeof h.title!=='string')return null;
 const m=h.title.match(/^(.+)\s+(刷卡|还款)\s+¥\s*([\d,]+(?:\.\d+)?)$/);
 if(!m)return null;
 const amount=num(m[3]);if(!(amount>0))return null;
 const note=String(h.note||'');
 const debt=note.match(/欠款\s*¥\s*([\d,]+(?:\.\d+)?)\s*→\s*¥\s*([\d,]+(?:\.\d+)?)/);
 const fund=note.match(/(?:^|\s·\s)从\s+(.+?)\s+扣\s+¥\s*([\d,]+(?:\.\d+)?)(?:\s·\s|$)/);
 let userNote=note;
 const cut=userNote.indexOf(' · 欠款 ');if(cut>=0)userNote=userNote.slice(0,cut);
 userNote=userNote.replace(/^\s*·\s*|\s*·\s*$/g,'').trim();
 const time=typeof h.time==='string'&&Number.isFinite(Date.parse(h.time))?new Date(h.time).toISOString():String(h.time||'');
 const sourceKey=hash([time,h.title,note].join('|'));
 return {id:'h-'+sourceKey,source:'history',sourceKey,cardName:m[1].trim(),type:m[2]==='刷卡'?'spend':'pay',amount,time,note:userNote,debtBefore:debt?num(debt[1]):null,debtAfter:debt?num(debt[2]):null,fundName:fund?fund[1].trim():null,fundAmount:fund?num(fund[2]):null,archivedAt:new Date().toISOString()};
}
function readLedger(storage){
 const s=storage||root.localStorage;let v={version:VERSION,entries:[],lastSyncAt:null};
 try{const x=JSON.parse(s.getItem(LEDGER_KEY)||'null');if(x&&x.version===VERSION&&Array.isArray(x.entries))v=x}catch(_){}
 return v;
}
function sync(data,storage,now){
 const s=storage||root.localStorage,ledger=readLedger(s),seen=new Set(ledger.entries.map(x=>x&&x.sourceKey).filter(Boolean));let added=0;
 for(const h of arr(obj(data).history)){
  const x=parseHistoryItem(h);if(!x||seen.has(x.sourceKey))continue;
  ledger.entries.push(x);seen.add(x.sourceKey);added++;
 }
 ledger.entries=ledger.entries.filter(x=>x&&['spend','pay'].includes(x.type)&&typeof x.cardName==='string'&&x.cardName&&Number(x.amount)>0).sort((a,b)=>String(b.time||'').localeCompare(String(a.time||''))).slice(0,5000);
 ledger.lastSyncAt=now||new Date().toISOString();
 if(added||!s.getItem(LEDGER_KEY))s.setItem(LEDGER_KEY,JSON.stringify(ledger));
 else {try{s.setItem(LEDGER_KEY,JSON.stringify({...ledger,lastSyncAt:ledger.lastSyncAt}))}catch(_){}}
 return {ledger,added};
}
function syncFromStorage(storage){
 const s=storage||root.localStorage;let data=null;try{data=JSON.parse(s.getItem(DATA_KEY)||'null')}catch(_){}
 if(!data||!Array.isArray(data.cards))return {ledger:readLedger(s),added:0,error:'当前浏览器没有有效账本'};
 return sync(data,s);
}
function monthOf(time){return typeof time==='string'&&/^\d{4}-\d{2}/.test(time)?time.slice(0,7):''}
function filter(entries,opt){
 opt=obj(opt);const card=String(opt.card||''),month=String(opt.month||''),type=String(opt.type||'all'),q=String(opt.q||'').trim().toLowerCase();
 return arr(entries).filter(x=>(!card||x.cardName===card)&&(!month||monthOf(x.time)===month)&&(type==='all'||x.type===type)&&(!q||[x.cardName,x.note,x.fundName].some(v=>String(v||'').toLowerCase().includes(q))));
}
function summary(entries){let spend=0,pay=0;for(const x of arr(entries)){if(x.type==='spend')spend+=Number(x.amount)||0;else if(x.type==='pay')pay+=Number(x.amount)||0}return {spend:round2(spend),pay:round2(pay),net:round2(spend-pay),count:arr(entries).length}}
function cards(data,entries){const now=arr(obj(data).cards).map(c=>String(c.name||'')).filter(Boolean);const old=arr(entries).map(x=>x.cardName).filter(Boolean);return Array.from(new Set([...now,...old])).sort((a,b)=>a.localeCompare(b,'zh-CN'))}
function months(entries){return Array.from(new Set(arr(entries).map(x=>monthOf(x.time)).filter(Boolean))).sort().reverse()}
function money(n){return typeof n==='number'&&Number.isFinite(n)?'¥'+n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}
function csv(entries){
 const esc=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
 const rows=[['时间','信用卡','类型','金额','备注','操作前欠款','操作后欠款','资金账户','关联金额']];
 for(const x of arr(entries))rows.push([x.time,x.cardName,x.type==='spend'?'刷卡':'还款',Number(x.amount).toFixed(2),x.note||'',x.debtBefore==null?'':Number(x.debtBefore).toFixed(2),x.debtAfter==null?'':Number(x.debtAfter).toFixed(2),x.fundName||'',x.fundAmount==null?'':Number(x.fundAmount).toFixed(2)]);
 return '\ufeff'+rows.map(r=>r.map(esc).join(',')).join('\r\n');
}
const api={DATA_KEY,LEDGER_KEY,VERSION,parseHistoryItem,readLedger,sync,syncFromStorage,filter,summary,cards,months,money,csv,monthOf,hash};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DebtCardLedger=api;
})(typeof window!=='undefined'?window:globalThis);
