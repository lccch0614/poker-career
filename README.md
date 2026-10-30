# Poker Career · GitHub Pages 分享版

React + TypeScript + Vite。以 Sites 第 40 版遊戲為基礎，保留 Cash Game、錦標賽、AOF 及職涯／訓練功能，改用每位訪客自己的瀏覽器儲存。

## 1. 在 Mac／VS Code 開啟

安裝 Node.js 22.13 或更新版本（建議 Node 22 LTS），然後在這個資料夾開 Terminal：

```sh
npm ci
npm run dev
```

打開 Terminal 顯示的本機網址。不要直接雙擊 `index.html`；TypeScript／React 需要經 Vite 編譯。

## 2. 放上 GitHub

1. 建立新的公開 repository，例如 `poker-career`。
2. 將本資料夾內容上傳到 repository 根目錄，包括隱藏的 `.github/` 和 `.gitignore`。
3. 在 GitHub repository 開 **Settings → Pages**。
4. 在 **Build and deployment → Source** 選 **GitHub Actions**。
5. 推送 `main` 分支後，`Deploy Poker to GitHub Pages` workflow 會自動安裝、建置及發佈。
6. 完成後，在 Pages 設定或 Actions 的 deploy 結果取得公開網址。

Mac Finder 可用 Command + Shift + . 顯示隱藏檔。建議用 VS Code Source Control 或 GitHub Desktop 上傳，避免漏掉 `.github/workflows/pages.yml`。只上傳這份原始碼；不要上傳 `node_modules/`。

若使用 Git 指令，在 repository 尚未初始化的資料夾執行：

```sh
git init
git add .
git commit -m "Add Poker Career source"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

先把 `YOUR-USERNAME`、`YOUR-REPO` 換成自己的資料。日後修改後 commit 和 push，網站會自動更新。

官方說明：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 3. 建置與測試

```sh
npm run build
npm run preview
npm test
```

`build` 產生 `dist/`。相對路徑 `base: './'` 支援 repository 名稱不同的 GitHub Pages 子路徑。

`npm test` 涵蓋 AOF、多人錦標賽、分池與本機儲存測試。其他原有 TypeScript 測試亦保留在 `tests/`，完整 Sites 原版另附於匯出包。

## 存檔行為

- 全部籌碼／職涯資金都是虛擬數值。
- 存檔依「瀏覽器 + 網站路徑」分開；同一網址重開會讀回。
- 本機儲存有 revision 比對；兩個分頁同時寫入時會阻止較舊分頁覆蓋。
- 較大存檔直接寫本機，不受先前 keepalive 64 KiB 傳輸限制。
- 沒有雲端帳號或跨裝置同步；原 Sites 的雲端進度不會自動匯入。
- 瀏覽器容量不足或停用儲存時會顯示錯誤。清除網站資料會刪除進度。
- 公開版程式和 AI 底牌都在訪客裝置上運行，適合單機遊玩與學習，不適合作為防作弊的真人賽事伺服器。

## 檔案導覽

| 檔案 | 用途 |
|---|---|
| `app/page.tsx` | 首頁、牌桌、AOF、訓練及遊戲流程 |
| `app/globals.css` | 桌面及手機外觀 |
| `app/browser-storage.ts` | GitHub 版本機存檔轉接 |
| `app/poker-engine.ts` | 牌型及底池工具 |
| `app/career-bankroll.ts` | 職涯資金、買入與結算 |
| `app/tournament.ts`、`app/mtt-field.ts` | 錦標賽及多桌賽 |
| `app/tournament-clock.ts` | 行動倒數與 Time-bank |
| `app/preflop-strategy.ts` | 翻牌前策略 |
| `main.tsx`、`index.html` | 純 React 網頁入口 |
| `.github/workflows/pages.yml` | GitHub Pages 自動發佈 |

此分享包仍保留原套件鎖定版本，方便重現。部分套件屬原 Sites 工具鏈；分享版不會呼叫其登入或資料庫服務。
