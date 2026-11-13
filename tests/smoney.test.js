const test = require('node:test');
const assert = require('node:assert');
const { smoneyCat, parseCSV, parseSmoney, diffMonths } = require('../app/smoney.js');

const sample = '﻿記帳日期,分類,主分類,子分類,金額,幣別,更新日期,備註\n' +
  '2026/11/01,支出,飲食,午餐,120,TWD,2026/11/01,便當\n' +
  '2026/11/04,支出,生活,房租,7051,TWD,2026/11/04,房貸\n' +
  '2026/11/05,收入,薪水,薪水,35000,TWD,2026/11/05,薪水\n' +
  '2026/11/06,支出,其他,其他,0,TWD,2026/11/06,零元會略過\n' +
  '2026/12/01,支出,消費,美容,"1,200",TWD,2026/12/01,"做臉, 含稅"\n';

test('依主分類、子分類、備註對應到家計簿類別', () => {
  assert.strictEqual(smoneyCat('支出', '飲食', '早餐', ''), '餐費');
  assert.strictEqual(smoneyCat('支出', '生活', '房租', '房貸'), '房貸');
  assert.strictEqual(smoneyCat('支出', '生活', '房租', '房租'), '房租');
  assert.strictEqual(smoneyCat('支出', '其他', '其他', '保費'), '保險');
  assert.strictEqual(smoneyCat('支出', '其他', '稅收', '健保費'), '稅費');
  assert.strictEqual(smoneyCat('收入', '薪水', '獎金', ''), '獎金');
  assert.strictEqual(smoneyCat('收入', '其他', '其他', '老公零用錢'), '零用');
});

test('CSV 解析處理 BOM、引號和逗號', () => {
  const rows = parseCSV(sample);
  assert.strictEqual(rows[0][0], '記帳日期');
  assert.strictEqual(rows[5][4], '1,200');
  assert.strictEqual(rows[5][7], '做臉, 含稅');
});

test('依月份分組，略過金額為 0 的資料', () => {
  const p = parseSmoney(sample);
  assert.strictEqual(p.n, 4);
  assert.strictEqual(p.skipped, 1);
  assert.deepStrictEqual(Object.keys(p.by).sort(), ['2026-11', '2026-12']);
  assert.strictEqual(p.by['2026-12'][0].a, 1200);
  assert.strictEqual(p.by['2026-11'][1].c, '房貸');
});

test('缺欄位時給出看得懂的錯誤', () => {
  assert.throws(() => parseSmoney('日期,金額\n2026/11/01,100\n'), /找不到欄位/);
});

test('匯入前比對：分出新增、有變動、沒變的月份', () => {
  const { by } = parseSmoney(sample);
  const monthly = {
    '2026-11': { rows: by['2026-11'].slice().reverse() }, // 順序不同也算沒變
    '2026-12': { rows: [{ d: '2026-12-01', t: 'e', c: '美容', s: '美容', a: 999, n: '' }] },
  };
  const d = diffMonths(by, monthly);
  assert.deepStrictEqual(d.map(x => x.status), ['same', 'changed']);
  assert.deepStrictEqual(diffMonths(by, {})[1], { ym: '2026-12', status: 'new', old: null, new: { i: 0, e: 1200, n: 1 } });
  // 舊的 Excel 月總計（沒有逐筆）一律當作有變動
  assert.strictEqual(diffMonths(by, { '2026-11': { income: 35000, expense: 7171 } })[0].status, 'changed');
});
