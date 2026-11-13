# 老婆財務平台

阿臻的家計簿：收支總覽、記帳、預算、未來一年現金流、存錢目標、投資持股與固定支出。

**網址：https://a0981755429-debug.github.io/wife-finance/**（用 Safari 打開 → 分享 → 加入主畫面，就會像 App 一樣）

## 資料放哪裡

- 所有帳目、持股、預算都在 `app/vault.json`，**整份加密**（PBKDF2-SHA256＋AES-GCM），要輸入密碼才會在瀏覽器裡解開。這個 repo 是公開的，網路上只看得到亂碼；repo 裡沒有任何明文。
- 密碼不會傳到任何地方。忘記密碼就解不開，請自己記好，也定期在「設定」下載備份。
- 股票收盤價在 `app/quotes.json`，每個交易日傍晚由 GitHub Actions 自動更新。裡面是上市櫃全部的股票，看不出持有哪幾檔。

## 第一次使用（每台裝置做一次）

1. 打開網址，輸入密碼，勾「在這台裝置記住」。
2. 到「設定」分頁，照畫面上的步驟建立 GitHub Fine-grained token（只勾 wife-finance、Contents 選 Read and write），貼上後按「儲存金鑰」。
3. 之後在這台裝置的修改，幾秒內會自動存回 GitHub，其他裝置重新打開就會看到。兩台同時改也不會互蓋。

沒有設定金鑰的裝置可以看資料，修改會先存在這台裝置上。

## 平時更新資料

- **收支**：在 smoney 匯出 CSV，到「記帳」頁選檔案。會先列出每個月有沒有變，確認後再匯入。
- **持股**：現價每天自動更新；買賣後在「投資」頁改股數和付出成本。

## 檔案

| 路徑 | 內容 |
| --- | --- |
| `index.html`、圖示、`manifest.webmanifest` | 首頁（自動進入 `app/`）和主畫面圖示 |
| `app/index.html`、`app/style.css` | 頁面結構與樣式（含深色模式） |
| `app/app.js` | 主程式（圖表、各分頁、設定） |
| `app/vault.js` | 加解密、修改紀錄的套用與合併 |
| `app/sync.js` | 解鎖、讀取、用 GitHub API 自動同步 |
| `app/smoney.js` | smoney 匯出 CSV 的解析、類別對應、匯入前比對 |
| `app/vault.json` | 加密的資料檔 |
| `app/quotes.json` | 每天自動更新的收盤價 |
| `tools/vault.mjs` | 在電腦上加解密：`WF_PASS=密碼 node tools/vault.mjs encrypt\|decrypt 來源 目的` |
| `tools/quotes.mjs` | 抓證交所、櫃買中心收盤價 |
| `tests/` | 測試，用 `node --test tests/*.test.js` 執行 |
| `CHANGELOG.md` | 每一版的更新內容 |

## 修改程式

1. 改 `app/` 裡的檔案；要發新版時，同時改 `app/app.js` 的 `VERSION` 和 `CHANGELOG.md` 最上面一筆。開 PR。
2. GitHub Actions 跑語法檢查和測試。
3. 合併到 main 後，GitHub Pages 一兩分鐘內就會更新網站，Actions 也會自動建立版本標籤和 Release。
