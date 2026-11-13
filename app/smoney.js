/* smoney 匯出 CSV 的解析與類別對應。瀏覽器裡是全域函式，Node 測試用 module.exports。 */
/* smoney 匯出檔 → 家計簿類別 */
function smoneyCat(kind,main,sub,note){
  if(kind==='收入'){if(main==='薪水')return sub==='獎金'?'獎金':'薪水';if(/零用/.test(note))return'零用';if(/股|配息|股息/.test(note))return'股息';return'其他收入'}
  if(main==='飲食')return sub==='家電'?'家電':'餐費';
  if(main==='消費')return({日用品:'日用品',服裝:'服裝',美容:'美容',禮物:'禮物',購物:'購物'})[sub]||'日用品';
  if(main==='交通')return'交通';
  if(main==='健康')return sub==='運動'?'運動':'醫療';
  if(main==='娛樂')return({旅遊:'旅遊',社交:'社交'})[sub]||'娛樂';
  if(main==='生活'){if(sub==='房租')return/房貸/.test(note)?'房貸':'房租';if(sub==='電話費')return'電話';if(sub==='電費'||sub==='水費')return'水電';return'其他'}
  if(main==='其他'){if(sub==='稅收')return'稅費';if(/保險|保費|漁保/.test(note))return'保險';return'其他'}
  return'其他';
}
function parseCSV(text){const out=[];let row=[],f='',q=false;text=text.replace(/^﻿/,'');
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=ch}
    else if(ch==='"')q=true;else if(ch===','){row.push(f);f=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(f);f='';if(row.some(x=>x!==''))out.push(row);row=[]}else f+=ch}
  row.push(f);if(row.some(x=>x!==''))out.push(row);return out}
function parseSmoney(text){
  const rows=parseCSV(text);if(!rows.length)throw new Error('檔案是空的');
  const h=rows[0].map(s=>s.trim());const ix=n=>h.indexOf(n);
  const need=['記帳日期','分類','主分類','子分類','金額'];const miss=need.filter(n=>ix(n)<0);
  if(miss.length)throw new Error('找不到欄位：'+miss.join('、')+'。請用 smoney 的「匯出 CSV」檔案。');
  const by={};let n=0,skipped=0;
  for(const r of rows.slice(1)){
    const d=(r[ix('記帳日期')]||'').trim().replace(/\//g,'-');const kind=(r[ix('分類')]||'').trim();const a=Math.round(+String(r[ix('金額')]||'').replace(/,/g,''));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!(kind==='收入'||kind==='支出')||!a||a<0){skipped++;continue}
    const main=(r[ix('主分類')]||'').trim(),sub=(r[ix('子分類')]||'').trim(),note=ix('備註')>=0?(r[ix('備註')]||'').trim():'';
    const ym=d.slice(0,7);(by[ym]=by[ym]||[]).push({d,t:kind==='收入'?'i':'e',c:smoneyCat(kind,main,sub,note),s:sub,a,n:note});n++}
  return{by,n,skipped};
}
/* 匯入前比對：每個月跟目前存的資料比，分成新增、有變動、沒變 */
function monthTotals(rows){let i=0,e=0;for(const r of rows||[])r.t==='i'?i+=r.a:e+=r.a;return{i,e,n:(rows||[]).length}}
function rowsSig(rows){return(rows||[]).map(r=>[r.d,r.t,r.c,r.s,r.a,r.n].join('|')).sort().join('\n')}
function diffMonths(by,monthly){
  return Object.keys(by).sort().map(ym=>{const old=monthly[ym];const nw=monthTotals(by[ym]);
    if(!old)return{ym,status:'new',old:null,new:nw};
    const ot=old.rows?monthTotals(old.rows):{i:+old.income||0,e:+old.expense||0,n:0};
    return{ym,status:old.rows&&rowsSig(old.rows)===rowsSig(by[ym])?'same':'changed',old:ot,new:nw}});
}
if(typeof module!=='undefined')module.exports={smoneyCat,parseCSV,parseSmoney,diffMonths};
