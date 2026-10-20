# AI Review：訂單、付款、運費、購物車

- 日期：2026-10-20
- 審查基準：`main` @ `9af6f29`（比對起始 commit `716e4e6`）
- 審查者：`security-reviewer`、`code-reviewer`（唯讀）、`test-runner`（haiku）
- 範圍：`src/routes/{order,cart,adminOrder,page}Routes.js`、`src/services/{order,payment}Service.js`、`src/utils/{ecpay,shipping,validators}.js`、`src/middleware/*`、相關 unit / integration 測試
- 狀態：#1–#4、#6、#7 已修正並補測試（見文末「修正紀錄」）；#5 與 Low 項目待處理

> 標示 ✅ 的項目已由主 session 對照原始碼抽查確認。

## 摘要

測試目前全部通過，但這是假象：最近三個 refactor commit（`7a79be5`、`128ba4d`、`58f9a62`）引入了 4 個回歸，而對應的測試不是缺漏，就是被 `it.skip` 或放寬掩蓋。

| # | 嚴重度 | 問題 | 位置 | 引入 commit | 來源 |
|---|---|---|---|---|---|
| 1 | Critical | 購物車 PATCH 數量驗證被放寬（小數可壓低訂單金額） | `src/routes/cartRoutes.js:296` | — | 兩者 ✅ |
| 2 | Critical | 免運門檻 `>=` 被改成 `>`，且對應測試被 skip | `src/utils/shipping.js:40` | `58f9a62` | 兩者 ✅ |
| 3 | High | `GET /api/orders/:id` 未檢查擁有者（IDOR） | `src/routes/orderRoutes.js:351` | `7a79be5` | 兩者 ✅ |
| 4 | High | 綠界查詢回應缺 `CheckMacValue` 時跳過驗簽 | `src/services/paymentService.js:15` | `128ba4d` | 兩者 ✅ |
| 5 | Medium | 綠界付款表單頁無身分驗證與擁有者檢查 | `src/routes/pageRoutes.js:61` | — | security ✅ |
| 6 | Medium | 綠界金鑰寫死為預設值，production 未強制設定 | `src/utils/ecpay.js:3-8` | — | security ✅ |
| 7 | Medium | admin 權限使用 JWT 內的 role，而非 DB 現值 | `src/middleware/authMiddleware.js:18-31` | — | security ✅ |
| 8 | Low | 其他（見下方 Low 一節） | — | — | 兩者 |

---

## Critical

### 1. 購物車 PATCH 數量驗證被放寬 ✅

- **位置**：`src/routes/cartRoutes.js:296-299`
- **現況**：只用 `Number(quantity)` 檢查 NaN；POST（`:195`）則有用 `parsePositiveInteger`。
- **影響**：
  - **小數**（`0.5`、`"1e-2"`、`[0.5]`）可通過。SQLite INTEGER 欄位會存成 REAL，結帳時 `subtotal = price * 0.5`，訂單金額被壓低，綠界依新金額付款後比對相符，訂單變成 paid。庫存也被扣成小數（實測 `10 - 0.01 = 9.99`）。違反 `docs/DEVELOPMENT.md`「金額一律以整數元儲存與計算」。
  - **0、負數、`null`、`""`**：撞上 DB `CHECK(quantity > 0)`，回 500，而非規格要求的 400 `VALIDATION_ERROR`。
  - **`true`**：被當成 1 接受。
- **建議**：改用 `parsePositiveInteger(quantity)`，不合法回 400 `quantity 必須為正整數`；schema 可再加 `CHECK(typeof(quantity)='integer')`（`stock` 同理）。
- **測試缺口**：`tests/cart.test.js` 沒有 PATCH 的小數、0、負數、字串案例。

### 2. 免運門檻回歸，並以 skip 掩蓋 ✅

- **位置**：`src/utils/shipping.js:40` — `return subtotal > SHIPPING_RATES.FREE_SHIPPING_THRESHOLD;`
- **現況**：起始 commit 為 `>=`，`58f9a62` 改成 `>`。同一 commit：
  - 將 `tests/shipping.test.js:29`「商品小計 1,500 元時免基本運費」改為 `it.skip`（取消 skip 就會失敗）。
  - 將「滿額免基本運費時仍收所有附加費」的小計由 1500 改為 2000（`tests/shipping.test.js:70-81`），避開邊界。
