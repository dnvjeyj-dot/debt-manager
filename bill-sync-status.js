/* Read-only status projection. Never infer an email was not received from a missing receipt. */
(function(root){
'use strict';
const M=root.DebtBillMerge||(typeof require==='function'?require('./bill-sync-core.js'):null);
const list=x=>Array.isArray(x)?x:[];
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
function project(data,mapping,report){
 const book=obj(data.billSyncLedger),r=obj(report),cloud=obj(r.cloud),items=list(cloud.items),sources=list(cloud.sourceStates),cards=list(data.cards),mapped=obj(mapping);
 return cards.map(c=>{
  const bank=M.bank(c.name),last4=typeof mapped[c.name]==='string'&&/^\d{4}$/.test(mapped[c.name])?mapped[c.name]:null;
  const base={cardName:c.name,bank,last4,localAmount:typeof c.statement==='number'?c.statement:null};
  if(!last4)return {...base,state:'unmapped',label:'未填写尾号',tone:'muted',detail:'尚未建立尾号对应关系，无法匹配邮件账单。'};
  const unique=cards.filter(x=>M.bank(x.name)===bank&&mapped[x.name]===last4).length===1;
  if(!unique)return {...base,state:'ambiguous',label:'映射有冲突',tone:'warn',detail:'同一银行和尾号对应多张卡，暂停写入。'};
  const entries=Object.values(book).filter(x=>x&&x.bank===bank&&x.last4===last4&&x.cardName===c.name&&M.valid(x,'9999-12-31')).sort((a,b)=>b.statementDate.localeCompare(a.statementDate));
  const mail=items.filter(x=>x.bank===bank&&x.last4===last4).sort((a,b)=>b.statementDate.localeCompare(a.statementDate))[0];
  const saved=entries[0];
  const latest=mail&&(!saved||mail.statementDate>=saved.statementDate)?mail:saved;
  const issues=sources.filter(x=>x.bank===bank&&x.last4===last4&&['review','conflict'].includes(x.state)&&(!latest||!x.statementDate||x.statementDate>=latest.statementDate)).sort((a,b)=>String(b.statementDate||'').localeCompare(String(a.statementDate||'')));
  if(issues.length){const x=issues[0];return {...base,state:x.state,label:x.state==='conflict'?'账单冲突 · 未写入':'已收到 · 待核对',tone:'warn',statementDate:x.statementDate,receivedAt:x.receivedAt,detail:x.reason||'邮件需要核对，未覆盖本机账单。'};}
  if(!latest){const supported=M.SUPPORTED.includes(bank);return {...base,state:supported?'no_statement':'unsupported',label:supported?'尚无已入库账单':'此银行待适配',tone:'muted',detail:supported?'本机尚无该卡的入库记录。请结合上方邮箱检查回执判断；这不等于邮箱未收到。':'尾号已保存。当前尚不自动处理此银行，收到邮件后会登记待适配。'};}
  const p=latest,entry=book[p.identity];
  const src=sources.find(x=>x.sourceId===p.sourceId)||{};
  const detail={...base,identity:p.identity,statementDate:p.statementDate,dueDate:p.dueDate,originalAmount:p.amountCents/100,minimumPayment:p.minimumCents/100,receivedAt:src.receivedAt||null,storedAt:p.storedAt||src.storedAt||null};
  if(!entry||entry.cardName!==c.name||entry.policy!==M.POLICY)return {...detail,state:'pending',label:'已入库 · 待同步',tone:'warn',detail:'账单已到私有库，尚无当前规则的本机写入回执。'};
  if(entry.status!=='updated')return {...detail,state:'protected',label:'已入库 · 未覆盖',tone:'warn',detail:entry.reason||'本期保留原记录'};
  const fields=['bank','last4','currency','statementDate','dueDate','amountCents','minimumCents'];
  if(!fields.every(k=>entry[k]===p[k]))return {...detail,state:'conflict',label:'内容不一致 · 待核对',tone:'warn',detail:'本机回执与入库内容不一致，不自动覆盖。'};
  const evidence=list(data.history).some(h=>h&&h.time===entry.processedAt&&String(h.title||'').startsWith('账单同步 '+c.name));
  if(c.lastStatementDate!==p.statementDate||!evidence)return {...detail,state:'changed_period',label:'曾写入 · 本机待核对',tone:'warn',appliedAt:entry.processedAt,detail:'本机账期或操作历史已变化，可能撤销、手工结转或恢复过备份；不把旧回执冒充当前账单。'};
  const changed=typeof c.statement!=='number'||Math.round(c.statement*100)!==p.amountCents;
  return {...detail,state:changed?'applied_changed':'applied',label:changed?'已同步 · 后续金额有变动':'已同步至本机',tone:changed?'info':'ok',appliedAt:entry.processedAt,detail:changed?'首次写入后，本机金额发生还款或修改等变化；不会重复覆盖。':'这一期有本机写入回执，且账单金额与邮件一致。'};
 });
}
function health(report,now){const cloud=obj(obj(report).cloud),checks=list(cloud.checks),stamp=now||Date.now();const latest=checks[0]||null,automatic=checks.find(x=>x.mode==='automatic')||null;const age=automatic&&automatic.completed_at?stamp-Date.parse(automatic.completed_at):Infinity;return {latest,automatic,automaticFresh:!!(automatic&&automatic.outcome==='complete'&&age>=-300000&&age<=10800000),cloudAt:cloud.generatedAt||obj(report).at||null,error:obj(report).error||null};}
const api={project,health};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DebtBillStatus=api;
})(typeof window!=='undefined'?window:globalThis);
