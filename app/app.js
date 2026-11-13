(() => {
const EXP_CATS=['餐費','日用品','服裝','美容','交通','電話','水電','醫療','運動','旅遊','娛樂','禮物','社交','家電','購物','房貸','房租','稅費','保險','宗教','其他'];
const INC_CATS=['薪水','股息','股票','獎金','零用','回饋','其他收入'];
const NOT_BUDGET=new Set(['保險','房貸']);

const FIXED_KINDS=['貸款','保險','稅費','其他'];
const GRAYCATS=new Set(['未分類','生活費']);
const S={monthly:{},entries:[],budget:{},plan:{},goals:[],fixed:[],holdings:[],ready:false};
const Q={date:'',prices:{}}; // 每天盤後自動更新的收盤價（quotes.json）
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n||0).toLocaleString('zh-TW');
const money=n=>(n<0?'−':'')+'$'+fmt(Math.abs(n));
const sum=o=>Object.values(o||{}).reduce((a,b)=>a+(+b||0),0);
const pad=n=>String(n).padStart(2,'0');
const today=new Date();
const curYM=`${today.getFullYear()}-${pad(today.getMonth()+1)}`;
const ymAdd=(ym,k)=>{let[y,m]=ym.split('-').map(Number);m+=k;y+=Math.floor((m-1)/12);m=((m-1)%12+12)%12+1;return`${y}-${pad(m)}`};
const roc=y=>y-1911;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const VERSION='2.1.0';
const rocLabel=ym=>`${+ym.slice(5)}月`;

function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2200)}

/* ---------- data ---------- */
let aggCache={};
function agg(ym){
  if(aggCache[ym])return aggCache[ym];
  const inc={},exp={};const add=(o,k,v)=>{o[k]=(o[k]||0)+(+v||0)};
  const m=S.monthly[ym];
  if(m){for(const src of[m,m.extra||{}]){for(const[k,v]of Object.entries(src.income||{}))add(inc,k,v);for(const[k,v]of Object.entries(src.expense||{}))add(exp,k,v)}
        for(const r of m.rows||[])add(r.t==='i'?inc:exp,r.c||'其他',r.a);}
  for(const e of S.entries){if(!e.date||e.date.slice(0,7)!==ym)continue;add(e.type==='income'?inc:exp,e.category||'其他',e.amount)}
  return aggCache[ym]={inc,exp,ti:sum(inc),te:sum(exp),has:!!m||S.entries.some(e=>e.date&&e.date.slice(0,7)===ym)};
}
function years(){const ys=new Set();Object.keys(S.monthly).forEach(k=>ys.add(+k.slice(0,4)));S.entries.forEach(e=>e.date&&ys.add(+e.date.slice(0,4)));return[...ys].sort()}
function monthsWithData(){const s=new Set(Object.keys(S.monthly));S.entries.forEach(e=>e.date&&s.add(e.date.slice(0,7)));return[...s].sort()}
const living=a=>{let t=0;for(const[k,v]of Object.entries(a.exp))if(k!=='房貸')t+=v;return t};
const median=arr=>{if(!arr.length)return 0;const s=[...arr].sort((a,b)=>a-b),h=s.length>>1;return s.length%2?s[h]:(s[h-1]+s[h])/2};
function recentStats(n=12){
  const ms=monthsWithData().filter(k=>k<curYM).slice(-n);
  const as=ms.map(agg);
  return{ms,inc:median(as.map(a=>a.ti).filter(v=>v>0)),liv:median(as.map(living).filter(v=>v>0)),as};
}
function catAvg(){ // average per category over months whose categories are recorded
  const ms=monthsWithData().filter(k=>k<curYM).slice(-12);const tot={};let n=0;
  for(const k of ms){const a=agg(k);const keys=Object.keys(a.exp).filter(c=>!NOT_BUDGET.has(c));
    if(!keys.length||keys.every(c=>GRAYCATS.has(c)))continue;n++;for(const c of keys)if(!GRAYCATS.has(c))tot[c]=(tot[c]||0)+a.exp[c];}
  const out={};for(const c in tot)out[c]=tot[c]/n;return{avg:out,n};
}

/* ---------- db ---------- */
function curRec(col,id){if(col==='settings')return S[id]||null;if(col==='monthly')return S.monthly[id]||null;const r=(S[col]||[]).find(e=>e.id===id);if(!r)return null;const{id:_,...rest}=r;return rest}
function put(col,id,data){
  const prev=curRec(col,id);
  if(col==='entries'){const i=S.entries.findIndex(e=>e.id===id);const d={...data,id};i<0?S.entries.push(d):S.entries[i]=d}
  else if(col==='goals'||col==='fixed'||col==='holdings'){const arr=S[col];const i=arr.findIndex(e=>e.id===id);const d={...data,id};i<0?arr.push(d):arr[i]=d}
  else if(col==='monthly'){S.monthly[id]=data}
  else if(col==='settings'){S[id]=data}
  Sync.op(col,id,data,prev);renderAll();
}
function del(col,id){
  const prev=curRec(col,id);
  if(col==='entries'||col==='goals'||col==='fixed'||col==='holdings')S[col]=S[col].filter(e=>e.id!==id);
  Sync.op(col,id,null,prev);renderAll();
}
function setStatus(t,err){const s=$('#status');s.textContent=t;s.classList.toggle('err',!!err)}

function loadData(d){
  S.monthly=d.monthly||{};S.entries=(d.entries||[]).slice().sort((p,q)=>(q.date||'').localeCompare(p.date||''));
  S.budget=d.budget||{};S.plan=d.plan||{};S.goals=d.goals||[];S.fixed=d.fixed||[];S.holdings=d.holdings||[];S.ready=true;renderAll();
}
function onSyncState(st){setStatus(st.text,st.kind==='error');const b=$('#banner');
  if(st.kind==='error'&&S.ready){b.hidden=false;b.textContent=st.text}else if(st.kind==='local'&&st.pending){b.hidden=false;b.textContent='還沒設定 GitHub 金鑰，修改只存在這台裝置，其他裝置看不到。到「設定」分頁填金鑰就會自動同步。'}else b.hidden=true;
  if(tab==='settings')renderSettings()}
async function start(){
  fetch('quotes.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(q=>{if(q&&q.prices){Q.date=q.date||'';Q.prices=q.prices;renderAll()}}).catch(()=>{});
  const r=await Sync.boot({onData:loadData,onState:onSyncState,onConflicts:c=>{toast(`有 ${c.length} 筆被兩台裝置同時修改，詳情在「設定」`);if(tab==='settings')renderSettings()}});
  if(r==='locked'){$('#lock').hidden=false;$('#pw').focus()}
  else if(r==='error'){$('#lock').hidden=false;$('#lockf').hidden=true;$('#pwerr').textContent='讀不到資料檔，請稍後重新整理。'}
}
$('#lockf').addEventListener('submit',async e=>{e.preventDefault();const btn=$('#lockf button');btn.disabled=true;$('#pwerr').textContent='解鎖中…';
  try{await Sync.unlock($('#pw').value,$('#remember').checked);$('#pw').value='';$('#pwerr').textContent='';$('#lock').hidden=true}
  catch(err){$('#pwerr').textContent='密碼不對。'}finally{btn.disabled=false}});

/* ---------- render helpers ---------- */
function guarded(el,html){ // don't redraw a block while someone is typing in it
  const a=document.activeElement;
  if(a&&el.contains(a)&&/INPUT|SELECT/.test(a.tagName)){el.dataset.stale='1';return false}
  el.innerHTML=html;el.dataset.stale='';return true;
}
document.addEventListener('focusout',e=>{setTimeout(()=>{if(document.querySelector('[data-stale="1"]')&&!(document.activeElement&&/INPUT|SELECT/.test(document.activeElement.tagName)&&document.activeElement.closest('[data-stale="1"]')))renderAll()},0)});
const kpi=(lab,val,note,cls='')=>`<div class="kpi"><span class="lab">${lab}</span><span class="val ${cls}">${val}</span>${note?`<span class="note">${note}</span>`:''}</div>`;
const loading=()=>!S.ready;

function niceMax(v){if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v)));const f=v/p;return(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p}
const kfmt=v=>Math.abs(v)>=10000?(v/10000).toFixed(Math.abs(v)%10000?1:0)+'萬':fmt(v);

