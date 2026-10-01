/* Statement merge: pure, conservative, no network or storage writes. */
(function(root){
'use strict';
function date(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const n=Date.parse(s+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s;}
const cash=n=>'¥'+(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const cents=n=>Number.isFinite(Number(n))?Math.round(Number(n)*100):NaN;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function bank(name){const s=String(name||'').replace(/\s/g,'').replace(/\d+$/,'');return ['光大','光大银行','中国光大银行'].includes(s)?'CEB':null;}
function valid(p,today){
 const days=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000;
 return p&&p.bank==='CEB'&&p.currency==='CNY'&&/^\d{4}$/.test(p.last4)&&[p.statementDate,p.dueDate,p.periodStart,p.periodEnd].every(date)&&p.periodEnd===p.statementDate&&p.statementDate<=today&&days(p.periodEnd,p.periodStart)>=1&&days(p.periodEnd,p.periodStart)<=62&&days(p.dueDate,p.statementDate)>=1&&days(p.dueDate,p.statementDate)<=75&&Number.isSafeInteger(p.amountCents)&&p.amountCents>=0&&p.amountCents<=2000000000&&Number.isSafeInteger(p.minimumCents)&&p.minimumCents>=0&&p.minimumCents<=p.amountCents&&p.identity==='CEB:'+p.last4+':'+p.statementDate+':CNY';
}
function merge(input,mapping,items,now){
 if(!input||!Array.isArray(input.cards)||!Array.isArray(input.debts)||!Array.isArray(input.receivables))throw Error('本机账本不存在或格式不完整，未写入任何数据');
 if(!Array.isArray(items)||items.length>100)throw Error('账单响应格式异常');
 const stamp=now||new Date().toISOString(),today=new Date(Date.parse(stamp)+28800000).toISOString().slice(0,10);
 const data=JSON.parse(JSON.stringify(input)),results=[];
 const book=data.billSyncLedger&&typeof data.billSyncLedger==='object'&&!Array.isArray(data.billSyncLedger)?data.billSyncLedger:{};
 const history=Array.isArray(data.history)?data.history:[];
 let changed=false,updated=0;
 const groups=new Map();
 for(const p of items){if(!valid(p,today))throw Error('账单字段校验失败，未写入');const k=p.bank+':'+p.last4;const prev=groups.get(k);if(prev&&prev.statementDate===p.statementDate&&JSON.stringify([prev.amountCents,prev.minimumCents,prev.dueDate])!==JSON.stringify([p.amountCents,p.minimumCents,p.dueDate]))throw Error('同一账期存在冲突，未写入');if(!prev||p.statementDate>prev.statementDate)groups.set(k,p);}
 for(const p of groups.values()){
  if(own(book,p.identity)){results.push({cardName:book[p.identity].cardName,last4:p.last4,status:'unchanged',reason:'这期已处理，保留之后的还款和修改'});continue;}
  const matches=data.cards.filter(c=>bank(c.name)===p.bank&&mapping&&own(mapping,c.name)&&mapping[c.name]===p.last4);
  if(matches.length!==1){results.push({last4:p.last4,status:'unmatched',reason:matches.length?'相同银行和尾号对应多张卡，未写入':'请在卡尾号映射中指定对应信用卡'});continue;}
  const c=matches[0],debt=cents(c.debt),oldStatement=c.statement===null?null:cents(c.statement);
  if(!Number.isFinite(debt)||debt<0||oldStatement!==null&&(!Number.isFinite(oldStatement)||oldStatement<0))throw Error('本机金额格式异常，未写入');
  let status='updated',reason='已更新账单，实时欠款和可用额度未改动';
  if(c.lastStatementDate&&!date(c.lastStatementDate)){status='protected';reason='本机出账日期格式异常，保留原账单';}
  else if(c.lastStatementDate&&c.lastStatementDate>=p.statementDate){status='protected';reason='本机已有相同或更新账期，保留还款后的余额';}
  else if(p.dueDate<today){status='protected';reason='历史到期账单仅归档，不重新挂账';}
  else if(debt===0){status='protected';reason='当前无欠款，不根据邮件重新挂账';}
  else{
   const cutoff=Date.parse(p.statementDate+'T00:00:00+08:00');
   const relevant=history.filter(h=>h&&Number.isFinite(Date.parse(h.time))&&Date.parse(h.time)>=cutoff);
   const paid=relevant.some(h=>String(h.title||'').startsWith(c.name+' 还款 '));
   const edited=relevant.some(h=>h.title==='编辑信用卡 '+c.name||String(h.title||'').startsWith(c.name+' 账单结转 ')||h.title==='体检修复 '+c.name);
   const unknownTouch=!relevant.some(h=>String(h.title||'').startsWith(c.name+' 刷卡 '))&&Number.isFinite(Date.parse(c.lastTouchedAt))&&Date.parse(c.lastTouchedAt)>=cutoff;
   if(paid||edited||unknownTouch){status='protected';reason='出账后已有还款或手工修改，保留现有应还金额';}
   else if(p.amountCents>debt){status='protected';reason='出账金额高于当前欠款，可能已还款，未覆盖';}
  }
  if(status==='updated'){
   c.statement=p.amountCents/100;c.statementDay=Number(p.statementDate.slice(-2));c.dueDay=Number(p.dueDate.slice(-2));c.lastStatementDate=p.statementDate;
   c.statementDueDate=p.dueDate;c.minimumPayment=p.minimumCents/100;updated++;
  }
  book[p.identity]={bank:p.bank,last4:p.last4,cardName:c.name,statementDate:p.statementDate,dueDate:p.dueDate,periodStart:p.periodStart,periodEnd:p.periodEnd,amountCents:p.amountCents,minimumCents:p.minimumCents,status,reason,processedAt:stamp,sourceId:p.sourceId||null};
  results.push({cardName:c.name,last4:p.last4,status,reason,amount:p.amountCents/100,dueDate:p.dueDate});
  history.unshift({time:stamp,title:'账单同步 '+c.name+(status==='updated'?' '+cash(p.amountCents):' · 保护原记录'),note:'出账 '+p.statementDate+' · 到期 '+p.dueDate+' · '+reason});changed=true;
 }
 if(changed){data.billSyncLedger=book;data.history=history;}
 return {data,changed,updated,results};
}
const api={merge,valid,bank};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DebtBillMerge=api;
})(typeof window!=='undefined'?window:globalThis);
