const test = require('node:test');
const assert = require('node:assert');
const { cleanHoldings, diffHoldings } = require('../app/holdings.js');

test('整理截圖讀出的持股：清掉格式、保留開頭 0、去重複', () => {
  const out = cleanHoldings([
    { code: ' 0050 ', name: '元大台灣50', shares: '1,000', cost: '$185,000', price: '190.5' },
    { code: '0050', name: '元大台灣50', shares: 1000, cost: 185000, price: 191 },
    { code: '合計', shares: 1 },
    { code: '2330', name: '台積電', shares: 10, cost: null, price: -1 },
  ]);
  assert.deepStrictEqual(out, [
    { code: '0050', name: '元大台灣50', shares: 1000, cost: 185000, price: 191 },
    { code: '2330', name: '台積電', shares: 10, cost: null, price: null },
  ]);
  assert.throws(() => cleanHoldings({}), /格式不對/);
});

test('跟目前持股比對：新增、有變動、沒變、截圖裡沒有', () => {
  const cur = [
    { id: '0050', code: '0050', name: '元大台灣50', shares: 1000, cost: 185000, price: 190, div: 3 },
    { id: '2330', code: '2330', name: '台積電', shares: 10, cost: 9000, price: 1000 },
    { id: '00878', code: '00878', name: '國泰永續高股息', shares: 100, cost: 2000, price: 21 },
  ];
  const d = diffHoldings(cur, [
    { code: '0050', name: '', shares: 1000, cost: 185000, price: 195 },
    { code: '2330', name: '台積電', shares: 10, cost: null, price: null },
    { code: '00919', name: '群益台灣精選高息', shares: 50, cost: 1100, price: 22 },
  ]);
  assert.deepStrictEqual(d.map(x => [x.code, x.status]), [['0050', 'changed'], ['2330', 'same'], ['00919', 'new'], ['00878', 'missing']]);
  assert.strictEqual(d[0].next.name, '元大台灣50'); // 沒讀到名稱就沿用舊的
  assert.strictEqual(d[1].next.cost, 9000); // 沒讀到的欄位沿用舊值
});
