const test = require('node:test');
const assert = require('node:assert');
const { auditData, importRisks } = require('../app/audit.js');

test('健檢：正常資料沒有問題', () => {
  const r = auditData({ monthly: { '2026-11': { rows: [{ d: '2026-11-01', t: 'e', c: '餐費', a: 120, n: '' }] } }, entries: [{ id: 'a', date: '2026-11-02', type: 'expense', category: '餐費', amount: 80 }] });
  assert.deepStrictEqual([r.months, r.rows, r.entries, r.issues], [1, 1, 1, []]);
});

test('健檢：錯誤日期、金額、跨月份、重複編號、月總計和逐筆重疊、疑似重複', () => {
  const r = auditData({
    monthly: {
      '2026-10': { income: { 薪水: 35000 }, rows: [{ d: '2026-11-03', t: 'i', c: '薪水', a: 35000 }] },
      '2026-11': { rows: [{ d: '2026-11-31', t: 'e', c: '餐費', a: 100 }, { d: '2026-11-05', t: 'e', c: '餐費', a: -5 }, { d: '2026-11-06', t: 'e', c: '其他', a: 500000 }, { d: '2026-11-07', t: 'e', c: '餐費', a: 250 }] },
    },
    entries: [{ id: 'x', date: '2026-11-07', type: 'expense', amount: 250 }, { id: 'x', date: '2026/11/08', type: 'expense', amount: 10 }],
    holdings: [{ code: '0050', shares: -1 }],
  });
  const msgs = r.issues.map(i => i.level + ':' + i.msg).join('\n');
  for (const s of ['算兩次', '不在 2026-10', '日期「2026-11-31」', '金額「-5」', 'warn:金額 500,000', '可能記了兩次', '日期「2026/11/08」', '編號 x 重複', '股數']) assert.ok(msgs.includes(s), s);
  assert.strictEqual(r.issues[r.issues.length - 1].level, 'warn'); // 錯誤排在前面
});

test('匯入前風險：蓋掉 Excel 月總計、跟手動記帳重複、補記收支會保留', () => {
  const by = { '2025-04': [{ d: '2025-04-10', t: 'e', c: '餐費', a: 300 }], '2026-11': [{ d: '2026-11-07', t: 'e', c: '餐費', a: 250 }] };
  const rs = importRisks(by, { '2025-04': { income: { 薪水: 35000 }, extra: { income: { 股票: 1000 } } } }, [{ date: '2026-11-07', type: 'expense', amount: 250 }]);
  assert.deepStrictEqual(rs.map(r => r.kind), ['legacy', 'extra', 'manual']);
});
