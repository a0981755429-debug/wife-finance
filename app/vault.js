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

/* 資料結構：monthly 是 {年月: 資料}；entries/goals/fixed/holdings 是陣列（每筆有 id）；budget、plan 是物件。 */
const ARRAY_COLS = ['entries', 'goals', 'fixed', 'holdings'];
function emptyData() { return { schema: 1, monthly: {}, entries: [], budget: {}, plan: {}, goals: [], fixed: [], holdings: [] }; }
/* 一筆修改 op = {col, id, data}；data 為 null 代表刪除。col 'settings' 的 id 是 budget 或 plan。 */
function applyOp(d, op) {
  const { col, id, data } = op;
  if (col === 'settings') { if (id === 'budget' || id === 'plan') d[id] = data || {}; return d; }
  if (col === 'monthly') { d.monthly = d.monthly || {}; if (data) d.monthly[id] = data; else delete d.monthly[id]; return d; }
  if (ARRAY_COLS.includes(col)) {
    const arr = (d[col] = d[col] || []); const i = arr.findIndex(e => e.id === id);
    if (!data) { if (i >= 0) arr.splice(i, 1); }
    else { const row = { ...data, id }; i < 0 ? arr.push(row) : (arr[i] = row); }
  }
  return d;
}
/* 把還沒同步的修改套在最新的雲端資料上（別台裝置先存了也不會被蓋掉） */
function rebase(base, ops) { const d = JSON.parse(JSON.stringify(base || emptyData())); for (const op of ops) applyOp(d, op); return d; }

if (typeof module !== 'undefined') module.exports = { VAULT_ITER, deriveVaultKey, newSalt, encryptVault, decryptVault, emptyData, applyOp, rebase };
