const test = require('node:test');
const assert = require('node:assert');
const { computeFunds, reservesFromFixed, accruedReserve } = require('../app/funds.js');
const { emptyData, applyOp } = require('../app/vault.js');
const today = new Date('2026-11-13T12:00:00+08:00');

test('資產、負債、預留、底線 → 可運用現金與淨資產', () => {
  const F = computeFunds({
    accounts: [{ name: '永豐活存', kind: '活存', balance: 180000 }, { name: '錢包', kind: '現金', balance: 20000 }, { name: '一年定存', kind: '定存', balance: 100000 }],
    reserves: [{ name: '保費', amount: 30000 }, { name: '旅遊', amount: 10000 }],
    liabilities: [{ name: '信貸', principal: 50000 }],
    fixed: [{ id: 'm', name: '房貸', kind: '貸款', balance: 1430625 }, { name: '保險', kind: '保險', amount: 34814 }],
    funds: { floor: 60000 }, holdingsValue: 259236,
  }, today);
  assert.deepStrictEqual([F.liquid, F.locked, F.reserved, F.available], [200000, 100000, 40000, 100000]);
  assert.deepStrictEqual([F.debtOwn, F.debtFixed, F.debt], [50000, 1430625, 1480625]);
  assert.strictEqual(F.net, 200000 + 100000 + 259236 - 1480625);
  assert.deepStrictEqual(F.warnings, []);
});

test('預留超過現金、扣完不夠時提醒資金缺口', () => {
  const F = computeFunds({ accounts: [{ name: 'A', kind: '活存', balance: 30000 }], reserves: [{ name: '保費', amount: 40000 }], funds: { floor: 10000 } }, today);
  assert.strictEqual(F.available, -20000);
  assert.strictEqual(F.gap, 20000);
  assert.ok(F.warnings.some(w => w.msg.includes('比活存加現金')));
  assert.ok(F.warnings.some(w => w.msg.includes('差 20,000')));
});

test('重複帳戶、太久沒更新的餘額', () => {
  const F = computeFunds({ accounts: [{ name: '永豐', kind: '活存', balance: 1, updatedAt: '2026-08-01' }, { name: '永豐', kind: '活存', balance: 2, updatedAt: '2026-11-10' }] }, today);
  const m = F.warnings.map(w => w.msg).join('\n');
  assert.ok(m.includes('出現兩次'));
  assert.ok(m.includes('天沒更新'));
  assert.strictEqual(F.liquid, 3);
});

test('舊版資料（沒有資金欄位）照常運作', () => {
  const F = computeFunds({}, today);
  assert.deepStrictEqual([F.cash, F.available, F.net, F.warnings.length], [0, 0, 0, 0]);
  const d = emptyData(); delete d.accounts; delete d.funds;
  applyOp(d, { col: 'accounts', id: 'a1', data: { name: '永豐', balance: 300000 } });
  applyOp(d, { col: 'settings', id: 'funds', data: { floor: 60000 } });
  assert.deepStrictEqual([d.accounts.length, d.funds.floor], [1, 60000]);
});

test('無效金額與日期', () => {
  const F = computeFunds({ accounts: [{ name: 'A', balance: -1 }, { name: 'B', balance: 5, updatedAt: 'abc' }], reserves: [{ name: '稅', amount: 'x' }, { name: '旅遊', amount: 1, due: '2026-13' }], liabilities: [{ name: '信貸', principal: NaN }] }, today);
  const m = F.warnings.filter(w => w.level === 'error').map(w => w.msg).join('\n');
  for (const s of ['餘額「-1」', '更新日期不正確', '金額「x」', '「2026-13」', '本金「NaN」']) assert.ok(m.includes(s), s);
  assert.strictEqual(F.liquid, 5);
});

test('從年繳固定支出帶入預留：按月提撥估算，已有的不重複', () => {
  const fixed = [{ name: '保險', freq: 'yearly', amount: 34814, month: 6 }, { name: '牌照稅', freq: 'yearly', amount: 450, month: 7 }, { name: '房貸', freq: 'monthly', amount: 7060 }];
  assert.strictEqual(accruedReserve(fixed[0], today), Math.round(34814 * 5 / 12));
  const r = reservesFromFixed(fixed, [{ name: '牌照稅', amount: 100 }], today);
  assert.deepStrictEqual(r.map(x => [x.name, x.amount, x.due]), [['保險', 14506, '2027-06']]);
});

test('「其他」帳戶（例如房屋）算淨資產，不算現金與存款', () => {
  const F = computeFunds({ accounts: [{ name: '活存', kind: '活存', balance: 100000 }, { name: '房屋', kind: '其他', balance: 4500000 }, { name: '定存', kind: '定存', balance: 50000 }], fixed: [{ id: 'm', name: '房貸', kind: '貸款', balance: 1430000 }] }, today);
  assert.deepStrictEqual([F.liquid, F.locked, F.other, F.cash], [100000, 50000, 4500000, 150000]);
  assert.strictEqual(F.net, 100000 + 50000 + 4500000 - 1430000);
  assert.strictEqual(F.available, 100000);
});
