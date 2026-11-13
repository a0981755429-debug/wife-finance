# 老婆財務平台

阿臻的家計簿：收支總覽、記帳、預算、未來一年現金流、存錢目標、投資持股與固定支出。

- 平台本體：https://claude.ai/artifact/PbRBMVwwTG6rSvDAb9t7Zk
- 手機桌面入口：https://a0981755429-debug.github.io/wife-finance/ （用 Safari 打開 → 分享 → 加入主畫面）

**財務資料不在這個 repo 裡。** 帳目、持股、預算都存在 claude.ai 的資料庫，只有在 claude.ai 打開才讀得到。這個 repo 是公開的，只放程式碼和入口頁。

## 檔案

| 路徑 | 內容 |
| --- | --- |
| `index.html`、圖示、`manifest.webmanifest` | GitHub Pages 入口頁，點開跳到平台 |
| `app/index.html` | 平台的頁面結構 |
| `app/style.css` | 樣式，含深色模式 |
| `app/app.js` | 平台主程式（讀寫 claude.ai 資料庫、圖表、各分頁） |
| `app/smoney.js` | smoney 匯出 CSV 的解析與類別對應 |
| `tests/` | smoney 匯入的測試，用 `node --test tests/*.test.js` 執行 |

## 修改流程

1. 改 `app/` 裡的檔案，開 PR。
2. GitHub Actions 會跑語法檢查和匯入測試。
3. 合併後，請 Claude 用 `app/` 的檔案重新發布到 claude.ai 平台（網址不變，資料不受影響）。
