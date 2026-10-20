# Issue #1：結帳優惠碼

- 分支：`issue-1-checkout-coupon`
- 狀態：已完成

## 目標

結帳時可輸入一組優惠碼折抵商品小計；規則集中於 `src/utils/coupon.js`。

## 實作步驟

1. 新增 `src/utils/coupon.js`：`FLOWER100`、`SPRING10`、`SUMMER50`（已失效），`applyCoupon({ code, subtotal })` 回傳折扣或錯誤碼
2. `orders` 新增 `coupon_code`、`discount` 欄位（含既有 DB migration）
3. `POST /api/orders` 接受選填 `couponCode`；在進入 transaction 前驗證，無效則回 400
4. 以 `subtotal - discount` 計算運費，`total_amount = subtotal - discount + shipping_fee`
5. 建單與 `GET /api/orders/:id` 回傳 `coupon_code`、`discount`

## 測試

- Unit：`tests/coupon.test.js`（模組規則）、`tests/orders.test.js`（非字串 couponCode、未使用時 discount 為 0）
- Integration：優惠碼快照寫入 DB，綠界表單 `TotalAmount` 為折扣後總額
- 驗收：`npm run test:acceptance -- coupon`

## 不在本次範圍

後台管理優惠碼、使用次數上限、前端結帳頁優惠碼輸入欄位。