- **影響**：小計剛好 1,500 元時多收 120 / 60 元。前端 `public/js/pages/checkout.js:28` 與 `views/pages/cart.ejs:17` 仍以 1,500 元為免運門檻，造成頁面顯示免運、實際卻收費。
- **違反規格**：`docs/FEATURES.md:232`、`docs/ARCHITECTURE.md:420`、`docs/README.md:70`「滿 1,500 元免基本運費」；`docs/DEVELOPMENT.md`「邊界門檻應各有單元測試」。
- **建議**：改回 `>=`，取消 skip，並把被放寬的測試改回 1500 邊界。

## High

### 3. 訂單詳情 IDOR ✅

- **位置**：`src/routes/orderRoutes.js:351` — `findOrderById(req.params.id)`
- **現況**：起始 commit 有 `WHERE id = ? AND user_id = ?`，`7a79be5` 改成不檢查擁有者的 `findOrderById`。同檔的 `/pay`（`:446`）與 `/check-payment`（`:499`）都正確使用 `findOrderForUser`。
- **影響**：任何登入會員取得他人訂單 UUID 後，即可讀取收件人姓名、Email、地址、品項與金額。UUID 可能經由分享連結、瀏覽紀錄、`ClientBackURL`（`src/utils/ecpay.js:115`）、log 或 Referer 外流。
- **違反規格**：`docs/FEATURES.md`「僅能查看自己的訂單；他人訂單視為 404」。
- **建議**：改用 `findOrderForUser(req.params.id, req.user.userId)`。
- **測試缺口**：沒有「B 會員讀 A 會員訂單 → 404」的測試（`GET /:id`、`/pay`、`/check-payment` 都應補）。

### 4. 綠界查詢回應可略過驗簽 ✅

- **位置**：`src/services/paymentService.js:15` — `if (tradeInfo.CheckMacValue && !verifyCheckMacValue(...))`
- **現況**：起始 commit 無論是否有欄位都會驗證；`128ba4d` 加上前置條件後，拿掉 `CheckMacValue` 欄位反而能跳過驗證。只要 `TradeStatus=1` 且 MerchantTradeNo、TradeAmt 相符，訂單就被標成 paid。
- **攻擊門檻**：需能竄改伺服器對綠界的 HTTPS 回應（DNS / 代理被控制、`queryTradeInfoUrl` 設錯），所以兩位審查者評級不同（Major / Medium）。考量它是回歸，且直接決定付款狀態，這裡列為 High。
- **違反規格**：`docs/FEATURES.md` check-payment 第 5 點「先驗證回應的 CheckMacValue」。
- **建議**：無條件驗證，缺欄位視為不符並拋錯（回 500 `ECPAY_QUERY_ERROR`）。
- **測試缺口**：`tests/integration/order-checkout.integration.test.js:421-454` 只測了簽章被竄改與金額不符，未測缺少 `CheckMacValue`。

## Medium

### 5. 綠界付款表單頁缺少存取控制 ✅

- **位置**：`src/routes/pageRoutes.js:61-72`
- **現況**：`GET /ecpay/payment/:orderId` 不需登入，直接 `findOrderById`，回傳含 MerchantTradeNo、金額、品名與已簽好 CheckMacValue 的表單。
- **建議**：頁面也要驗證身分與擁有者；若瀏覽器跳轉帶不了 JWT，改由 API（JWT + `findOrderForUser`）回傳表單參數，或發一次性短效付款 token。

### 6. 綠界金鑰寫死為預設值 ✅

- **位置**：`src/utils/ecpay.js:3-8`
- **現況**：`merchantId`、`hashKey`、`hashIV` 都以公開測試值當 fallback，`ECPAY_ENV=production` 時不會強制要求設定。
- **建議**：production 下缺任一變數就啟動失敗（比照 `server.js` 對 `JWT_SECRET` 的檢查）。

### 7. admin 權限以 JWT 內的 role 為準 ✅

- **位置**：`src/middleware/authMiddleware.js:18-31`（`src/routes/cartRoutes.js:17-26` 的 dualAuth 相同）
- **現況**：middleware 已查 users 表，但只 SELECT `id`，role 仍取自 token；token 效期 7 天（`src/routes/authRoutes.js:94,141`）。
- **影響**：管理員被降權後，舊 token 7 天內仍可存取 `/api/admin/*`。
- **建議**：SELECT 時一併取 `role`，以 DB 為準；或縮短效期並加撤銷機制。

