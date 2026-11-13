const test = require('node:test');
const assert = require('node:assert');
const { deriveVaultKey, newSalt, encryptVault, decryptVault, emptyData, applyOp, rebase } = require('../app/vault.js');

test('加密後解得回來，密碼錯就解不開', async () => {
  const data = { ...emptyData(), monthly: { '2026-11': { rows: [{ d: '2026-11-01', t: 'e', c: '餐費', a: 120, n: '便當' }] } } };
  const salt = newSalt();
  const v = await encryptVault(data, await deriveVaultKey('正確的密碼', salt, 1000), salt, 1000);
  assert.strictEqual(v.z, 'gzip');
  assert.ok(!JSON.stringify(v).includes('便當'));
  assert.deepStrictEqual(await decryptVault(v, await deriveVaultKey('正確的密碼', v.salt, v.iter)), data);
  await assert.rejects(decryptVault(v, await deriveVaultKey('錯的密碼', v.salt, v.iter)));
});

test('修改套用：新增、更新、刪除、設定', () => {
  const d = emptyData();
  applyOp(d, { col: 'holdings', id: '0050', data: { code: '0050', shares: 100 } });
  applyOp(d, { col: 'holdings', id: '0050', data: { code: '0050', shares: 200 } });
  applyOp(d, { col: 'monthly', id: '2026-11', data: { rows: [] } });
  applyOp(d, { col: 'settings', id: 'budget', data: { cats: { 餐費: 8000 } } });
  assert.deepStrictEqual(d.holdings, [{ code: '0050', shares: 200, id: '0050' }]);
  assert.deepStrictEqual(d.budget, { cats: { 餐費: 8000 } });
  applyOp(d, { col: 'holdings', id: '0050', data: null });
  applyOp(d, { col: 'monthly', id: '2026-11', data: null });
  assert.deepStrictEqual([d.holdings, d.monthly], [[], {}]);
});

test('兩台裝置都有修改：把這台的修改套在雲端最新版本上，不會蓋掉對方', () => {
  const cloud = { ...emptyData(), goals: [{ id: 'emergency', saved: 160000 }], holdings: [{ id: '0050', shares: 200 }] }; // 另一台剛存的
  const mine = [{ col: 'holdings', id: '0050', data: { shares: 300 } }, { col: 'entries', id: 'x1', data: { date: '2026-11-13', amount: 50 } }];
  const out = rebase(cloud, mine);
  assert.strictEqual(out.goals[0].saved, 160000);
  assert.strictEqual(out.holdings[0].shares, 300);
  assert.strictEqual(out.entries.length, 1);
  assert.strictEqual(cloud.holdings[0].shares, 200); // 原本的不會被改到
});

test('同一筆被兩台裝置改：不同欄位都保留，改到同一欄才回報衝突', () => {
  const { rebaseDetailed } = require('../app/vault.js');
  const prev = { code: '0050', shares: 200, cost: 20000, price: 100 };
  const cloud = { ...emptyData(), holdings: [{ id: '0050', ...prev, price: 101, div: 3 }] }; // 另一台改了現價、配息
  const mine = [{ col: 'holdings', id: '0050', prev, data: { ...prev, shares: 300, cost: 30000 } }]; // 這台改股數、成本
  let r = rebaseDetailed(cloud, mine);
  assert.deepStrictEqual(r.data.holdings[0], { id: '0050', code: '0050', shares: 300, cost: 30000, price: 101, div: 3 });
  assert.deepStrictEqual(r.conflicts, []);
  r = rebaseDetailed(cloud, [{ col: 'holdings', id: '0050', prev, data: { ...prev, price: 99 } }]);
  assert.strictEqual(r.data.holdings[0].price, 99);
  assert.deepStrictEqual(r.conflicts.map(c => c.fields), [['price']]);
  // 這台刪除、另一台改過 → 先保留另一台的
  r = rebaseDetailed(cloud, [{ col: 'holdings', id: '0050', prev, data: null }]);
  assert.strictEqual(r.data.holdings.length, 1);
  assert.strictEqual(r.conflicts[0].kind, 'kept');
  // 雲端沒動過 → 照常套用、沒有衝突
  r = rebaseDetailed({ ...emptyData(), holdings: [{ id: '0050', ...prev }] }, [{ col: 'holdings', id: '0050', prev, data: null }]);
  assert.deepStrictEqual([r.data.holdings, r.conflicts], [[], []]);
});
