// 抓上市（TWSE）和上櫃（TPEx）所有股票、ETF 的當日收盤價，寫到 app/quotes.json。
// 存的是全部代號，不會透露持有哪幾檔。由 .github/workflows/quotes.yml 每個交易日盤後執行。
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { parseTwse, parseTpex, rocToIso } = createRequire(import.meta.url)('./quotes-parse.cjs');

const OUT = new URL('../app/quotes.json', import.meta.url);
async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'wife-finance-quotes' } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}
const prices = {}; const dates = [];
for (const [name, url, parse] of [
  ['上市', 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', parseTwse],
  ['上櫃', 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', parseTpex],
]) {
  try {
    const r = parse(await getJson(url));
    Object.assign(prices, r.prices); if (r.date) dates.push(r.date);
    console.log(`${name}：${Object.keys(r.prices).length} 檔，日期 ${r.date || '不明'}`);
  } catch (e) { console.error(`${name}抓取失敗：${e.message}`); }
}
// 兩邊日期不同（證交所比較晚更新）時用比較舊的那天，免得把昨天的價格當成今天
const date = dates.sort()[0] || '';
if (Object.keys(prices).length < 100) { console.error('抓到的資料太少，保留舊的 quotes.json'); process.exit(1); }
let old = {}; try { old = JSON.parse(readFileSync(OUT, 'utf8')); } catch {}
if (old.date && date && old.date > date) { console.log('網站上的資料比較新，不更新'); process.exit(0); }
const sorted = Object.fromEntries(Object.entries(prices).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify({ date: date || new Date().toISOString().slice(0, 10), prices: sorted }) + '\n');
console.log(`已寫入 ${Object.keys(sorted).length} 檔，日期 ${date}`);