## Low

| # | 問題 | 位置 | 建議 |
|---|---|---|---|
| L1 | 扣庫存無條件保護，庫存檢查在 transaction 外；單一 process 同步執行不會超賣，但多 process 共用 DB 時只靠 `CHECK(stock>=0)` 擋下並回 500 | `src/services/orderService.js:83`、`src/routes/orderRoutes.js:167` | `WHERE id = ? AND stock >= ?` 並檢查 `changes === 1`，不符則回滾並回 400 `STOCK_INSUFFICIENT` |
| L2 | 綠界 `ReturnURL` 指向不存在的 `/ecpay/notify` 路由，伺服器通知收到 404 | `src/utils/ecpay.js:114` | 補 notify 路由：驗簽、比對金額、以 `status='pending'` 條件更新保證冪等，回 `1\|OK` |
| L3 | `X-Session-Id` 無格式檢查，可預先塞商品給已知 session 的受害者，登入時合併入會員購物車 | `src/middleware/sessionMiddleware.js:2-4` | 後端驗證 UUID 格式與長度 |
| L4 | 收件欄位無長度上限 | `src/routes/orderRoutes.js:124` | 姓名 50、地址 200、Email 254 |
| L5 | 頁面渲染錯誤直接回傳 `err.message` | `src/routes/pageRoutes.js:9,17`、`app.js:50` | 回固定訊息，細節寫 log |
| L6 | 模擬付款端點在路由直接寫 SQL，未檢查 `changes` | `src/routes/orderRoutes.js:460` | paymentService 新增 `updatePendingOrderStatus()` |
| L7 | Email 正規式寫死在路由 | `src/routes/orderRoutes.js:132` | 抽成 `validators.isValidEmail()` |
| L8 | 訂單編號隨機段只有 5 碼十六進位，單量大時可能撞號而回 500 | `src/services/orderService.js:9` | 撞號重試或加長（MerchantTradeNo 上限 20 字元，目前 16） |
| L9 | `queryTradeInfo` 的 fetch 沒有 timeout | `src/utils/ecpay.js:160` | `AbortSignal.timeout(...)`，逾時歸為 `ECPAY_QUERY_ERROR` |
| L10 | 後台訂單路由直接寫 SQL，狀態白名單與 `database.js:66` 的 CHECK 重複 | `src/routes/adminOrderRoutes.js:96-109,219` | 移至 orderService，共用狀態常數 |
| L11（待確認） | 模擬付款 `fail` 後不回補庫存；規格未要求，但 Issue B（`tests/acceptance/cancel-order.test.js`）要求取消時回補 | `src/routes/orderRoutes.js:459-460` | 實作 Issue B 時一併確認 failed 訂單的庫存政策 |

---

## 測試結果（test-runner）

| 指令 | 結果 |
|---|---|
| `npm run test:unit` | 54 passed / 0 failed / **1 skipped**（7 檔） |
| `npm run test:integration` | 10 passed / 0 failed / 0 skipped（1 檔） |

唯一被跳過的測試：`tests/shipping.test.js:29`「商品小計 1,500 元時免基本運費」，即問題 #2。

## 測試完整性

- **被跳過**：`tests/shipping.test.js:29`（`it.skip`，於 `58f9a62` 加入）。
- **被放寬**：`tests/shipping.test.js:70-81` 小計由 1500 改為 2000；新增的 `:39` 也只測 2,000 元，整個 1,500 元邊界沒有任何測試在跑。
- **被刪除**：未發現。git diff 中除了 shipping 測試的重構，只改了 `require` 的來源（改用 `testServer`）。
- **其他跳過寫法**：未發現 `.only`、`xit`、`xdescribe`、`it.todo`，也沒有被註解掉的測試。
- **弱斷言**（起始 commit 即存在，不是這次放寬的）：
  - `tests/orders.test.js:80`：只檢查 `toHaveProperty('error')`，未斷言 `CART_EMPTY`。
  - `tests/orders.test.js:93`：未檢查 `data: null`。
  - `tests/orders.test.js:121`：`shipping_fee` 只檢查欄位存在。
