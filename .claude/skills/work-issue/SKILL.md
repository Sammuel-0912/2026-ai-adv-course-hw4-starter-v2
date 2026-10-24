---
name: work-issue
description: 依固定流程處理一個 GitHub Issue：檢查標籤與作者 → 開分支 → 實作與補測試 → 派 test-runner 跑測試 → 更新 docs 與 openapi.json → 開 PR → 派 reviewer 審查並修正高嚴重度問題 → 標為 in-review 後停止。不合併 PR。
argument-hint: <issue 編號>
---

# work-issue

處理 Issue #$ARGUMENTS，依下列步驟執行，**每一步完成才進下一步**。

若 `$ARGUMENTS` 為空或不是數字，停下來請使用者提供 Issue 編號。

## 步驟

### 1. 讀 Issue 並檢查前置條件

```bash
gh issue view $ARGUMENTS --json number,title,body,labels,author,state
gh api user --jq .login
```

必須**同時**符合以下條件才繼續，否則停下來向使用者說明哪一項不符：

- Issue 為 `OPEN`
- 帶有 `ready` 標籤
- `author.login` 等於目前 `gh` 登入的使用者

條件符合後，把標籤從 `ready` 改為 `in-progress`：

```bash
gh issue edit $ARGUMENTS --remove-label ready --add-label in-progress
```

從 Issue 內容整理出：需求、驗收條件、對應的驗收測試檔（`tests/acceptance/<名稱>.test.js`，例如 Issue A → `coupon`）。若對應不明確，列出 `tests/acceptance/` 的檔案並詢問使用者。

### 2. 從最新 main 開分支

```bash
git checkout main
git pull origin main
git checkout -b issue-$ARGUMENTS-<名稱>
```

- `<名稱>` 為 Issue 標題的英文 kebab-case 簡稱（例：`issue-4-order-filter`）
- 開始前工作目錄必須乾淨；若有未提交變更，停下來詢問使用者，不得自行 stash 或丟棄

### 3. 實作並補測試

- 先讀 `CLAUDE.md`、`docs/ARCHITECTURE.md`、`docs/DEVELOPMENT.md`，遵守既有規則（API 回應格式 `{ data, error, message }`、dualAuth、`db.transaction()` 等）
- 在 `docs/plans/` 寫下實作計畫
- 實作功能，並補上對應的 Unit 或 Integration Test（`tests/` 下既有慣例）
- 測試必須使用記憶體/獨立 SQLite，不得修改專案 `database.sqlite`
- 以小而清楚的 commit 提交，訊息沿用專案格式（例：`feat(orders): ...`、`fix(orders): ...`）

### 4. 派 test-runner 跑測試

用 Agent 工具派 `test-runner`，要求執行：

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:acceptance -- <驗收測試檔名>`（步驟 1 確認的檔名）

有失敗就修正程式後再派一次，直到全部通過。**不得**以刪除、跳過（`.skip`）或放寬斷言的方式讓測試通過；驗收測試檔不可修改。

### 5. 更新 docs 與 openapi.json

- `docs/FEATURES.md`：新增或更新功能與完成狀態
- `docs/CHANGELOG.md`：新增本次變更
- 其他受影響的文件（`ARCHITECTURE.md`、`TESTING.md` 等）視需要更新
- 新 API 補上 JSDoc，執行 `npm run openapi` 重生 `openapi.json`
- 實作計畫從 `docs/plans/` 移到 `docs/plans/archive/`
- 提交以上變更

### 6. 開 PR

```bash
git push -u origin issue-$ARGUMENTS-<名稱>
gh pr create --base main --title "<type>(<scope>): <摘要>" --body "<描述>"
```

PR 描述包含：變更摘要、測試結果（unit / integration / acceptance 通過數）、以及一行 `Closes #$ARGUMENTS`。

### 7. 派 reviewer 審查

- 用 Agent 工具派 `code-reviewer` 審查此 PR 的變更（`git diff main...HEAD`）
- 若變更涉及 middleware、routes、services、`utils/ecpay.js` 或 `validators.js`，同時派 `security-reviewer`
- 有「高」嚴重度問題 → 修正、補測試、重新派 test-runner 確認通過，commit 並 push 到同一分支
- 中/低嚴重度問題不自行修改，列在最後回報中由使用者決定

### 8. 改標籤並停止

```bash
gh issue edit $ARGUMENTS --remove-label in-progress --add-label in-review
```

向使用者回報：PR 連結、測試結果、已修正的高嚴重度問題、未處理的中/低嚴重度問題。然後**停止**。

## 邊界（不得做的事）

- **不得合併 PR**（不執行 `gh pr merge`、不在 main 上 merge），合併由使用者自行決定
- 不得直接 commit 或 push 到 `main`，不得 force push
- 不處理非本人開立、或未帶 `ready` 標籤的 Issue
- 不執行 `npm run test:e2e`（會寫入開發 DB 並連綠界 staging）
- 不修改專案 `database.sqlite`，不修改 `.github/workflows/` 與驗收測試檔
- 不得刪除、跳過或放寬既有測試
- 不關閉 Issue（由 PR 的 `Closes #` 於合併時自動關閉）
- 遇到需求不清、與既有規格衝突或測試反覆失敗無法解決時，停下來詢問使用者，不要自行猜測
