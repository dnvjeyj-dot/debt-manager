(function(){
'use strict';
const M=window.DebtReminders,DATA='debt_manager_hosted_v1',CFG='debt_manager_reminders_config_v1',LOG='debt_manager_reminders_exports_v1',OPEN='debt_manager_reminders_open_v1';
const $=id=>document.getElementById(id),esc=s=>String(s===null||s===undefined?'':s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const read=(key,otherwise)=>{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):otherwise;};
const write=(key,value)=>{const text=JSON.stringify(value);localStorage.setItem(key,text);if(localStorage.getItem(key)!==text)throw Error('提醒设置保存失败，请勿重复导入。');};
const stamp=t=>new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
let cfg=M.options({}),projection=null,batches=[],selected=new Set(),namespace=null,busy=false;
function message(text,bad){$('message').hidden=false;$('message').textContent=text;$('message').className='notice '+(bad?'warn':'');}
function form(){return {days:[...document.querySelectorAll('input[name=days]:checked')].map(x=>Number(x.value)),time:$('reminderTime').value,horizon:Number($('horizon').value),includeAmounts:$('includeAmounts').checked};}
function fill(){document.querySelectorAll('input[name=days]').forEach(x=>x.checked=cfg.days.includes(Number(x.value)));$('reminderTime').value=cfg.time;$('horizon').value=String(cfg.horizon);$('includeAmounts').checked=cfg.includeAmounts;}
function wasGenerated(row){return batches.some(b=>!b.test&&!b.clearedAt&&(b.items||[]).some(x=>x.key===row.key));}
function load(reset){
 try{
  const stored=read(CFG,{});cfg=M.options(stored);namespace=stored.namespace||null;
  batches=read(LOG,[]);if(!Array.isArray(batches))throw Error('提醒导出记录格式异常；请保留数据，不要清空账本。');
  const book=read(DATA,null);projection=M.project(book,cfg);fill();
  if(reset)selected=new Set(projection.rows.filter(r=>M.actionable(r)&&!wasGenerated(r)).map(r=>r.key));
  else selected=new Set([...selected].filter(k=>projection.rows.some(r=>r.key===k&&M.actionable(r))));
  render();
 }catch(e){projection=null;$('items').textContent='未读取到有效账本。请用原来有数据的 Safari 入口，不要重新导入或清空。';message(e.message,true);controls();}
}
function controls(){['share','download','manual'].forEach(id=>$(id).disabled=busy||!projection||!selected.size);$('test').disabled=busy;}
function render(){
 const p=projection,c=p.counts;$('metrics').innerHTML=[['今天到期',c.today],['3 天内到期',c.soon],['已到期需确认',c.past]].map(x=>'<div class="metric"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>').join('');
 $('scope').textContent='本机读取：'+stamp(Date.now())+'；显示至 '+p.end+'，共 '+p.rows.length+' 项。日期待补／有冲突 '+c.undated+' 项。';
 const filter=$('filter').value,rows=p.rows.filter(r=>filter==='all'||filter==='pending'&&!r.paid||filter===r.state||filter==='undated'&&r.state==='conflict');
 const labels={today:'今天到期',past:'已到期 · 待确认',soon:'即将到期',later:'计划提醒',paid:'本期已记还清',undated:'日期待补',conflict:'记录有冲突'};
 $('items').innerHTML=rows.length?rows.map(r=>{
  const can=M.actionable(r),when=r.due?(r.due+' · '+(r.days<0?'已过 '+(-r.days)+' 天':r.days===0?'今天':r.days+' 天后')):'尚不能生成日历提醒';
  return '<article class="item"><div class="item-top"><label class="pick"><input type="checkbox" data-pick="'+esc(r.key)+'" '+(selected.has(r.key)?'checked ':'')+(can?'':'disabled ')+' aria-label="选择 '+esc(r.title)+'"><div><h3>'+esc(r.title)+'</h3><div class="meta">'+esc(when)+'</div></div></label><span class="badge '+esc(r.state)+'">'+labels[r.state]+'</span></div><div class="amount">'+esc(M.money(r.amount))+'</div><div class="meta">'+esc(r.amountLabel)+'</div><p class="meta">'+esc(r.note)+'</p><div class="meta">日历：'+(wasGenerated(r)?'曾生成过本期文件，是否添加以导出记录为准':'尚未生成本期文件')+'</div><button type="button" data-open="'+esc(r.source)+'">回账本处理</button></article>';
 }).join(''):'<div class="panel sub">此筛选下没有事项。尚未出账的下期信用卡不会重复套用本期金额。</div>';
 renderBatches();selection();
}
function renderBatches(){
 let stale=0;
 $('batches').innerHTML=batches.slice().reverse().map(b=>{
  const state=b.clearedAt?{state:'cleared',changed:[]}:b.test?{state:b.confirmedAt?'confirmed':'generated',changed:[]}:M.batchState(b,projection.rows,cfg);stale+=state.changed.length;
  const title=b.test?'测试提醒':(b.items||[]).length+' 项还款 · '+b.count+' 个提醒时点';
  const label={cleared:'你已确认处理旧日程',stale:'账本有变化 · 日历需手动调整',confirmed:'你已确认添加（非系统验证）',generated:'已生成文件 · 尚未确认日历添加'}[state.state];
  return '<div class="batch"><strong>'+esc(title)+'</strong><div class="meta">'+esc(stamp(b.createdAt))+'</div><p class="small">'+esc(label)+'</p>'+(state.changed.length?'<p class="meta">'+esc(state.changed.map(x=>x.title).join('、'))+'：请在系统日历删除或调整剩余提醒。</p>':'')+(b.clearedAt?'':'<div class="actions">'+(!b.confirmedAt?'<button data-confirm="'+esc(b.id)+'" type="button">我已在日历确认添加</button>':'')+'<button data-clear="'+esc(b.id)+'" type="button">我已处理／移除这批旧日程</button></div>')+'</div>';
 }).join('')||'<p class="sub">还没有导出记录。建议先测试，再加入正式提醒。</p>';
 $('stale').hidden=!stale;$('stale').textContent='有 '+stale+' 项已生成提醒对应的账本发生变化。页面无法自动取消系统日历，请检查下方导出记录并处理旧日程。';
}
function selection(){
 let count=0;if(projection)projection.rows.filter(r=>selected.has(r.key)).forEach(r=>count+=M.slots(r,cfg).length);
 $('selection').textContent='已选 '+selected.size+' 项 · 将生成 '+count+' 个提醒时点'+(cfg.includeAmounts?'（含参考金额）':'（日历不含金额）');controls();
}
function ensureConfig(){
 if(!namespace){namespace=window.crypto&&crypto.randomUUID?crypto.randomUUID():'local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
 write(CFG,{...cfg,namespace});
}
function prepare(test){
 if(!test){const latest=M.project(read(DATA,null),cfg);const rows=latest.rows.filter(r=>selected.has(r.key));if(rows.length!==selected.size||rows.some(r=>!M.actionable(r))){load(true);throw Error('账本已变化，请重新检查选择后再生成。');}projection=latest;}
 ensureConfig();
 const rows=test?[{key:'test:'+Date.now(),title:'债务管理器 · 日历测试',name:'测试',due:M.today(Date.now()),amount:null,amountLabel:'测试',paid:false,note:'这只是日历通知测试，不是还款提醒。'}]:projection.rows.filter(r=>selected.has(r.key));
 const result=M.calendar(rows,test?{days:[0],time:'00:00',includeAmounts:false}:cfg,namespace);
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),filename=(test?'日历提醒测试':'还款提醒')+'-'+id+'.ics';
 return {result,id,filename,test};
}
function saveBatch(p){
 const log=read(LOG,[]);if(!Array.isArray(log))throw Error('导出记录无法保存');
 log.push({id:p.id,createdAt:new Date().toISOString(),count:p.result.count,items:p.result.items,test:p.test,confirmedAt:null,clearedAt:null});write(LOG,log);
 selected.clear();load(false);message(p.test?'测试文件已生成：计划提醒 '+stamp(p.result.items[0].alarms[0])+'。请先在日历添加并核对“提醒”。':'已生成日历文件，请在系统日历确认添加；生成或分享本身不代表提醒已启用。');
}
async function exportFile(mode,test){
 if(busy)return;
 try{
  if(!test&&projection.rows.some(r=>selected.has(r.key)&&wasGenerated(r))&&!confirm('部分事项之前已生成过。请先处理系统日历里的旧日程；重复导入可能产生重复提醒。仍继续生成？'))return;
  const p=prepare(test),file=new File([p.result.text],p.filename,{type:'text/calendar;charset=utf-8'});
  if(mode==='share'&&(!navigator.share||!navigator.canShare||!navigator.canShare({files:[file]}))){if(test)mode='download';else{message('此浏览器不支持分享日历文件，请点“下载 .ics”，或查看手动添加清单。',true);$('guide').open=true;return;}}
  busy=true;controls();
  if(mode==='share')await navigator.share({files:[file],title:'还款日历提醒'});
  else {const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=p.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  saveBatch(p);$('guide').open=true;
 }catch(e){if(e.name!=='AbortError')message('未确认完成：'+e.message,true);}
 finally{busy=false;controls();}
}
$('saveSettings').onclick=()=>{try{const v=form();if(!v.days.length)throw Error('请至少选择一个提醒时点');cfg=M.options(v);ensureConfig();load(true);message('提醒设置已保存。已导入的旧日历不会自动改变，请检查导出记录。');}catch(e){message(e.message,true);}};
$('refresh').onclick=()=>load(true);$('filter').onchange=()=>projection&&render();
$('selectNew').onclick=()=>{if(projection){selected=new Set(projection.rows.filter(r=>M.actionable(r)&&!wasGenerated(r)).map(r=>r.key));render();}};
$('selectNone').onclick=()=>{selected.clear();if(projection)render();};
$('items').onchange=e=>{const key=e.target.getAttribute('data-pick');if(key){if(e.target.checked)selected.add(key);else selected.delete(key);selection();}};
$('items').onclick=e=>{const b=e.target.closest('button[data-open]');if(!b||!projection)return;const row=projection.rows.find(r=>r.source===b.getAttribute('data-open'));if(row){try{sessionStorage.setItem(OPEN,JSON.stringify({kind:row.kind,name:row.name,at:Date.now()}));}catch(_){}location.href='./?bill_skip=1';}};
$('share').onclick=()=>exportFile('share',false);$('download').onclick=()=>exportFile('download',false);$('test').onclick=()=>exportFile(navigator.share&&navigator.canShare?'share':'download',true);
$('manual').onclick=()=>{try{const p=prepare(false);$('manualText').value=p.result.items.map(x=>x.title+'\n还款日：'+x.due+'\n分别添加以下日程（提醒选开始时）：\n'+x.alarms.map(stamp).join('\n')).join('\n\n');$('manualBox').hidden=false;$('manualBox').scrollIntoView({behavior:'smooth'});}catch(e){message(e.message,true);}};
$('batches').onclick=e=>{
 const c=e.target.closest('button[data-confirm]'),r=e.target.closest('button[data-clear]');if(!c&&!r)return;
 try{const id=(c||r).getAttribute(c?'data-confirm':'data-clear'),log=read(LOG,[]),b=log.find(x=>x.id===id);if(!b)return;
 if(!confirm(c?'你已经在系统日历中看到这批日程，并确认各日程有提醒？这不是系统自动验证。':'确认你已在系统日历处理／删除这批剩余日程，或从未导入？这里不会替你删除日历。'))return;
 if(c)b.confirmedAt=new Date().toISOString();else b.clearedAt=new Date().toISOString();write(LOG,log);load(true);
 }catch(err){message(err.message,true);}
};
window.addEventListener('storage',e=>{if([DATA,CFG,LOG].includes(e.key))load(false);});
window.addEventListener('pageshow',()=>load(false));document.addEventListener('visibilitychange',()=>{if(!document.hidden)load(false);});
load(true);
})();