function attachTip(box,svg,getHtml){
  let tip=box.querySelector('.tip');if(!tip){tip=document.createElement('div');tip.className='tip';tip.hidden=true;box.appendChild(tip)}
  svg.querySelectorAll('[data-i]').forEach(r=>{
    const show=ev=>{const i=+r.dataset.i;const h=getHtml(i);if(!h){tip.hidden=true;return}
      svg.querySelectorAll('.hl').forEach(x=>x.style.display='none');const hl=svg.querySelector(`.hl[data-h="${i}"]`);if(hl)hl.style.display='';
      tip.innerHTML=h;tip.hidden=false;const bb=box.getBoundingClientRect();const rb=r.getBoundingClientRect();
      let x=rb.left-bb.left+rb.width/2-tip.offsetWidth/2;x=Math.max(0,Math.min(bb.width-tip.offsetWidth,x));
      tip.style.left=x+'px';tip.style.top='4px';};
    r.addEventListener('mouseenter',show);r.addEventListener('click',show);r.addEventListener('focus',show);
    r.addEventListener('mouseleave',()=>{tip.hidden=true;svg.querySelectorAll('.hl').forEach(x=>x.style.display='none')});
  });
}

function barChart(box,labels,inc,exp,tipFn){
  const W=720,H=240,L=46,R=8,T=12,B=26;const n=labels.length;
  const mx=niceMax(Math.max(1,...inc,...exp));const y=v=>T+(H-T-B)*(1-v/mx);
  const slot=(W-L-R)/n;const bw=Math.max(4,Math.min(18,(slot-10)/2));
  let g='';for(let k=0;k<=4;k++){const v=mx*k/4;g+=`<line class="${k?'grid':'zero'}" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${kfmt(v)}</text>`}
  let bars='';
  labels.forEach((lb,i)=>{const cx=L+slot*i+slot/2;
    bars+=`<rect class="hl" data-h="${i}" x="${L+slot*i}" y="${T}" width="${slot}" height="${H-T-B}" style="display:none"/>`;
    const bar=(v,x,cls)=>{if(!v)return'';const top=y(v),h=y(0)-top;const r=Math.min(4,h,bw/2);
      return`<path class="${cls}" d="M${x},${y(0)}V${top+r}Q${x},${top} ${x+r},${top}H${x+bw-r}Q${x+bw},${top} ${x+bw},${top+r}V${y(0)}Z"/>`};
    bars+=bar(inc[i],cx-bw-1,'b-inc')+bar(exp[i],cx+1,'b-exp');
    bars+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${esc(lb)}</text>`;
    bars+=`<rect class="hit" data-i="${i}" tabindex="0" x="${L+slot*i}" y="${T}" width="${slot}" height="${H-T}"/>`;
  });
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每月收入與支出長條圖">${g}${bars}</svg>`;
  attachTip(box,box.querySelector('svg'),tipFn);
}
function lineChart(box,labels,vals,tipFn,aria){
  const W=720,H=170,L=46,R=12,T=14,B=26;const n=labels.length;
  const pts=vals.map((v,i)=>v==null?null:[i,v]).filter(Boolean);
  if(!pts.length){box.innerHTML='<div class="empty">還沒有資料</div>';return}
  let mn=Math.min(0,...pts.map(p=>p[1])),mx=Math.max(0,...pts.map(p=>p[1]));
  const span=niceMax(Math.max(mx-mn,1));const step=span/4;mn=Math.floor(mn/step)*step;mx=Math.ceil(mx/step)*step;if(mx===mn)mx=mn+step;
  const slot=(W-L-R)/n;const x=i=>L+slot*i+slot/2;const y=v=>T+(H-T-B)*(1-(v-mn)/(mx-mn));
  let g='';for(let v=mn;v<=mx+1e-6;v+=step){g+=`<line class="${Math.abs(v)<1e-6?'zero':'grid'}" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${kfmt(v)}</text>`}
  const d=pts.map((p,k)=>(k?'L':'M')+x(p[0])+','+y(p[1])).join('');
  const area=d+`L${x(pts[pts.length-1][0])},${y(Math.max(mn,0))}L${x(pts[0][0])},${y(Math.max(mn,0))}Z`;
  let lab='';labels.forEach((lb,i)=>{lab+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${esc(lb)}</text><rect class="hl" data-h="${i}" x="${L+slot*i}" y="${T}" width="${slot}" height="${H-T-B}" style="display:none"/><rect class="hit" data-i="${i}" tabindex="0" x="${L+slot*i}" y="${T}" width="${slot}" height="${H-T}"/>`});
  const last=pts[pts.length-1];
  const endLbl=`<text x="${Math.min(x(last[0]),W-R-4)}" y="${y(last[1])-10}" text-anchor="end" style="fill:var(--ink);font-weight:500">${kfmt(last[1])}</text>`;
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${g}<path class="area" d="${area}"/><path class="line" d="${d}"/><circle class="dot" cx="${x(last[0])}" cy="${y(last[1])}" r="4.5"/>${endLbl}${lab}</svg>`;
  attachTip(box,box.querySelector('svg'),tipFn);
}

/* ---------- 總覽 ---------- */
let ovYear=null;
function renderOverview(){
  const ys=years();
  if(loading()&&!ys.length){$('#ov-kpis').innerHTML=kpi('年收入','…')+kpi('年支出','…')+kpi('結餘','…')+kpi('儲蓄率','…');return}
  if(!ys.length){
    $('#ov-years').innerHTML='';$('#ov-kpis').innerHTML=kpi('年收入','$0')+kpi('年支出','$0')+kpi('結餘','$0')+kpi('儲蓄率','—');
    $('#ov-chart').innerHTML='<div class="empty">還沒有任何收支資料。到「記帳」記下第一筆，這裡就會出現圖表。</div>';
    $('#ov-cum').innerHTML='';$('#ov-cats').innerHTML='';$('#ov-ins').innerHTML='';$('#ov-table').innerHTML='';return;
  }
  if(!ovYear||!ys.includes(ovYear))ovYear=ys.includes(today.getFullYear())&&monthsWithData().filter(k=>k.startsWith(today.getFullYear())).length>=2?today.getFullYear():ys[ys.length-1];
  $('#ov-years').innerHTML=ys.map(y=>`<button class="chip" data-y="${y}" aria-pressed="${y===ovYear}">${roc(y)}年 · ${y}</button>`).join('');
  $('#ov-title').textContent=`民國 ${roc(ovYear)} 年總覽`;
  const ms=[...Array(12)].map((_,i)=>`${ovYear}-${pad(i+1)}`);
  const as=ms.map(agg);
  const ti=as.reduce((a,b)=>a+b.ti,0),te=as.reduce((a,b)=>a+b.te,0),bal=ti-te;
  const nM=as.filter(a=>a.has).length;
  $('#ov-kpis').innerHTML=kpi('年收入',money(ti),`${nM} 個月有記錄`)+kpi('年支出',money(te),nM?`平均每月 ${money(te/nM)}`:'')+
    kpi('結餘',money(bal),bal<0?'支出比收入多':'收入大於支出',bal<0?'neg':'pos')+kpi('儲蓄率',ti?Math.round(bal/ti*100)+'%':'—','結餘 ÷ 收入',bal<0?'neg':'');
  const labels=ms.map(rocLabel);
  const tip=i=>{const a=as[i];if(!a.has)return`<b>${ovYear}年${i+1}月</b><div class="muted">沒有記錄</div>`;
    const top=Object.entries(a.exp).filter(([k])=>k!=='房貸').sort((p,q)=>q[1]-p[1]).slice(0,3);
    return`<b>${roc(ovYear)}年${i+1}月</b><div class="r"><span>收入</span><span>${money(a.ti)}</span></div><div class="r"><span>支出</span><span>${money(a.te)}</span></div><div class="r"><span>結餘</span><span>${money(a.ti-a.te)}</span></div>`+
      (top.length?`<div style="margin-top:4px;opacity:.75">最多：${top.map(([k,v])=>`${esc(k)} ${kfmt(v)}`).join('、')}</div>`:'')};
  barChart($('#ov-chart'),labels,as.map(a=>a.ti),as.map(a=>a.te),tip);
  let run=0;const lastIdx=as.map(a=>a.has).lastIndexOf(true);
  const cum=as.map((a,i)=>{run+=a.ti-a.te;return i<=lastIdx?run:null});
  lineChart($('#ov-cum'),labels,cum,i=>cum[i]==null?'':`<b>${roc(ovYear)}年${i+1}月底</b><div class="r"><span>累計結餘</span><span>${money(cum[i])}</span></div>`,'累計結餘折線圖');
  // categories
  const cats={};as.forEach(a=>{for(const[k,v]of Object.entries(a.exp))if(k!=='房貸')cats[k]=(cats[k]||0)+v});
  const list=Object.entries(cats).filter(([,v])=>v>0).sort((p,q)=>GRAYCATS.has(p[0])-GRAYCATS.has(q[0])||q[1]-p[1]);
  const cmax=Math.max(1,...list.map(x=>x[1]));const ctot=sum(cats);
  $('#ov-cats').innerHTML=list.length?list.map(([k,v])=>`<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill ${GRAYCATS.has(k)?'gray':''}" style="width:${v/cmax*100}%"></div></div><span class="v">${fmt(v)} <span class="muted">${Math.round(v/ctot*100)}%</span></span></div>`).join(''):'<div class="empty">這一年沒有分類資料</div>';
  // insights
  const ins=[];const had=as.map((a,i)=>({a,i})).filter(x=>x.a.has);
  if(had.length){
    const worst=had.reduce((p,q)=>q.a.ti-q.a.te<p.a.ti-p.a.te?q:p);
    const wTop=Object.entries(worst.a.exp).filter(([k])=>k!=='房貸').sort((p,q)=>q[1]-p[1])[0];
    ins.push(`<li>赤字最大的是 <strong>${worst.i+1}月</strong>（${money(worst.a.ti-worst.a.te)}），主要是${wTop?`<strong>${esc(wTop[0])}</strong> ${money(wTop[1])}`:'支出偏高'}。</li>`);
    const neg=had.filter(x=>x.a.ti<x.a.te).length;
    ins.push(`<li>${had.length} 個月裡有 <strong>${neg} 個月</strong>入不敷出。</li>`);
    const top=list.find(([k])=>!GRAYCATS.has(k));
    if(top)ins.push(`<li>最大的花費類別是 <strong>${esc(top[0])}</strong>，全年 ${money(top[1])}，佔生活支出 ${Math.round(top[1]/ctot*100)}%。</li>`);
    const mort=as.reduce((a,b)=>a+(b.exp['房貸']||0),0);
    if(mort)ins.push(`<li>房貸全年 ${money(mort)}，佔收入 ${ti?Math.round(mort/ti*100):0}%。</li>`);
    const yearly=S.fixed.filter(f=>f.freq==='yearly').reduce((a,f)=>a+(+f.amount||0),0);
    if(yearly)ins.push(`<li>每年一次的固定支出共 ${money(yearly)}，每月先存 <strong>${money(yearly/12)}</strong> 就不會在繳費月份變赤字。</li>`);
  }
  $('#ov-ins').innerHTML=ins.join('')||'<li>資料再多一些就能看出趨勢。</li>';
  // table
  let rows='';as.forEach((a,i)=>{if(!a.has)return;const b=a.ti-a.te;rows+=`<tr><td>${i+1}月</td><td class="num r">${fmt(a.ti)}</td><td class="num r">${fmt(a.exp['房貸']||0)}</td><td class="num r">${fmt(living(a))}</td><td class="num r">${fmt(a.te)}</td><td class="num r ${b<0?'neg':'pos'}">${b<0?'−':''}${fmt(Math.abs(b))}</td><td class="small muted">${esc((S.monthly[ms[i]]||{}).note||'')}</td></tr>`});
  $('#ov-table').innerHTML=`<table><thead><tr><th>月份</th><th class="r">收入</th><th class="r">房貸</th><th class="r">生活支出</th><th class="r">總支出</th><th class="r">結餘</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table>`;
}
$('#ov-years').addEventListener('click',e=>{const b=e.target.closest('[data-y]');if(b){ovYear=+b.dataset.y;renderOverview()}});

/* ---------- 記帳 ---------- */
let eType='expense';
function fillCats(){const sel=$('#e-cat');const cur=sel.value;const list=eType==='income'?INC_CATS:EXP_CATS;sel.innerHTML=list.map(c=>`<option>${c}</option>`).join('');if(list.includes(cur))sel.value=cur}
$('#e-type').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;eType=b.dataset.v;$('#e-type').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));fillCats()});
$('#e-date').value=`${curYM}-${pad(today.getDate())}`;$('#lg-month').value=curYM;$('#bg-month').value=curYM;
fillCats();
$('#entry-form').addEventListener('submit',e=>{e.preventDefault();const amt=Math.round(+$('#e-amt').value);if(!amt||amt<0){toast('請輸入金額');return}
  const d={date:$('#e-date').value,type:eType,category:$('#e-cat').value,amount:amt,note:$('#e-note').value.trim(),createdAt:new Date().toISOString()};
  put('entries',uid(),d);$('#e-amt').value='';$('#e-note').value='';$('#lg-month').value=d.date.slice(0,7);toast(`已記下 ${d.category} ${money(amt)}`);$('#e-amt').focus()});
