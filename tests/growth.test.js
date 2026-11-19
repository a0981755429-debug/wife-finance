const test = require('node:test');
const assert = require('node:assert');
const { snapshotOf, snapChanged, netSeries, growthStats, investPlan } = require('../app/growth.js');
const { emptyData, applyOp } = require('../app/vault.js');

test('快照只記整數，數字沒變就不重存', () => {
  const s = snapshotOf({ cash: 300000.4, liquid: 200000, invest: 259236.7, debt: 1430625, net: -871388.3 }, '2026-11');
  assert.deepStrictEqual(s, { ym: '2026-11', cash: 300000, liquid: 200000, invest: 259237, other: 0, debt: 1430625, net: -871388 });
  assert.strictEqual(snapChanged(null, s), true);
  assert.strictEqual(snapChanged({ ...s, at: 'x' }, s), false);
  assert.strictEqual(snapChanged({ ...s, net: 1 }, s), true);
});

test('第一筆快照之前用收支結餘往回推估，之後沒記到的月份留空', () => {
  const snaps = [{ id: '2026-09', net: 100000 }, { id: '2026-11', net: 130000 }];
  const surplus = { '2026-06': 1, '2026-07': 5000, '2026-08': -2000, '2026-09': 10000, '2026-10': 8000 };
  const s = netSeries(snaps, surplus, '2026-11', 12);
  assert.deepStrictEqual(s.map(p => [p.ym, p.net, p.est]), [
    ['2026-05', 86999, true], ['2026-06', 87000, true], ['2026-07', 92000, true], ['2026-08', 90000, true],
    ['2026-09', 100000, false], ['2026-10', null, false], ['2026-11', 130000, false]]);
  const g = growthStats(s);
  assert.strictEqual(g.prev.ym, '2026-09'); assert.strictEqual(g.prev.diff, 30000);
  assert.strictEqual(g.year, null); assert.strictEqual(g.first.diff, 43001); assert.strictEqual(g.first.est, true);
  assert.deepStrictEqual(netSeries([], surplus, '2026-11'), []);
});

test('預備金不夠：結餘一半補預備金、一半投資', () => {
  const P = investPlan({ liquid: 150000, reserved: 30000, floor: 0, living: 40000, surplus: 21000 });
  assert.strictEqual(P.fund, 120000); assert.strictEqual(P.target, 240000); assert.strictEqual(P.months, 3);
  assert.strictEqual(P.short, 120000); assert.strictEqual(P.toFund, 10500); assert.strictEqual(P.toInvest, 10000);
  assert.strictEqual(P.fillMonths, 12); assert.strictEqual(P.lump, 0);
});

test('預備金夠了：結餘全部可投入，超過底線的可以分批投入；沒有結餘就不建議投入', () => {
  const P = investPlan({ liquid: 500000, reserved: 0, floor: 200000, living: 40000, surplus: 15500 });
  assert.strictEqual(P.target, 200000); assert.strictEqual(P.targetFromFloor, true);
  assert.strictEqual(P.short, 0); assert.strictEqual(P.toInvest, 15000); assert.strictEqual(P.lump, 300000);
  const N = investPlan({ liquid: 50000, living: 40000, surplus: -3000 });
  assert.strictEqual(N.toInvest, 0); assert.strictEqual(N.toFund, 0); assert.strictEqual(N.fillMonths, null);
});

test('snapshots 是可以同步的資料', () => {
  const d = emptyData(); assert.deepStrictEqual(d.snapshots, []);
  applyOp(d, { col: 'snapshots', id: '2026-11', data: { ym: '2026-11', net: 1 } });
  assert.deepStrictEqual(d.snapshots, [{ ym: '2026-11', net: 1, id: '2026-11' }]);
});

const { cashFlowOf, cashFlowStats, monthlyBook } = require('../app/growth.js');

test('自由現金流＝收入 − 生活支出 − 貸款月付', () => {
  const f = cashFlowOf({ ti: 60000, te: 52000, loan: 18000 });
  assert.deepStrictEqual(f, { income: 60000, living: 34000, loan: 18000, pre: 26000, fcf: 8000, dsr: 0.3 });
  assert.strictEqual(cashFlowOf({ ti: 0, te: 5000, loan: 0 }).dsr, null);
});

test('自由現金流統計：中位數、負的月份、貸款佔收入', () => {
  const rows = [
    { ym: '2026-08', ...cashFlowOf({ ti: 60000, te: 50000, loan: 18000 }) },
    { ym: '2026-09', ...cashFlowOf({ ti: 60000, te: 65000, loan: 18000 }) },
    { ym: '2026-10', ...cashFlowOf({ ti: 90000, te: 54000, loan: 18000 }) },
  ];
  const C = cashFlowStats(rows);
  assert.strictEqual(C.n, 3); assert.strictEqual(C.median, 10000); assert.strictEqual(C.negN, 1);
  assert.strictEqual(C.total, 41000); assert.strictEqual(C.dsr, 0.3); assert.strictEqual(C.last.ym, '2026-10');
  assert.strictEqual(cashFlowStats([]), null);
});

test('淨資產與現金流對照：比上月和其他變動，估算的月份不算其他變動', () => {
  const flows = { '2026-08': cashFlowOf({ ti: 60000, te: 50000, loan: 18000 }), '2026-09': cashFlowOf({ ti: 60000, te: 50000, loan: 18000 }), '2026-10': cashFlowOf({ ti: 60000, te: 50000, loan: 18000 }) };
  const series = [{ ym: '2026-08', net: 90000, est: true }, { ym: '2026-09', net: 100000, est: false }, { ym: '2026-10', net: 125000, est: false }];
  const b = monthlyBook(['2026-08', '2026-09', '2026-10'], flows, series);
  assert.deepStrictEqual(b.map(r => [r.ym, r.net, r.change, r.other]), [
    ['2026-08', 90000, null, null], ['2026-09', 100000, 10000, null], ['2026-10', 125000, 25000, 15000]]);
  assert.strictEqual(monthlyBook(['2026-10'], flows, [])[0].net, null);
});
