/* 我的資金：帳戶、負債、用途預留、安全底線 → 可運用現金與淨資產。只做計算，不改資料。
   瀏覽器裡是全域函式，Node 測試用 module.exports。 */
const ACCOUNT_KINDS = ['活存', '現金', '定存', '其他'];
const LIQUID_KINDS = new Set(['活存', '現金']); // 隨時可以動用的
const STALE_DAYS = 60;
const okNum = v => typeof v === 'number' && isFinite(v) && v >= 0;
const validMonth = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');

/* 年繳固定支出：照「每月提撥」算，到今天應該已經存下多少（上次繳完後經過的月數 ÷ 12） */
function accruedReserve(f, today) {
  const amt = +f.amount || 0, due = +f.month || 0; if (!amt || !due) return 0;
  const m = today.getMonth() + 1; const since = (m - due + 12) % 12; // 繳費當月算 0
  return Math.round(amt * since / 12);
}

function computeFunds({ accounts = [], liabilities = [], reserves = [], funds = {}, fixed = [], holdingsValue = 0 }, today = new Date()) {
  const warnings = []; const warn = (level, msg) => warnings.push({ level, msg });
  let liquid = 0, locked = 0, other = 0; // other：房屋等「其他」資產，算淨資產，不算現金
  const seen = new Map();
  for (const a of accounts) {
    const name = (a.name || '').trim() || '（沒有名稱）';
    if (!okNum(a.balance)) { warn('error', `帳戶「${name}」餘額「${a.balance}」不正確`); continue; }
    const kind = a.kind || '活存';
    if (LIQUID_KINDS.has(kind)) liquid += a.balance; else if (kind === '其他') other += a.balance; else locked += a.balance;
    const key = name + '|' + (a.kind || '');
    if (seen.has(key)) warn('warn', `帳戶「${name}」出現兩次，可能重複計算`); else seen.set(key, 1);
    if (a.updatedAt) {
      const days = Math.floor((today - new Date(a.updatedAt)) / 86400000);
      if (isNaN(days)) warn('error', `帳戶「${name}」更新日期不正確`);
      else if (days > STALE_DAYS) warn('warn', `帳戶「${name}」的餘額 ${days} 天沒更新了`);
    }
  }
  let reserved = 0;
  for (const r of reserves) {
    if (!okNum(r.amount)) { warn('error', `預留「${r.name || ''}」金額「${r.amount}」不正確`); continue; }
    if (r.due && !validMonth(r.due)) warn('error', `預留「${r.name || ''}」的動用月份「${r.due}」格式不對`);
    reserved += r.amount;
  }
  let debtOwn = 0;
  for (const l of liabilities) { if (!okNum(l.principal)) { warn('error', `負債「${l.name || ''}」本金「${l.principal}」不正確`); continue; } debtOwn += l.principal; }
  const loans = fixed.filter(f => f.kind === '貸款' && okNum(+f.balance) && +f.balance > 0).map(f => ({ id: f.id, name: f.name, principal: +f.balance }));
  const debtFixed = loans.reduce((s, l) => s + l.principal, 0);
  const floor = okNum(+funds.floor) ? +funds.floor : 0;
  const available = liquid - reserved - floor;
  if (reserved > liquid) warn('warn', `用途預留 ${reserved.toLocaleString('zh-TW')} 比活存加現金 ${liquid.toLocaleString('zh-TW')} 還多，有些預留的錢其實不在帳上`);
  if (accounts.length && available < 0) warn('warn', `扣掉預留和安全底線後差 ${(-available).toLocaleString('zh-TW')}，目前沒有可以自由運用的現金`);
  const assets = liquid + locked + other + (+holdingsValue || 0), debt = debtOwn + debtFixed;
  return { liquid, locked, other, cash: liquid + locked, reserved, floor, available, invest: +holdingsValue || 0, debtOwn, debtFixed, loans, debt, assets, net: assets - debt, gap: Math.max(0, -available), warnings };
}

/* 從年繳固定支出產生預留項目（已經有同名的就跳過） */
function reservesFromFixed(fixed, reserves, today = new Date()) {
  const have = new Set(reserves.map(r => (r.name || '').trim()));
  return fixed.filter(f => f.freq === 'yearly' && +f.amount > 0 && !have.has((f.name || '').trim())).map(f => {
    const m = today.getMonth() + 1, due = +f.month; const y = today.getFullYear() + (due < m ? 1 : 0);
    return { name: (f.name || '').trim(), amount: accruedReserve(f, today), due: `${y}-${String(due).padStart(2, '0')}`, note: `依固定支出每月提撥 ${Math.round(f.amount / 12).toLocaleString('zh-TW')} 估算` };
  });
}

if (typeof module !== 'undefined') module.exports = { ACCOUNT_KINDS, computeFunds, reservesFromFixed, accruedReserve };
