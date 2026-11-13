// 解析證交所、櫃買中心 OpenAPI 的收盤價。欄位名稱偶爾會變，所以多認幾種。
const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return String(o[k]).trim(); return ''; };
const rocToIso = s => { const m = String(s || '').replace(/\D/g, '').match(/^(\d{2,3})(\d{2})(\d{2})$/); return m ? `${+m[1] + 1911}-${m[2]}-${m[3]}` : ''; };
function parseList(rows, codeKeys, closeKeys) {
  const prices = {}; let date = '';
  for (const r of Array.isArray(rows) ? rows : []) {
    const code = pick(r, codeKeys).toUpperCase();
    const close = +pick(r, closeKeys).replace(/,/g, '');
    if (!/^[0-9A-Z]{4,6}$/.test(code) || !(close > 0)) continue;
    prices[code] = close;
    const d = rocToIso(pick(r, ['Date', 'date', '日期'])); if (d > date) date = d;
  }
  return { prices, date };
}
const parseTwse = rows => parseList(rows, ['Code', '證券代號'], ['ClosingPrice', '收盤價']);
const parseTpex = rows => parseList(rows, ['SecuritiesCompanyCode', 'Code', '代號'], ['Close', 'ClosingPrice', '收盤']);
module.exports = { parseTwse, parseTpex, rocToIso };
