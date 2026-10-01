(function(){
'use strict';
const button=document.getElementById('billSyncEntry');
if(button)button.addEventListener('click',()=>{location.href='./bill-sync.html'});
window.addEventListener('storage',event=>{
 if(event.key!=='debt_manager_hosted_v1'||event.oldValue===event.newValue||document.getElementById('billSyncStale'))return;
 const box=document.createElement('div');box.id='billSyncStale';box.setAttribute('role','alertdialog');box.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(20,30,45,.65);display:grid;place-items:center;padding:24px';
 const panel=document.createElement('div');panel.style.cssText='max-width:360px;padding:24px;border-radius:18px;background:white;color:#172438;line-height:1.6';
 const text=document.createElement('p');text.textContent='另一页面已更新账本。请重新加载后再录入，避免旧页面覆盖新记录。';
 const link=document.createElement('a');link.href='./?bill_skip=1';link.className='btn primary';link.textContent='重新加载最新账本';panel.append(text,link);box.appendChild(panel);document.body.appendChild(box);
});
})();
