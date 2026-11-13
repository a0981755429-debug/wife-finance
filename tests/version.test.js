const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// 每次改版要同時改 app.js 的 VERSION 和 CHANGELOG.md 最上面那一筆，發布才會建立對的版本標籤
test('app.js 的版本跟 CHANGELOG 最新一筆一致', () => {
  const app = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
  const log = fs.readFileSync(path.join(__dirname, '../CHANGELOG.md'), 'utf8');
  const v = app.match(/const VERSION='([\d.]+)'/)[1];
  const top = log.match(/^## ([\d.]+)/m)[1];
  assert.strictEqual(v, top);
});
