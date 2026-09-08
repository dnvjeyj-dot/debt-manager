(()=>{
  const KEY='debt_manager_hosted_v1';
  const money=n=>'¥'+Number(n||0).toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2});
  const styles=`
#battleMetrics.v10-home-metrics{gap:10px}
#battleMetrics.v10-home-metrics>.sim-result{position:relative;overflow:hidden;min-width:0;min-height:96px;padding:14px;border:1px solid rgba(60,60,67,.12);border-radius:18px;background:linear-gradient(180deg,#fff 0%,#fafbfe 100%);box-shadow:0 3px 14px rgba(0,0,0,.045)}
#battleMetrics.v10-home-metrics>.sim-result::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:#c8cfdb}
#battleMetrics.v10-home-metrics .v10-label{color:#71809b;font-size:12px;font-weight:650;line-height:1.3}
#battleMetrics.v10-home-metrics .v10-value{font-size:21px;font-weight:820;letter-spacing:-.035em;line-height:1.15;margin-top:7px;overflow-wrap:anywhere}
#battleMetrics.v10-home-metrics .v10-sub{color:#8b95a8;font-size:11px;line-height:1.35;margin-top:6px}
#battleMetrics.v10-home-metrics>.v10-funds::before{background:#5a8dee}
#battleMetrics.v10-home-metrics>.v10-gap-ok::before{background:#26875a}
#battleMetrics.v10-home-metrics>.v10-gap-warn::before{background:#ff453a}
#battleMetrics.v10-home-metrics>.v10-available{background:linear-gradient(180deg,#f7fbff 0%,#eef6ff 100%);border-color:rgba(10,132,255,.18)}
#battleMetrics.v10-home-metrics>.v10-available::before{background:#0a84ff}
#battleMetrics.v10-home-metrics>.v10-available .v10-value{color:#0868c9}
@media(max-width:760px){#battleMetrics.v10-home-metrics{gap:9px}#battleMetrics.v10-home-metrics>.sim-result{min-height:101px;padding:13px 12px;border-radius:18px}#battleMetrics.v10-home-metrics .v10-label{font-size:11px}#battleMetrics.v10-home-metrics .v10-value{font-size:19px;margin-top:7px}#battleMetrics.v10-home-metrics .v10-sub{font-size:10.5px;margin-top:5px}}
`;
  if(!document.getElementById('homeAvailableV10Style')){
    const st=document.createElement('style');st.id='homeAvailableV10Style';st.textContent=styles;document.head.appendChild(st);
  }
  const cardAvailable=()=>{
    try{
      const d=JSON.parse(localStorage.getItem(KEY)||'{}');
      return Array.isArray(d.cards)?d.cards.reduce((s,c)=>s+Number(c&&c.available||0),0):0;
    }catch(_){return 0}
  };
  function apply(){
    const box=document.getElementById('battleMetrics');
    if(!box||box.children.length<4)return;
    box.classList.add('v10-home-metrics');
    const cards=Array.from(box.children).slice(0,4);
    const vals=cards.map(c=>{const n=c.querySelector('.n,.v10-value');return n?n.textContent.trim():''});
    const defs=[
      ['本月已知待处理',vals[0]||'¥0','仅统计已录入金额',''],
      ['当前可动用资金',vals[1]||'待录入',vals[1]==='待录入'?'到资金账户录入余额':'已扣除保留资金','v10-funds'],
      ['已知资金缺口',vals[2]||'待录资金',vals[2]==='0'?'当前已知事项可覆盖':(vals[2]==='待录资金'?'录入资金后自动计算':'按当前已知事项计算'),vals[2]==='0'?'v10-gap-ok':'v10-gap-warn'],
      ['可用总额度',money(cardAvailable()),'全部信用卡当前可用额度','v10-available']
    ];
    cards.forEach((c,i)=>{
      const d=defs[i];
      const desired=`<div class="v10-label">${d[0]}</div><div class="v10-value">${d[1]}</div><div class="v10-sub">${d[2]}</div>`;
      if(c.innerHTML!==desired)c.innerHTML=desired;
      c.classList.remove('v10-funds','v10-gap-ok','v10-gap-warn','v10-available');
      if(d[3])c.classList.add(d[3]);
    });
  }
  let scheduled=false;
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  const startObserver=()=>{
    const box=document.getElementById('battleMetrics');
    if(!box){setTimeout(startObserver,120);return}
    new MutationObserver(schedule).observe(box,{childList:true,subtree:true,characterData:true});
    schedule();
  };
  startObserver();
})();