$('#lg-month').addEventListener('change',renderLedger);
function renderLedger(){
  const ym=$('#lg-month').value||curYM;const[y,m]=ym.split('-');
  $('#lg-title').textContent=`${roc(+y)}年${+m}月記錄`;
  const a=agg(ym);const hist=S.monthly[ym];
  const own=S.entries.filter(e=>e.date&&e.date.startsWith(ym)).map(e=>({...e,own:true}));
  const imp=((hist&&hist.rows)||[]).map((r,i)=>({id:'r'+i,date:r.d,type:r.t==='i'?'income':'expense',category:r.c,amount:r.a,note:r.n,sub:r.s}));
  const list=own.concat(imp).sort((p,q)=>q.date.localeCompare(p.date)||(q.createdAt||'').localeCompare(p.createdAt||''));
  const legacy=hist&&!hist.rows&&(hist.income||hist.expense);
  $('#lg-kpis').innerHTML=kpi('收入',money(a.ti))+kpi('支出',money(a.te))+kpi('結餘',money(a.ti-a.te),'',a.ti-a.te<0?'neg':'pos')+kpi('筆數',String(list.length),imp.length?`其中 ${imp.length} 筆從 smoney 匯入`:legacy?'另含匯入的月總計':'');
  if(loading()){$('#lg-list').innerHTML='<div class="empty">載入中…</div>';return}
  const extraNote=hist&&hist.note?`<p class="small muted" style="margin:0">備註：${esc(hist.note)}</p>`:'';
  if(!list.length){$('#lg-list').innerHTML=`<div class="empty">${legacy?'這個月的資料是從 Excel 匯入的月總計，沒有逐筆記錄。':'這個月還沒有記錄，從上面記下第一筆。'}</div>`+extraNote;return}
  $('#lg-list').innerHTML=extraNote+`<table><thead><tr><th>日期</th><th>類別</th><th>備註</th><th class="r">金額</th><th></th></tr></thead><tbody>${list.map(e=>`<tr><td class="num">${esc(e.date.slice(5).replace('-','/'))}</td><td><span class="pill ${e.type==='income'?'inc':'exp'}">${esc(e.category)}</span>${e.sub&&e.sub!==e.category?` <span class="small muted">${esc(e.sub)}</span>`:''}</td><td>${esc(e.note)}</td><td class="num r ${e.type==='income'?'pos':''}">${e.type==='income'?'+':'−'}${fmt(e.amount)}</td><td class="r">${e.own?`<button class="btn sm del" data-del="${esc(e.id)}" type="button">刪除</button>`:'<span class="small muted">smoney</span>'}</td></tr>`).join('')}</tbody></table>`;
}
function armDelete(container,col){container.addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b)return;
  if(b.classList.contains('arm')){del(col,b.dataset.del);toast('已刪除');return}
  b.classList.add('arm');b.textContent='確定刪除';setTimeout(()=>{if(b.isConnected){b.classList.remove('arm');b.textContent='刪除'}},3000)})}
