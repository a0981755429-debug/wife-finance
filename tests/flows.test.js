const test = require('node:test');
const assert = require('node:assert');
const { classify, flowSig, flowsFor, accountDeltas, MOVE_FLOWS } = require('../app/flows.js');
const { emptyData, applyOp } = require('../app/vault.js');

test('自動判斷：一般消費和收入不變，房貸是還款', () => {
  assert.strictEqual(classify({ d: '2026-11-01', t: 'e', c: '餐費', s: '午餐', a: 120, n: '便當' }).flow, 'spend');
  assert.strictEqual(classify({ d: '2026-11-05', t: 'i', c: '薪水', a: 35000, n: '薪水' }).flow, 'income');
  assert.strictEqual(classify({ d: '2026-11-04', t: 'e', c: '房貸', s: '房租', a: 7060, n: '房貸' }).flow, 'repay');
  assert.strictEqual(classify({ t: 'i', c: '零用', n: '老公零用錢' }).flow, 'income');
});

test('自動判斷：轉帳、買股、賣股、借款屬於資金移動', () => {
  const c = r => classify(r).flow;
  assert.strictEqual(c({ t: 'e', c: '其他', n: '轉帳到郵局' }), 'transfer');
  assert.strictEqual(c({ t: 'e', c: '其他', n: '0050 定期定額' }), 'invest_buy');
  assert.strictEqual(c({ t: 'e', c: '其他', n: '買股 00878' }), 'invest_buy');
  assert.strictEqual(c({ t: 'i', c: '股票', a: 51635, n: 'extra' }), 'invest_sell');
  assert.strictEqual(c({ t: 'i', c: '其他收入', n: '信貸撥款' }), 'borrow');
  assert.strictEqual(c({ t: 'e', c: '其他', n: '還信貸' }), 'repay');
  for (const f of ['transfer', 'invest_buy', 'invest_sell', 'borrow']) assert.ok(MOVE_FLOWS.has(f));
  assert.ok(!MOVE_FLOWS.has('repay') && !MOVE_FLOWS.has('spend'));
});

test('手動設定優先：記帳上的 flow、匯入紀錄的覆寫', () => {
  const r = { d: '2025-01-03', t: 'e', c: '旅遊', s: '旅遊', a: 13272, n: '換錢' };
  assert.deepStrictEqual(classify(r), { flow: 'spend', auto: true, why: '' });
  assert.strictEqual(classify(r, { [flowSig(r)]: 'transfer' }).flow, 'transfer');
  assert.strictEqual(classify({ ...r, flow: 'invest_buy' }).flow, 'invest_buy');
  assert.strictEqual(classify(r, { [flowSig(r)]: 'nonsense' }).flow, 'spend'); // 不認得的值不理
  assert.deepStrictEqual(flowsFor('e'), ['spend', 'repay', 'transfer', 'invest_buy']);
});

test('連動帳戶餘額：消費扣款、收入入帳、轉帳兩邊一加一減', () => {
  assert.deepStrictEqual(accountDeltas({ type: 'expense', amount: 500, acct: 'A' }), { A: -500 });
  assert.deepStrictEqual(accountDeltas({ type: 'income', amount: 35000, acct: 'A' }), { A: 35000 });
  assert.deepStrictEqual(accountDeltas({ type: 'expense', flow: 'transfer', amount: 10000, acct: 'A', acct2: 'B' }), { A: -10000, B: 10000 });
  assert.deepStrictEqual(accountDeltas({ type: 'expense', flow: 'invest_buy', amount: 10000, acct: 'A' }), { A: -10000 });
  assert.deepStrictEqual(accountDeltas({ type: 'expense', amount: 100 }), {});
});

test('分類設定存在 settings/flows', () => {
  const d = emptyData();
  applyOp(d, { col: 'settings', id: 'flows', data: { overrides: { x: 'transfer' } } });
  assert.deepStrictEqual(d.flows, { overrides: { x: 'transfer' } });
});
