(function(){
'use strict';
const L=window.DebtCardLedger,$=id=>document.getElementById(id);let data=null,ledger=null;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const stamp=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString('zh-CN',{hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):String(s||'')};
const day=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}):'日期未知'};
function loadData(){try{data=JSON.parse(localStorage.getItem(L.DATA_KEY)||'null')}catch(_){}if(!data||!Array.isArray(data.cards))throw Error('当前 Safari 环境没有找到有效债务管理器数据')}
function setupSelects(){
 const keepCard=$('card').value,keepMonth=$('month').value,names=L.cards(data,ledger.entries),months=L.months(ledger.entries),requested=new URLSearchParams(location.search).get('card')||'';
 $('card').innerHTML='<option value="">全部信用卡</option>'+names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+(data.cards.some(c=>c.name===n)?'':'（历史名称）')+'</option>').join('');
 const cur=new Date(),current=cur.getFullYear()+'-'+String(cur.getMonth()+1).padStart(2,'0');if(!months.includes(current))months.unshift(current);
 $('month').innerHTML='<option value="">全部月份</option>'+months.map(m=>'<option value="'+m+'">'+m+'</option>').join('');
 $('card').value=names.includes(keepCard)?keepCard:(names.includes(requested)?requested:'');$('month').value=months.includes(keepMonth)?keepMonth:(keepMonth===''?'':(months.includes(current)?current:''));
 if(!$('month').dataset.ready){$('month').value=months.includes(current)?current:'';$('month').dataset.ready='1'}
}
function currentRows(){return L.filter(ledger.entries,{card:$('card').value,month:$('month').value,type:$('type').value,q:$('q').value})}
function render(){
 const rows=currentRows(),s=L.summary(rows);$('spend').textContent=L.money(s.increase);$('pay').textContent=L.money(s.decrease);$('net').textContent=(s.net>0?'+':s.net<0?'−':'')+L.money(Math.abs(s.net));$('count').textContent=String(s.count);
 if(!rows.length){$('list').innerHTML='<div class="empty">当前筛选没有明细。</div>';return}
 let last='';const html=[];for(const x of rows){const d=day(x.time);if(d!==last){html.push('<div class="day">'+esc(d)+'</div>');last=d}
  const v=L.signed(x),debt=x.debtBefore!=null&&x.debtAfter!=null?'<div class="debt">欠款 '+esc(L.money(x.debtBefore))+' → '+esc(L.money(x.debtAfter))+'</div>':'',fund=x.fundName?'<div class="meta">资金账户：'+esc(x.fundName)+(x.fundAmount!=null?' · '+esc(L.money(x.fundAmount)):'')+'</div>':'';
  const src='<span class="source '+(x.source==='email'?'mail':x.source==='history+email'?'both':'manual')+'">'+esc(x.sourceLabel||'手工记录')+'</span>';
  const dates=x.postDate?'<div class="meta">交易 '+esc(String(x.time).slice(0,10))+' · 记账 '+esc(x.postDate)+(x.statementDate?' · 账单 '+esc(x.statementDate):'')+'</div>':'<div class="meta">'+esc(stamp(x.time))+'</div>';
  html.push('<div class="txn"><div class="top"><div><div class="name">'+esc(x.cardName)+'</div>'+dates+'</div><div class="tags"><span class="badge '+esc(x.type)+'">'+esc(L.typeLabel(x.type))+'</span>'+src+'</div></div><div class="amount '+(v<0?'credit':'debit')+'">'+(v<0?'−':'+')+esc(L.money(Math.abs(v)))+'</div>'+(x.note?'<div class="meta desc">'+esc(x.note)+'</div>':'')+fund+debt+'</div>');
 }
 $('list').innerHTML=html.join('');
}
function sync(msg){try{loadData();const r=L.sync(data,localStorage);ledger=r.ledger;setupSelects();render();const emails=ledger.entries.filter(x=>x.source==='email'||x.source==='history+email').length;$('status').className='status';$('status').textContent=(msg||('已刷新本机明细'+(r.added?'，回填 '+r.added+' 笔旧记录':'，没有新增手工记录')))+' · 已关联电子账单 '+emails+' 笔';}catch(e){$('status').className='status error';$('status').textContent=e.message;$('list').innerHTML='<div class="empty">无法读取本机数据。</div>'}}
function download(){const rows=currentRows();if(!rows.length){$('status').textContent='当前筛选没有可导出的明细';return}const blob=new Blob([L.csv(rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a'),name=$('card').value||'全部信用卡',month=$('month').value||'全部月份';a.href=url;a.download='信用卡明细_'+name+'_'+month+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent='已生成当前筛选的 CSV 文件'}
['card','month','type'].forEach(id=>$(id).addEventListener('change',render));$('q').addEventListener('input',render);$('sync').addEventListener('click',()=>sync());$('csv').addEventListener('click',download);window.addEventListener('pageshow',()=>sync('已读取本机明细档案'));sync('已读取本机明细档案');
})();