armDelete($('#lg-list'),'entries');
let pending=null;
const ymLabel=ym=>`${roc(+ym.slice(0,4))}/${+ym.slice(5)}月`;
const STATUS_TXT={new:['新月份','inc'],changed:['有變動','exp'],same:['沒變','']};
const needConfirm=()=>!!(pending&&pending.risks&&pending.risks.some(r=>r.kind!=='extra')&&!$('#imp-ok').checked);
function renderImpRisks(){const box=$('#imp-risk');const rs=(pending&&pending.risks)||[];if(!rs.length){box.innerHTML='';box.hidden=true;return}
  const serious=rs.some(r=>r.kind!=='extra');box.hidden=false;
  box.innerHTML=`<b>${serious?'匯入前請確認':'提醒'}</b><ul>${rs.map(r=>`<li>${esc(r.text)}</li>`).join('')}</ul>${serious?'<label class="small"><input type="checkbox" id="imp-ok"> 我看過了，照樣匯入</label>':''}`;
  const ok=$('#imp-ok');if(ok)ok.addEventListener('change',()=>{$('#imp-go').disabled=needConfirm()})}
function renderImpPreview(){const box=$('#imp-preview');if(!pending){box.innerHTML='';return}
  const d=pending.diff;const tot=t=>t?`<span class="num" style="white-space:nowrap">+${fmt(t.i)} / −${fmt(t.e)}</span>`:'<span class="muted">—</span>';
  box.innerHTML=`<table><thead><tr><th>月份</th><th>狀態</th><th class="r">目前（收 / 支）</th><th class="r">匯入後（收 / 支）</th><th class="r">筆數</th></tr></thead><tbody>${d.map(x=>{const[t,c]=STATUS_TXT[x.status];
    return`<tr class="${x.status==='same'?'muted':''}"><td>${ymLabel(x.ym)}</td><td>${c?`<span class="pill ${c}">${t}</span>`:`<span class="small muted">${t}</span>`}</td><td class="r">${tot(x.old)}</td><td class="r">${tot(x.new)}</td><td class="num r">${x.old&&x.old.n?`${x.old.n} → `:''}${x.new.n}</td></tr>`}).join('')}</tbody></table>`}
$('#imp-file').addEventListener('change',async e=>{const f=e.target.files[0];pending=null;$('#imp-go').disabled=true;renderImpPreview();renderImpRisks();if(!f)return;
  try{const p=parseSmoney(await f.text());const ms=Object.keys(p.by).sort();if(!ms.length)throw new Error('檔案裡沒有可以匯入的收支記錄');
    p.diff=diffMonths(p.by,S.monthly);const todo=p.diff.filter(x=>x.status!=='same');pending=p;renderImpPreview();
    const sub={};todo.forEach(x=>sub[x.ym]=p.by[x.ym]);p.risks=importRisks(sub,S.monthly,S.entries);renderImpRisks();
    $('#imp-go').disabled=!todo.length||needConfirm();
    $('#imp-msg').textContent=`找到 ${p.n.toLocaleString()} 筆，${ymLabel(ms[0])} 到 ${ymLabel(ms[ms.length-1])}。`+(todo.length?`會更新 ${todo.length} 個月${ms.length>todo.length?`，其餘 ${ms.length-todo.length} 個月跟現在一樣，會跳過`:''}。按「匯入」開始。`:'每個月都跟現在一樣，不用匯入。')+(p.skipped?`（略過 ${p.skipped} 筆格式不對的資料）`:'')}
  catch(err){$('#imp-msg').textContent='無法讀取：'+(err.message||err)}});
$('#imp-go').addEventListener('click',async()=>{if(!pending||needConfirm())return;const ms=pending.diff.filter(x=>x.status!=='same').map(x=>x.ym);$('#imp-go').disabled=true;let done=0;
  for(const ym of ms){const old=S.monthly[ym]||{};const d={ym,rows:pending.by[ym],source:'smoney',importedAt:new Date().toISOString()};
    if(old.extra)d.extra=old.extra;if(old.note)d.note=old.note;
    const prevM=S.monthly[ym]||null;S.monthly[ym]=d;Sync.op('monthly',ym,d,prevM);
    done++;$('#imp-msg').textContent=`匯入中… ${done}/${ms.length} 個月`}
  pending=null;renderImpPreview();renderImpRisks();$('#imp-file').value='';$('#imp-msg').textContent=`完成，已更新 ${done} 個月：${ms.map(ymLabel).join('、')}。`;toast('匯入完成');renderAll()});

