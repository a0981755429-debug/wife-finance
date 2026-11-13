/* 讀取、解鎖、同步 vault.json。
   - 沒設定 GitHub 金鑰：讀網站上的 vault.json，修改只存在這台裝置（加密草稿）。
   - 有金鑰：用 GitHub API 讀最新版本，修改後幾秒自動寫回；別台裝置先存了，會先拿最新的再把這台的修改套上去。 */
const Sync = (() => {
  const ls = { get: k => { try { return localStorage.getItem(k) } catch (e) { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} }, del: k => { try { localStorage.removeItem(k) } catch (e) {} } };
  const PATH = 'app/vault.json';
  let CONFLICTS = (() => { try { return JSON.parse(localStorage.getItem('wf.conflicts') || '[]') } catch (e) { return [] } })(), onConflicts = () => {};
  let VAULT = null, KEY = null, SALT = '', ITER = VAULT_ITER, BASE = null, SHA = null, OPS = [], timer = null, busy = false, again = false, onData = () => {}, onState = () => {};

  const repo = () => { const r = ls.get('wf.repo'); if (r) return r; const h = location.hostname.match(/^([^.]+)\.github\.io$/); const p = location.pathname.split('/').filter(Boolean)[0]; return h && p ? `${h[1]}/${p}` : 'a0981755429-debug/wife-finance'; };
  const token = () => ls.get('wf.token') || '';
  const api = () => `https://api.github.com/repos/${repo()}/contents/${PATH}`;
  const H = () => ({ Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  const b64utf = s => btoa(s); // vault 內容本身就是 ASCII
  const state = (kind, text) => onState({ kind, text, pending: OPS.length, hasToken: !!token() });

  async function fetchRemote(useStatic) {
    if (token() && !useStatic) {
      const r = await fetch(api() + '?ref=main&t=' + Date.now(), { headers: H(), cache: 'no-store' });
      if (r.status === 404) return { vault: null, sha: null };
      if (!r.ok) throw httpErr(r.status);
      const j = await r.json();
      return { vault: JSON.parse(atob(j.content.replace(/\n/g, ''))), sha: j.sha };
    }
    const r = await fetch('vault.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw httpErr(r.status);
    return { vault: await r.json(), sha: null };
  }
  const httpErr = s => Object.assign(new Error('HTTP ' + s), { status: s });
  const errText = e => ({ 401: '金鑰錯誤或過期', 403: '金鑰沒有寫入權限（Contents 要選 Read and write）', 404: '金鑰沒有勾到 wife-finance 這個 repo' })[e && e.status] || (e && e.message) || '網路錯誤';

  async function saveDraft() {
    if (!KEY) return;
    if (!OPS.length) { ls.del('wf.draft'); return; }
    ls.set('wf.draft', JSON.stringify({ salt: SALT, v: await encryptVault({ ops: OPS }, KEY, SALT, ITER) }));
  }
  async function loadDraft() {
    const raw = ls.get('wf.draft'); if (!raw) return [];
    try { const o = JSON.parse(raw); if (o.salt !== SALT) return []; return (await decryptVault(o.v, KEY)).ops || []; } catch (e) { return []; }
  }

  async function boot(handlers) {
    onData = handlers.onData; onState = handlers.onState; onConflicts = handlers.onConflicts || onConflicts;
    state('loading', '讀取資料中…');
    try { const r = await fetchRemote(); VAULT = r.vault; SHA = r.sha; }
    catch (e) {
      let ok = false;
      if (token()) { try { const r = await fetchRemote(true); VAULT = r.vault; ok = true; } catch (e2) {} } // 金鑰有問題時先讀網站上的版本
      if (!ok) { state('error', '讀不到資料檔：' + errText(e)); return 'error'; }
    }
    if (!VAULT) { state('error', '網站上還沒有 vault.json'); return 'error'; }
    const saved = ls.get('wf.key');
    if (saved) { try { const o = JSON.parse(saved); if (o.salt === VAULT.salt) { await unlockWithKey(await crypto.subtle.importKey('jwk', o.jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']), false); return 'unlocked'; } } catch (e) { ls.del('wf.key'); } }
    return 'locked';
  }
  async function unlock(pass, remember) {
    const k = await deriveVaultKey(pass, VAULT.salt, VAULT.iter);
    await unlockWithKey(k, remember); // 密碼錯會在解密時丟出錯誤
  }
  async function unlockWithKey(k, remember) {
    BASE = await decryptVault(VAULT, k);
    KEY = k; SALT = VAULT.salt; ITER = VAULT.iter || VAULT_ITER;
    if (remember) ls.set('wf.key', JSON.stringify({ salt: SALT, jwk: await crypto.subtle.exportKey('jwk', k) }));
    OPS = await loadDraft();
    onData(rebase(BASE, OPS));
    if (OPS.length) { state('pending', `這台裝置有 ${OPS.length} 筆還沒同步的修改`); schedule(500); }
    else idle();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  }
  function idle() {
    if (!token()) state('local', OPS.length ? `修改只存在這台裝置（${OPS.length} 筆）· 到「設定」填 GitHub 金鑰才會同步` : '唯讀 · 到「設定」填 GitHub 金鑰才能同步修改');
    else state('ok', '已同步 · 修改會自動存到 GitHub');
  }

  function op(col, id, data, prev) {
    const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
    const o = { col, id, data: clone(data) }; if (prev !== undefined) o.prev = clone(prev);
    OPS.push(o);
    saveDraft(); schedule(2500);
    if (token()) state('pending', '有修改，稍後自動同步…'); else idle();
  }
  function schedule(ms) { clearTimeout(timer); if (token()) timer = setTimeout(push, ms); }

  async function push() {
    if (!token() || !OPS.length) return;
    if (busy) { again = true; return; }
    busy = true; state('syncing', '同步中…');
    const sending = OPS.slice();
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetchRemote();
        if (r.vault && r.sha !== SHA) {
          if (r.vault.salt !== SALT) throw new Error('密碼在別台裝置改過了，請重新整理後用新密碼解鎖');
          BASE = await decryptVault(r.vault, KEY); SHA = r.sha;
        }
        const rb = rebaseDetailed(BASE, sending); const next = rb.data; next.savedAt = new Date().toISOString();
        var found = rb.conflicts;
        const v = await encryptVault(next, KEY, SALT, ITER);
        const res = await fetch(api(), { method: 'PUT', headers: H(), body: JSON.stringify({ message: '更新家計簿資料 ' + next.savedAt.slice(0, 16).replace('T', ' '), content: b64utf(JSON.stringify(v) + '\n'), ...(SHA ? { sha: SHA } : {}), branch: 'main' }) });
        if (res.status === 409 || res.status === 422) continue; // 別台裝置剛好也在存，重拿一次
        if (!res.ok) throw httpErr(res.status);
        const j = await res.json(); SHA = j.content.sha; BASE = next; VAULT = v;
        if (found.length) { const at = new Date().toISOString(); CONFLICTS = found.map(c => ({ ...c, at })).concat(CONFLICTS).slice(0, 30); ls.set('wf.conflicts', JSON.stringify(CONFLICTS)); onConflicts(found); }
        OPS = OPS.slice(sending.length); await saveDraft();
        onData(rebase(BASE, OPS));
        busy = false;
        if (OPS.length || again) { again = false; return push(); }
        state('ok', '已同步 ' + new Date().toTimeString().slice(0, 5));
        return;
      }
      throw new Error('一直跟別台裝置衝突，稍後再試');
    } catch (e) {
      busy = false; state('error', '同步失敗：' + errText(e) + '。修改先留在這台裝置。');
    }
  }
  async function refresh() {
    if (!KEY || busy || OPS.length || !token()) return;
    try { const r = await fetchRemote(); if (r.vault && r.sha !== SHA && r.vault.salt === SALT) { BASE = await decryptVault(r.vault, KEY); SHA = r.sha; VAULT = r.vault; onData(rebase(BASE, OPS)); } } catch (e) {}
  }

  async function setToken(t) {
    t = (t || '').trim();
    if (!t) { ls.del('wf.token'); idle(); return 'cleared'; }
    const r = await fetch(`https://api.github.com/repos/${repo()}`, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw httpErr(r.status);
    const j = await r.json(); if (!(j.permissions && j.permissions.push)) throw httpErr(403);
    ls.set('wf.token', t);
    const cur = await fetchRemote(); SHA = cur.sha;
    if (cur.vault && cur.vault.salt === SALT) { BASE = await decryptVault(cur.vault, KEY); VAULT = cur.vault; onData(rebase(BASE, OPS)); }
    if (OPS.length) push(); else idle();
    return 'ok';
  }
  async function changePassword(oldPass, newPass) {
    if (!token()) throw new Error('要先設定 GitHub 金鑰，新密碼才能存回去');
    const check = await deriveVaultKey(oldPass, SALT, ITER); await decryptVault(VAULT, check);
    if (OPS.length) await push();
    if (OPS.length) throw new Error('還有修改沒同步，先處理同步問題');
    const salt = newSalt(), key = await deriveVaultKey(newPass, salt, VAULT_ITER);
    const r = await fetchRemote(); if (r.vault && r.sha !== SHA) { BASE = await decryptVault(r.vault, KEY); SHA = r.sha; }
    const next = { ...BASE, savedAt: new Date().toISOString() }; const v = await encryptVault(next, key, salt, VAULT_ITER);
    const res = await fetch(api(), { method: 'PUT', headers: H(), body: JSON.stringify({ message: '更換家計簿密碼', content: b64utf(JSON.stringify(v) + '\n'), sha: SHA, branch: 'main' }) });
    if (!res.ok) throw httpErr(res.status);
    SHA = (await res.json()).content.sha; KEY = key; SALT = salt; ITER = VAULT_ITER; VAULT = v; BASE = next;
    if (ls.get('wf.key')) ls.set('wf.key', JSON.stringify({ salt, jwk: await crypto.subtle.exportKey('jwk', key) }));
    idle();
  }
  function lock() { ls.del('wf.key'); location.reload(); }
  function plain() { return rebase(BASE, OPS); }
  function conflicts() { return CONFLICTS; }
  function clearConflicts() { CONFLICTS = []; ls.del('wf.conflicts'); }
  return { boot, unlock, op, conflicts, clearConflicts, syncNow: () => { clearTimeout(timer); return push(); }, setToken, changePassword, lock, plain, repo, hasToken: () => !!token(), errText };
})();
