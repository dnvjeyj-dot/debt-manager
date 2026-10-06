/* Email-priority merge. Adding banks must not reapply already processed statements. */
(function(root){
'use strict';
const POLICY='email-priority-v2',SUPPORTED=['CEB','CITIC','CIB'];
const FIELDS=['bank','last4','currency','statementDate','dueDate','periodStart','periodEnd','amountCents','minimumCents'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const cash=n=>'¥'+(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
function date(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const n=Date.parse(s+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s;}
function bank(name){const s=String(name||'').replace(/\s/g,'').replace(/\d+$/,'');const names={CEB:['光大','光大银行','中国光大银行'],CITIC:['中信','中信银行','中信信用卡','中国中信银行'],CMB:['招行','招商','招商银行'],ICBC:['工行','工商','工商银行','中国工商银行'],ABC:['农行','农业银行'],BOC:['中行','中国银行'],CCB:['建行','建设银行'],CIB:['兴业','兴业银行','兴业信用卡','兴业银行信用卡'],CGB:['广发','广发银行'],SPDB:['浦发','浦发银行'],PAB:['平安','平安银行'],BOCOM:['交行','交通银行'],CMBC:['民生','民生银行'],HXB:['华夏','华夏银行'],PSBC:['邮储','邮储银行']};return Object.keys(names).find(k=>names[k].includes(s))||null;}
function valid(p,today){
 const days=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000;
 if(!p||!SUPPORTED.includes(p.bank))return false;
 // CIB's verified summary does not state cycle boundaries; missing dates stay null.
 const cycle=p.bank==='CIB'
  ? p.periodStart===null&&p.periodEnd===null&&p.periodSource==='not-stated-in-email'
  : [p.periodStart,p.periodEnd].every(date)&&p.periodEnd===p.statementDate&&days(p.periodEnd,p.periodStart)>=1&&days(p.periodEnd,p.periodStart)<=62;
 return cycle&&p.currency==='CNY'&&/^\d{4}$/.test(p.last4)&&[p.statementDate,p.dueDate].every(date)&&p.statementDate<=today&&days(p.dueDate,p.statementDate)>=1&&days(p.dueDate,p.statementDate)<=75&&Number.isSafeInteger(p.amountCents)&&p.amountCents>=0&&p.amountCents<=2000000000&&Number.isSafeInteger(p.minimumCents)&&p.minimumCents>=0&&p.minimumCents<=p.amountCents&&p.identity===p.bank+':'+p.last4+':'+p.statementDate+':CNY';
}
function merge(input,mapping,items,now){
 if(!input||!Array.isArray(input.cards)||!Array.isArray(input.debts)||!Array.isArray(input.receivables)||input.cards.some(c=>!c||typeof c.name!=='string'))throw Error('本机账本不存在或格式不完整，未写入任何数据');
 if(!Array.isArray(items)||items.length>100)throw Error('账单响应格式异常');
 const stamp=now||new Date().toISOString();if(!Number.isFinite(Date.parse(stamp)))throw Error('同步时间无效');
 const today=new Date(Date.parse(stamp)+28800000).toISOString().slice(0,10);
 const data=JSON.parse(JSON.stringify(input)),results=[];
 const book=data.billSyncLedger&&typeof data.billSyncLedger==='object'&&!Array.isArray(data.billSyncLedger)?data.billSyncLedger:{};
 const history=Array.isArray(data.history)?data.history:[],groups=new Map(),identities=new Map();let changed=false,updated=0;
 for(const p of items){if(!valid(p,today))throw Error('账单字段校验失败，未写入');const duplicate=identities.get(p.identity);if(duplicate&&!FIELDS.every(k=>duplicate[k]===p[k]))throw Error('同一账期存在冲突，未写入');identities.set(p.identity,p);const k=p.bank+':'+p.last4,prev=groups.get(k);if(!prev||p.statementDate>prev.statementDate)groups.set(k,p);}
 for(const p of groups.values()){
  const basic={identity:p.identity,bank:p.bank,last4:p.last4,statementDate:p.statementDate,amount:p.amountCents/100,dueDate:p.dueDate,sourceId:p.sourceId||null};
  const matches=data.cards.filter(c=>bank(c.name)===p.bank&&mapping&&own(mapping,c.name)&&mapping[c.name]===p.last4);
  if(matches.length!==1){results.push({...basic,status:'unmatched',reason:matches.length?'相同银行和尾号对应多张卡，未写入':'请在卡尾号映射中指定对应信用卡'});continue;}
  const c=matches[0],prior=own(book,p.identity)?book[p.identity]:null;
  if(prior&&prior.policy===POLICY&&prior.cardName===c.name){
   if(!FIELDS.every(k=>prior[k]===p[k]))throw Error('已处理账单内容发生冲突，未写入');
   results.push({...basic,cardName:c.name,status:'unchanged',applied:prior.status==='updated',appliedAt:prior.status==='updated'?prior.processedAt:null,reason:prior.status==='updated'?'这期已按邮箱账单覆盖，不重复改动之后的还款或修改':prior.reason});continue;
  }
  const newerRecorded=Object.values(book).some(x=>x&&x.bank===p.bank&&x.last4===p.last4&&x.cardName===c.name&&x.status==='updated'&&date(x.statementDate)&&x.statementDate>p.statementDate);
  let status='updated',reason='已按邮箱账单覆盖，当前欠款、可用额度和还款记录未改动';
  if(c.lastStatementDate&&!date(c.lastStatementDate)){status='protected';reason='本机出账日期格式异常，无法判断新旧账期，未覆盖';}
  else if(c.lastStatementDate&&c.lastStatementDate>p.statementDate||newerRecorded){status='protected';reason='本机已有更新账期，不用旧邮件覆盖';}
  else if(p.dueDate<today){status='protected';reason='历史到期账单仅归档，不重新挂账';}
  const before={};for(const k of ['statement','statementDay','dueDay','lastStatementDate','statementDueDate','minimumPayment'])if(own(c,k))before[k]=c[k];
  if(status==='updated'){c.statement=p.amountCents/100;c.statementDay=Number(p.statementDate.slice(-2));c.dueDay=Number(p.dueDate.slice(-2));c.lastStatementDate=p.statementDate;c.statementDueDate=p.dueDate;c.minimumPayment=p.minimumCents/100;updated++;}
  book[p.identity]={policy:POLICY,bank:p.bank,last4:p.last4,currency:p.currency,cardName:c.name,statementDate:p.statementDate,dueDate:p.dueDate,periodStart:p.periodStart,periodEnd:p.periodEnd,...(p.periodSource?{periodSource:p.periodSource}:{}),amountCents:p.amountCents,minimumCents:p.minimumCents,status,reason,processedAt:stamp,sourceId:p.sourceId||null,before,previousStatus:prior&&prior.status||null};
  results.push({...basic,cardName:c.name,status,applied:status==='updated',appliedAt:status==='updated'?stamp:null,reason});
  const oldAmount=before.statement===null||before.statement===undefined||before.statement===''||!Number.isFinite(Number(before.statement))?'待补':cash(Math.round(Number(before.statement)*100));
  history.unshift({time:stamp,title:'账单同步 '+c.name+(status==='updated'?' · 邮箱覆盖 '+cash(p.amountCents):' · 保留原记录'),note:'出账 '+p.statementDate+' · 到期 '+p.dueDate+' · '+(status==='updated'?'本期账单 '+oldAmount+' → '+cash(p.amountCents)+'；使用邮件出账原额，不回溯扣减已有还款。':reason)});changed=true;
 }
 if(changed){data.billSyncLedger=book;data.history=history;}return {data,changed,updated,results,policy:POLICY};
}
const api={merge,valid,bank,POLICY,SUPPORTED};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DebtBillMerge=api;
})(typeof window!=='undefined'?window:globalThis);