/* ---------- 預算 ---------- */
$('#bg-month').addEventListener('change',renderBudget);
let bgTimer;
function renderBudget(){
  const ym=$('#bg-month').value||curYM;const a=agg(ym);const{avg,n}=catAvg();const bud=S.budget.cats||{};
  const cats=EXP_CATS.filter(c=>!NOT_BUDGET.has(c));
  const totB=cats.reduce((t,c)=>t+(+bud[c]||0),0);const spent=cats.reduce((t,c)=>t+(a.exp[c]||0),0);const avgT=Object.entries(avg).reduce((t,[,v])=>t+v,0);
  const{inc}=recentStats();
  $('#bg-kpis').innerHTML=kpi('每月預算合計',money(totB),inc?`約佔收入 ${Math.round(totB/inc*100)}%`:'')+kpi('過去平均',money(avgT),n?`取 ${n} 個月`:'尚無分類資料')+kpi(`${+ym.slice(5)}月已花`,money(spent),totB?`預算的 ${Math.round(spent/totB*100)}%`:'',totB&&spent>totB?'neg':'')+kpi('還能花',totB?money(totB-spent):'—','',totB-spent<0?'neg':'');
  const rows=cats.map(c=>{const b=+bud[c]||0,s=a.exp[c]||0,av=avg[c]||0;const p=b?s/b:0;
    const st=!b?'':p>1?'<span class="pill bad">超支</span>':p>.8?'<span class="pill warn">快用完</span>':'<span class="pill good">正常</span>';
    return`<tr><td>${c}</td><td class="r"><input class="cell" type="number" min="0" step="100" id="bud-${c}" data-cat="${c}" value="${b||''}" placeholder="${av?Math.round(av/100)*100:''}"></td><td class="num r muted">${av?fmt(av):'—'}</td><td class="num r">${s?fmt(s):'—'}</td><td style="min-width:120px"><div class="prog"><div class="${p>1?'bad':p>.8?'warn':''}" style="width:${Math.min(100,p*100)}%"></div></div></td><td>${st}</td></tr>`}).join('');
  guarded($('#bg-table'),`<table><thead><tr><th>類別</th><th class="r">每月預算</th><th class="r">過去平均</th><th class="r">本月已花</th><th>進度</th><th></th></tr></thead><tbody>${rows}</tbody></table>`);
}
$('#bg-table').addEventListener('input',e=>{const i=e.target.closest('[data-cat]');if(!i)return;clearTimeout(bgTimer);bgTimer=setTimeout(saveBudget,700)});
$('#bg-table').addEventListener('change',()=>{clearTimeout(bgTimer);saveBudget()});
function saveBudget(){const cats={...(S.budget.cats||{})};$('#bg-table').querySelectorAll('[data-cat]').forEach(i=>{const v=Math.round(+i.value);if(v>0)cats[i.dataset.cat]=v;else delete cats[i.dataset.cat]});
  if(JSON.stringify(cats)===JSON.stringify(S.budget.cats||{}))return;put('settings','budget',{...S.budget,cats,updatedAt:new Date().toISOString()});}

/* ---------- 規劃 ---------- */
function planParams(){const st=recentStats();const budT=sum(S.budget.cats||{});
  return{save:+S.plan.savings||0,inc:S.plan.income!=null&&S.plan.income!==''?+S.plan.income:Math.round(st.inc),liv:S.plan.living!=null&&S.plan.living!==''?+S.plan.living:Math.round(budT||st.liv),st,budT}}
function projection(){
  const p=planParams();const start=ymAdd(curYM,1);const out=[];let bal=p.save;
  for(let k=0;k<12;k++){const ym=ymAdd(start,k);const mo=+ym.slice(5);const items=[];
    for(const f of S.fixed){const amt=+f.amount||0;if(!amt)continue;if(f.freq==='monthly'||(f.freq==='yearly'&&+f.month===mo))items.push([f.name,amt,f.freq])}
    const fx=items.reduce((a,b)=>a+b[1],0);const net=p.inc-p.liv-fx;bal+=net;out.push({ym,items,fx,net,bal})}
  return{p,out};
}
function renderPlan(){
  const{p,out}=projection();
  ['save','inc','liv'].forEach(k=>{const el=$('#pl-'+k);if(document.activeElement!==el)el.value=k==='save'?(S.plan.savings??''):p[k]||''});
  $('#pl-save').placeholder='例如 200000';
  const hasInc=S.plan.income!=null&&S.plan.income!=='',hasLiv=S.plan.living!=null&&S.plan.living!=='';
  $('#pl-hint').textContent=`收入${hasInc?`用你填的 ${money(p.inc)}（最近 ${p.st.ms.length} 個月中位數是 ${money(p.st.inc)}）`:`用最近 ${p.st.ms.length} 個月的中位數 ${money(p.st.inc)}`}；生活費${hasLiv?`用你填的 ${money(p.liv)}`:p.budT?`用預算合計 ${money(p.budT)}`:`用最近月份的中位數 ${money(p.st.liv)}`}。清空欄位就會改回預設。存款是現金合計，買進 0050 的錢會從這裡移到投資。`;
  const low=out.reduce((a,b)=>b.bal<a.bal?b:a,out[0]);const end=out[out.length-1];
  const neg=out.filter(o=>o.net<0);
  $('#pl-kpis').innerHTML=kpi('一年後存款',money(end.bal),`比現在 ${end.bal-p.save>=0?'多':'少'} ${money(Math.abs(end.bal-p.save))}`,end.bal<p.save?'neg':'pos')+
    kpi('平常月份可存',money(p.inc-p.liv-S.fixed.filter(f=>f.freq==='monthly').reduce((a,f)=>a+(+f.amount||0),0)),'沒有年繳費用的月份')+
    kpi('最低點',money(low.bal),`${roc(+low.ym.slice(0,4))}年${+low.ym.slice(5)}月`,low.bal<0?'neg':'')+
    kpi('赤字月份',neg.length+' 個月',neg.length?neg.map(o=>+o.ym.slice(5)+'月').join('、'):'每個月都有結餘',neg.length?'neg':'pos');
  const labels=out.map(o=>(+o.ym.slice(5)===1?`${roc(+o.ym.slice(0,4))}/`:'')+(+o.ym.slice(5))+'月');
  lineChart($('#pl-chart'),labels,out.map(o=>o.bal),i=>{const o=out[i];return`<b>${roc(+o.ym.slice(0,4))}年${+o.ym.slice(5)}月</b><div class="r"><span>當月結餘</span><span>${money(o.net)}</span></div>${o.items.map(t=>`<div class="r"><span>${esc(t[0])}</span><span>−${fmt(t[1])}</span></div>`).join('')}<div class="r"><span>月底存款</span><span>${money(o.bal)}</span></div>`},'未來12個月存款預估');
  $('#pl-table').innerHTML=`<table><thead><tr><th>月份</th><th class="r">收入</th><th class="r">生活費</th><th class="r">固定支出</th><th>內容</th><th class="r">當月結餘</th><th class="r">月底存款</th></tr></thead><tbody>${out.map(o=>`<tr><td>${roc(+o.ym.slice(0,4))}/${+o.ym.slice(5)}月</td><td class="num r">${fmt(p.inc)}</td><td class="num r">${fmt(p.liv)}</td><td class="num r">${fmt(o.fx)}</td><td class="small">${o.items.filter(t=>t[2]==='yearly').map(t=>`<span class="pill warn">${esc(t[0])}</span>`).join(' ')}</td><td class="num r ${o.net<0?'neg':''}">${o.net<0?'−':''}${fmt(Math.abs(o.net))}</td><td class="num r">${fmt(o.bal)}</td></tr>`).join('')}</tbody></table>`;
  renderStrategy();
  renderGoals(p);
}

