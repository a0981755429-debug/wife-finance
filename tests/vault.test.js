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
