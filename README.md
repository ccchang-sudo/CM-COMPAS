# 普通考試歷屆試題複習系統（中國科技大學 管理學院）

純靜態網頁，掛在 GitHub Pages，學生開網址即用，免登入、免後端。

## 目前功能

| 需求 | 實作 |
|---|---|
| 學生透過網頁連線 | GitHub Pages 網址 |
| 亂數出題 | 隨機出題／依考點練習／錯題重練；可篩年度、題數；同一輪不重複 |
| 網頁輸入答案 | 選擇題點選選項；可選每題 72 或 45 秒倒數，時間到自動算未答 |
| 送出後評分並給完整答案建議 | 立即顯示對錯、得分、正確答案與詳解；支援考選部「更正答案」與「一律給分」 |
| 接續練習或停止 | 下一題／結束並檢視紀錄／繼續練習；關掉網頁後可「接續上次紀錄」 |
| 複習輔助 | 錯題本、各考點答對率、複製文字紀錄、列印或存成 PDF、備份與匯入紀錄 |

紀錄只存在學生自己的瀏覽器，不會傳到任何伺服器。

## 檔案

```
index.html        前端（HTML + CSS + JS，無外部套件）
core.js           出題、評分、統計邏輯（可用 Node 單獨測試）
data/bank.json    題庫（目前：113 年普考 經濟學概要 50 題）
.nojekyll         讓 GitHub Pages 原樣提供檔案
```

## 部署到 GitHub Pages

1. 在 GitHub 建立倉庫（Pages 在免費方案只支援公開倉庫，題庫與詳解會是公開的）。
2. 把本資料夾的所有檔案放進倉庫根目錄（網頁介面：Add file → Upload files；或 `git push`）。
3. Settings → Pages → Source 選 Deploy from a branch，Branch 選 main、資料夾選 / (root)，按 Save。
4. 1 至 2 分鐘後網址為 `https://<帳號或組織>.github.io/<倉庫名>/`。

本機測試：在資料夾執行 `python3 -m http.server 8000`，開 http://localhost:8000。不要直接雙擊 index.html（瀏覽器會擋住讀取題庫檔）。

## 新增題目

在 `data/bank.json` 的 `questions` 陣列加入題目，格式如下。載入時系統會檢查格式，有誤會顯示錯誤訊息。

```json
{
  "id": "113-econ-1",
  "year_roc": 113,
  "exam": "公務人員普通考試",
  "categories": ["金融保險", "統計", "經建行政", "商業行政"],
  "subject": "經濟學概要",
  "question_no": 1,
  "type": "mcq",
  "points": 2,
  "question": "題目全文",
  "options": ["選項 A", "選項 B", "選項 C", "選項 D"],
  "answer": "A",
  "accept": null,
  "give_all": false,
  "correction_note": "",
  "explanation": "詳解",
  "area": "個體經濟",
  "tags": ["生產可能曲線"],
  "source": "考選部考畢試題查詢平臺"
}
```

- 考選部公告更正答案：改 `answer`，或在 `accept` 填多個可接受答案（如 `["A","C"]`），並在 `correction_note` 註明。
- 公告一律給分：`give_all` 設為 `true`。
- `question` 與 `explanation` 允許少量 HTML（`<sub>`、`<sup>`、`<table>`），其餘欄位一律當純文字。題庫只能由維護者修改，不要放入來路不明的內容。

## 檢查

```bash
node tests/test_core.js   # 題庫格式、答案、出題、評分、統計
```

## 目前尚未做的事

見交付說明的「缺漏清單」。重點：只有 113 年一個科目；申論題評分尚未實作；校徽尚未放入；學生資料不集中，老師看不到整班狀況。

## 免責

試題與標準答案來自考選部。詳解為教學用途整理，非官方答案；法規請以現行版本為準。
