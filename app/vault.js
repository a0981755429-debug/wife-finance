/* 加密資料檔 vault.json：PBKDF2-SHA256 → AES-GCM，加密前先 gzip。
   瀏覽器和 Node（tools/vault.mjs、測試）共用。repo 裡只會有加密後的檔案。 */
const VAULT_ITER = 310000;
const vb64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const vunb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function vaultPipe(u8, stream) {
  const out = new Blob([u8]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
async function deriveVaultKey(pass, saltB64, iter = VAULT_ITER) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: vunb64(saltB64), iterations: iter }, base,
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
const newSalt = () => vb64(crypto.getRandomValues(new Uint8Array(16)));

async function encryptVault(data, key, saltB64, iter = VAULT_ITER) {
  let pt = new TextEncoder().encode(JSON.stringify(data));
  const z = typeof CompressionStream !== 'undefined';
  if (z) pt = await vaultPipe(pt, new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter, salt: saltB64, iv: vb64(iv), ...(z ? { z: 'gzip' } : {}), ct: vb64(ct) };
}
async function decryptVault(v, key) {
  let pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: vunb64(v.iv) }, key, vunb64(v.ct)));
  if (v.z === 'gzip') pt = await vaultPipe(pt, new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* 資料結構：monthly 是 {年月: 資料}；entries/goals/fixed/holdings/snapshots 是陣列（每筆有 id）；budget、plan 是物件。 */
const ARRAY_COLS = ['entries', 'goals', 'fixed', 'holdings', 'accounts', 'liabilities', 'reserves', 'snapshots', 'trades'];
const SETTING_IDS = ['budget', 'plan', 'funds', 'flows', 'invest'];
function emptyData() { return { schema: 1, monthly: {}, entries: [], budget: {}, plan: {}, goals: [], fixed: [], holdings: [], accounts: [], liabilities: [], reserves: [], snapshots: [], trades: [], funds: {} }; }
/* 一筆修改 op = {col, id, data}；data 為 null 代表刪除。col 'settings' 的 id 是 budget、plan 或 funds。 */
function applyOp(d, op) {
  const { col, id, data } = op;
  if (col === 'settings') { if (SETTING_IDS.includes(id)) d[id] = data || {}; return d; }
  if (col === 'monthly') { d.monthly = d.monthly || {}; if (data) d.monthly[id] = data; else delete d.monthly[id]; return d; }
  if (ARRAY_COLS.includes(col)) {
    const arr = (d[col] = d[col] || []); const i = arr.findIndex(e => e.id === id);
    if (!data) { if (i >= 0) arr.splice(i, 1); }
    else { const row = { ...data, id }; i < 0 ? arr.push(row) : (arr[i] = row); }
  }
  return d;
}
/* 把還沒同步的修改套在最新的雲端資料上（別台裝置先存了也不會被蓋掉）。
   op.prev 是這台修改前看到的那筆資料：雲端那筆如果在這段時間也被改過，就逐欄合併——
   只有這台改的欄位用這台的值，其他欄位保留雲端的；兩邊改到同一欄才算衝突（用這台的值，並回報）。 */
const COL_NAME = { entries: '記帳', goals: '目標', fixed: '固定支出', holdings: '持股', accounts: '帳戶', liabilities: '負債', reserves: '預留金', snapshots: '資產快照', trades: '投資交易', monthly: '月份資料', settings: '設定' };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function getRec(d, col, id) {
  if (col === 'settings') return d[id] || null;
  if (col === 'monthly') return (d.monthly || {})[id] || null;
  const r = (d[col] || []).find(e => e.id === id); if (!r) return null; const { id: _, ...rest } = r; return rest;
}
function merge3(prev, mine, remote, conflictKeys) {
  const out = { ...remote };
  for (const k of new Set([...Object.keys(prev), ...Object.keys(mine)])) {
    if (same(prev[k], mine[k])) continue;             // 這台沒改這欄 → 用雲端的
    if (!same(prev[k], remote[k]) && !same(remote[k], mine[k])) conflictKeys.push(k); // 兩邊都改了
    if (k in mine) out[k] = mine[k]; else delete out[k];
  }
  return out;
}
function rebaseDetailed(base, ops) {
  const d = JSON.parse(JSON.stringify(base || emptyData())); const conflicts = [];
  for (const op of ops) {
    if (!('prev' in op)) { applyOp(d, op); continue; }
    const remote = getRec(d, op.col, op.id), prev = op.prev, mine = op.data;
    if (same(remote, prev)) { applyOp(d, op); continue; } // 雲端沒動過
    const label = (COL_NAME[op.col] || op.col) + ' ' + ((mine && (mine.name || mine.code || mine.note)) || (prev && (prev.name || prev.code || prev.note)) || op.id);
    if (!mine) { if (remote) conflicts.push({ col: op.col, id: op.id, label, kind: 'kept', text: '這台刪除，但另一台改過，先保留另一台的版本' }); continue; }
    if (!remote) { applyOp(d, op); if (prev) conflicts.push({ col: op.col, id: op.id, label, kind: 'restored', text: '另一台刪除了，這台又改過，所以保留這台的版本' }); continue; }
    if (!prev || op.col === 'monthly' || typeof remote !== 'object') { applyOp(d, op); conflicts.push({ col: op.col, id: op.id, label, kind: 'overwrite', text: '兩台同時修改，用了這台的版本' }); continue; }
    const keys = []; applyOp(d, { col: op.col, id: op.id, data: merge3(prev, mine, remote, keys) });
    if (keys.length) conflicts.push({ col: op.col, id: op.id, label, kind: 'fields', fields: keys, text: `兩台同時改了「${keys.join('、')}」，用了這台的值` });
  }
  return { data: d, conflicts };
}
function rebase(base, ops) { return rebaseDetailed(base, ops).data; }

if (typeof module !== 'undefined') module.exports = { VAULT_ITER, deriveVaultKey, newSalt, encryptVault, decryptVault, emptyData, applyOp, rebase, rebaseDetailed, getRec };
