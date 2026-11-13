/* 投資交易：買入、賣出、領股息、資料更正。持股（holdings）是目前部位，交易（trades）是每一筆變動的紀錄。
   只做計算，不改資料。瀏覽器裡是全域函式，Node 測試用 module.exports。 */
const TRADE_KINDS = { buy: '買入', sell: '賣出', div: '領股息', adjust: '資料更正' };
const FEE_RATE = 0.001425;
const isEtfCode = c => /^00/.test(String(c || ''));
const taxRate = code => (isEtfCode(code) ? 0.001 : 0.003);

/* 手續費：成交金額 × 0.1425% × 折扣，最低 minFee 元（零股常見 1 元，整股 20 元，可在設定改） */
function tradeFee(amount, cfg = {}) {
  if (!(amount > 0)) return 0;
  const disc = +cfg.discount > 0 && +cfg.discount <= 1 ? +cfg.discount : 1;
  const min = +cfg.minFee >= 0 && cfg.minFee !== '' && cfg.minFee != null ? +cfg.minFee : 20;
  return Math.max(min, Math.floor(amount * FEE_RATE * disc));
}
const tradeTax = (amount, code) => (amount > 0 ? Math.floor(amount * taxRate(code)) : 0);

/* 預估賣出淨損益：市值扣掉賣出手續費和交易稅，再減成本 */
function holdingValue(h, price, cfg = {}) {
  const shares = +h.shares || 0, mv = shares * (+price || 0), cost = +h.cost || 0;
  const net = mv - tradeFee(mv, cfg) - tradeTax(mv, h.code);
  const pnl = mv ? net - cost : 0;
  return { mv, net, cost, pnl, pct: cost ? pnl / cost : 0, avg: shares ? cost / shares : 0, estDiv: (+h.div || 0) * shares };
}

/* 把一筆交易套到持股上。回傳 {holding, trade, error}；holding 為 null 代表出清。
   trade 會補上 cash（現金增減，買入是負的）、costOut（賣出的成本）、pnl（已實現損益）、before（更正前）。 */
function applyTrade(h, t, cfg = {}) {
  const cur = h ? { ...h } : null;
  const shares = Math.round(+t.shares || 0), price = +t.price || 0;
  const out = { ...t, code: String(t.code || '').trim().toUpperCase() };
  if (!out.code) return { error: '要填股票代號' };
  if (t.kind === 'buy') {
    if (!(shares > 0) || !(price > 0)) return { error: '股數和成交價要大於 0' };
    const amt = Math.round(shares * price), fee = t.fee != null && t.fee !== '' ? Math.round(+t.fee) : tradeFee(amt, cfg);
    Object.assign(out, { shares, price, fee, tax: 0, cash: -(amt + fee) });
    const base = cur || { code: out.code, name: t.name || '', shares: 0, cost: 0, price };
    return { trade: out, holding: { ...base, ...(!base.name && t.name ? { name: t.name } : {}), shares: (+base.shares || 0) + shares, cost: Math.round((+base.cost || 0) + amt + fee) } };
  }
  if (t.kind === 'sell') {
    if (!cur || !(+cur.shares > 0)) return { error: '沒有這檔持股，不能賣出' };
    if (!(shares > 0) || !(price > 0)) return { error: '股數和成交價要大於 0' };
    if (shares > +cur.shares) return { error: `只有 ${(+cur.shares).toLocaleString('zh-TW')} 股，不能賣 ${shares.toLocaleString('zh-TW')} 股` };
    const amt = Math.round(shares * price);
    const fee = t.fee != null && t.fee !== '' ? Math.round(+t.fee) : tradeFee(amt, cfg);
    const tax = t.tax != null && t.tax !== '' ? Math.round(+t.tax) : tradeTax(amt, out.code);
    const costOut = shares === +cur.shares ? Math.round(+cur.cost || 0) : Math.round((+cur.cost || 0) * shares / +cur.shares);
    const cash = amt - fee - tax;
    Object.assign(out, { shares, price, fee, tax, cash, costOut, pnl: cash - costOut });
    const left = +cur.shares - shares;
    if (left <= 0) { const { id: _, ...snap } = cur; out.closed = snap; } // 出清時留下原本的持股，復原時還得回去
    return { trade: out, holding: left > 0 ? { ...cur, shares: left, cost: Math.round((+cur.cost || 0) - costOut) } : null };
  }
  if (t.kind === 'div') {
    const amt = Math.round(+t.amount || 0); if (!(amt > 0)) return { error: '股息金額要大於 0' };
    Object.assign(out, { amount: amt, cash: amt });
    return { trade: out, holding: cur };
  }
  if (t.kind === 'adjust') {
    if (!cur) return { error: '沒有這檔持股' };
    const after = {}; for (const k of ['shares', 'cost', 'price', 'div', 'name']) if (k in (t.after || {})) after[k] = t.after[k];
    const before = {}; for (const k of Object.keys(after)) before[k] = cur[k] ?? null;
    Object.assign(out, { before, after, cash: 0 });
    return { trade: out, holding: { ...cur, ...after } };
  }
  return { error: '不知道是哪種交易' };
}

