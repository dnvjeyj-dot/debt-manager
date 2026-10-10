/* Optional UI only. Never write to the financial storage key. */
(function(){
'use strict';
const DATA='debt_manager_hosted_v1',CFG='debt_manager_reminders_config_v1',OPEN='debt_manager_reminders_open_v1';
function init(){
 if(!window.DebtReminders||document.getElementById('repaymentReminderEntry'))return;
 const target=document.querySelector('#moreSheet button[data-more-page="data"]');
 if(target){const b=document.createElement('button');b.type='button';b.id='repaymentReminderEntry';b.innerHTML='<span class="mi">◷</span>还款提醒';b.onclick=()=>location.href='./repayment-reminders.html';target.before(b);}
 const panel=document.getElementById('page-battle');let entry;
 if(panel){entry=document.createElement('a');entry.href='./repayment-reminders.html';entry.id='repaymentReminderSummary';entry.style.cssText='display:block;background:#edf4ff;color:#245d94;border:1px solid #d3e2f4;border-radius:15px;padding:13px 15px;margin:0 0 14px;text-decoration:none;font-size:14px;line-height:1.6';panel.prepend(entry);}
 function refresh(){if(!entry)return;try{const raw=localStorage.getItem(DATA);if(!raw){entry.hidden=true;return;}const p=window.DebtReminders.project(JSON.parse(raw),JSON.parse(localStorage.getItem(CFG)||'{}'));const c=p.counts,text='还款提醒　今天 '+c.today+' 项 · 3天内 '+c.soon+' 项 · 已到期待确认 '+c.past+' 项　›';if(entry.textContent!==text)entry.textContent=text;entry.hidden=false;}catch(_){entry.textContent='还款提醒　查看设置与日历　›';}}
 refresh();const timeline=document.getElementById('battleTimeline');if(timeline)new MutationObserver(refresh).observe(timeline,{childList:true});
 window.addEventListener('storage',refresh);window.addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 try{const r=JSON.parse(sessionStorage.getItem(OPEN)||'null');sessionStorage.removeItem(OPEN);if(r&&Date.now()-r.at>=0&&Date.now()-r.at<600000&&['card','loan','maturity'].includes(r.kind)){const page=r.kind==='card'?'cards':'debts';const nav=document.querySelector('#nav button[data-page="'+page+'"]');if(nav)nav.click();}}catch(_){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