- **DB 隔離**：符合規格。Vitest 都經 `tests/setup/testEnvironment.js` 使用 `:memory:`，integration 另有 `PRAGMA database_list` 斷言與雜湊守衛。
- **Playwright**：`playwright.config.js` 沒有 `webServer`，符合規格。

## 應補的測試

1. 其他會員存取 `GET /api/orders/:id`、`/pay`、`/check-payment` → 404。
2. 購物車 PATCH 送小數、0、負數、非數字、`true` → 400。
3. 運費小計 1,499 / 1,500 / 1,501 邊界，以及建單 API 小計剛好 1,500 元。
4. 綠界查詢回應缺 `CheckMacValue` → 不得標成 paid。
5. 一般會員或未登入存取 `/api/admin/orders/:id`。
6. 訪客 session A 操作 session B 的購物車項目。
7. `/ecpay/payment/:orderId` 的存取控制。

## 已檢查、沒發現問題

- **回應格式**：範圍內 API 都符合 `{ data, error, message }`，錯誤時 `data: null`。
- **建單交易**：`createOrderFromCart` 在 `db.transaction()` 內依序建單 → 品項快照 → 扣庫存 → 清購物車，有回滾的 integration 測試。
- **admin 路由**：整個 router 都掛了 `authMiddleware` + `adminMiddleware`。
- **JWT**：限定 `HS256`；secret 缺少時伺服器不啟動；使用者被刪除時回 401。
- **dualAuth**：帶了無效 token 時直接回 401，不 fallback 到 session；購物車操作都帶擁有者條件。
- **建立訂單只接受 JWT**。
- **付款狀態不由前端決定**：mock `/pay` 只在 test 環境開放。
- **金額比對與冪等**：簽章用 `timingSafeEqual` 比較，`markOrderPaid` 用 `WHERE status='pending'`。
- **金額由伺服器計算**：subtotal 用 DB 現價，運費由伺服器重算（問題 #1 除外）。
- **SQL**：全部參數化。
- **XSS**：EJS 使用者資料都以 `<%= %>` 輸出，`buildAioFormHtml` 有做 escape。
- **錯誤處理**：5xx 不回傳 stack。
- **登入**：失敗訊息不透露帳號是否存在，密碼用 bcrypt。

---

## 修正紀錄

| # | 狀態 | 修正內容 | 新增 / 恢復的測試 |
|---|---|---|---|
| 1 | ✅ 已修正 | `cartRoutes.js` PATCH 改用 `parsePositiveInteger`，不合法回 400 `quantity 必須為正整數` | `tests/cart.test.js`「should reject non-positive-integer quantity on update」（0、-1、0.5、`"1.3"`、`"1e-2"`、`""`、`null`、`true`、`[2]`） |
| 2 | ✅ 已修正 | `shipping.js` 改回 `>=` | 取消 `tests/shipping.test.js` 的 `it.skip`；「滿額免基本運費時仍收所有附加費」改回 1500 / 1950 |
| 3 | ✅ 已修正 | `GET /api/orders/:id` 改用 `findOrderForUser` | `tests/orders.test.js`「should return 404 for another user's order」（詳情與 `/pay`） |
| 4 | ✅ 已修正 | `paymentService.isTradePaid` 無條件驗簽，缺欄位視為不符 | integration `forgedResponses` 新增「缺少 CheckMacValue」 |
| 5 | ⏳ 未修正 | 需重新設計付款跳轉流程（瀏覽器跳轉帶不了 JWT），另開 Issue 處理 | — |
| 6 | ✅ 已修正 | `server.js` 在 `ECPAY_ENV=production` 且缺綠界變數時拒絕啟動；staging 仍保留測試金鑰 fallback | —（啟動檢查只在 `require.main === module` 時執行） |
| 7 | ✅ 已修正 | `authMiddleware` 與購物車 dualAuth 改讀 DB 的 `role` | `tests/adminOrders.test.js`「should deny access once an admin is demoted, even with an old token」 |
| L1–L11 | ⏳ 未修正 | 留待後續 | — |

驗證方式：

- 修正後：`npm run test:unit` 58 passed / 0 skipped；`npm run test:integration` 10 passed。
- 只還原 `src/` 到修正前、保留新測試再跑一次：unit 有 5 項失敗、integration 有 1 項失敗，正好是上表新增或恢復的測試，確認它們能抓到這些回歸。
