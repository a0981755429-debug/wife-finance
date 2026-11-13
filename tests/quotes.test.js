const test = require('node:test');
const assert = require('node:assert');
const { parseTwse, parseTpex, rocToIso } = require('../tools/quotes-parse.cjs');

test('解析證交所收盤價', () => {
  const r = parseTwse([
    { Date: '1151113', Code: '0050', Name: '元大台灣50', ClosingPrice: '108.15' },
    { Date: '1151113', Code: '00400A', Name: '主動國泰動能高息', ClosingPrice: '14.84' },
    { Date: '1151113', Code: '2330', Name: '台積電', ClosingPrice: '1,450.00' },
    { Date: '1151113', Code: '9999', Name: '沒成交', ClosingPrice: '' },
  ]);
  assert.deepStrictEqual(r, { prices: { '0050': 108.15, '00400A': 14.84, '2330': 1450 }, date: '2026-11-13' });
});

test('解析櫃買中心收盤價', () => {
  const r = parseTpex([{ Date: '1151113', SecuritiesCompanyCode: '6488', CompanyName: '環球晶', Close: '420.50' }, { Date: '1151113', SecuritiesCompanyCode: '6547', Close: '---' }]);
  assert.deepStrictEqual(r, { prices: { 6488: 420.5 }, date: '2026-11-13' });
  assert.strictEqual(rocToIso('115/01/05'), '2026-01-05');
});
