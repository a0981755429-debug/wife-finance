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
| `app/smoney.js` | smoney 匯出 CSV 的解析、類別對應、匯入前的月份比對 |
| `app/holdings.js` | 券商截圖讀出的持股整理與比對 |
| `tests/` | 匯入、持股比對、版本一致的測試，用 `node --test tests/*.test.js` 執行 |
| `CHANGELOG.md` | 每一版的更新內容 |

## 修改流程

1. 改 `app/` 裡的檔案；要發新版時，同時改 `app/app.js` 的 `VERSION` 和 `CHANGELOG.md` 最上面一筆。開 PR。
2. GitHub Actions 會跑語法檢查和測試（包含版本號是否一致）。
3. 合併到 main 後，Actions 會自動建立版本標籤和 Release（附 `app/` 的壓縮檔）。
4. 請 Claude 用 `app/` 的檔案重新發布到 claude.ai 平台（網址不變，資料不受影響）。頁面最下面會顯示目前版本。

## 平時更新資料

- **收支**：在 smoney 匯出 CSV，到「記帳」頁選檔案。會先列出每個月有沒有變，確認後再匯入。
- **持股**：在券商 App 截「未實現損益」畫面，到「投資」頁的「從券商截圖更新」選圖、讀取、確認後套用。