/* ---------- 理財計畫：獎金分配、存款、原則 ---------- */
const PAY_CATS=['薪水','獎金'];
function strategyCfg(){const st=S.plan.strategy||{};return{baseNet:+st.baseNet||0,gap:+st.gap||0,split:st.split||{invest:50,big:30,free:20},cash:st.cash||[],advice:st.advice||[]}}
let bonusTouched=false;
function renderStrategy(){
  const c=strategyCfg();const box=$('#bn-split');
  if(!c.baseNet){$('#bn-rule').textContent='';$('#bn-why').textContent='還沒有設定底薪與分配比例。';box.innerHTML='';$('#bn-hist').innerHTML='';$('#cash-alloc').innerHTML='<div class="empty">還沒有存款分配</div>';$('#pl-advice').innerHTML='';return}
  $('#bn-rule').textContent=`先補 ${fmt(c.gap)}，剩下 ${c.split.invest}% 買 0050 · ${c.split.big}% 年度大項 · ${c.split.free}% 自由花`;
  $('#bn-why').textContent=`底薪實領 ${fmt(c.baseNet)}，但生活費預算、房貸和保險預備加起來每月要多 ${fmt(c.gap)}，所以獎金先補這個缺口，剩下的才分。`;
  const bonusOf=ym=>{const a=agg(ym);return Math.max(0,PAY_CATS.reduce((t,k)=>t+(a.inc[k]||0),0)-c.baseNet)};
  const hist=monthsWithData().filter(k=>k<=curYM).slice(-6);
  const inp=$('#pl-bonus');if(!bonusTouched&&document.activeElement!==inp){const last=hist[hist.length-1];inp.value=last?bonusOf(last):''}
  const split=b=>{const g=Math.min(b,c.gap),r=Math.max(0,b-c.gap);return{g,inv:Math.round(r*c.split.invest/100),big:Math.round(r*c.split.big/100),free:Math.round(r*c.split.free/100)}};
  const x=split(Math.max(0,+inp.value||0));
  box.innerHTML=kpi('補生活與保險',money(x.g),x.g<c.gap?`還差 ${money(c.gap-x.g)}，這個月不用投資`:'')+kpi(`買 0050（${c.split.invest}%）`,money(x.inv))+kpi(`年度大項（${c.split.big}%）`,money(x.big),'旅遊、美容療程')+kpi(`自由花（${c.split.free}%）`,money(x.free));
  $('#bn-hist').innerHTML=`<table><thead><tr><th>月份</th><th class="r">薪資入帳</th><th class="r">業績獎金</th><th class="r">補缺口</th><th class="r">0050</th><th class="r">年度大項</th><th class="r">自由花</th></tr></thead><tbody>${hist.map(ym=>{const a=agg(ym);const pay=PAY_CATS.reduce((t,k)=>t+(a.inc[k]||0),0);const b=bonusOf(ym);const y=split(b);
    return`<tr><td>${roc(+ym.slice(0,4))}/${+ym.slice(5)}月${ym===curYM?' <span class="small muted">本月</span>':''}</td><td class="num r">${fmt(pay)}</td><td class="num r">${fmt(b)}</td><td class="num r">${fmt(y.g)}</td><td class="num r">${fmt(y.inv)}</td><td class="num r">${fmt(y.big)}</td><td class="num r">${fmt(y.free)}</td></tr>`}).join('')}</tbody></table>`;
  const tot=c.cash.reduce((t,r)=>t+(+r.amount||0),0);
  $('#cash-alloc').innerHTML=c.cash.length?`<div class="bars">${c.cash.map(r=>`<div class="bar-row" style="grid-template-columns:7.5em 1fr 6.5em"><span>${esc(r.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${tot?r.amount/tot*100:0}%;background:var(--accent)"></div></div><span class="v">${fmt(r.amount)}</span></div>`).join('')}</div><ul class="insights" style="margin-top:8px">${c.cash.filter(r=>r.note).map(r=>`<li><strong>${esc(r.name)}</strong>：${esc(r.note)}</li>`).join('')}</ul>`:'<div class="empty">還沒有存款分配</div>';
  $('#pl-advice').innerHTML=c.advice.map(t=>`<li>${esc(t)}</li>`).join('');
}
$('#pl-bonus').addEventListener('input',()=>{bonusTouched=true;renderStrategy()});
function renderGoals(p){
  const monthly=p.inc-p.liv-S.fixed.filter(f=>f.freq==='monthly').reduce((a,f)=>a+(+f.amount||0),0)-S.fixed.filter(f=>f.freq==='yearly').reduce((a,f)=>a+(+f.amount||0),0)/12;
  const gs=[...S.goals].sort((a,b)=>(a.due||'').localeCompare(b.due||''));
  if(!gs.length){guarded($('#gl-list'),'<div class="empty">還沒有存錢目標。在下面填一個，例如「緊急預備金」或「旅遊基金」。</div>');return}
  let need=0;
  const html=gs.map(g=>{const left=Math.max(0,(+g.target||0)-(+g.saved||0));const[y,m]=(g.due||curYM).split('-').map(Number);const[cy,cm]=curYM.split('-').map(Number);
    const months=Math.max(1,(y-cy)*12+(m-cm));const per=left/months;need+=left?per:0;const pct=g.target?Math.min(100,(+g.saved||0)/g.target*100):0;
    return`<div class="goal"><div style="display:flex;flex-direction:column;gap:6px;min-width:0"><div class="row" style="gap:8px"><h3>${esc(g.name)}</h3>${left?'':'<span class="pill good">達成</span>'}</div>
      <div class="prog"><div style="width:${pct}%"></div></div>
      <div class="meta">已存 <span class="num">${fmt(g.saved)}</span> / <span class="num">${fmt(g.target)}</span> · 期限 ${roc(y)}年${m}月${left?` · 還差 ${money(left)}，每月要存 <strong class="num">${money(per)}</strong>（${months} 個月）`:''}</div></div>
      <div class="row" style="align-items:flex-start;gap:6px"><label class="small muted" for="gs-${esc(g.id)}">已存</label><input class="cell" id="gs-${esc(g.id)}" type="number" min="0" step="100" data-gsaved="${esc(g.id)}" value="${+g.saved||0}"><button class="btn sm del" type="button" data-del="${esc(g.id)}">刪除</button></div></div>`}).join('');
  const verdict=need<=monthly?`<span class="pill good">做得到</span> 所有目標每月合計要存 ${money(need)}，預估每月可存 ${money(monthly)}（已扣掉年繳費用的提撥）。`:`<span class="pill bad">不夠</span> 所有目標每月合計要存 ${money(need)}，但預估每月只能存 ${money(monthly)}，差 ${money(need-monthly)}。可以延後期限或調降生活費預算。`;
  guarded($('#gl-list'),`<p style="margin:0 0 4px" class="small">${verdict}</p>${html}`);
}
['save','inc','liv'].forEach(k=>$('#pl-'+k).addEventListener('change',e=>{const key={save:'savings',inc:'income',liv:'living'}[k];const v=e.target.value===''?null:Math.round(+e.target.value);
  const plan={...S.plan};if(v==null)delete plan[key];else plan[key]=v;put('settings','plan',plan);toast('已更新預估')}));
$('#goal-form').addEventListener('submit',e=>{e.preventDefault();put('goals',uid(),{name:$('#g-name').value.trim(),target:Math.round(+$('#g-target').value),saved:Math.round(+$('#g-saved').value||0),due:$('#g-due').value});e.target.reset();$('#g-saved').value=0;toast('已新增目標')});
$('#g-due').value=ymAdd(curYM,12);
$('#gl-list').addEventListener('change',e=>{const i=e.target.closest('[data-gsaved]');if(!i)return;const g=S.goals.find(x=>x.id===i.dataset.gsaved);if(!g)return;const{id,...rest}=g;put('goals',id,{...rest,saved:Math.round(+i.value||0)})});
armDelete($('#gl-list'),'goals');


/* ---------- 投資 ---------- */
const isETF=c=>/^00/.test(String(c));
/* 現價：quotes.json 的收盤價比手動輸入的新就用收盤價 */
function quoteFor(h){const q=Q.prices[String(h.code).toUpperCase()];return q&&Q.date&&Q.date>(h.updatedAt||'').slice(0,10)?+q:null}
const priceOf=h=>quoteFor(h)??(+h.price||0);
function holdCalc(h){const mv=(+h.shares||0)*priceOf(h);const net=mv*(1-0.001425-(isETF(h.code)?0.001:0.003));const cost=+h.cost||0;const pnl=net-cost;
  return{mv,net,cost,pnl,pct:cost?pnl/cost:0,avg:h.shares?cost/h.shares:0,div:(+h.div||0)*(+h.shares||0)}}
function renderInvest(){
  const hs=[...S.holdings].sort((a,b)=>holdCalc(b).mv-holdCalc(a).mv);
  const cs=hs.map(holdCalc);const mv=cs.reduce((a,c)=>a+c.mv,0),cost=cs.reduce((a,c)=>a+c.cost,0),pnl=cs.reduce((a,c)=>a+c.pnl,0),div=cs.reduce((a,c)=>a+c.div,0);
  const auto=hs.some(h=>quoteFor(h)!=null);const upd=auto?Q.date:hs.map(h=>(h.updatedAt||'').slice(0,10)).sort().pop();$('#iv-upd').textContent=upd?`現價${auto?'（收盤價自動更新）':''}：${upd.replace(/-/g,'/')}`:'';
  $('#iv-kpis').innerHTML=kpi('市值',money(mv),`${hs.length} 檔`)+kpi('投入成本',money(cost))+kpi('未實現損益',(pnl>=0?'+':'')+money(pnl),cost?`報酬率 ${(pnl/cost*100).toFixed(1)}%`:'',pnl<0?'neg':'pos')+kpi('預估年配息',div?money(div):'—',div?`約每月 ${money(div/12)}`:'在表格填「每股年配息」就會算');
  if(loading()&&!hs.length){$('#iv-table').innerHTML='<div class="empty">載入中…</div>';return}
  if(!hs.length){guarded($('#iv-table'),'<div class="empty">還沒有持股。用右下的表單新增。</div>');$('#iv-alloc').innerHTML='';return}
  const hid=h=>esc(h.id);
  guarded($('#iv-table'),`<table><thead><tr><th>股票</th><th class="r">股數</th><th class="r">付出成本</th><th class="r">均價</th><th class="r">現價</th><th class="r">市值</th><th class="r">損益</th><th class="r">報酬率</th><th class="r">每股年配息</th><th></th></tr></thead><tbody>${hs.map((h,i)=>{const c=cs[i];return`<tr data-hid="${hid(h)}">
    <td><div class="num">${esc(h.code)}</div><div class="small muted">${esc(h.name)}</div></td>
    <td class="r"><input class="cell" type="number" min="0" step="1" id="hs-${hid(h)}" data-k="shares" value="${+h.shares||0}" style="max-width:6.5em"></td>
    <td class="r"><input class="cell" type="number" min="0" step="1" id="hc-${hid(h)}" data-k="cost" value="${+h.cost||0}" style="max-width:7.5em"></td>
    <td class="num r muted">${c.avg.toFixed(2)}</td>
    <td class="r"><input class="cell" type="number" min="0" step="0.01" id="hp-${hid(h)}" data-k="price" value="${priceOf(h)}" style="max-width:6.5em"></td>
    <td class="num r">${fmt(c.mv)}</td>
    <td class="num r ${c.pnl<0?'neg':'pos'}">${c.pnl<0?'−':'+'}${fmt(Math.abs(c.pnl))}</td>
    <td class="num r ${c.pnl<0?'neg':'pos'}">${(c.pct*100).toFixed(2)}%</td>
    <td class="r"><input class="cell" type="number" min="0" step="0.01" id="hd-${hid(h)}" data-k="div" value="${h.div??''}" placeholder="未填" style="max-width:6em"></td>
    <td class="r"><button class="btn sm del" type="button" data-del="${hid(h)}">刪除</button></td></tr>`}).join('')}</tbody></table>`);
  $('#iv-alloc').innerHTML=hs.map((h,i)=>`<div class="bar-row"><span>${esc(h.code)}</span><div class="bar-track"><div class="bar-fill" style="width:${mv?cs[i].mv/mv*100:0}%;background:var(--inc)"></div></div><span class="v">${mv?Math.round(cs[i].mv/mv*100):0}%</span></div>`).join('')+
    `<p class="small muted" style="margin:4px 0 0">${hs.map(h=>`${esc(h.code)} ${esc(h.name)}`).join('、')}</p>`;
}
$('#iv-table').addEventListener('change',e=>{const el=e.target.closest('[data-k]');if(!el)return;const h=S.holdings.find(x=>x.id===el.closest('[data-hid]').dataset.hid);if(!h)return;
  const{id,...rest}=h;const k=el.dataset.k;const v=el.value===''?null:+el.value;const d={...rest,[k]:v};if(k==='price')d.updatedAt=new Date().toISOString();put('holdings',id,d)});
armDelete($('#iv-table'),'holdings');
$('#hold-form').addEventListener('submit',e=>{e.preventDefault();const code=$('#h-code').value.trim().toUpperCase();const id=code.replace(/[^A-Za-z0-9_\-.~:@+]/g,'')||uid();
  put('holdings',id,{code,name:$('#h-name').value.trim(),shares:Math.round(+$('#h-shares').value),cost:Math.round(+$('#h-cost').value),price:+$('#h-price').value,updatedAt:new Date().toISOString()});e.target.reset();toast('已新增 '+code)});

/* ---------- 固定支出 ---------- */
function renderFixed(){
  const fx=[...S.fixed].sort((a,b)=>(a.freq||'').localeCompare(b.freq||'')||(+a.month||0)-(+b.month||0));
  const mon=fx.filter(f=>f.freq==='monthly').reduce((a,f)=>a+(+f.amount||0),0);const yr=fx.filter(f=>f.freq==='yearly').reduce((a,f)=>a+(+f.amount||0),0);
  const debt=fx.filter(f=>f.kind==='貸款').reduce((a,f)=>a+(+f.balance||0),0);
  $('#fx-kpis').innerHTML=kpi('每月固定',money(mon))+kpi('每年一次',money(yr),'合計')+kpi('每月該提撥',money(yr/12),'年繳費用 ÷ 12')+kpi('貸款餘額',debt?money(debt):'未填','填了才會顯示');
  if(!fx.length){guarded($('#fx-table'),'<div class="empty">還沒有固定支出。按「新增一項」加入房貸、保險、稅等。</div>');return}
  const opt=(arr,v)=>arr.map(o=>`<option value="${esc(o[0])}" ${String(o[0])===String(v)?'selected':''}>${esc(o[1])}</option>`).join('');
  guarded($('#fx-table'),`<table><thead><tr><th>名稱</th><th>類型</th><th class="r">金額</th><th>頻率</th><th>月份</th><th class="r">貸款餘額</th><th>備註</th><th></th></tr></thead><tbody>${fx.map(f=>`<tr data-fid="${esc(f.id)}">
    <td><input class="cell-t" id="fn-${esc(f.id)}" data-k="name" value="${esc(f.name)}" style="min-width:7em"></td>
    <td><select class="cell" id="fk-${esc(f.id)}" data-k="kind">${opt(FIXED_KINDS.map(k=>[k,k]),f.kind)}</select></td>
    <td class="r"><input class="cell" type="number" min="0" step="1" id="fa-${esc(f.id)}" data-k="amount" value="${+f.amount||0}"></td>
    <td><select class="cell" id="ff-${esc(f.id)}" data-k="freq">${opt([['monthly','每月'],['yearly','每年']],f.freq)}</select></td>
    <td>${f.freq==='yearly'?`<select class="cell" id="fm-${esc(f.id)}" data-k="month">${opt([...Array(12)].map((_,i)=>[i+1,(i+1)+'月']),f.month)}</select>`:'<span class="muted">—</span>'}</td>
    <td class="r">${f.kind==='貸款'?`<input class="cell" type="number" min="0" step="1" id="fb-${esc(f.id)}" data-k="balance" value="${f.balance??''}" placeholder="未填">`:'<span class="muted">—</span>'}</td>
    <td><input class="cell-t" id="fo-${esc(f.id)}" data-k="note" value="${esc(f.note)}" style="min-width:10em"></td>
    <td class="r"><button class="btn sm del" type="button" data-del="${esc(f.id)}">刪除</button></td></tr>`).join('')}</tbody></table>`);
}
$('#fx-table').addEventListener('change',e=>{const el=e.target.closest('[data-k]');if(!el)return;const tr=el.closest('[data-fid]');const f=S.fixed.find(x=>x.id===tr.dataset.fid);if(!f)return;
  const{id,...rest}=f;const k=el.dataset.k;let v=el.value;if(['amount','balance','month'].includes(k))v=v===''?null:Math.round(+v);
  const d={...rest,[k]:v};if(k==='freq'&&v==='yearly'&&!d.month)d.month=today.getMonth()+1;put('fixed',id,d)});
armDelete($('#fx-table'),'fixed');
$('#fx-add').addEventListener('click',()=>{put('fixed',uid(),{name:'新項目',kind:'其他',amount:0,freq:'monthly',note:''});toast('已新增，請填寫名稱與金額')});

/* ---------- tabs ---------- */
/* ---------- 設定 ---------- */
function renderSettings(){
  $('#st-repo').textContent=Sync.repo();$('#st-sync').textContent=$('#status').textContent;
  $('#st-tok-state').textContent=Sync.hasToken()?'這台裝置已設定金鑰，修改會自動同步。':'這台裝置還沒設定金鑰：可以看資料，但修改不會同步到其他裝置。';
  $('#st-tok-clear').hidden=!Sync.hasToken();$('#st-now').hidden=!Sync.hasToken();
  renderHealth();
}
function renderHealth(){if(!S.ready)return;
  const a=auditData({monthly:S.monthly,entries:S.entries,holdings:S.holdings});const err=a.issues.filter(i=>i.level==='error'),warn=a.issues.filter(i=>i.level==='warn');
  $('#hc-kpis').innerHTML=kpi('月份',String(a.months))+kpi('匯入紀錄',a.rows.toLocaleString())+kpi('手動記帳',String(a.entries))+kpi('錯誤',String(err.length),err.length?'要修正':'沒有',err.length?'neg':'pos')+kpi('待核對',String(warn.length),warn.length?'請人工確認':'沒有');
  const list=a.issues.slice(0,50);
  $('#hc-list').innerHTML=list.length?`<table><thead><tr><th>等級</th><th>位置</th><th>說明</th></tr></thead><tbody>${list.map(i=>`<tr><td><span class="pill ${i.level==='error'?'exp':''}">${i.level==='error'?'錯誤':'待核對'}</span></td><td class="num">${esc(i.where)}</td><td>${esc(i.msg)}</td></tr>`).join('')}</tbody></table>${a.issues.length>50?`<p class="small muted">另外還有 ${a.issues.length-50} 項沒列出。</p>`:''}`:'<div class="empty">帳務檢查沒有發現問題。</div>';
  const cs=Sync.conflicts();$('#hc-conf').hidden=!cs.length;
  $('#hc-conf-list').innerHTML=cs.map(c=>`<li><span class="num small muted">${esc((c.at||'').slice(0,16).replace('T',' '))}</span> ${esc(c.label)}：${esc(c.text)}</li>`).join('');
}
$('#st-tok-form').addEventListener('submit',async e=>{e.preventDefault();const m=$('#st-tok-msg');m.textContent='檢查金鑰中…';
  try{await Sync.setToken($('#st-tok').value);$('#st-tok').value='';m.textContent='金鑰可以用，已開始同步。';toast('已設定同步')}
  catch(err){m.textContent='金鑰不能用：'+Sync.errText(err)}renderSettings()});
$('#st-tok-clear').addEventListener('click',async()=>{await Sync.setToken('');$('#st-tok-msg').textContent='已從這台裝置移除金鑰。';renderSettings()});
$('#st-now').addEventListener('click',()=>Sync.syncNow());
$('#st-pw-form').addEventListener('submit',async e=>{e.preventDefault();const m=$('#st-pw-msg');const a=$('#st-pw-old').value,b=$('#st-pw-new').value,c=$('#st-pw-new2').value;
  if(b.length<8){m.textContent='新密碼至少 8 個字。';return}if(b!==c){m.textContent='兩次輸入的新密碼不一樣。';return}
  m.textContent='更換中…';try{await Sync.changePassword(a,b);e.target.reset();m.textContent='已換成新密碼。其他裝置下次打開要輸入新密碼。';toast('密碼已更換')}
  catch(err){m.textContent=/decrypt|operation/i.test(String(err&&(err.name||err.message)))?'目前的密碼不對。':'更換失敗：'+Sync.errText(err)}});
$('#st-backup').addEventListener('click',()=>{const d=Sync.plain();const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,1)],{type:'application/json'}));a.download=`家計簿備份_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)});
$('#st-lock').addEventListener('click',()=>Sync.lock());
$('#hc-conf-clear').addEventListener('click',()=>{Sync.clearConflicts();renderHealth()});

const TABS=['overview','ledger','budget','plan','invest','fixed','settings'];let tab=TABS.includes(location.hash.slice(1))?location.hash.slice(1):'overview';
function showTab(t){tab=t;document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));document.querySelectorAll('[data-view]').forEach(v=>v.hidden=v.dataset.view!==t);try{history.replaceState(null,'','#'+t)}catch(e){}renderAll()}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});
function renderAll(){aggCache={};try{({overview:renderOverview,ledger:renderLedger,budget:renderBudget,plan:renderPlan,invest:renderInvest,fixed:renderFixed,settings:renderSettings})[tab]()}catch(err){console.error(err)}}
$('#ver').textContent=VERSION;
showTab(tab);
start();
})();
