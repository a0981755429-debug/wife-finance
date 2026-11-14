(() => {
const EXP_CATS=['餐費','日用品','服裝','美容','交通','電話','水電','醫療','運動','旅遊','娛樂','禮物','社交','家電','購物','房貸','房租','稅費','保險','宗教','其他'];
const INC_CATS=['薪水','股息','股票','獎金','零用','回饋','其他收入'];
const NOT_BUDGET=new Set(['保險','房貸']);

const FIXED_KINDS=['貸款','保險','稅費','其他'];
const GRAYCATS=new Set(['未分類','生活費']);
const S={monthly:{},entries:[],budget:{},plan:{},goals:[],fixed:[],holdings:[],accounts:[],liabilities:[],reserves:[],snapshots:[],trades:[],funds:{},flows:{},invest:{},ready:false};
const ARR_COLS=['goals','fixed','holdings','accounts','liabilities','reserves','snapshots','trades'];
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
const VERSION='2.7.1';
const rocLabel=ym=>`${+ym.slice(5)}月`;

function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2200)}

/* ---------- data ---------- */
let aggCache={};
const ovr=()=>(S.flows&&S.flows.overrides)||{};
function agg(ym){
  if(aggCache[ym])return aggCache[ym];
  const inc={},exp={},mv={};let nMv=0,rp=0;const add=(o,k,v)=>{o[k]=(o[k]||0)+(+v||0)};
  // 資金移動（轉帳、投資買賣、借入）不算收入也不算支出，另外記在 mv
  const take=(rec,cat,amt)=>{const f=classify(rec,ovr()).flow;if(MOVE_FLOWS.has(f)){add(mv,f,amt);nMv++;return}if(f==='repay')rp+=+amt||0;add(rec.t==='i'?inc:exp,cat,amt)};
  const m=S.monthly[ym];
  if(m){for(const[k,v]of Object.entries(m.income||{}))add(inc,k,v);for(const[k,v]of Object.entries(m.expense||{}))add(exp,k,v);
        const x=m.extra||{};for(const[k,v]of Object.entries(x.income||{}))take({d:ym+'-00',t:'i',c:k,a:v,n:'extra'},k,v);for(const[k,v]of Object.entries(x.expense||{}))take({d:ym+'-00',t:'e',c:k,a:v,n:'extra'},k,v);
        for(const r of m.rows||[])take(r,r.c||'其他',r.a);}
  for(const e of S.entries){if(!e.date||e.date.slice(0,7)!==ym)continue;take({d:e.date,t:e.type==='income'?'i':'e',c:e.category,a:e.amount,n:e.note,flow:e.flow},e.category||'其他',e.amount)}
  return aggCache[ym]={inc,exp,mv,nMv,rp,ti:sum(inc),te:sum(exp),has:!!m||S.entries.some(e=>e.date&&e.date.slice(0,7)===ym)};
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
  else if(ARR_COLS.includes(col)){const arr=S[col];const i=arr.findIndex(e=>e.id===id);const d={...data,id};i<0?arr.push(d):arr[i]=d}
  else if(col==='monthly'){S.monthly[id]=data}
  else if(col==='settings'){S[id]=data}
  Sync.op(col,id,data,prev);renderAll();
}
function del(col,id){
  const prev=curRec(col,id);
  if(col==='entries'&&prev&&prev.linked)shiftAccounts(accountDeltas(prev),-1); // 刪掉記帳時把帳戶餘額改回來
  if(col==='entries'||ARR_COLS.includes(col))S[col]=S[col].filter(e=>e.id!==id);
  Sync.op(col,id,null,prev);renderAll();
}
function setStatus(t,err){const s=$('#status');s.textContent=t;s.classList.toggle('err',!!err)}

function loadData(d){
  S.monthly=d.monthly||{};S.entries=(d.entries||[]).slice().sort((p,q)=>(q.date||'').localeCompare(p.date||''));
  S.budget=d.budget||{};S.plan=d.plan||{};S.goals=d.goals||[];S.fixed=d.fixed||[];S.holdings=d.holdings||[];
  S.accounts=d.accounts||[];S.liabilities=d.liabilities||[];S.reserves=d.reserves||[];S.snapshots=d.snapshots||[];S.trades=d.trades||[];S.invest=d.invest||{};S.funds=d.funds||{};S.flows=d.flows||{};S.ready=true;renderAll();
}
function onSyncState(st){lastSync={kind:st.kind,text:st.text};setStatus(st.text,st.kind==='error');const b=$('#banner');
  if(st.kind==='error'&&S.ready){b.hidden=false;b.textContent=st.text}else if(st.kind==='local'&&st.pending){b.hidden=false;b.textContent='還沒設定 GitHub 金鑰，修改只存在這台裝置，其他裝置看不到。到「設定」分頁填金鑰就會自動同步。'}else b.hidden=true;
  if(tab==='settings')renderSettings()}
async function start(){
  fetch('quotes.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(q=>{if(q&&q.prices){Q.date=q.date||'';Q.prices=q.prices}}).catch(()=>{}).finally(()=>{Q.tried=true;renderAll()});
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
  // 從一格點到下一格時，change 事件發生在焦點還沒移過去的空檔（activeElement 是 body）；
  // 這時重畫會把正要輸入的那格換掉，所以等焦點落定再畫。
  if((!a||a===document.body)&&!guarded.settling){el.dataset.stale='1';clearTimeout(guarded.t);guarded.t=setTimeout(()=>{guarded.settling=true;try{renderAll()}finally{guarded.settling=false}},0);return false}
  el.innerHTML=html;el.dataset.stale='';return true;
}
document.addEventListener('focusout',e=>{setTimeout(()=>{if(document.querySelector('[data-stale="1"]')&&!(document.activeElement&&/INPUT|SELECT/.test(document.activeElement.tagName)&&document.activeElement.closest('[data-stale="1"]')))renderAll()},0)});
const kpi=(lab,val,note,cls='',attrs='')=>`<div class="kpi" ${attrs}><span class="lab">${lab}</span><span class="val ${cls}">${val}</span>${note?`<span class="note">${note}</span>`:''}</div>`;
const loading=()=>!S.ready;

function niceMax(v){if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v)));const f=v/p;return(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p}
const kfmt=v=>Math.abs(v)>=10000?(v/10000).toFixed(Math.abs(v)%10000?1:0)+'萬':fmt(v);

function markSel(box,svg){svg.querySelectorAll('.hl').forEach(x=>{x.style.display='none';x.classList.remove('sel')});const k=box.dataset.sel;
  if(k!==undefined&&k!==''){const h=svg.querySelector(`.hl[data-h="${k}"]`);if(h){h.style.display='';h.classList.add('sel')}}}
function attachTip(box,svg,getHtml,onPick){
  const touch=matchMedia('(pointer:coarse)').matches; // 手機沒有滑鼠移過，不顯示浮動提示，改看圖表下方的固定明細
  let tip=box.querySelector('.tip');if(!tip){tip=document.createElement('div');tip.className='tip';tip.hidden=true;box.appendChild(tip)}
  svg.querySelectorAll('[data-i]').forEach(r=>{
    const show=()=>{const i=+r.dataset.i;const h=getHtml(i);svg.querySelectorAll('.hl').forEach(x=>x.style.display='none');const hl=svg.querySelector(`.hl[data-h="${i}"]`);if(hl)hl.style.display='';
      if(!h||touch){tip.hidden=true;return}
      tip.innerHTML=h;tip.hidden=false;const bb=box.getBoundingClientRect();const rb=r.getBoundingClientRect();
      let x=rb.left-bb.left+rb.width/2-tip.offsetWidth/2;x=Math.max(0,Math.min(bb.width-tip.offsetWidth,x));
      tip.style.left=x+'px';tip.style.top='4px';};
    const pick=()=>{if(onPick){box.dataset.sel=r.dataset.i;onPick(+r.dataset.i);markSel(box,svg)}};
    r.addEventListener('mouseenter',show);r.addEventListener('focus',show);r.addEventListener('click',()=>{show();pick()});
    r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}});
    r.addEventListener('mouseleave',()=>{tip.hidden=true;markSel(box,svg)});
  });
  markSel(box,svg);
}

