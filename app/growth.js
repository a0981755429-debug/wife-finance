/* 資產成長：每月淨資產快照、緊急預備金、每月可投入建議。只做計算，不改資料。
   瀏覽器裡是全域函式，Node 測試用 module.exports。 */
const EMERGENCY_MONTHS = 6; // 沒設安全底線時，緊急預備金的目標是幾個月生活費

/* computeFunds 的結果 → 一個月的快照（id 用年月，一個月只留一筆，本月會一直更新到月底） */
function snapshotOf(F, ym) {
  const r = Math.round;
  return { ym, cash: r(F.cash), liquid: r(F.liquid), invest: r(F.invest), other: r(F.other || 0), debt: r(F.debt), net: r(F.net) };
}
const SNAP_KEYS = ['cash', 'liquid', 'invest', 'other', 'debt', 'net'];
const snapChanged = (old, nu) => !old || SNAP_KEYS.some(k => Math.round(+old[k] || 0) !== nu[k]);

const ymShift = (ym, k) => { let [y, m] = ym.split('-').map(Number); m += k; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return `${y}-${String(m).padStart(2, '0')}`; };

/* 淨資產走勢：有快照的月份用快照；第一筆快照之前，用每月收支結餘往回推估（最多 back 個月，標記 est）。
   surplus = {年月: 當月收入 − 支出}，資金移動已經排除。 */
function netSeries(snapshots, surplus, curYM, back = 12) {
  const snaps = [...snapshots].filter(s => /^\d{4}-\d{2}$/.test(s.ym || s.id || '')).map(s => ({ ...s, ym: s.ym || s.id })).sort((a, b) => a.ym.localeCompare(b.ym));
  if (!snaps.length) return [];
  const first = snaps[0], out = [];
  let v = +first.net || 0;
  for (let k = 1; k <= back; k++) {
    const ym = ymShift(first.ym, -k);
    if (!(ymShift(ym, 1) in surplus)) break;    // 下個月沒有收支資料就推不回去
    v -= surplus[ymShift(ym, 1)] || 0;           // 月底淨資產 = 下個月底 − 下個月的結餘
    out.unshift({ ym, net: Math.round(v), est: true });
  }
  const bySnap = new Map(snaps.map(s => [s.ym, s]));
  for (let ym = first.ym; ym <= curYM; ym = ymShift(ym, 1)) {
    const s = bySnap.get(ym); if (s) out.push({ ym, net: +s.net || 0, cash: s.cash, invest: s.invest, other: s.other, debt: s.debt, est: false });
    else out.push({ ym, net: null, est: false }); // 那個月沒有打開過，留空
  }
  return out;
}

/* 跟上個月、跟一年前比（都用最接近、有數字的那一筆） */
function growthStats(series) {
  const has = series.filter(p => p.net != null); if (!has.length) return null;
  const now = has[has.length - 1];
  const before = ym => [...has].reverse().find(p => p.ym <= ym && p !== now) || null;
  const prev = before(ymShift(now.ym, -1)), year = before(ymShift(now.ym, -12)), first = has[0] === now ? null : has[0];
  const d = p => p ? { ym: p.ym, diff: now.net - p.net, est: p.est } : null;
  return { now, prev: d(prev), year: d(year), first: d(first) };
}

/* 緊急預備金和每月可投入：
   - 緊急預備金 = 活存＋現金 − 用途預留，目標是安全底線（沒設就用 6 個月生活費）
   - 還不夠：每月結餘一半補預備金、一半投資；夠了：結餘全部可以投入，帳上超過底線的錢也可以分批投入 */
function investPlan({ liquid = 0, reserved = 0, floor = 0, living = 0, surplus = 0 }) {
  const fund = Math.max(0, liquid - reserved);
  const target = floor > 0 ? floor : Math.round(living * EMERGENCY_MONTHS);
  const months = living > 0 ? fund / living : null;
  const short = Math.max(0, target - fund);
  const s = Math.max(0, Math.round(surplus));
  const r1k = v => Math.floor(v / 1000) * 1000;
  let toFund = 0, toInvest = 0, fillMonths = null;
  if (s > 0) {
    if (short > 0) { toFund = Math.min(short, Math.ceil(s / 2)); toInvest = r1k(s - toFund); fillMonths = Math.ceil(short / toFund); }
    else toInvest = r1k(s);
  }
  const lump = short > 0 ? 0 : Math.max(0, fund - target);
  return { fund, target, months, short, surplus: Math.round(surplus), toFund, toInvest, fillMonths, lump, targetFromFloor: floor > 0 };
}

/* 自由現金流：收入 − 生活支出 − 貸款月付（轉帳、投資買賣、借入這些資金移動已經排除）。
   a = {ti, te, loan}：te 是總支出，已經含貸款月付。 */
function cashFlowOf(a) {
  const income = Math.round(+a.ti || 0), loan = Math.round(+a.loan || 0), living = Math.round(+a.te || 0) - loan;
  return { income, living, loan, pre: income - living, fcf: income - living - loan, dsr: income > 0 ? loan / income : null };
}

/* 幾個完整月份的自由現金流統計 rows = [{ym, ...cashFlowOf}] */
function cashFlowStats(rows) {
  if (!rows.length) return null;
  const med = arr => { const s = [...arr].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const fcf = rows.map(r => r.fcf), dsr = rows.map(r => r.dsr).filter(v => v != null);
  return {
    n: rows.length, median: Math.round(med(fcf)), avg: Math.round(fcf.reduce((a, b) => a + b, 0) / rows.length),
    total: fcf.reduce((a, b) => a + b, 0), negN: fcf.filter(v => v < 0).length,
    dsr: dsr.length ? med(dsr) : null, loan: Math.round(med(rows.map(r => r.loan))), last: rows[rows.length - 1],
  };
}

/* 每月淨資產與現金流對照表：series 是 netSeries 的結果，flows = {年月: cashFlowOf}。
   change = 跟上個月比的淨資產變化；other = change − 自由現金流，大約是還掉的本金、股價漲跌和沒記到的帳（估算的月份不算）。 */
function monthlyBook(months, flows, series) {
  const net = new Map(series.filter(p => p.net != null).map(p => [p.ym, p]));
  return months.map(ym => {
    const f = flows[ym] || null, p = net.get(ym) || null, q = net.get(ymShift(ym, -1)) || null;
    const change = p && q ? p.net - q.net : null;
    return { ym, flow: f, net: p ? p.net : null, est: p ? !!p.est : false, change, other: change != null && f && !p.est && !q.est ? change - f.fcf : null };
  });
}

if (typeof module !== 'undefined') module.exports = { EMERGENCY_MONTHS, snapshotOf, snapChanged, netSeries, growthStats, investPlan, cashFlowOf, cashFlowStats, monthlyBook, ymShift };
