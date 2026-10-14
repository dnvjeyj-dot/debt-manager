/* Optional UI/archive bridge. Financial data remains owned by the core app. */
(function(){
'use strict';
function init(){
 if(!window.DebtCardLedger||document.getElementById('cardLedgerEntry'))return;
 const L=window.DebtCardLedger;
 const sync=()=>{try{L.syncFromStorage(localStorage)}catch(_){}};
 sync();
 const moreTarget=document.querySelector('#moreSheet button[data-more-page="data"]');
 if(moreTarget){const b=document.createElement('button');b.type='button';b.id='cardLedgerEntry';b.innerHTML='<span class="mi">≡</span>刷还卡明细';b.onclick=()=>location.href='./card-ledger.html';moreTarget.before(b);}
 function addLinks(){
  let data;try{data=JSON.parse(localStorage.getItem(L.DATA_KEY)||'null')}catch(_){return}
  if(!data||!Array.isArray(data.cards))return;
  document.querySelectorAll('#cardMobile .card-item .actions').forEach(box=>{
   if(box.querySelector('.card-ledger-link'))return;const txn=box.querySelector('[data-act="txn"][data-idx]');if(!txn)return;const c=data.cards[Number(txn.dataset.idx)];if(!c)return;
   const a=document.createElement('a');a.className='btn card-ledger-link';a.textContent='刷还明细';a.href='./card-ledger.html?card='+encodeURIComponent(c.name);a.style.textDecoration='none';box.appendChild(a);
  });
  document.querySelectorAll('#cardTable tbody tr').forEach(tr=>{
   if(tr.querySelector('.card-ledger-link'))return;const txn=tr.querySelector('[data-act="txn"][data-idx]');if(!txn)return;const c=data.cards[Number(txn.dataset.idx)];if(!c)return;
   const cell=txn.closest('td');if(!cell)return;const a=document.createElement('a');a.className='btn small card-ledger-link';a.textContent='明细';a.href='./card-ledger.html?card='+encodeURIComponent(c.name);a.style.cssText='text-decoration:none;margin-left:4px';cell.appendChild(a);
  });
 }
 addLinks();
 const mobile=document.getElementById('cardMobile'),table=document.getElementById('cardTable');
 if(mobile)new MutationObserver(()=>{addLinks();sync()}).observe(mobile,{childList:true,subtree:true});
 if(table)new MutationObserver(()=>addLinks()).observe(table,{childList:true,subtree:true});
 document.addEventListener('click',e=>{if(e.target&&e.target.id==='txnSaveBtn')setTimeout(sync,120)});
 window.addEventListener('pageshow',()=>{sync();addLinks()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){sync();addLinks()}});
 setInterval(sync,5000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