function barChart(box,labels,inc,exp,tipFn,onPick){
  const W=Math.max(280,box.clientWidth||720),H=240,L=46,R=8,T=12,B=26;const n=labels.length;
  const mx=niceMax(Math.max(1,...inc,...exp));const y=v=>T+(H-T-B)*(1-v/mx);
  const slot=(W-L-R)/n;const bw=Math.max(4,Math.min(18,(slot-10)/2));const step=slot<30?2:1;
  let g='';for(let k=0;k<=4;k++){const v=mx*k/4;g+=`<line class="${k?'grid':'zero'}" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${kfmt(v)}</text>`}
  let bars='';
  labels.forEach((lb,i)=>{const cx=L+slot*i+slot/2;
    bars+=`<rect class="hl" data-h="${i}" x="${L+slot*i}" y="${T}" width="${slot}" height="${H-T-B}" style="display:none"/>`;
    const bar=(v,x,cls)=>{if(!v)return'';const top=y(v),h=y(0)-top;const r=Math.min(4,h,bw/2);
      return`<path class="${cls}" d="M${x},${y(0)}V${top+r}Q${x},${top} ${x+r},${top}H${x+bw-r}Q${x+bw},${top} ${x+bw},${top+r}V${y(0)}Z"/>`};
    bars+=bar(inc[i],cx-bw-1,'b-inc')+bar(exp[i],cx+1,'b-exp');
    if(i%step===0)bars+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${esc(lb)}</text>`;
    bars+=`<rect class="hit" data-i="${i}" tabindex="0" role="button" aria-label="${esc(lb)}" x="${L+slot*i}" y="${T}" width="${slot}" height="${H-T}"/>`;
  });
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每月收入與支出長條圖">${g}${bars}</svg>`;
  attachTip(box,box.querySelector('svg'),tipFn,onPick);
}
function lineChart(box,labels,vals,tipFn,aria,estN=0,opts={}){ // estN：前幾個點是估算，畫虛線
  const W=Math.max(280,box.clientWidth||720),H=opts.H||170,L=46,R=12,T=14,B=26;const n=labels.length;
  const pts=vals.map((v,i)=>v==null?null:[i,v]).filter(Boolean);
  if(!pts.length){box.innerHTML='<div class="empty">還沒有資料</div>';return}
  let mn=Math.min(0,...pts.map(p=>p[1])),mx=Math.max(0,...pts.map(p=>p[1]));
  const span=niceMax(Math.max(mx-mn,1));const step=span/4;mn=Math.floor(mn/step)*step;mx=Math.ceil(mx/step)*step;if(mx===mn)mx=mn+step;
  const slot=(W-L-R)/n;const lstep=slot<30?2:1;const x=i=>L+slot*i+slot/2;const y=v=>T+(H-T-B)*(1-(v-mn)/(mx-mn));
  let g='';for(let v=mn;v<=mx+1e-6;v+=step){g+=`<line class="${Math.abs(v)<1e-6?'zero':'grid'}" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${kfmt(v)}</text>`}
  const path=ps=>ps.map((p,k)=>(k?'L':'M')+x(p[0])+','+y(p[1])).join('');const d=path(pts);
  const solid=estN?path(pts.filter(p=>p[0]>=estN)):d,dash=estN?path(pts.filter(p=>p[0]<=estN)):'';
  const area=d+`L${x(pts[pts.length-1][0])},${y(Math.max(mn,0))}L${x(pts[0][0])},${y(Math.max(mn,0))}Z`;
  let lab='';labels.forEach((lb,i)=>{lab+=`${i%lstep===0?`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${esc(lb)}</text>`:''}<rect class="hl" data-h="${i}" x="${L+slot*i}" y="${T}" width="${slot}" height="${H-T-B}" style="display:none"/><rect class="hit" data-i="${i}" tabindex="0" role="button" aria-label="${esc(lb)}" x="${L+slot*i}" y="${T}" width="${slot}" height="${H-T}"/>`});
  const last=pts[pts.length-1];
  const endLbl=`<text x="${Math.min(x(last[0]),W-R-4)}" y="${y(last[1])-10}" text-anchor="end" style="fill:var(--ink);font-weight:500">${kfmt(last[1])}</text>`;
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${g}<path class="area" d="${area}"/>${dash?`<path class="line est" d="${dash}"/>`:''}<path class="line" d="${solid}"/><circle class="dot" cx="${x(last[0])}" cy="${y(last[1])}" r="4.5"/>${endLbl}${lab}</svg>`;
  attachTip(box,box.querySelector('svg'),tipFn,opts.onPick);
}

/* ---------- 總覽 ---------- */
let ovYear=null,ovPeriod=null,ovView='flow',ovCat='ex',ovCatAll=false,ovSel=null;const ovOpen=new Set();
const signedN=v=>(v<0?'−':'+')+fmt(Math.abs(v));
const ymText=ym=>`${roc(+ym.slice(0,4))}年${+ym.slice(5)}月`;
/* 一個月裡每一筆收支（資金移動不算），給「點數字看明細」用 */
function itemsOf(ym){const out=[];const m=S.monthly[ym];
  const push=(rec,c,a,n,d)=>{if(MOVE_FLOWS.has(classify(rec,ovr()).flow))return;out.push({d,t:rec.t,c,a:+a||0,n:n||''})};
  if(m){for(const[k,v]of Object.entries(m.income||{}))out.push({d:ym+'-00',t:'i',c:k,a:+v||0,n:'Excel 月總計'});for(const[k,v]of Object.entries(m.expense||{}))out.push({d:ym+'-00',t:'e',c:k,a:+v||0,n:'Excel 月總計'});
    const x=m.extra||{};for(const[k,v]of Object.entries(x.income||{}))push({d:ym+'-00',t:'i',c:k,a:v,n:'extra'},k,v,'補記',ym+'-00');for(const[k,v]of Object.entries(x.expense||{}))push({d:ym+'-00',t:'e',c:k,a:v,n:'extra'},k,v,'補記',ym+'-00');
    for(const r of m.rows||[])push(r,r.c||'其他',r.a,r.n,r.d)}
  for(const e of S.entries){if(!e.date||e.date.slice(0,7)!==ym)continue;push({d:e.date,t:e.type==='income'?'i':'e',c:e.category,a:e.amount,n:e.note,flow:e.flow},e.category||'其他',e.amount,e.note,e.date)}
  return out}
/* 目前選的期間：要統計的月份 pm、圖表顯示的月份 cm、期間最後一個有資料的月份 endYM */
function ovMonths(){
  const ms=[...Array(12)].map((_,i)=>`${ovYear}-${pad(i+1)}`);
  const lim=ovYear===today.getFullYear()?curYM:ms[11];const hasM=ms.filter(k=>k<=lim&&agg(k).has);
  const endYM=hasM.length?hasM[hasM.length-1]:(ovYear===today.getFullYear()?curYM:ms[11]);
  const six=[...Array(6)].map((_,i)=>ymAdd(endYM,i-5));
  const pm=ovPeriod==='year'?ms.filter(k=>k<=endYM):ovPeriod==='six'?six:[endYM];
  const cm=ovPeriod==='year'?ms:six;
  return{ms,pm,cm,endYM}}
const pLabel=()=>ovPeriod==='year'?'年':ovPeriod==='six'?'近 6 月':'本月';
function renderOverview(){
  const ys=years();
  if(loading()&&!ys.length){$('#ov-kpis').innerHTML=kpi('年收入','…')+kpi('年支出','…')+kpi('結餘','…')+kpi('儲蓄率','…');return}
  if(!ys.length){
    $('#ov-years').innerHTML='';$('#ov-range').textContent='';$('#ov-kpis').innerHTML=kpi('年收入','$0')+kpi('年支出','$0')+kpi('結餘','$0')+kpi('儲蓄率','—');
    $('#ov-chart').innerHTML='<div class="empty">還沒有任何收支資料。到「記帳」記下第一筆，這裡就會出現圖表。</div>';
    $('#ov-pick').innerHTML='';$('#ov-cats').innerHTML='';$('#ov-ins').innerHTML='';$('#ov-table').innerHTML='';return;
  }
  if(!ovPeriod)ovPeriod=matchMedia('(max-width:640px)').matches?'six':'year';
  if(!ovYear||!ys.includes(ovYear))ovYear=ys.includes(today.getFullYear())&&monthsWithData().filter(k=>k.startsWith(today.getFullYear())).length>=2?today.getFullYear():ys[ys.length-1];
  $('#ov-years').innerHTML=ys.map(y=>`<button class="chip" data-y="${y}" aria-pressed="${y===ovYear}">${roc(y)}年 · ${y}</button>`).join('');
  document.querySelectorAll('#ov-period button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.p===ovPeriod));
  document.querySelectorAll('#ov-view button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.w===ovView));
  document.querySelectorAll('#ov-catmode button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.cm===ovCat));
  $('#ov-title').textContent=`民國 ${roc(ovYear)} 年總覽`;
  const{pm,cm,endYM}=ovMonths();const as=pm.map(agg);
  $('#ov-range').textContent=ovPeriod==='month'?`本月 · ${ymText(endYM)}${endYM!==curYM?'（這年最後一個有記錄的月份）':''}`:`${pLabel()} · ${ymText(pm[0])} ～ ${ymText(pm[pm.length-1])}`;
  const ti=as.reduce((a,b)=>a+b.ti,0),te=as.reduce((a,b)=>a+b.te,0),bal=ti-te;const nM=as.filter(a=>a.has).length;const pl=ovPeriod==='year'?'年':ovPeriod==='six'?'近 6 月':'本月';
  $('#ov-kpis').innerHTML=kpi(pl+'收入',money(ti),`${nM} 個月有記錄`,'',`data-detail="i" role="button" tabindex="0" aria-label="${pl}收入明細"`)+kpi(pl+'支出',money(te),nM?`平均每月 ${money(te/nM)}`:'','',`data-detail="e" role="button" tabindex="0" aria-label="${pl}支出明細"`)+
    kpi('結餘',(bal<0?'':'+')+money(bal),bal<0?'支出比收入多':'收入大於支出',bal<0?'neg':'pos')+kpi('儲蓄率',ti?Math.round(bal/ti*100)+'%':'—','結餘 ÷ 收入',bal<0?'neg':'');
  // 趨勢圖：每月收支／累計結餘，同一區域切換；點月份在下面固定顯示明細
  const cas=cm.map(agg);const labels=cm.map(k=>rocLabel(k));
  if(!cm.includes(ovSel))ovSel=cm.includes(endYM)?endYM:cm[cm.length-1];
  const box=$('#ov-chart');box.dataset.sel=cm.indexOf(ovSel);
  const pick=i=>{ovSel=cm[i];renderPick()};
  const tip=i=>{const a=cas[i];if(!a.has)return`<b>${ymText(cm[i])}</b><div class="muted">沒有記錄</div>`;
    const top=Object.entries(a.exp).filter(([k])=>k!=='房貸').sort((p,q)=>q[1]-p[1]).slice(0,3);
    return`<b>${ymText(cm[i])}</b><div class="r"><span>收入</span><span>${money(a.ti)}</span></div><div class="r"><span>支出</span><span>${money(a.te)}</span></div><div class="r"><span>結餘</span><span>${money(a.ti-a.te)}</span></div>`+
      (top.length?`<div style="margin-top:4px;opacity:.75">最多：${top.map(([k,v])=>`${esc(k)} ${kfmt(v)}`).join('、')}</div>`:'')};
  $('#ov-legend').hidden=ovView!=='flow';$('#ov-cumnote').hidden=ovView!=='cum';
  if(ovView==='flow')barChart(box,labels,cas.map(a=>a.ti),cas.map(a=>a.te),tip,pick);
  else{let run=0;const lastIdx=cas.map(a=>a.has).lastIndexOf(true);const cum=cas.map((a,i)=>{run+=a.ti-a.te;return i<=lastIdx?run:null});
    $('#ov-cumnote').textContent=`累計結餘＝${+cm[0].slice(5)} 月起，每月收入減支出一路加總，不是銀行存款餘額。`;
    lineChart(box,labels,cum,i=>cum[i]==null?'':`<b>${ymText(cm[i])}底</b><div class="r"><span>累計結餘</span><span>${money(cum[i])}</span></div>`,'累計結餘折線圖',0,{onPick:pick,H:240})}
  renderPick();
  // 逐月明細：手機四欄（月份、收入、總支出、結餘），其餘點開；桌面七欄
  const tms=ovPeriod==='year'?pm:pm;let rows='',sI=0,sM=0,sO=0,sT=0,n=0;
  tms.forEach(ym=>{const a=agg(ym),mon=+ym.slice(5),note=(S.monthly[ym]||{}).note||'';
    if(!a.has){rows+=`<tr class="ym none"><td>${mon}月</td><td class="num r">—</td><td class="num r x">—</td><td class="num r x">—</td><td class="num r">—</td><td class="num r">—</td><td class="small x"></td></tr>`;return}
    const b=a.ti-a.te,mort=a.exp['房貸']||0,liv=living(a),op=ovOpen.has(ym);n++;sI+=a.ti;sM+=mort;sO+=liv;sT+=a.te;
    rows+=`<tr class="ym ${b<0?'negm':''} ${op?'open':''}" data-ym="${ym}" tabindex="0" aria-expanded="${op}"><td>${mon}月 <span class="chev" aria-hidden="true">›</span></td><td class="num r">${fmt(a.ti)}</td><td class="num r x">${fmt(mort)}</td><td class="num r x">${fmt(liv)}</td><td class="num r">${fmt(a.te)}</td><td class="num r bal ${b<0?'neg':'pos'}">${signedN(b)}</td><td class="small muted x note-c" title="${esc(note)}">${esc(note)}</td></tr>`+
      `<tr class="tr-detail" ${op?'':'hidden'}><td colspan="7"><div class="dl"><span>房貸</span><b class="num">${fmt(mort)}</b><span>其他支出</span><b class="num">${fmt(liv)}</b></div>${note?`<div class="small" style="margin:6px 0">${esc(note)}</div>`:''}<button class="btn ghost sm" type="button" data-ledger="${ym}">查看當月記帳</button></td></tr>`});
  const avg=v=>n?fmt(v/n):'—';const sb=sI-sT;
  $('#ov-table').innerHTML=`<table><thead><tr><th>月份</th><th class="r">收入</th><th class="r x">房貸</th><th class="r x" title="房貸以外的支出">其他支出</th><th class="r">總支出</th><th class="r">結餘</th><th class="x">備註</th></tr></thead><tbody>${rows}</tbody>`+
    (n?`<tfoot><tr><td>合計</td><td class="num r">${fmt(sI)}</td><td class="num r x">${fmt(sM)}</td><td class="num r x">${fmt(sO)}</td><td class="num r">${fmt(sT)}</td><td class="num r bal ${sb<0?'neg':'pos'}">${signedN(sb)}</td><td class="x"></td></tr>
      <tr><td>月平均<div class="small muted">已記錄 ${n} 個月</div></td><td class="num r">${avg(sI)}</td><td class="num r x">${avg(sM)}</td><td class="num r x">${avg(sO)}</td><td class="num r">${avg(sT)}</td><td class="num r bal ${sb<0?'neg':'pos'}">${n?signedN(Math.round(sb/n)):'—'}</td><td class="x"></td></tr></tfoot>`:'')+`</table>`;
  // 支出分布
  const cats={};as.forEach(a=>{for(const[k,v]of Object.entries(a.exp))if(ovCat==='in'||k!=='房貸')cats[k]=(cats[k]||0)+v});
  const list=Object.entries(cats).filter(([,v])=>v>0).sort((p,q)=>GRAYCATS.has(p[0])-GRAYCATS.has(q[0])||q[1]-p[1]);
  const cmax=Math.max(1,...list.map(x=>x[1]));const ctot=sum(cats);const shown=ovCatAll?list:list.slice(0,5);
  $('#ov-cats').innerHTML=shown.length?shown.map(([k,v])=>`<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill ${GRAYCATS.has(k)?'gray':''}" style="width:${v/cmax*100}%"></div></div><span class="v">${fmt(v)} <span class="muted">${Math.round(v/ctot*100)}%</span></span></div>`).join('')+`<p class="small muted" style="margin:2px 0 0">${ovCat==='in'?'含房貸':'不含房貸'}，${pLabel()}合計 ${money(ctot)}</p>`:'<div class="empty">這段期間沒有分類資料</div>';
  const ca=$('#ov-catall');ca.hidden=list.length<=5;ca.textContent=ovCatAll?'只看前五大':`查看全部（${list.length} 類）`;
  // 重點提醒：最多三則，附相關明細入口
  const had=as.map((a,i)=>({a,ym:pm[i]})).filter(x=>x.a.has);const cand=[];
  const link=(ym)=>` <button class="lnk" type="button" data-ledger="${ym}">看明細</button>`,dlink=k=>` <button class="lnk" type="button" data-detail="${k}">看明細</button>`;
  if(had.length){
    const low=had.reduce((p,q)=>q.a.ti-q.a.te<p.a.ti-p.a.te?q:p);const lb=low.a.ti-low.a.te;
    const lTop=Object.entries(low.a.exp).filter(([k])=>k!=='房貸').sort((p,q)=>q[1]-p[1])[0];const why=lTop?`，花最多的是<strong>${esc(lTop[0])}</strong> ${money(lTop[1])}`:'';
    cand.push(had.length===1?`<li><strong>${+low.ym.slice(5)}月</strong>結餘 ${lb<0?'赤字 ':''}${money(Math.abs(lb))}${why}。${link(low.ym)}</li>`
      :lb<0?`<li>赤字最大的是 <strong>${+low.ym.slice(5)}月</strong>（${money(lb)}）${why}。${link(low.ym)}</li>`:`<li>結餘最低的是 <strong>${+low.ym.slice(5)}月</strong>（+${money(lb)}）${why}。每個月都有結餘。${link(low.ym)}</li>`);
    const neg=had.filter(x=>x.a.ti<x.a.te).length;
    if(neg&&had.length>1)cand.push(`<li>${had.length} 個月裡有 <strong>${neg} 個月</strong>入不敷出。${dlink('e')}</li>`);
  }
  const mvY={};let nMvY=0;as.forEach(a=>{nMvY+=a.nMv;for(const[k,v]of Object.entries(a.mv))mvY[k]=(mvY[k]||0)+v});
  if(nMvY){const net=(mvY.invest_buy||0)-(mvY.invest_sell||0);cand.push(`<li>有 ${nMvY} 筆資金移動沒有算進收支：${esc(mvText(mvY))}。${net>0?`這段期間投資淨投入 <strong>${money(net)}</strong>，是存成資產，不是花掉。`:net<0?`賣出投資比買進多 ${money(-net)}。`:''}</li>`)}
  const topc=Object.entries(cats).filter(([k,v])=>v>0&&!GRAYCATS.has(k)).sort((p,q)=>q[1]-p[1])[0];
  if(topc)cand.push(`<li>最大的花費類別是 <strong>${esc(topc[0])}</strong>，${pLabel()} ${money(topc[1])}，佔${ovCat==='in'?'':'生活'}支出 ${Math.round(topc[1]/ctot*100)}%。${dlink('e')}</li>`);
  const mort=as.reduce((a,b)=>a+(b.exp['房貸']||0),0);
  if(mort)cand.push(`<li>房貸${pLabel()}共 ${money(mort)}，佔收入 ${ti?Math.round(mort/ti*100):0}%。</li>`);
  const yearly=S.fixed.filter(f=>f.freq==='yearly').reduce((a,f)=>a+(+f.amount||0),0);
  if(yearly)cand.push(`<li>每年一次的固定支出共 ${money(yearly)}，每月先存 <strong>${money(yearly/12)}</strong> 就不會在繳費月份變赤字。</li>`);
  $('#ov-ins').innerHTML=cand.slice(0,3).join('')||'<li>資料再多一些就能看出趨勢。</li>';
}
/* 圖表下方固定顯示被選到的月份 */
function renderPick(){const ym=ovSel;if(!ym){$('#ov-pick').innerHTML='';return}const a=agg(ym);
  if(!a.has){$('#ov-pick').innerHTML=`<div class="pick-h">${ymText(ym)}</div><div class="small muted">這個月沒有記錄。</div>`;return}
  const b=a.ti-a.te,top=Object.entries(a.exp).filter(([k])=>k!=='房貸').sort((p,q)=>q[1]-p[1])[0];
  $('#ov-pick').innerHTML=`<div class="pick-h">${ymText(ym)}</div><div class="pick-g"><div><span class="small muted">收入</span><b class="num">${fmt(a.ti)}</b></div><div><span class="small muted">支出</span><b class="num">${fmt(a.te)}</b></div><div><span class="small muted">結餘</span><b class="num ${b<0?'neg':'pos'}">${signedN(b)}</b></div></div>`+
    `<div class="row between" style="margin-top:8px"><span class="small muted">${top?`花最多：${esc(top[0])} ${money(top[1])}`:''}</span><button class="btn ghost sm" type="button" data-ledger="${ym}">查看該月明細</button></div>`}
/* 點收入、支出數字：看這段期間的類別和最大幾筆 */
function openDetail(kind){const{pm}=ovMonths();const all=pm.flatMap(itemsOf).filter(x=>x.t===kind);const tot=all.reduce((a,x)=>a+x.a,0);const name=kind==='i'?'收入':'支出';
  const by={};all.forEach(x=>by[x.c]=(by[x.c]||0)+x.a);const cl=Object.entries(by).sort((p,q)=>q[1]-p[1]);const mx=Math.max(1,...cl.map(x=>x[1]));
  const top=[...all].sort((p,q)=>q.a-p.a).slice(0,30);
  openSheet(`${pLabel()}${name}明細`,`<div class="small muted">${ymText(pm[0])}${pm.length>1?` ～ ${ymText(pm[pm.length-1])}`:''}，共 ${all.length} 筆、${money(tot)}。資金移動（轉帳、投資買賣、借入）沒有算進來。</div>
    <div class="bars">${cl.map(([k,v])=>`<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill ${kind==='i'?'inc':''}" style="width:${v/mx*100}%"></div></div><span class="v">${fmt(v)}</span></div>`).join('')}</div>
    <h3>最大的 ${top.length} 筆</h3><div class="tbl-wrap"><table><thead><tr><th>日期</th><th>類別</th><th>備註</th><th class="r">金額</th></tr></thead><tbody>${top.map(x=>`<tr><td class="num small">${esc(x.d.endsWith('-00')?x.d.slice(5,7)+'月':x.d.slice(5).replace('-','/'))}</td><td>${esc(x.c)}</td><td class="small muted">${esc(x.n)}</td><td class="num r">${fmt(x.a)}</td></tr>`).join('')}</tbody></table></div>
    <button class="btn" type="button" data-ledger="${pm[pm.length-1]}">到記帳看 ${+pm[pm.length-1].slice(5)} 月</button>`,{full:true})}
function goLedger(ym){$('#lg-month').value=ym;scrollAt.ledger=0;showTab('ledger');$('#lg-back').hidden=false}
$('#lg-back').addEventListener('click',()=>showTab('overview'));
$('#sheet-body').addEventListener('click',e=>{const b=e.target.closest('[data-ledger]');if(b)goLedger(b.dataset.ledger)});
$('#v-overview').addEventListener('click',e=>{const t=e.target;let b;
  if(b=t.closest('[data-y]')){ovYear=+b.dataset.y;ovSel=null;renderOverview()}
  else if(b=t.closest('[data-p]')){ovPeriod=b.dataset.p;ovSel=null;renderOverview()}
  else if(b=t.closest('[data-w]')){ovView=b.dataset.w;renderOverview()}
  else if(b=t.closest('[data-cm]')){ovCat=b.dataset.cm;renderOverview()}
  else if(t.closest('#ov-catall')){ovCatAll=!ovCatAll;renderOverview()}
  else if(b=t.closest('[data-ledger]'))goLedger(b.dataset.ledger);
  else if(b=t.closest('[data-detail]'))openDetail(b.dataset.detail);
  else if(b=t.closest('tr.ym[data-ym]')){const ym=b.dataset.ym;ovOpen.has(ym)?ovOpen.delete(ym):ovOpen.add(ym);b.classList.toggle('open',ovOpen.has(ym));b.setAttribute('aria-expanded',ovOpen.has(ym));b.nextElementSibling.hidden=!ovOpen.has(ym)}
  else if(b=t.closest('.note-c'))b.classList.toggle('open')});
$('#v-overview').addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const b=e.target.closest('.kpi[data-detail],tr.ym[data-ym]');if(b){e.preventDefault();b.click()}});
let lastW=innerWidth,rsT=null;window.addEventListener('resize',()=>{if(innerWidth===lastW)return;lastW=innerWidth;clearTimeout(rsT);rsT=setTimeout(()=>{if(S.ready)renderAll()},200)});

/* ---------- 記帳 ---------- */
let eType='expense';
function fillCats(){const sel=$('#e-cat');const cur=sel.value;const list=eType==='income'?INC_CATS:EXP_CATS;sel.innerHTML=list.map(c=>`<option>${c}</option>`).join('');if(list.includes(cur))sel.value=cur}
$('#e-type').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;eType=b.dataset.v;$('#e-type').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));fillCats();fillFlow()});
const FLOW_HINT={spend:'',income:'',repay:'還貸款、信貸等',transfer:'自己的帳戶之間搬錢，不算收支',invest_buy:'買股票、ETF、基金，是資產轉換不是花掉',invest_sell:'賣股票拿回的錢，不算收入',borrow:'借來的錢，不算收入'};
function fillFlow(){const sel=$('#e-flow');const cur=sel.value;const t=eType==='income'?'i':'e';sel.innerHTML=flowsFor(t).map(f=>`<option value="${f}">${FLOWS[f]}</option>`).join('');if([...sel.options].some(o=>o.value===cur))sel.value=cur;fillAcct()}
function fillAcct(){const accts=S.accounts.filter(a=>a.name);const o=accts.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  const a1=$('#e-acct'),a2=$('#e-acct2');const v1=a1.value,v2=a2.value;a1.innerHTML='<option value="">不指定</option>'+o;a2.innerHTML='<option value="">不指定</option>'+o;a1.value=v1||'';a2.value=v2||'';
  $('#e-acct').closest('label').hidden=!accts.length;const tr=$('#e-flow').value==='transfer';$('#e-acct2-wrap').hidden=!accts.length||!tr;
  $('#e-acct2-lab').textContent=eType==='income'?'從哪個帳戶轉出':'轉入哪個帳戶';$('#e-link-wrap').hidden=!a1.value;}
$('#e-flow').addEventListener('change',fillAcct);$('#e-acct').addEventListener('change',fillAcct);
$('#e-date').value=`${curYM}-${pad(today.getDate())}`;$('#lg-month').value=curYM;$('#bg-month').value=curYM;
fillCats();fillFlow();
$('#entry-form').addEventListener('submit',e=>{e.preventDefault();const amt=Math.round(+$('#e-amt').value);if(!amt||amt<0){toast('請輸入金額');return}
  const d={date:$('#e-date').value,type:eType,category:$('#e-cat').value,amount:amt,note:$('#e-note').value.trim(),createdAt:new Date().toISOString()};
  const f=$('#e-flow').value;if(f&&f!==(eType==='income'?'income':'spend'))d.flow=f;
  const a1=$('#e-acct').value,a2=$('#e-acct2').value;if(a1){d.acct=a1;if(f==='transfer'&&a2&&a2!==a1)d.acct2=a2;}
  if(f==='transfer'&&a1&&!d.acct2){toast('轉帳要選兩個不同的帳戶');return}
  if(a1&&$('#e-link').checked){d.linked=true;shiftAccounts(accountDeltas(d),1)}
  put('entries',uid(),d);$('#e-amt').value='';$('#e-note').value='';$('#lg-month').value=d.date.slice(0,7);
  toast(`已記下 ${d.category} ${money(amt)}${d.flow?`（${FLOWS[d.flow]}）`:''}${d.linked?'，帳戶餘額已調整':''}`);$('#e-amt').focus()});
/* 記帳連動帳戶餘額：sign=1 記帳時，-1 刪除時還原 */
function shiftAccounts(deltas,sign){for(const[id,v]of Object.entries(deltas)){const a=S.accounts.find(x=>x.id===id);if(!a)continue;const{id:_,...rest}=a;
  put('accounts',id,{...rest,balance:Math.round((+a.balance||0)+sign*v),updatedAt:new Date().toISOString()})}}
$('#lg-month').addEventListener('change',renderLedger);
const mvText=mv=>Object.entries(mv).filter(([,v])=>v).map(([f,v])=>`${FLOWS[f]} ${money(v)}`).join('、');
function flowSelect(e){const t=e.type==='income'?'i':'e';const c=e.cls;
  return`<select class="cell flow-sel ${MOVE_FLOWS.has(c.flow)?'mv':c.flow==='repay'?'rp':''}" data-flow="${esc(e.id)}" aria-label="性質" title="${esc(c.why||'')}">${flowsFor(t).map(f=>`<option value="${f}" ${f===c.flow?'selected':''}>${FLOWS[f]}${f===c.flow&&c.auto&&c.why?'（自動）':''}</option>`).join('')}</select>`}
let lgRows={};
function renderLedger(){
  if(document.activeElement&&!document.activeElement.closest('#entry-form'))fillFlow();
  const ym=$('#lg-month').value||curYM;const[y,m]=ym.split('-');
  $('#lg-title').textContent=`${roc(+y)}年${+m}月記錄`;
  const a=agg(ym);const hist=S.monthly[ym];
  const own=S.entries.filter(e=>e.date&&e.date.startsWith(ym)).map(e=>({...e,own:true,cls:classify({d:e.date,t:e.type==='income'?'i':'e',c:e.category,a:e.amount,n:e.note,flow:e.flow},ovr())}));
  const imp=((hist&&hist.rows)||[]).map((r,i)=>({id:'r'+i,date:r.d,type:r.t==='i'?'income':'expense',category:r.c,amount:r.a,note:r.n,sub:r.s,raw:r,cls:classify(r,ovr())}));
  const xs=[];const xx=(hist&&hist.extra)||{};for(const part of['income','expense'])for(const[k,v]of Object.entries(xx[part]||{})){const raw={d:ym+'-00',t:part==='income'?'i':'e',c:k,a:v,n:'extra'};xs.push({id:'x'+part+k,date:ym+'-01',type:part,category:k,amount:v,note:'另外補記（不在 smoney）',raw,cls:classify(raw,ovr()),extra:true})}
  const list=own.concat(imp,xs).sort((p,q)=>q.date.localeCompare(p.date)||(q.createdAt||'').localeCompare(p.createdAt||''));
  lgRows={};list.forEach(e=>lgRows[e.id]=e);
  const legacy=hist&&!hist.rows&&(hist.income||hist.expense);
  $('#lg-kpis').innerHTML=kpi('收入',money(a.ti),'不含轉帳、賣股、借款')+kpi('支出',money(a.te),'消費＋還款')+kpi('結餘',money(a.ti-a.te),'',a.ti-a.te<0?'neg':'pos')
    +(a.nMv?kpi('資金移動',`${a.nMv} 筆`,mvText(a.mv)+'，沒算進收支'):kpi('筆數',String(list.length),imp.length?`其中 ${imp.length} 筆從 smoney 匯入`:legacy?'另含匯入的月總計':''));
  if(loading()){$('#lg-list').innerHTML='<div class="empty">載入中…</div>';return}
  const extraNote=hist&&hist.note?`<p class="small muted" style="margin:0">備註：${esc(hist.note)}</p>`:'';
  if(!list.length){$('#lg-list').innerHTML=`<div class="empty">${legacy?'這個月的資料是從 Excel 匯入的月總計，沒有逐筆記錄。':'這個月還沒有記錄，從上面記下第一筆。'}</div>`+extraNote;return}
  const acctName=id=>{const x=S.accounts.find(q=>q.id===id);return x?x.name||'帳戶':''};
  guarded($('#lg-list'),extraNote+`<table><thead><tr><th>日期</th><th>類別</th><th>備註</th><th>性質</th><th class="r">金額</th><th></th></tr></thead><tbody>${list.map(e=>`<tr class="${MOVE_FLOWS.has(e.cls.flow)?'muted':''}"><td class="num">${e.extra?'補記':esc(e.date.slice(5).replace('-','/'))}</td><td><span class="pill ${e.type==='income'?'inc':'exp'}">${esc(e.category)}</span>${e.sub&&e.sub!==e.category?` <span class="small muted">${esc(e.sub)}</span>`:''}</td><td>${esc(e.note)}${e.acct?`<div class="small muted">${esc(acctName(e.acct))}${e.acct2?' → '+esc(acctName(e.acct2)):''}${e.linked?'・已調整餘額':''}</div>`:''}</td><td>${flowSelect(e)}</td><td class="num r ${e.type==='income'?'pos':''}">${e.type==='income'?'+':'−'}${fmt(e.amount)}</td><td class="r">${e.own?`<button class="btn sm del" data-del="${esc(e.id)}" type="button">刪除</button>`:`<span class="small muted">${e.extra?'Excel':'smoney'}</span>`}</td></tr>`).join('')}</tbody></table>`);
}
$('#lg-list').addEventListener('change',e=>{const sel=e.target.closest('[data-flow]');if(!sel)return;const row=lgRows[sel.dataset.flow];if(!row)return;const f=sel.value;
  if(row.own){const{own,cls,id,...rest}=row;put('entries',id,{...rest,flow:f});}
  else{const auto=classify(row.raw,{}).flow;const o={...ovr()};const k=flowSig(row.raw);if(f===auto)delete o[k];else o[k]=f;put('settings','flows',{...(S.flows||{}),overrides:o});}
  toast(`已改成「${FLOWS[f]}」`)});
let armed={id:null,until:0}; // 「確定刪除」狀態，表格重畫後也有效
function armDelete(container,col){container.addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b)return;const id=b.dataset.del;
  if(armed.id===col+':'+id&&Date.now()<armed.until){armed={id:null,until:0};del(col,id);toast('已刪除');return}
  armed={id:col+':'+id,until:Date.now()+3000};b.classList.add('arm');b.textContent='確定刪除';setTimeout(()=>{if(b.isConnected){b.classList.remove('arm');b.textContent='刪除'}},3000)})}
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
const feeCfg=()=>{const v=S.invest||{};return{discount:v.discount,minFee:v.minFee}};
const holdCalc=h=>holdingValue(h,priceOf(h),feeCfg());
const signed=v=>(v<0?'−':'+')+'$'+fmt(Math.abs(v));
const pctTxt=v=>(v<0?'−':'+')+Math.abs(v*100).toFixed(2)+'%';
let trKind='buy',editing=null,openCards=new Set();
function renderInvest(){
  document.querySelectorAll('#iv-cards .hcard').forEach(d=>{d.open?openCards.add(d.dataset.hid):openCards.delete(d.dataset.hid)}); // 重畫前先記下哪幾張是展開的
  const hs=[...S.holdings].sort((a,b)=>holdCalc(b).mv-holdCalc(a).mv);const cs=hs.map(holdCalc);
  const yr=String(today.getFullYear());const sm=investSummary(hs,S.trades,priceOf,yr,feeCfg());
  const auto=hs.filter(h=>quoteFor(h)!=null).length;$('#iv-upd').textContent=hs.length?(auto?`收盤價 ${Q.date.replace(/-/g,'/')}，${auto} 檔自動更新${auto<hs.length?`、${hs.length-auto} 檔手動`:''}`:'現價都是手動輸入'):'';
  const pl=planNow();
  $('#iv-kpis').innerHTML=kpi('投資市值',money(sm.mv),`${hs.length} 檔，投入本金 ${money(sm.cost)}`)
    +kpi('累計總損益',signed(sm.total),'帳面＋已實現＋實領股息',sm.total<0?'neg':'pos')
    +kpi(`${roc(+yr)}年實領股息`,money(sm.divYear),sm.estDiv?`預估全年 ${money(sm.estDiv)}，估算月均 ${money(sm.estDiv/12)}`:'在持股「編輯」填每股年配息就會預估')
    +kpi('可投入現金',S.accounts.length?money(Math.max(0,pl.F.available)):'—',S.accounts.length?(pl.P.toInvest?`每月結餘建議投入 ${money(pl.P.toInvest)}`:'目前每月沒有建議投入'):'先到「我的資金」登錄帳戶',pl.F.available<0?'neg':'');
  const row=(lab,v,note,cls='')=>`<div class="wf-row ${cls}"><span>${lab}${note?`<span class="small muted">　${note}</span>`:''}</span><span class="num ${v<0?'neg':''}">${signed(v)}</span></div>`;
  $('#iv-break').innerHTML=hs.length||S.trades.length?row('預估賣出淨損益',sm.unreal,'現在全部賣掉，扣手續費和交易稅後')+row('已實現損益',sm.realized,sm.realizedYear?`今年 ${signed(sm.realizedYear)}`:'賣出時記下')+row('實領股息',sm.divAll,'領股息時記下')
    +row('累計總損益',sm.total,sm.cost?`本金 ${money(sm.cost)}，加碼增加的市值不算賺`:'', 'wf-total'):'';
  if(loading()&&!hs.length){$('#iv-cards').innerHTML='<div class="empty">載入中…</div>';return}
  // 持股卡片
  const hid=h=>esc(h.id);
  const cards=hs.map((h,i)=>{const c=cs[i];const q=quoteFor(h)!=null;const by=sm.byCode[h.code]||{realized:0,div:0};const ed=editing===h.id;
    const pdate=q?Q.date:(h.updatedAt||'').slice(0,10);const field=(lab,k,v,step=1)=>`<label class="f">${lab}<input class="cell" type="number" min="0" step="${step}" data-k="${k}" value="${v??''}" placeholder="未填"></label>`;
    return`<details class="hcard" data-hid="${hid(h)}" ${openCards.has(h.id)||ed?'open':''}><summary>
      <div class="hc-name"><span class="num">${esc(h.code)}</span> <span>${esc(h.name)}</span></div>
      <div class="hc-mv num">${fmt(c.mv)}</div>
      <div class="hc-pnl num ${c.pnl<0?'neg':'pos'}">${signed(c.pnl)}　${pctTxt(c.pct)}</div></summary>
      <div class="hc-body">${ed?`<div class="form">${field('股數','shares',h.shares)}${field('付出成本','cost',h.cost)}${field('現價','price',priceOf(h),0.01)}${field('每股年配息','div',h.div,0.01)}</div>
        <div class="row"><button class="btn sm" type="button" data-act="save">儲存更正</button><button class="btn ghost sm" type="button" data-act="cancel">取消</button><button class="btn sm del" type="button" data-del="${hid(h)}">刪除持股</button></div>`
      :`<dl class="hc-dl"><dt>股數</dt><dd class="num">${fmt(h.shares)}</dd><dt>付出成本</dt><dd class="num">${fmt(c.cost)}</dd><dt>均價</dt><dd class="num">${c.avg.toFixed(2)}</dd>
        <dt>現價</dt><dd class="num">${priceOf(h)} <span class="small muted">${q?'自動':'手動'}${pdate?' '+esc(pdate.slice(5).replace('-','/')):''}</span></dd>
        <dt>已實現</dt><dd class="num ${by.realized<0?'neg':''}">${by.realized?signed(by.realized):'—'}</dd><dt>實領股息</dt><dd class="num">${by.div?money(by.div):'—'}</dd>
        <dt>預估年配息</dt><dd class="num">${c.estDiv?`${money(c.estDiv)} <span class="small muted">估算月均 ${fmt(c.estDiv/12)}</span>`:'未填'}</dd></dl>
        <div class="row"><button class="btn ghost sm" type="button" data-act="buy">買入</button><button class="btn ghost sm" type="button" data-act="sell">賣出</button><button class="btn ghost sm" type="button" data-act="div">領股息</button><button class="btn ghost sm" type="button" data-act="edit">編輯</button></div>`}</div></details>`}).join('');
  guarded($('#iv-cards'),hs.length?cards:'<div class="empty">還沒有持股。用下面的「買入」記第一筆。</div>');
  $('#tr-codes').innerHTML=hs.map(h=>`<option value="${esc(h.code)}">${esc(h.name)}</option>`).join('');
  fillTrForm();renderAlloc(hs,pl);renderDivs(hs,cs,yr);renderTrades();
}
function renderAlloc(hs,pl){
  const tg=(S.invest&&S.invest.targets)||{};const add=Math.max(0,pl.P.toInvest||0);const A=allocateNew(hs,priceOf,tg,add);
  if(!hs.length){guarded($('#iv-alloc'),'<div class="empty">有持股後可以設定目標比例。</div>');return}
  const rows=A.rows.map(r=>{const h=hs.find(x=>x.code===r.code);return`<tr data-code="${esc(r.code)}"><td><span class="num">${esc(r.code)}</span> <span class="small muted">${esc(h?h.name:'')}</span></td>
    <td class="num r">${r.pct.toFixed(0)}%</td>
    <td class="r"><input class="cell" type="number" min="0" max="100" step="1" id="tg-${esc(r.code)}" data-tg="${esc(r.code)}" value="${tg[r.code]??''}" placeholder="—" style="max-width:4.5em"></td>
    <td class="num r ${A.ok&&Math.abs(r.drift)>=5?'neg':''}">${A.ok&&r.target?(r.drift>=0?'+':'−')+Math.abs(r.drift).toFixed(0)+'%':''}</td><td class="num r">${A.ok&&r.add?fmt(r.add):''}</td></tr>`}).join('');
  const off=A.ok?A.rows.filter(r=>r.target&&Math.abs(r.drift)>=5):[];
  guarded($('#iv-alloc'),`<div class="tbl-wrap"><table><thead><tr><th>股票</th><th class="r">目前</th><th class="r">目標 %</th><th class="r">偏離</th><th class="r">本月投入</th></tr></thead><tbody>${rows}</tbody></table></div>
    <ul class="insights" style="margin-top:10px">${!A.ok?'<li>在「目標 %」填想要的比例（加起來不用剛好 100，會自動換算），就會算出偏離和新資金怎麼分。</li>':''}
    ${off.length?`<li>${off.map(r=>`<strong>${esc(r.code)}</strong> 比目標${r.drift>0?'多':'少'} ${Math.abs(r.drift).toFixed(0)}%`).join('、')}，用新資金慢慢調整，不用急著賣。</li>`:''}
    <li>${add?`依「我的資金」的試算，每月可投入約 <strong>${money(add)}</strong>${A.ok?'，已經照目標比例分好，優先補比重不足的。':'。'}`:'依「我的資金」的試算，目前每月沒有建議投入的金額。'}</li></ul>`);
}
function renderDivs(hs,cs,yr){
  const got=S.trades.filter(t=>t.kind==='div'&&(t.date||'').startsWith(yr)).sort(byTradeTime);const byM={};got.forEach(t=>{const m=+t.date.slice(5,7);(byM[m]=byM[m]||[]).push(t)});
  const est=hs.map((h,i)=>({h,v:cs[i].estDiv})).filter(x=>x.v);
  const cal=Array.from({length:12},(_,i)=>{const m=i+1,ts=byM[m]||[];const tot=ts.reduce((s,t)=>s+t.amount,0);
    return`<div class="dv-m ${tot?'has':''}"><span class="small muted">${m}月</span><span class="num">${tot?fmt(tot):'—'}</span>${ts.length?`<span class="small muted">${ts.map(t=>esc(t.code)).join('、')}</span>`:''}</div>`}).join('');
  $('#iv-div').innerHTML=`<p class="small muted" style="margin:0 0 8px">${roc(+yr)}年已入帳 ${money(got.reduce((s,t)=>s+t.amount,0))}（按「領股息」記下的）</p><div class="dv-cal">${cal}</div>`
    +(est.length?`<p class="small muted" style="margin:10px 0 0">預估全年配息：${est.map(x=>`${esc(x.h.code)} ${money(x.v)}`).join('、')}（每股年配息 × 股數，估算月均只是平均，實際看發放月份）。已公告的配息日期還沒有自動來源，公告後用「領股息」記下實領金額就好。</p>`:'');
}
function renderTrades(){
  const ts=[...S.trades].sort(byTradeTime).reverse().slice(0,40);
  if(!ts.length){$('#iv-trades').innerHTML='<div class="empty">還沒有交易紀錄。買入、賣出、領股息、更正都會記在這裡。</div>';return}
  const last=new Set([...new Set(S.trades.map(t=>t.code))].map(c=>latestTradeId(S.trades,c)));
  const desc=t=>t.kind==='div'?`股息 ${fmt(t.amount)}`:t.kind==='adjust'?Object.keys(t.after||{}).map(k=>`${{shares:'股數',cost:'成本',price:'現價',div:'配息',name:'名稱'}[k]||k} ${t.before[k]??'—'} → ${t.after[k]??'—'}`).join('，'):`${fmt(t.shares)} 股 × ${t.price}`;
  $('#iv-trades').innerHTML=`<table><thead><tr><th>日期</th><th>種類</th><th>股票</th><th>內容</th><th class="r">現金</th><th class="r">已實現</th><th></th></tr></thead><tbody>${ts.map(t=>`<tr>
    <td>${esc((t.date||'').replace(/-/g,'/'))}</td><td><span class="pill ${t.kind==='sell'||t.kind==='div'?'':'warn'}">${TRADE_KINDS[t.kind]||t.kind}</span></td><td class="num">${esc(t.code)}</td><td class="small">${esc(desc(t))}${t.fee?`<span class="muted">，費 ${fmt(t.fee)}${t.tax?`、稅 ${fmt(t.tax)}`:''}</span>`:''}</td>
    <td class="num r ${t.cash<0?'neg':''}">${t.cash?signed(t.cash):'—'}</td><td class="num r ${t.pnl<0?'neg':'pos'}">${t.kind==='sell'?signed(t.pnl):''}</td>
    <td class="r">${last.has(t.id)?`<button class="btn sm ghost" type="button" data-undo="${esc(t.id)}">復原</button>`:''}</td></tr>`).join('')}</tbody></table>`;
}
/* 交易表單 */
function fillTrForm(){
  const sell=trKind==='sell',div=trKind==='div';const code=$('#tr-code').value.trim().toUpperCase();const h=S.holdings.find(x=>x.code===code);
  $('#tr-name-wrap').hidden=trKind!=='buy'||!!h;$('#tr-shares-wrap').hidden=div;$('#tr-price-wrap').hidden=div;$('#tr-amount-wrap').hidden=!div;$('#tr-fee-wrap').hidden=div;$('#tr-tax-wrap').hidden=!sell;
  const accts=S.accounts.filter(a=>a.name);const a=$('#tr-acct');const v=a.value||(S.invest&&S.invest.acct)||'';
  a.innerHTML='<option value="">不指定</option>'+accts.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');a.value=accts.some(x=>x.id===v)?v:'';
  $('#tr-acct-wrap').hidden=!accts.length;$('#tr-link-wrap').hidden=!a.value;
  const disc=$('#tr-disc'),mn=$('#tr-min');if(document.activeElement!==disc)disc.value=(S.invest||{}).discount??'';if(document.activeElement!==mn)mn.value=(S.invest||{}).minFee??'';
  trPreview();
}
function trDraft(){return{kind:trKind,date:$('#tr-date').value,code:$('#tr-code').value.trim().toUpperCase(),name:$('#tr-name').value.trim(),shares:$('#tr-shares').value,price:$('#tr-price').value,amount:$('#tr-amount').value,fee:$('#tr-fee').value===''?null:$('#tr-fee').value,tax:$('#tr-tax').value===''?null:$('#tr-tax').value}}
function trPreview(){const t=trDraft();const h=S.holdings.find(x=>x.code===t.code);const p=$('#tr-preview');
  if(!t.code||(trKind==='div'?!+t.amount:!(+t.shares&&+t.price))){p.textContent=trKind==='sell'&&h?`目前持有 ${fmt(h.shares)} 股，平均成本 ${(h.cost/h.shares).toFixed(2)}`:'';return}
  const r=applyTrade(h,t,feeCfg());if(r.error){p.innerHTML=`<span class="neg">${esc(r.error)}</span>`;return}const x=r.trade;
  p.textContent=trKind==='buy'?`付出 ${fmt(-x.cash)}（含手續費 ${fmt(x.fee)}）${h?`，加碼後 ${fmt(r.holding.shares)} 股、均價 ${(r.holding.cost/r.holding.shares).toFixed(2)}`:''}`
    :trKind==='sell'?`實收 ${fmt(x.cash)}（扣手續費 ${fmt(x.fee)}、交易稅 ${fmt(x.tax)}），成本 ${fmt(x.costOut)}，已實現 ${signed(x.pnl)}`:`股息 ${fmt(x.cash)} 入帳`;}
function setTrKind(k){trKind=k;$('#tr-kind').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===k));fillTrForm()}
$('#tr-kind').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setTrKind(b.dataset.v)});
['#tr-code','#tr-shares','#tr-price','#tr-amount','#tr-fee','#tr-tax','#tr-name'].forEach(s=>$(s).addEventListener('input',()=>{if(s==='#tr-code')fillTrForm();else trPreview()}));
$('#tr-acct').addEventListener('change',fillTrForm);
$('#tr-date').value=`${curYM}-${pad(today.getDate())}`;
const setInvest=patch=>put('settings','invest',{...(S.invest||{}),...patch});
$('#tr-disc').addEventListener('change',e=>{const v=e.target.value===''?null:+e.target.value;if(v!=null&&!(v>0&&v<=1)){toast('折扣要在 0.1 到 1 之間');return}setInvest({discount:v});toast('已更新手續費折扣')});
$('#tr-min').addEventListener('change',e=>{setInvest({minFee:e.target.value===''?null:Math.round(+e.target.value)});toast('已更新最低手續費')});
function quick(kind,code){setTrKind(kind);if(code){$('#tr-code').value=code;fillTrForm()}$('#tr-sheet').scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$(code?(kind==='div'?'#tr-amount':'#tr-shares'):'#tr-code').focus(),300)}
document.querySelectorAll('[data-quick]').forEach(b=>b.addEventListener('click',()=>quick(b.dataset.quick)));
const holdId=code=>code.replace(/[^A-Za-z0-9_\-.~:@+]/g,'')||uid();
function putHolding(code,prevId,h){const id=prevId||holdId(code);if(h)put('holdings',id,h);else del('holdings',id);return id}
$('#tr-form').addEventListener('submit',e=>{e.preventDefault();const t=trDraft();if(!t.date){toast('請選日期');return}
  const cur=S.holdings.find(x=>x.code===t.code);const{id:hid0,...curRest}=cur||{};
  const r=applyTrade(cur?curRest:null,t,feeCfg());if(r.error){toast(r.error);return}
  const tr={...r.trade,name:(cur&&cur.name)||t.name||'',at:new Date().toISOString()};if(tr.fee==null)delete tr.fee;if(tr.tax==null)delete tr.tax;
  if(r.holding&&trKind==='buy'&&!cur)r.holding.updatedAt=new Date().toISOString();
  const acct=$('#tr-acct').value,link=!!acct&&$('#tr-link').checked,toLedger=$('#tr-entry').checked;
  if(toLedger){const eid=uid();const d={date:t.date,type:tr.cash<0?'expense':'income',category:trKind==='div'?'股息':trKind==='sell'?'股票':'其他',amount:Math.abs(tr.cash),note:`${TRADE_KINDS[trKind]} ${tr.code} ${tr.name}`.trim(),createdAt:tr.at,trade:true};
    if(trKind==='buy')d.flow='invest_buy';else if(trKind==='sell')d.flow='invest_sell';
    if(acct){d.acct=acct;if(link){d.linked=true;shiftAccounts(accountDeltas(d),1)}}put('entries',eid,d);tr.entryId=eid}
  else if(link){tr.acct=acct;tr.linked=true;shiftAccounts({[acct]:tr.cash},1)}
  if(trKind!=='div'||cur)putHolding(tr.code,hid0,r.holding);
  put('trades',uid(),tr);if(acct&&acct!==(S.invest||{}).acct)setInvest({acct});
  ['#tr-shares','#tr-price','#tr-amount','#tr-fee','#tr-tax','#tr-name'].forEach(s=>$(s).value='');trPreview();
  toast(`已記下${TRADE_KINDS[trKind]} ${tr.code}${link?'，帳戶餘額已調整':''}${toLedger?'，也記到記帳了':''}`)});
$('#iv-cards').addEventListener('toggle',e=>{const d=e.target.closest('.hcard');if(!d)return;d.open?openCards.add(d.dataset.hid):openCards.delete(d.dataset.hid)},true);
$('#iv-cards').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const card=b.closest('[data-hid]');const h=S.holdings.find(x=>x.id===card.dataset.hid);if(!h)return;const a=b.dataset.act;
  if(a==='edit'){editing=h.id;openCards.add(h.id);renderInvest();return}
  if(a==='cancel'){editing=null;renderInvest();return}
  if(a==='save'){const after={};card.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k;const v=el.value===''?null:(k==='shares'||k==='cost'?Math.round(+el.value):+el.value);const old=k==='price'?priceOf(h):h[k];if(v!==(old??null))after[k]=v});
    editing=null;if(!Object.keys(after).length){renderInvest();toast('沒有變更');return}
    const{id,...rest}=h;const r=applyTrade(rest,{kind:'adjust',code:h.code,after});if(r.error){toast(r.error);return}
    if('price' in after)r.holding.updatedAt=new Date().toISOString();
    put('holdings',id,r.holding);put('trades',uid(),{...r.trade,name:h.name,date:`${curYM}-${pad(today.getDate())}`,at:new Date().toISOString()});toast('已更正，紀錄在交易紀錄');return}
  quick(a,h.code)});
armDelete($('#iv-cards'),'holdings');
$('#iv-alloc').addEventListener('change',e=>{const el=e.target.closest('[data-tg]');if(!el)return;const tg={...((S.invest&&S.invest.targets)||{})};if(el.value==='')delete tg[el.dataset.tg];else tg[el.dataset.tg]=Math.max(0,+el.value);setInvest({targets:tg})});
$('#iv-trades').addEventListener('click',e=>{const b=e.target.closest('[data-undo]');if(!b)return;const t=S.trades.find(x=>x.id===b.dataset.undo);if(!t)return;
  if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent='確定復原';b.classList.add('arm');setTimeout(()=>{if(b.isConnected){b.dataset.arm='';b.textContent='復原';b.classList.remove('arm')}},3000);return}
  const cur=S.holdings.find(x=>x.code===t.code);const{id:hid0,...rest}=cur||{};const r=undoTrade(cur?rest:null,t);if(r.error){toast(r.error);return}
  if(t.kind!=='div')putHolding(t.code,hid0,r.holding);
  if(t.entryId&&S.entries.some(x=>x.id===t.entryId))del('entries',t.entryId); // 會一併還原帳戶餘額
  else if(t.linked&&t.acct)shiftAccounts({[t.acct]:t.cash},-1);
  del('trades',t.id);toast(`已復原${TRADE_KINDS[t.kind]} ${t.code}`)});

/* ---------- 我的資金 ---------- */
function holdingsValue(){return S.holdings.reduce((a,h)=>a+(+h.shares||0)*priceOf(h),0)}
function rowsTable(id,cols,rows,attr){ // 共用的可編輯表格
  return`<table><thead><tr>${cols.map(c=>`<th class="${c.r?'r':''}">${c.t}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(r=>`<tr ${attr}="${esc(r.id)}">${cols.map(c=>`<td class="${c.r?'r':''}">${c.html(r)}</td>`).join('')}<td class="r"><button class="btn sm del" type="button" data-del="${esc(r.id)}">刪除</button></td></tr>`).join('')}</tbody></table>`}
const inNum=(pre,r,k,step=1)=>`<input class="cell" type="number" min="0" step="${step}" id="${pre}-${esc(r.id)}" data-k="${k}" value="${r[k]??''}" placeholder="未填">`;
const inTxt=(pre,r,k,w='8em',ph='')=>`<input class="cell-t" id="${pre}-${esc(r.id)}" data-k="${k}" value="${esc(r[k])}" placeholder="${ph}" style="min-width:${w}">`;
const fundsNow=()=>computeFunds({accounts:S.accounts,liabilities:S.liabilities,reserves:S.reserves,funds:S.funds,fixed:S.fixed,holdingsValue:holdingsValue()},today);
function renderFunds(){
  const st=recentStats();const F=fundsNow();renderGrowth(F,st);
  const has=S.accounts.length>0;
  $('#fd-kpis').innerHTML=kpi('現金與存款',has?money(F.cash):'未登錄',F.locked?`活存＋現金 ${money(F.liquid)}，定存 ${money(F.locked)}`:'個人銀行及現金')
    +kpi('可運用現金',has?money(F.available):'—',has?(F.available<0?'不夠扣預留和底線':'扣除預留及安全底線'):'先登錄帳戶',F.available<0?'neg':'pos')
    +kpi('用途預留金',money(F.reserved),`${S.reserves.length} 項`)
    +kpi('已知個人淨資產',has||S.holdings.length?money(F.net):'—',`含投資 ${money(F.invest)}${F.other?`、其他資產 ${money(F.other)}`:''}，扣負債 ${money(F.debt)}${F.debtFixed&&!F.other?'（房屋價值沒算，可用「其他」帳戶登錄）':''}`,F.net<0?'neg':'');
  const step=(lab,v,sign,note)=>`<div class="wf-row"><span>${lab}${note?`<span class="small muted">　${note}</span>`:''}</span><span class="num">${sign}${fmt(v)}</span></div>`;
  $('#fd-flow').innerHTML=has?step('活存＋現金',F.liquid,'')+step('用途預留金',F.reserved,'− ')+step('安全現金底線',F.floor,'− ',F.floor?'':'還沒設定')
    +`<div class="wf-row wf-total ${F.available<0?'neg':''}"><span>試算可運用現金</span><span class="num">${F.available<0?'−':''}${fmt(Math.abs(F.available))}</span></div>`
    +`<p class="small muted" style="margin:0">${F.locked+F.other?`定存、房屋等不能隨時動用的 ${money(F.locked+F.other)} 沒有算進來。`:''}還沒扣除其他沒登錄的未來支出。</p>`
    :'<div class="empty">先在下面登錄帳戶餘額，就會算出可運用現金。</div>';
  const floorEl=$('#fd-floor');if(document.activeElement!==floorEl)floorEl.value=S.funds.floor??'';
  floorEl.placeholder=st.liv?`例如 ${fmt(Math.round(st.liv*3/1000)*1000)}（約 3 個月生活費）`:'例如 60000';
  $('#fd-warn').innerHTML=F.warnings.length?`<ul>${F.warnings.map(w=>`<li>${w.level==='error'?'<b>錯誤：</b>':''}${esc(w.msg)}</li>`).join('')}</ul>`:'';$('#fd-warn').hidden=!F.warnings.length;
  const opt=(arr,v)=>arr.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('');
  guarded($('#fd-acc'),S.accounts.length?rowsTable('acc',[{t:'帳戶',html:r=>inTxt('an',r,'name','8em','例如 永豐活存')},{t:'類型',html:r=>`<select class="cell" id="ak-${esc(r.id)}" data-k="kind">${opt(ACCOUNT_KINDS,r.kind||'活存')}</select>`},{t:'餘額',r:1,html:r=>inNum('ab',r,'balance')},{t:'更新',html:r=>`<span class="small muted">${r.updatedAt?esc(r.updatedAt.slice(0,10).replace(/-/g,'/')):'—'}</span>`},{t:'備註',html:r=>inTxt('ao',r,'note','8em')}],S.accounts,'data-aid'):'<div class="empty">還沒有帳戶。'+(S.plan.savings?`規劃頁填的目前存款是 ${money(+S.plan.savings)}，可以按「新增帳戶」登錄在哪個帳戶。`:'')+'</div>');
  guarded($('#fd-res'),S.reserves.length?rowsTable('res',[{t:'用途',html:r=>inTxt('rn',r,'name','7em','例如 保費')},{t:'已預留',r:1,html:r=>inNum('ra',r,'amount')},{t:'預計動用',html:r=>`<input class="cell" type="month" id="rd-${esc(r.id)}" data-k="due" value="${esc(r.due||'')}">`},{t:'備註',html:r=>inTxt('ro',r,'note','10em')}],S.reserves,'data-rid'):'<div class="empty">還沒有預留項目。年繳的保費、稅可以按「從固定支出帶入」。</div>');
  const loans=F.loans.map(l=>`<tr><td>${esc(l.name)}</td><td class="r num">${fmt(l.principal)}</td><td colspan="3" class="small muted">來自「固定支出」的貸款餘額，要改請到固定支出分頁</td></tr>`).join('');
  guarded($('#fd-debt'),(S.liabilities.length?rowsTable('debt',[{t:'負債',html:r=>inTxt('ln',r,'name','8em','例如 信用貸款')},{t:'未償本金',r:1,html:r=>inNum('lp',r,'principal')},{t:'年利率 %',r:1,html:r=>inNum('lr',r,'rate',0.01)},{t:'備註',html:r=>inTxt('lo',r,'note','8em')}],S.liabilities,'data-lid'):'')
    +(loans?`<table><tbody>${loans}</tbody></table>`:'')+(!S.liabilities.length&&!loans?'<div class="empty">沒有登錄負債。</div>':''));
}
function armRows(box,attr,col,numKeys,stamp){box.addEventListener('change',e=>{const el=e.target.closest('[data-k]');if(!el)return;const tr=el.closest(`[${attr}]`);const r=S[col].find(x=>x.id===tr.getAttribute(attr));if(!r)return;
  const{id,...rest}=r;const k=el.dataset.k;let v=el.value;if(numKeys.includes(k))v=v===''?null:(k==='rate'?+v:Math.round(+v));const d={...rest,[k]:v};if(stamp&&k==='balance')d.updatedAt=new Date().toISOString();put(col,id,d)});armDelete(box,col)}
armRows($('#fd-acc'),'data-aid','accounts',['balance'],true);
armRows($('#fd-res'),'data-rid','reserves',['amount']);
armRows($('#fd-debt'),'data-lid','liabilities',['principal','rate']);
$('#fd-acc-add').addEventListener('click',()=>{put('accounts',uid(),{name:'',kind:'活存',balance:null,note:''});toast('已新增，請填帳戶名稱與餘額')});
$('#fd-res-add').addEventListener('click',()=>{put('reserves',uid(),{name:'',amount:null,due:'',note:''});toast('已新增，請填用途與金額')});
$('#fd-debt-add').addEventListener('click',()=>{put('liabilities',uid(),{name:'',principal:null,rate:null,note:''});toast('已新增，請填負債名稱與本金')});
$('#fd-res-fixed').addEventListener('click',()=>{const add=reservesFromFixed(S.fixed,S.reserves,today);if(!add.length){toast('年繳固定支出都已經帶入了');return}add.forEach(r=>put('reserves',uid(),r));toast(`已帶入 ${add.map(r=>r.name).join('、')}，請對一下實際預留的金額`)});
$('#fd-floor').addEventListener('change',e=>{const v=e.target.value===''?null:Math.round(+e.target.value);const f={...S.funds};if(v==null)delete f.floor;else f.floor=v;put('settings','funds',f);toast('已更新安全底線')});

/* ---------- 資產成長 ---------- */
// 緊急預備金與每月可投入：我的資金、投資兩頁共用
function planNow(F=fundsNow(),st=recentStats()){const spend=median(st.as.map(a=>a.te).filter(v=>v>0)),surplus=median(st.as.filter(a=>a.has).map(a=>a.ti-a.te));
  return{F,st,spend,P:investPlan({liquid:F.liquid,reserved:F.reserved,floor:F.floor,living:spend,surplus})}}
const hasAssets=()=>S.accounts.length>0||S.holdings.length>0;
// 每個月自動存一筆淨資產快照（本月會一直更新到月底）。只在有 GitHub 金鑰的裝置存，行情讀完才算，避免持股市值是舊的。
let snapT=null;
function scheduleSnapshot(){if(!S.ready||!Q.tried||!Sync.hasToken())return;clearTimeout(snapT);snapT=setTimeout(takeSnapshot,4000)}
function takeSnapshot(){if(!hasAssets())return;const snap=snapshotOf(fundsNow(),curYM);const old=S.snapshots.find(x=>x.id===curYM);
  if(snapChanged(old,snap))put('snapshots',curYM,{...snap,at:new Date().toISOString()})}
function surplusMap(){const o={};for(const ym of monthsWithData()){const a=agg(ym);o[ym]=a.ti-a.te+a.rp}return o} // 還款大多是本金，負債跟著變少，淨資產不太變，所以往回推時不扣
const ymShort=ym=>(+ym.slice(5)===1?`${roc(+ym.slice(0,4))}/`:'')+(+ym.slice(5))+'月';
const ymLong=ym=>`${roc(+ym.slice(0,4))}年${+ym.slice(5)}月`;
function renderGrowth(F,st){
  if(!hasAssets()){$('#gr-kpis').innerHTML='';$('#gr-chart').innerHTML='<div class="empty">登錄帳戶或持股後，每個月會自動記下淨資產，畫成成長曲線。</div>';$('#gr-note').textContent='';
    $('#gr-plan').innerHTML='<div class="empty">先在下面登錄帳戶餘額，就會算出緊急預備金夠幾個月、每月可以投入多少。</div>';return}
  const live=snapshotOf(F,curYM);const snaps=S.snapshots.filter(x=>x.id!==curYM).concat([{...live,id:curYM}]);
  const series=netSeries(snaps,surplusMap(),curYM,12);const G=growthStats(series);const estN=series.filter(p=>p.est).length;
  const diff=(d,lab)=>d?kpi(lab,(d.diff>=0?'+':'−')+money(Math.abs(d.diff)),`跟 ${ymLong(d.ym)}${d.est?'（估算）':''}比`,d.diff<0?'neg':'pos'):kpi(lab,'—','資料還不夠');
  const{spend,P}=planNow(F,st);
  $('#gr-kpis').innerHTML=kpi('本月淨資產',money(G.now.net),'即時，含持股市值',G.now.net<0?'neg':'')+diff(G.prev,'比上個月')+diff(G.year||G.first,G.year?'比一年前':'比最早一筆')
    +kpi('緊急預備金',P.months==null?'—':P.months.toFixed(1)+' 個月',spend?`每月支出約 ${money(spend)}`:'還沒有支出資料',P.months!=null&&P.months<3?'neg':'');
  lineChart($('#gr-chart'),series.map(p=>ymShort(p.ym)),series.map(p=>p.net),i=>{const p=series[i];if(p.net==null)return`<b>${ymLong(p.ym)}</b><div class="small">那個月沒有記到</div>`;
    return`<b>${ymLong(p.ym)}${p.est?'（估算）':p.ym===curYM?'（即時）':''}</b><div class="r"><span>淨資產</span><span>${money(p.net)}</span></div>${p.est?'':`<div class="r"><span>現金存款</span><span>${money(p.cash)}</span></div><div class="r"><span>投資</span><span>${money(p.invest)}</span></div>${p.other?`<div class="r"><span>其他資產</span><span>${money(p.other)}</span></div>`:''}<div class="r"><span>負債</span><span>−${fmt(p.debt)}</span></div>`}`},'每月淨資產走勢',estN);
  $('#gr-note').textContent=(estN?`虛線是用每月收支結餘往回推的估算（沒算股價漲跌，房貸還款當作都是本金），只是參考。`:'')+(Sync.hasToken()?'每個月會自動記下一筆，本月的數字會更新到月底。':'這台裝置沒設 GitHub 金鑰，不會存下每月紀錄，只顯示即時數字。');
  const row=(lab,v,cls='',note='')=>`<div class="wf-row ${cls}"><span>${lab}${note?`<span class="small muted">　${note}</span>`:''}</span><span class="num">${v}</span></div>`;
  const tips=[];
  if(P.surplus<=0)tips.push(`最近 ${st.ms.length} 個月的每月結餘中位數是 <strong>${money(P.surplus)}</strong>，目前沒有穩定的結餘可以投入，先看看「預算」哪一類超支。`);
  else if(P.short>0)tips.push(`每月結餘約 <strong>${money(P.surplus)}</strong>：建議 <strong>${money(P.toFund)}</strong> 先存進預備金，<strong>${money(P.toInvest)}</strong> 定期定額投入，大約 ${P.fillMonths} 個月補滿。`);
  else tips.push(`預備金已經夠了，每月結餘約 <strong>${money(P.surplus)}</strong>，可以定期定額投入 <strong>${money(P.toInvest)}</strong>。`);
  if(P.lump>0)tips.push(`帳上超過目標的 <strong>${money(P.lump)}</strong> 也可以拿去投資，分 6 個月投入的話每月約 ${money(Math.floor(P.lump/6/1000)*1000)}。`);
  if(F.reserved)tips.push(`用途預留的 ${money(F.reserved)} 已經先扣掉，不算預備金。`);
  tips.push('買 ETF、基金時，記帳的性質選「投資買入」，就不會被算成花費。');
  $('#gr-plan').innerHTML=`<div class="wf">${row('活存＋現金 − 用途預留',fmt(P.fund))+row('目標',fmt(P.target),'',P.targetFromFloor?'安全現金底線':`${EMERGENCY_MONTHS} 個月支出`)
    +row(P.short>0?'還差':'已足夠',fmt(P.short>0?P.short:P.fund-P.target),'wf-total '+(P.short>0?'neg':''))}</div><ul class="insights" style="margin-top:10px">${tips.map(t=>`<li>${t}</li>`).join('')}</ul>`;
}

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
/* ---------- 滑出面板 ---------- */
let sheetNode=null,sheetHome=null,sheetOpener=null;
function openSheet(title,content,{full=false}={}){
  closeSheet(true);const body=$('#sheet-body');body.innerHTML='';$('#sheet-title').textContent=title;
  if(typeof content==='string')body.innerHTML=content;else{sheetNode=content;sheetHome=content.parentNode;content.hidden=false;body.appendChild(content)}
  sheetOpener=document.activeElement;$('#sheet').classList.toggle('full',!!full);$('#sheet-bg').hidden=false;document.body.classList.add('noscroll');
  requestAnimationFrame(()=>$('#sheet').classList.add('in'));$('#sheet').focus();
}
function closeSheet(quick){
  if(sheetNode){sheetNode.hidden=true;sheetHome.appendChild(sheetNode);sheetNode=null}
  $('#sheet').classList.remove('in');$('#sheet-bg').hidden=true;document.body.classList.remove('noscroll');
  if(!quick&&sheetOpener&&sheetOpener.isConnected)sheetOpener.focus();sheetOpener=null;
}
$('#sheet-x').addEventListener('click',()=>closeSheet());
$('#sheet-bg').addEventListener('click',e=>{if(e.target.id==='sheet-bg')closeSheet()});
document.addEventListener('keydown',e=>{if($('#sheet-bg').hidden)return;
  if(e.key==='Escape'){closeSheet();return}
  if(e.key==='Tab'){const f=[...$('#sheet').querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,summary')].filter(x=>x.offsetParent);if(!f.length)return;
    const first=f[0],last=f[f.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('#sheet'))){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
function openPane(name){const pane=document.querySelector(`#st-panes [data-pane="${name}"]`);if(!pane)return;
  if(name==='sync')$('#tok-help').open=!Sync.hasToken();
  openSheet(pane.dataset.title,pane,{full:!!pane.dataset.full})}

/* ---------- 設定 ---------- */
let lastSync={kind:'loading',text:''};
const fmtDT=iso=>{const d=new Date(iso);return isNaN(d)?'':`${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
function renderSettings(){
  const has=Sync.hasToken(),k=lastSync.kind;
  const lab={ok:['good','已同步'],syncing:['warn','同步中…'],pending:['warn','有修改，等待同步'],loading:['warn','讀取中…'],error:['bad','同步失敗'],local:['','尚未設定同步']}[k]||['',lastSync.text||'—'];
  $('#sc-dot').className='dot '+lab[0];$('#sc-state').textContent=lab[1];
  const at=S.ready?(Sync.plain().savedAt||''):'';
  $('#sc-time').textContent=!has?'設定金鑰後，修改才會同步到其他裝置':at?`上次存入 ${fmtDT(at)}`:'還沒有存入紀錄';
  $('#st-now').textContent=has?'立即同步':'設定同步';$('#st-now').disabled=has&&k==='syncing';
  $('#st-repo').textContent=Sync.repo();$('#st-sync').textContent=lastSync.text||$('#status').textContent;
  $('#st-tok-state').textContent=has?'這台裝置已設定金鑰，修改會自動同步。':'這台裝置還沒設定金鑰：可以看資料，但修改不會同步到其他裝置。';
  $('#ms-sync').textContent=has?'已連線':'尚未設定';$('#st-tok-zone').hidden=!has;
  renderHealth();
}
function renderHealth(){if(!S.ready)return;
  const a=auditData({monthly:S.monthly,entries:S.entries,holdings:S.holdings});const err=a.issues.filter(i=>i.level==='error'),warn=a.issues.filter(i=>i.level==='warn');
  $('#ms-check').textContent=a.issues.length?`${a.issues.length} 項待確認`:'無異常';
  $('#hc-kpis').innerHTML=kpi('月份',String(a.months))+kpi('匯入紀錄',a.rows.toLocaleString())+kpi('手動記帳',String(a.entries))+kpi('錯誤',String(err.length),err.length?'要修正':'沒有',err.length?'neg':'pos')+kpi('待核對',String(warn.length),warn.length?'請人工確認':'沒有');
  const list=a.issues.slice(0,50);
  $('#hc-list').innerHTML=list.length?`<table><thead><tr><th>等級</th><th>位置</th><th>說明</th></tr></thead><tbody>${list.map(i=>`<tr><td><span class="pill ${i.level==='error'?'exp':''}">${i.level==='error'?'錯誤':'待核對'}</span></td><td class="num">${esc(i.where)}</td><td>${esc(i.msg)}</td></tr>`).join('')}</tbody></table>${a.issues.length>50?`<p class="small muted">另外還有 ${a.issues.length-50} 項沒列出。</p>`:''}`:'<div class="empty">帳務檢查沒有發現問題。</div>';
  const cs=Sync.conflicts();$('#hc-conf').hidden=!cs.length;
  $('#hc-conf-list').innerHTML=cs.map(c=>`<li><span class="num small muted">${esc((c.at||'').slice(0,16).replace('T',' '))}</span> ${esc(c.label)}：${esc(c.text)}</li>`).join('');
}
$('#st-menu').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b)openPane(b.dataset.open)});
const ferr=(id,msg)=>{const e=$('#'+id);e.textContent=msg||'';const inp=document.getElementById(id.replace(/-err$/,''));if(inp)inp.setAttribute('aria-invalid',msg?'true':'false')};
async function busy(btn,doing,fn){const old=btn.textContent;btn.disabled=true;btn.textContent=doing;let ok=false;try{ok=await fn()}finally{btn.disabled=false;btn.textContent=ok?'已儲存':old;if(ok)setTimeout(()=>{if(btn.isConnected)btn.textContent=old},1800)}}
document.querySelectorAll('[data-eye]').forEach(b=>b.addEventListener('click',()=>{const i=$('#'+b.dataset.eye);const show=i.type==='password';i.type=show?'text':'password';b.textContent=show?'隱藏':'顯示';b.setAttribute('aria-pressed',show)}));
$('#st-pw-show').addEventListener('change',e=>['#st-pw-old','#st-pw-new','#st-pw-new2'].forEach(s=>$(s).type=e.target.checked?'text':'password'));
$('#st-tok-form').addEventListener('submit',async e=>{e.preventDefault();ferr('st-tok-err','');const m=$('#st-tok-msg');m.textContent='';
  if(!$('#st-tok').value.trim()){ferr('st-tok-err','請貼上 github_pat_ 開頭的金鑰。');return}
  await busy($('#st-tok-save'),'儲存中…',async()=>{try{await Sync.setToken($('#st-tok').value);$('#st-tok').value='';m.textContent='金鑰可以用，已開始同步。';toast('已設定同步');return true}
    catch(err){ferr('st-tok-err','金鑰不能用：'+Sync.errText(err));return false}});renderSettings()});
$('#st-tok-clear').addEventListener('click',async()=>{await Sync.setToken('');$('#st-tok-msg').textContent='已從這台裝置移除金鑰。';renderSettings()});
$('#st-now').addEventListener('click',()=>{if(Sync.hasToken())Sync.syncNow();else openPane('sync')});
$('#st-pw-form').addEventListener('submit',async e=>{e.preventDefault();['st-pw-old-err','st-pw-new-err','st-pw-new2-err'].forEach(x=>ferr(x,''));const m=$('#st-pw-msg');m.textContent='';
  const a=$('#st-pw-old').value,b=$('#st-pw-new').value,c=$('#st-pw-new2').value;
  if(b.length<8){ferr('st-pw-new-err','新密碼至少 8 個字。');return}if(b!==c){ferr('st-pw-new2-err','兩次輸入的新密碼不一樣。');return}
  await busy($('#st-pw-save'),'儲存中…',async()=>{try{await Sync.changePassword(a,b);e.target.reset();m.textContent='已換成新密碼。其他裝置下次打開要輸入新密碼。';toast('密碼已更換');return true}
    catch(err){if(/decrypt|operation/i.test(String(err&&(err.name||err.message))))ferr('st-pw-old-err','目前的密碼不對。');else ferr('st-pw-new2-err','更換失敗：'+Sync.errText(err));return false}})});
$('#st-backup').addEventListener('click',()=>{const d=Sync.plain();const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,1)],{type:'application/json'}));a.download=`家計簿備份_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('已下載備份')});
$('#st-lock').addEventListener('click',()=>Sync.lock());
$('#hc-conf-clear').addEventListener('click',()=>{Sync.clearConflicts();renderHealth()});

const TABS=['overview','ledger','budget','plan','funds','invest','fixed','settings'];let tab=TABS.includes(location.hash.slice(1))?location.hash.slice(1):'overview';
const MORE_TABS=[['budget','預算'],['plan','規劃與目標'],['fixed','固定支出'],['settings','設定']];const scrollAt={};
function showTab(t){closeSheet(true);if(t!=='ledger')$('#lg-back').hidden=true;if(t!==tab)scrollAt[tab]=window.scrollY;tab=t; // 切回來時回到原本的捲動位置
  document.querySelectorAll('#tabs button,#bnav [data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  $('#bnav [data-more]').setAttribute('aria-selected',MORE_TABS.some(x=>x[0]===t));
  document.querySelectorAll('[data-view]').forEach(v=>v.hidden=v.dataset.view!==t);try{history.replaceState(null,'','#'+t)}catch(e){}renderAll();window.scrollTo(0,scrollAt[t]||0)}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});
$('#bnav').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.tab)showTab(b.dataset.tab);
  else openSheet('更多',`<div class="menu" style="border:1px solid var(--rule);border-radius:10px;overflow:hidden">${MORE_TABS.map(([k,n])=>`<button class="mrow" type="button" data-go="${k}"><span class="mt">${n}</span><span class="chev" aria-hidden="true">›</span></button>`).join('')}</div>`)});
$('#sheet-body').addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)showTab(b.dataset.go)});
function renderAll(){aggCache={};scheduleSnapshot();try{({overview:renderOverview,ledger:renderLedger,budget:renderBudget,plan:renderPlan,funds:renderFunds,invest:renderInvest,fixed:renderFixed,settings:renderSettings})[tab]()}catch(err){console.error(err)}}
$('#ver').textContent=VERSION;
showTab(tab);
start();
})();
