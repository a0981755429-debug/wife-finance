/* 帳務健檢：只找出問題、不會自己改資料。瀏覽器裡是全域函式，Node 測試用 module.exports。 */
const BIG_AMOUNT = 300000; // 單筆超過這個金額提醒核對
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const isAmt = a => typeof a === 'number' && isFinite(a) && a > 0;
const dupKey = (date, type, amount) => `${date}|${type}|${Math.round(amount)}`;

function auditData(d) {
  const issues = []; const add = (level, where, msg) => issues.push({ level, where, msg });
  const monthly = d.monthly || {}, entries = d.entries || [];
  let rows = 0;
  const imported = new Map(); // 匯入紀錄：日期|收支|金額 → 筆數
  for (const [ym, m] of Object.entries(monthly)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) { add('error', ym, `月份代號「${ym}」格式不對`); continue; }
    const hasTotals = !!(m && (m.income || m.expense) && (Object.keys(m.income || {}).length || Object.keys(m.expense || {}).length));
    if (hasTotals && (m.rows || []).length) add('error', ym, '同時有 Excel 月總計和 smoney 逐筆資料，收支會算兩次');
    for (const [i, r] of (m.rows || []).entries()) {
      rows++;
      const where = `${ym} 匯入第 ${i + 1} 筆`;
      if (!isDate(r.d)) add('error', where, `日期「${r.d}」不正確`);
      else if (r.d.slice(0, 7) !== ym) add('error', where, `日期 ${r.d} 不在 ${ym} 這個月`);
      if (!isAmt(r.a)) add('error', where, `金額「${r.a}」不正確`);
      else if (r.a >= BIG_AMOUNT) add('warn', where, `金額 ${r.a.toLocaleString('zh-TW')} 特別大，請確認（${r.c || ''} ${r.n || ''}）`.trim());
      if (r.t !== 'i' && r.t !== 'e') add('error', where, '不知道是收入還是支出');
      if (isDate(r.d) && isAmt(r.a)) { const k = dupKey(r.d, r.t, r.a); imported.set(k, (imported.get(k) || 0) + 1); }
    }
    for (const part of ['income', 'expense']) for (const [c, v] of Object.entries((m && m[part]) || {}))
      if (!(typeof v === 'number' && isFinite(v) && v >= 0)) add('error', `${ym} 月總計`, `「${c}」金額「${v}」不正確`);
  }
  const ids = new Map();
  for (const e of entries) {
    const where = `手動記帳 ${e.date || '?'} ${e.category || ''}`.trim();
    if (e.id) ids.set(e.id, (ids.get(e.id) || 0) + 1);
    if (!isDate(e.date)) add('error', where, `日期「${e.date}」不正確`);
    if (!isAmt(+e.amount)) add('error', where, `金額「${e.amount}」不正確`);
    else if (+e.amount >= BIG_AMOUNT) add('warn', where, `金額 ${(+e.amount).toLocaleString('zh-TW')} 特別大，請確認`);
    if (e.type !== 'income' && e.type !== 'expense') add('error', where, '不知道是收入還是支出');
    if (isDate(e.date) && imported.get(dupKey(e.date, e.type === 'income' ? 'i' : 'e', +e.amount)))
      add('warn', where, `跟 smoney 匯入的一筆同日、同金額 ${(+e.amount).toLocaleString('zh-TW')}，可能記了兩次`);
  }
  for (const [id, n] of ids) if (n > 1) add('error', '手動記帳', `編號 ${id} 重複 ${n} 次`);
  for (const h of d.holdings || []) {
    const where = `持股 ${h.code || h.id}`;
    for (const k of ['shares', 'cost', 'price']) if (h[k] != null && !(typeof h[k] === 'number' && isFinite(h[k]) && h[k] >= 0)) add('error', where, `「${{ shares: '股數', cost: '成本', price: '現價' }[k]}」數字不正確`);
  }
  issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  return { months: Object.keys(monthly).length, rows, entries: entries.length, issues };
}

/* 匯入前的風險：會蓋掉舊的 Excel 月總計，或跟手動記帳可能重複 */
function importRisks(by, monthly, entries) {
  const risks = [];
  for (const ym of Object.keys(by).sort()) {
    const old = monthly[ym];
    if (old && !(old.rows || []).length && (old.income || old.expense)) risks.push({ ym, kind: 'legacy', text: `${ym} 原本是 Excel 月總計，匯入會整個換成 smoney 逐筆資料` });
    if (old && old.extra) risks.push({ ym, kind: 'extra', text: `${ym} 另外補記的收支（例如股票收入）會保留，不會被換掉` });
    const keys = new Set(by[ym].map(r => dupKey(r.d, r.t, r.a)));
    const dup = (entries || []).filter(e => (e.date || '').slice(0, 7) === ym && keys.has(dupKey(e.date, e.type === 'income' ? 'i' : 'e', +e.amount)));
    if (dup.length) risks.push({ ym, kind: 'manual', count: dup.length, text: `${ym} 有 ${dup.length} 筆手動記帳跟這次匯入的同日、同金額，匯入後可能算兩次` });
  }
  return risks;
}

if (typeof module !== 'undefined') module.exports = { auditData, importRisks, BIG_AMOUNT };
