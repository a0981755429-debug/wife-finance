const test = require('node:test');
const assert = require('node:assert');
const T = require('../app/trades.js');
const { emptyData, applyOp } = require('../app/vault.js');

test('同一檔再買入是加碼：股數、成本累加，不會蓋掉原本的', () => {
  const h0 = { code: '0056', name: '元大高股息', shares: 2000, cost: 70000, price: 36 };
  const r = T.applyTrade(h0, { kind: 'buy', code: '0056', shares: 1000, price: 37, date: '2026-11-14' });
  assert.strictEqual(r.holding.shares, 3000);
  assert.strictEqual(r.trade.fee, 52); // 37000 × 0.1425% = 52.7 → 52
  assert.strictEqual(r.holding.cost, 70000 + 37000 + 52);
  assert.strictEqual(r.trade.cash, -37052);
  const n = T.applyTrade(null, { kind: 'buy', code: '2330', name: '台積電', shares: 10, price: 1000 }, { minFee: 1 });
  assert.deepStrictEqual([n.holding.shares, n.holding.cost, n.trade.fee, n.holding.name], [10, 10014, 14, '台積電']);
  assert.strictEqual(T.tradeFee(1000), 20); assert.strictEqual(T.tradeFee(1000, { minFee: 1 }), 1); assert.strictEqual(T.tradeFee(100000, { discount: 0.6 }), 85);
});

test('賣出：依平均成本算已實現損益，扣手續費和交易稅；賣光就出清', () => {
  const h = { code: '0056', shares: 3000, cost: 107052 };
  const r = T.applyTrade(h, { kind: 'sell', code: '0056', shares: 1000, price: 40 });
  assert.deepStrictEqual([r.trade.fee, r.trade.tax, r.trade.cash, r.trade.costOut], [57, 40, 39903, 35684]);
  assert.strictEqual(r.trade.pnl, 39903 - 35684);
  assert.deepStrictEqual([r.holding.shares, r.holding.cost], [2000, 107052 - 35684]);
  const all = T.applyTrade(r.holding, { kind: 'sell', code: '0056', shares: 2000, price: 40 });
  assert.strictEqual(all.holding, null); assert.strictEqual(all.trade.costOut, 71368);
  assert.match(T.applyTrade(h, { kind: 'sell', code: '0056', shares: 5000, price: 40 }).error, /只有 3,000 股/);
  assert.ok(T.applyTrade(null, { kind: 'sell', code: '0056', shares: 1, price: 1 }).error);
  assert.strictEqual(T.tradeTax(100000, '2330'), 300);
});

test('復原：買入、賣出、更正都能還原', () => {
  const h = { code: '0050', shares: 1000, cost: 150000, price: 160 };
  const b = T.applyTrade(h, { kind: 'buy', code: '0050', shares: 500, price: 170 });
  assert.deepStrictEqual(T.undoTrade(b.holding, b.trade).holding, h);
  const s = T.applyTrade(h, { kind: 'sell', code: '0050', shares: 1000, price: 170 });
  assert.deepStrictEqual(T.undoTrade(s.holding, s.trade).holding, h);
  const a = T.applyTrade(h, { kind: 'adjust', code: '0050', after: { shares: 1200 } });
  assert.deepStrictEqual(a.trade.before, { shares: 1000 });
  assert.deepStrictEqual(T.undoTrade(a.holding, a.trade).holding, h);
  const trades = [{ id: 'a', code: '0050', date: '2026-01-01' }, { id: 'b', code: '0050', date: '2026-03-01' }, { id: 'c', code: '0056', date: '2026-05-01' }];
  assert.strictEqual(T.latestTradeId(trades, '0050'), 'b');
});

test('投資總結分開帳面、已實現、實領股息', () => {
  const hs = [{ code: '0056', shares: 1000, cost: 35000, div: 2 }];
  const ts = [{ code: '0056', kind: 'sell', pnl: 4000, date: '2025-06-01' }, { code: '0056', kind: 'div', amount: 1500, date: '2026-07-15' }, { code: '0056', kind: 'div', amount: 1000, date: '2025-10-15' }];
  const s = T.investSummary(hs, ts, () => 40, '2026');
  assert.strictEqual(s.mv, 40000);
  assert.strictEqual(s.unreal, 40000 - 57 - 40 - 35000);
  assert.deepStrictEqual([s.realized, s.realizedYear, s.divAll, s.divYear, s.estDiv], [4000, 0, 2500, 1500, 2000]);
  assert.strictEqual(s.total, s.unreal + 4000 + 2500);
});

test('新資金依目標比例先補比重不足的', () => {
  const hs = [{ code: '0050', shares: 100, cost: 0 }, { code: '0056', shares: 100, cost: 0 }];
  const price = h => (h.code === '0050' ? 700 : 300); // 70000 / 30000
  const a = T.allocateNew(hs, price, { '0050': 50, '0056': 50 }, 20000);
  assert.deepStrictEqual(a.rows.map(r => r.add), [0, 20000]);
  assert.strictEqual(Math.round(a.rows[0].drift), 20);
  assert.strictEqual(T.allocateNew(hs, price, {}, 1000).ok, false);
});

test('trades 和 settings/invest 可以同步', () => {
  const d = emptyData(); assert.deepStrictEqual(d.trades, []);
  applyOp(d, { col: 'trades', id: 't1', data: { kind: 'buy' } }); assert.strictEqual(d.trades.length, 1);
  applyOp(d, { col: 'settings', id: 'invest', data: { targets: { '0050': 60 } } }); assert.deepStrictEqual(d.invest, { targets: { '0050': 60 } });
});
