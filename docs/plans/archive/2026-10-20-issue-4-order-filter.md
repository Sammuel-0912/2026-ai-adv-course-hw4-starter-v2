# Issue #4：我的訂單篩選與分頁

- 分支：`issue-4-order-filter`
- 狀態：已完成

## 目標

`GET /api/orders` 支援依狀態篩選與分頁，回應格式與 `GET /api/admin/orders` 一致。

## 實作步驟

1. `orderService.listOrdersForUser(userId, { status, limit, offset })` 回傳 `{ orders, total }`，排序為 `created_at DESC, rowid DESC`（`created_at` 只到秒，同秒訂單以建立順序排序，分頁才不會重複或遺漏）
2. 路由驗證 `status`（白名單）、`page`、`limit`（`parsePositiveInteger`），不合法回 400；`limit` 超過 50 以 50 計
3. 回應加上 `pagination: { page, limit, total, totalPages }`，訂單欄位補上 `discount`、`coupon_code`
4. 前台「我的訂單」頁改用分頁回應並加上頁碼按鈕

## 測試

- Unit：`tests/orders.test.js`（預設分頁、各種不合法參數、limit 上限與超出範圍的頁碼）
- Integration：同秒建立的訂單跨頁順序、狀態篩選、不含其他會員訂單
- 驗收：`npm run test:acceptance -- order-filter`

## 不在本次範圍

後台訂單列表調整、日期區間或關鍵字搜尋、前台篩選 UI。
