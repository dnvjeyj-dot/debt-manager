/* Read-only projection of the existing book. Calendar files are snapshots, not a sync service. */
(function(root){
'use strict';
const DAY=86400000,DEFAULTS={days:[3,1,0],time:'09:00',horizon:30,includeAmounts:false};
const list=v=>Array.isArray(v)?v:[];
const cents=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v),c=Math.round(n*100);return Number.isFinite(n)&&n>=0&&Number.isSafeInteger(c)?c:null;};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const dayMs=s=>Date.parse(s+'T00:00:00Z');
const iso=n=>new Date(n).toISOString().slice(0,10);
const today=now=>iso(Number(now)+8*3600000);
const validDay=v=>Number.isInteger(Number(v))&&Number(v)>=1&&Number(v)<=31;
function monthDate(month,day){const [y,m]=month.split('-').map(Number);return iso(Date.UTC(y,m-1,Math.min(Number(day),new Date(Date.UTC(y,m,0)).getUTCDate())));}
function nextMonth(month){const [y,m]=month.split('-').map(Number);return iso(Date.UTC(y,m,1)).slice(0,7);}
function options(value){const v=value||{},days=list(v.days).filter(n=>Number.isInteger(n)&&n>=0&&n<=30);return {days:[...new Set(days.length?days:DEFAULTS.days)].sort((a,b)=>b-a),time:/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.time||'')?v.time:DEFAULTS.time,horizon:[30,60].includes(Number(v.horizon))?Number(v.horizon):30,includeAmounts:v.includeAmounts===true};}
function required(d){const p=cents(d.monthlyPayment);if(p!==null&&p>0)return {amount:p,estimated:false};const b=cents(d.balance),r=cents(d.rate);if(d.method==='先息后本'&&b!==null&&r!==null)return {amount:Math.round(b*Number(d.rate)/100/12),estimated:true};return {amount:null,estimated:false};}
function loanPaid(d,history,month){
 // Explicit lastPaymentMonth is authoritative for the latest recording; older history is evidence only.
 const direct=d.lastPaymentMonth===month?cents(d.lastPaymentAmount):null;
 const seen=new Set();let sum=0,found=false;
 const prefix=String(d.name||'')+' 本期还款 ';
 for(const h of list(history)){
  if(!h||typeof h.title!=='string'||!h.title.startsWith(prefix))continue;
  const date=String(h.note||'').slice(0,10),m=h.title.slice(prefix.length).match(/^¥([\d,]+(?:\.\d{1,2})?)$/);
  if(!validDate(date)||date.slice(0,7)!==month||!m)continue;
  if(d.lastPaymentMonth&&d.lastPaymentDate===date&&d.lastPaymentMonth!==month)continue;
  const key=JSON.stringify([h.time,h.title,h.note]);if(seen.has(key))continue;seen.add(key);
  const n=cents(m[1].replace(/,/g,''));if(n!==null){sum+=n;found=true;}
 }
 return {amount:direct!==null?Math.max(direct,sum):sum,recorded:direct!==null||found||d.lastPaymentMonth===month};
}
function project(data,settings,now=Date.now()){
 if(!data||!Array.isArray(data.cards)||!Array.isArray(data.debts)||data.cards.length+data.debts.length>2000)throw Error('未找到有效本机账本；不会创建、清空或覆盖原数据。');
 const cfg=options(settings),date=today(now),month=date.slice(0,7),end=iso(dayMs(date)+cfg.horizon*DAY),rows=[];
 function put(row){if(row.due&&row.due>end)return;row.days=row.due?Math.round((dayMs(row.due)-dayMs(date))/DAY):null;row.state=row.paid?'paid':!row.due?'undated':row.days<0?'past':row.days===0?'today':row.days<=3?'soon':'later';rows.push(row);}
 data.cards.forEach((c,index)=>{
  if(!c||typeof c.name!=='string')return;
  const source='card:'+String(c.id||c.name),amount=cents(c.statement);let due=null,note='',anchor='month:'+month;
  if(c.statementDueDate){
   if(validDate(c.statementDueDate)&&(!c.lastStatementDate||validDate(c.lastStatementDate)&&c.statementDueDate>c.lastStatementDate)){
    due=c.statementDueDate;anchor='statement:'+(c.lastStatementDate||due);note='本机记录的完整还款日期';
   }else note='本机账单日期无效或冲突，请先核对';
  }else if(validDate(c.lastStatementDate)&&validDay(c.dueDay)){
   due=monthDate(c.lastStatementDate.slice(0,7),c.dueDay);if(due<=c.lastStatementDate)due=monthDate(nextMonth(c.lastStatementDate.slice(0,7)),c.dueDay);
   anchor='statement:'+c.lastStatementDate;note='按本机出账日与还款日推算，请核对银行日期';
  }else if(validDay(c.dueDay)&&!c.lastStatementDate){due=monthDate(month,c.dueDay);note='按本月固定还款日提醒，账期尚未核对';}
  else note='还款日期缺失或不合法，请在信用卡编辑中补齐';
  const paid=amount===0||(amount===null&&cents(c.debt)===0);
  put({key:source+'|'+anchor,source,index,kind:'card',name:c.name,title:c.name+' · 信用卡还款',due,amount,paid,amountLabel:'账本本期剩余',note:note+'；刚用邮件原额覆盖时，请核对之前的还款是否已扣除。'});
 });
 data.debts.forEach((d,index)=>{
  if(!d||typeof d.name!=='string')return;
  const balance=cents(d.balance),source='debt:'+String(d.id||d.name),req=required(d);
  if(balance===0)return;
  if(validDay(d.dueDay)){
   let m=month;for(let i=0;i<4&&m<=end.slice(0,7);i++,m=nextMonth(m)){
    const due=monthDate(m,d.dueDay);if(validDate(d.maturity)&&due>d.maturity)continue;
    const p=loanPaid(d,data.history,m),amount=req.amount===null?null:Math.max(0,req.amount-p.amount),paid=amount===0;
    const note=(req.estimated?'按当前本金和利率估算月息':req.amount===null?'本期金额待核对':'按已录入月供计算')+(p.recorded?'；本期已记录支付 '+money(p.amount):'')+(m!==month?'；未来月供为计划值':'');
    put({key:source+'|monthly:'+m,source,index,kind:'loan',name:d.name,title:d.name+' · 月度还款',due,amount,paid,amountLabel:req.estimated?'预计剩余月息':'计划剩余月供',note,estimated:req.estimated});
   }
  }else if(!validDate(d.maturity))put({key:source+'|undated',source,index,kind:'loan',name:d.name,title:d.name,due:null,amount:req.amount,paid:false,amountLabel:'计划月供',note:'每月还款日和本金到期日未完整填写，暂不能加入日历。'});
  if(validDate(d.maturity))put({key:source+'|maturity',source,index,kind:'maturity',name:d.name,title:d.name+' · 本金到期核对',due:d.maturity,amount:balance,paid:false,amountLabel:'本金余额（不含利息）',note:'到期本金与月供分开核对，勿重复支付；不据此自动扣款。'});
  else if(d.maturity&&d.maturity!=='待补')put({key:source+'|invalid-maturity',source,index,kind:'maturity',name:d.name,title:d.name+' · 到期日待核对',due:null,amount:balance,paid:false,amountLabel:'本金余额',note:'已录入的本金到期日期无效，未猜测日期。'});
 });
 const keys=new Map();for(const row of rows)keys.set(row.key,(keys.get(row.key)||0)+1);
 for(const row of rows)if(keys.get(row.key)>1){row.state='conflict';row.note='名称或标识重复，请在账本区分后再生成提醒。';}
 rows.sort((a,b)=>Number(a.paid)-Number(b.paid)||(a.due||'9999').localeCompare(b.due||'9999')||a.title.localeCompare(b.title,'zh-CN'));
 return {today:date,end,rows,config:cfg,counts:{today:rows.filter(x=>x.state==='today').length,soon:rows.filter(x=>x.state==='soon').length,past:rows.filter(x=>x.state==='past').length,undated:rows.filter(x=>x.state==='undated'||x.state==='conflict').length}};
}
function money(n){return n===null||n===undefined?'金额待核对':'¥'+(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});}
const actionable=r=>!!r.due&&!r.paid&&r.state!=='conflict';
function slots(row,settings,now=Date.now()){
 if(!actionable(row))return [];
 const c=options(settings),base=Date.parse(row.due+'T'+c.time+':00+08:00');
 const result=c.days.map(days=>({at:base-days*DAY,days})).filter(x=>x.at>Number(now)+60000);
 if(!result.length&&row.due<=today(now))result.push({at:Math.ceil((Number(now)+300000)/60000)*60000,days:null});
 return result;
}
const hash=s=>{let n=2166136261;for(const c of String(s)){n^=c.codePointAt(0);n=Math.imul(n,16777619);}return (n>>>0).toString(16).padStart(8,'0');};
function fingerprint(row,cfg){const c=options(cfg);return JSON.stringify([row.key,row.due,row.amount,row.paid,c.days,c.time,c.includeAmounts,row.title]);}
function batchState(batch,rows,cfg,now=Date.now()){
 const active=list(batch.items).filter(x=>list(x.alarms).some(n=>Number(n)>Number(now)));
 if(batch.clearedAt)return {state:'cleared',changed:[]};
 const changed=active.filter(x=>{const r=rows.find(y=>y.key===x.key);return !r||!actionable(r)||fingerprint(r,cfg)!==x.fingerprint;});
 return {state:changed.length?'stale':batch.confirmedAt?'confirmed':'generated',changed};
}
const clean=s=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,300);
const escapeText=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(s){const encoder=new TextEncoder();let out='',line='',bytes=0;for(const c of s){const n=encoder.encode(c).length;if(bytes+n>75){out+=line+'\r\n';line=' ';bytes=1;}line+=c;bytes+=n;}return out+line;}
const utc=n=>new Date(n).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
function calendar(rows,settings,namespace,now=Date.now()){
 if(!/^[a-zA-Z0-9-]{8,80}$/.test(namespace||''))throw Error('提醒标识无效');
 const cfg=options(settings),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Debt Manager//Repayment Reminders 1//ZH','CALSCALE:GREGORIAN','X-WR-CALNAME:债务还款提醒'],items=[];let count=0;
 for(const row of rows){
  const times=slots(row,cfg,now);if(!times.length)continue;
  for(const slot of times){
   const label=slot.days===null?'已到期请核对':slot.days===0?'今日到期':'提前'+slot.days+'天';
   const title=clean(row.title)+' · '+label;
   const desc='还款日期：'+row.due+'（北京时间）\n'+(cfg.includeAmounts?row.amountLabel+'：'+money(row.amount)+'\n':'金额未写入日历，请打开账本核对。\n')+(cfg.includeAmounts?clean(row.note):'请打开账本核对当前剩余应还，月供与到期本金分开确认。')+'\n这是导出时的提醒快照，不是实际支付指令。已还款或日期变化后，请在日历中删除或修改本期剩余提醒。';
   lines.push('BEGIN:VEVENT','UID:dm-'+namespace+'-'+hash(row.key)+'-'+(slot.days===null?'check':slot.days)+'@debt-manager.local','DTSTAMP:'+utc(now),'DTSTART:'+utc(slot.at),'DTEND:'+utc(slot.at+600000),'SUMMARY:'+escapeText(title),'DESCRIPTION:'+escapeText(desc),'CLASS:PRIVATE','TRANSP:TRANSPARENT','BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0S','DESCRIPTION:'+escapeText(title),'END:VALARM','END:VEVENT');count++;
  }
  items.push({key:row.key,title:row.title,due:row.due,fingerprint:fingerprint(row,cfg),alarms:times.map(x=>x.at)});
 }
 if(!count)throw Error('没有可加入日历的提醒。请检查日期、已还状态和选择。');if(count>500)throw Error('一次最多生成500条提醒，请减少选择。');
 lines.push('END:VCALENDAR');return {text:lines.map(fold).join('\r\n')+'\r\n',count,items};
}
const api={DEFAULTS,options,project,required,loanPaid,validDate,monthDate,today,slots,calendar,batchState,fingerprint,actionable,money};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DebtReminders=api;
})(typeof window!=='undefined'?window:globalThis);