/* 復原一筆交易（只允許復原該檔最新的一筆，這樣成本才算得回去） */
function undoTrade(h, t) {
  if (t.kind === 'buy') {
    if (!h) return { error: '持股已經不在了' };
    const shares = (+h.shares || 0) - t.shares, cost = Math.round((+h.cost || 0) + t.cash); // cash 是負的
    if (shares < 0) return { error: '股數會變負的，不能復原' };
    return { holding: shares > 0 ? { ...h, shares, cost } : null };
  }
  if (t.kind === 'sell') {
    if (!h && t.closed) return { holding: { ...t.closed } };
    const base = h || { code: t.code, name: t.name || '', shares: 0, cost: 0, price: t.price };
    return { holding: { ...base, shares: (+base.shares || 0) + t.shares, cost: Math.round((+base.cost || 0) + t.costOut) } };
  }
  if (t.kind === 'div') return { holding: h };
  if (t.kind === 'adjust') { if (!h) return { error: '持股已經不在了' }; return { holding: { ...h, ...t.before } }; }
  return { error: '不知道是哪種交易' };
}
const latestTradeId = (trades, code) => { const ts = trades.filter(t => t.code === code).sort(byTradeTime); return ts.length ? ts[ts.length - 1].id : null; };
function byTradeTime(a, b) { return (a.date || '').localeCompare(b.date || '') || (a.at || '').localeCompare(b.at || ''); }

/* 投資總結：帳面（預估賣出淨損益）、已實現、實領股息、累計總損益 */
function investSummary(holdings, trades, priceOf, year, cfg = {}) {
  let mv = 0, cost = 0, unreal = 0, estDiv = 0;
  for (const h of holdings) { const v = holdingValue(h, priceOf(h), cfg); mv += v.mv; cost += v.cost; unreal += v.pnl; estDiv += v.estDiv; }
  let realized = 0, divAll = 0, divYear = 0, realizedYear = 0; const byCode = {};
  for (const t of trades) {
    const c = (byCode[t.code] = byCode[t.code] || { realized: 0, div: 0 });
    if (t.kind === 'sell') { realized += +t.pnl || 0; c.realized += +t.pnl || 0; if ((t.date || '').startsWith(year)) realizedYear += +t.pnl || 0; }
    if (t.kind === 'div') { divAll += +t.amount || 0; c.div += +t.amount || 0; if ((t.date || '').startsWith(year)) divYear += +t.amount || 0; }
  }
  return { mv, cost, unreal, realized, realizedYear, divAll, divYear, estDiv, total: unreal + realized + divAll, byCode };
}

/* 新資金怎麼分：照目標比例，先補比重不足的（不建議賣出） */
function allocateNew(holdings, priceOf, targets, money) {
  const rows = holdings.map(h => ({ code: h.code, mv: (+h.shares || 0) * priceOf(h), target: +targets[h.code] || 0 }));
  for (const [code, pct] of Object.entries(targets || {})) if (+pct > 0 && !rows.some(r => r.code === code)) rows.push({ code, mv: 0, target: +pct });
  const tsum = rows.reduce((s, r) => s + r.target, 0), total = rows.reduce((s, r) => s + r.mv, 0);
  const out = rows.map(r => ({ ...r, pct: total ? r.mv / total * 100 : 0, add: 0 }));
  if (!tsum) return { rows: out, tsum, ok: false };
  const after = total + Math.max(0, money);
  const gaps = out.map(r => Math.max(0, after * r.target / tsum - r.mv)), gsum = gaps.reduce((s, g) => s + g, 0);
  out.forEach((r, i) => { r.drift = r.pct - r.target / tsum * 100; r.add = gsum ? Math.floor(money * gaps[i] / gsum) : 0; });
  return { rows: out, tsum, ok: true };
}

if (typeof module !== 'undefined') module.exports = { TRADE_KINDS, tradeFee, tradeTax, holdingValue, applyTrade, undoTrade, latestTradeId, byTradeTime, investSummary, allocateNew };
