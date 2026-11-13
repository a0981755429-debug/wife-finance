// 家計簿加密資料檔工具（跟網頁用同一套加密：PBKDF2-SHA256 → AES-GCM，先 gzip）
//
//   加密：WF_PASS=密碼 node tools/vault.mjs encrypt 明文.json app/vault.json
//   解密：WF_PASS=密碼 node tools/vault.mjs decrypt app/vault.json 明文.json
//
// 明文 JSON 絕對不要放進這個 repo（.gitignore 已擋 *.plain.json）。
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { deriveVaultKey, newSalt, encryptVault, decryptVault } = createRequire(import.meta.url)('../app/vault.js');

const [, , mode, src, dst] = process.argv;
const pass = process.env.WF_PASS;
if (!pass || !['encrypt', 'decrypt'].includes(mode) || !src || !dst) {
  console.error('用法：WF_PASS=密碼 node tools/vault.mjs encrypt|decrypt 來源 目的');
  process.exit(1);
}
if (mode === 'encrypt') {
  const data = JSON.parse(readFileSync(src, 'utf8'));
  const salt = newSalt();
  const v = await encryptVault(data, await deriveVaultKey(pass, salt), salt);
  writeFileSync(dst, JSON.stringify(v) + '\n');
  console.log(`已加密 → ${dst}`);
} else {
  const v = JSON.parse(readFileSync(src, 'utf8'));
  const data = await decryptVault(v, await deriveVaultKey(pass, v.salt, v.iter));
  writeFileSync(dst, JSON.stringify(data, null, 1) + '\n');
  console.log(`已解密 → ${dst}`);
}
