/* 交易性質：把轉帳、投資買賣、借款還款跟真正的收入、消費分開。
   瀏覽器裡是全域函式，Node 測試用 module.exports。 */
const FLOWS = { spend: '消費', income: '收入', repay: '還款', transfer: '轉帳', invest_buy: '投資買入', invest_sell: '投資賣出', borrow: '借入' };
const EXP_FLOWS = ['spend', 'repay', 'transfer', 'invest_buy'];   // 錢流出去的
const INC_FLOWS = ['income', 'invest_sell', 'borrow', 'transfer']; // 錢流進來的
const MOVE_FLOWS = new Set(['transfer', 'invest_buy', 'invest_sell', 'borrow']); // 資金移動：不算收入、也不算支出

/* 自動判斷規則（由上往下，第一個符合的算數）。沒符合就是一般的消費或收入。 */
const FLOW_RULES = [
  { t: 'e', test: r => r.c === '房貸', flow: 'repay', why: '房貸' },
  { t: 'e', test: r => /轉帳|轉出|轉入|轉存|提款|領現|存入|存款/.test(r.n + r.s), flow: 'transfer', why: '備註有轉帳、提款或存款' },
  { t: 'e', test: r => /買股|買進|定期定額|定額|基金|ETF|股票|^00\d{2}/i.test(r.n + ' ' + r.s), flow: 'invest_buy', why: '備註是買股票、ETF 或基金' },
  { t: 'e', test: r => /還款|還錢|還信貸|繳貸款|信貸/.test(r.n), flow: 'repay', why: '備註是還款' },
  { t: 'i', test: r => r.c === '股票' || /賣股|賣出|股票收入/.test(r.n), flow: 'invest_sell', why: '股票賣出的錢是資產轉換，不是收入' },
  { t: 'i', test: r => /轉帳|轉入|轉存|提款|領現/.test(r.n + r.s), flow: 'transfer', why: '備註有轉帳' },
  { t: 'i', test: r => /借款|借入|貸款撥款|撥款/.test(r.n), flow: 'borrow', why: '備註是借款' },
];

const flowSig = r => [r.d, r.t, Math.round(+r.a || 0), r.c || '', r.n || ''].join('|');
function norm(r) { return { d: r.d || '', t: r.t === 'i' ? 'i' : 'e', c: r.c || '', s: r.s || '', a: +r.a || 0, n: r.n || '' }; }

/* 回傳 {flow, auto, why}；auto 為 true 代表是規則自動判斷的 */
function classify(rec, overrides = {}) {
  const r = norm(rec);
  if (rec.flow && FLOWS[rec.flow]) return { flow: rec.flow, auto: false, why: '手動設定' };
  const o = overrides[flowSig(r)]; if (o && FLOWS[o]) return { flow: o, auto: false, why: '手動設定' };
  for (const rule of FLOW_RULES) if (rule.t === r.t && rule.test(r)) return { flow: rule.flow, auto: true, why: rule.why };
  return { flow: r.t === 'i' ? 'income' : 'spend', auto: true, why: '' };
}
const flowsFor = t => (t === 'i' || t === 'income' ? INC_FLOWS : EXP_FLOWS);

/* 手動記帳要不要連動帳戶餘額：回傳每個帳戶要加減多少 */
function accountDeltas(entry) {
  const a = Math.round(+entry.amount || 0), out = {};
  if (!a || !entry.acct) return out;
  const add = (id, v) => { if (id) out[id] = (out[id] || 0) + v; };
  const f = entry.flow || (entry.type === 'income' ? 'income' : 'spend');
  if (f === 'transfer') { if (entry.type === 'income') { add(entry.acct2, -a); add(entry.acct, a); } else { add(entry.acct, -a); add(entry.acct2, a); } }
  else if (entry.type === 'income') add(entry.acct, a);
  else add(entry.acct, -a);
  return out;
}

if (typeof module !== 'undefined') module.exports = { FLOWS, FLOW_RULES, MOVE_FLOWS, classify, flowSig, flowsFor, accountDeltas };
