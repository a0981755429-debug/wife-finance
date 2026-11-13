/* 券商「未實現損益」截圖讀出來的持股：整理格式、跟目前持股比對。瀏覽器裡是全域函式，Node 測試用 module.exports。 */
const HOLDINGS_PROMPT=`這些圖片是台灣券商 App 的「未實現損益」或「庫存」畫面截圖。請把每一檔股票或 ETF 讀出來。
每一檔要：code（股票代號，例如 0050、2330、00878，保留開頭的 0）、name（股票名稱）、shares（庫存股數，整數，零股也算）、cost（付出成本或成本總額，新台幣整數）、price（現價或市價，可以有小數）。
看不清楚或畫面上沒有的欄位填 null，不要猜。同一檔出現在多張圖只列一次。不要列合計、總計列。
只回覆 JSON 陣列，例如：[{"code":"0050","name":"元大台灣50","shares":120,"cost":21500,"price":185.3}]`;
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=+String(v).replace(/[,\s$元]/g,'');return isFinite(n)&&n>=0?n:null};
function cleanHoldings(raw){
  if(!Array.isArray(raw))throw new Error('讀出來的格式不對');
  const seen=new Map();
  for(const r of raw){if(!r||typeof r!=='object')continue;
    const code=String(r.code??'').trim().toUpperCase().replace(/\s/g,'');
    if(!/^[0-9A-Z]{4,6}$/.test(code))continue;
    const shares=num(r.shares),cost=num(r.cost),price=num(r.price);
    seen.set(code,{code,name:String(r.name??'').trim().slice(0,30),shares:shares===null?null:Math.round(shares),cost:cost===null?null:Math.round(cost),price})}
  return[...seen.values()];
}
function diffHoldings(current,parsed){
  const byCode=new Map(current.map(h=>[String(h.code).toUpperCase(),h]));
  const out=parsed.map(p=>{const old=byCode.get(p.code);byCode.delete(p.code);
    if(!old)return{code:p.code,status:'new',old:null,next:p};
    const next={...p,name:p.name||old.name};for(const k of['shares','cost','price'])if(next[k]===null)next[k]=old[k];
    const same=['shares','cost','price'].every(k=>+next[k]===+old[k]);
    return{code:p.code,status:same?'same':'changed',old,next}});
  for(const old of byCode.values())out.push({code:String(old.code),status:'missing',old,next:null});
  return out;
}
if(typeof module!=='undefined')module.exports={HOLDINGS_PROMPT,cleanHoldings,diffHoldings};
